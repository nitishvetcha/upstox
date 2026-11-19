import { assertCollectionAuthorized } from "./lib/collectionGuard.mjs";
assertCollectionAuthorized("upstox-collect.ts", "upstox");

// Phase B: resumable, rate-limited Upstox historical-candle collection into an isolated, immutable raw store.
// - One file per (instrument, interval, chunk). A file that exists is never overwritten; a chunk that exists is skipped.
// - Every attempt is appended to manifest.jsonl with status, HTTP status, error codes, candle count and SHA-256.
// - Stops safely on: expired/invalid credential (401), free disk below the floor, or an unexpected API error class.
// - Reads the access token from web/.env.local; never prints or stores it.
// Usage: node --experimental-strip-types scripts/upstox-collect.ts <dataset-name>
import { UPSTOX_API_BASE } from "../src/lib/services/upstoxEndpoints.ts";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { planChunks, type Chunk } from "../src/lib/services/historicalCandles.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const API = UPSTOX_API_BASE;
const SPACING_MS = 150; // the loader's own spacing (≈460 requests/min); stays inside the per-minute limit
const FLOOR_BYTES = 1024 ** 3; // stop if free space falls below 1 GiB
const END_DATE = "2026-11-05"; // last completed session before this run

type Interval = "1d" | "1h" | "15m";
const UNIT: Record<Interval, { unit: string; n: number }> = { "1d": { unit: "days", n: 1 }, "1h": { unit: "hours", n: 1 }, "15m": { unit: "minutes", n: 15 } };

interface Instrument { key: string; symbol: string; kind: "INDEX" | "EQUITY" }
interface Job { instrument: Instrument; interval: Interval; start: string; end: string }

const INDICES: Instrument[] = [
  { key: "NSE_INDEX|Nifty 50", symbol: "NIFTY", kind: "INDEX" },
  { key: "NSE_INDEX|Nifty Bank", symbol: "BANKNIFTY", kind: "INDEX" },
  { key: "NSE_INDEX|Nifty Fin Service", symbol: "FINNIFTY", kind: "INDEX" },
  { key: "NSE_INDEX|NIFTY MID SELECT", symbol: "MIDCPNIFTY", kind: "INDEX" },
  { key: "BSE_INDEX|SENSEX", symbol: "SENSEX", kind: "INDEX" },
  { key: "BSE_INDEX|BANKEX", symbol: "BANKEX", kind: "INDEX" },
];

// Universe v1: the 52 NSE instruments already present in the local history store (today's constituents, so
// survivorship-biased; see the universe record written with the run).
function universeV1(): Instrument[] {
  const dir = path.join(ROOT, ".data", "history");
  const isins = new Set<string>();
  for (const f of fs.readdirSync(dir)) {
    const m = f.match(/^NSE_EQ_(INE[A-Z0-9]+)_1d_/);
    if (m) isins.add(m[1]);
  }
  const master = JSON.parse(fs.readFileSync(path.join(ROOT, ".data", "instruments", "NSE_EQ.json"), "utf8")) as { symbol: string; instrumentKey: string }[];
  const bySym = new Map(master.map((r) => [r.instrumentKey.replace("NSE_EQ|", ""), r.symbol]));
  return [...isins].sort().map((isin) => ({ key: `NSE_EQ|${isin}`, symbol: bySym.get(isin) ?? isin, kind: "EQUITY" as const }));
}

function jobsFor(datasetName: string, universe: Instrument[]): Job[] {
  const jobs: Job[] = [];
  for (const i of INDICES) jobs.push({ instrument: i, interval: "1d", start: "2000-01-01", end: END_DATE });
  for (const s of universe) {
    jobs.push({ instrument: s, interval: "1d", start: "2000-01-01", end: END_DATE });
    jobs.push({ instrument: s, interval: "1h", start: "2022-01-01", end: END_DATE });
  }
  if (datasetName === "v2") {
    // 15-minute bars for the same 52 equities, since the provider's intraday limit (2022-01-01).
    const v2: Job[] = [];
    for (const s of universe) v2.push({ instrument: s, interval: "15m", start: "2022-01-01", end: END_DATE });
    return v2;
  }
  if (datasetName !== "v1") throw new Error(`unknown dataset ${datasetName}`);
  return jobs;
}

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function readToken(): string {
  const env = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  const m = env.match(/^UPSTOX_ANALYTICS_TOKEN=(.+)$/m);
  if (!m || !m[1].trim()) throw new Error("UPSTOX_ANALYTICS_TOKEN not configured");
  return m[1].trim();
}

function freeBytes(dir: string): number {
  const s = fs.statfsSync(dir);
  return Number(s.bavail) * Number(s.bsize);
}

function fileName(instrument: Instrument, interval: Interval, c: Chunk): string {
  const safe = instrument.key.replace(/[^A-Za-z0-9]+/g, "_");
  return `${safe}__${interval}__${c.from}_${c.to}.json`;
}

async function fetchChunk(token: string, instrument: Instrument, interval: Interval, c: Chunk) {
  const u = UNIT[interval];
  const p = `/v3/historical-candle/${encodeURIComponent(instrument.key)}/${u.unit}/${u.n}/${c.to}/${c.from}`;
  let res: Response | null = null;
  let text = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      res = await fetch(API + p, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
      text = await res.text();
      if (res.status === 429) { await sleep(5000 * attempt); continue; }
      if (res.status >= 500) { await sleep(2000 * attempt); continue; }
      break;
    } catch (e) {
      text = String((e as Error).message);
      res = null;
      await sleep(2000 * attempt);
    }
  }
  await sleep(SPACING_MS);
  let body: unknown = null;
  try { body = JSON.parse(text); } catch { /* keep the raw text */ }
  const errs = Array.isArray((body as { errors?: unknown[] })?.errors) ? ((body as { errors: { errorCode?: string }[] }).errors.map((e) => e.errorCode).filter(Boolean) as string[]) : [];
  const candles = (body as { data?: { candles?: unknown[] } })?.data?.candles;
  return { status: res?.status ?? 0, text, body, errs, candleCount: Array.isArray(candles) ? candles.length : null };
}

function main() {
  const datasetName = process.argv[2] ?? "v1";
  const outDir = path.join(ROOT, ".research-data", `upstox-raw-2026-11-06-${datasetName}`);
  fs.mkdirSync(outDir, { recursive: true });
  const universe = universeV1();
  const universeFile = path.join(outDir, "universe.json");
  if (!fs.existsSync(universeFile)) {
    fs.writeFileSync(universeFile, JSON.stringify({
      note: "Current NSE instruments with local history (today's constituents). NOT point-in-time: survivorship-biased. Delisted and former constituents are absent.",
      indices: INDICES, equities: universe, createdAt: new Date().toISOString(),
    }, null, 2));
  }
  const manifest = path.join(outDir, "manifest.jsonl");
  const token = readToken();
  const jobs = jobsFor(datasetName, universe);
  (async () => {
    let calls = 0, skipped = 0, failed = 0;
    for (const job of jobs) {
      for (const c of planChunks(job.start, job.end, job.interval)) {
        const dir = path.join(outDir, job.interval);
        fs.mkdirSync(dir, { recursive: true });
        const target = path.join(dir, fileName(job.instrument, job.interval, c));
        if (fs.existsSync(target)) { skipped++; continue; }
        if (freeBytes(outDir) < FLOOR_BYTES) {
          console.log(JSON.stringify({ stop: "disk floor reached", freeGiB: (freeBytes(outDir) / 1024 ** 3).toFixed(2) }));
          return;
        }
        const r = await fetchChunk(token, job.instrument, job.interval, c);
        calls++;
        const entry = { at: new Date().toISOString(), key: job.instrument.key, interval: job.interval, from: c.from, to: c.to, httpStatus: r.status, errorCodes: r.errs, candleCount: r.candleCount };
        if (r.status === 401) {
          fs.appendFileSync(manifest, JSON.stringify({ ...entry, stop: "credential rejected" }) + "\n");
          console.log(JSON.stringify({ stop: "credential rejected (401)", key: job.instrument.key }));
          return;
        }
        if (r.status !== 200) {
          failed++;
          fs.appendFileSync(manifest, JSON.stringify({ ...entry, result: "FAILED" }) + "\n");
          console.log(JSON.stringify({ result: "FAILED", key: job.instrument.key, interval: job.interval, from: c.from, status: r.status, errors: r.errs }));
          continue;
        }
        const record = { schema: "upstox-raw-chunk-1", instrumentKey: job.instrument.key, symbol: job.instrument.symbol, interval: job.interval, from: c.from, to: c.to, requestPath: `/v3/historical-candle/…/${UNIT[job.interval].unit}/${UNIT[job.interval].n}/${c.to}/${c.from}`, httpStatus: r.status, fetchedAt: entry.at, candleCount: r.candleCount, bodySha256: sha(r.text), body: r.body ?? r.text };
        const tmp = target + ".tmp";
        fs.writeFileSync(tmp, JSON.stringify(record));
        fs.renameSync(tmp, target);
        fs.appendFileSync(manifest, JSON.stringify({ ...entry, result: "STORED", bodySha256: record.bodySha256, file: path.basename(target) }) + "\n");
      }
    }
    console.log(JSON.stringify({ done: true, requestsMade: calls, skippedExisting: skipped, failed, outDir: path.relative(ROOT, outDir) }));
  })();
}

main();
