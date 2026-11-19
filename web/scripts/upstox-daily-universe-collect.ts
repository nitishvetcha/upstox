import { assertCollectionAuthorized } from "./lib/collectionGuard.mjs";
assertCollectionAuthorized("upstox-daily-universe-collect.ts", "upstox");

// Full-universe DAILY collector (daily only, 2,398 EQ). Same safeguards as the pilot collector. Same raw-file and manifest format as the verified stores, so scripts/upstox-verify-clean.ts can check it.
// Resumable (skips existing chunk files), throttled, records every request. Stops on 401/403 (access), repeated 429,
// or free space below 2 GiB. Reads the token from web/.env.local and never prints it.
import { UPSTOX_API_BASE } from "../src/lib/services/upstoxEndpoints.ts";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { planChunks, type Chunk } from "../src/lib/services/historicalCandles.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, ".research-data", "upstox-daily-universe-2026-11-08");
const API = UPSTOX_API_BASE;
const END = "2026-11-05";
const SPACING_MS = 150;
const FLOOR = 2 * 1024 ** 3;
const JOBS_ALL = [
  { interval: "1d", unit: "days", n: 1, start: "2000-01-01" },
] as const;
const JOBS = JOBS_ALL.filter((j) => j.interval === "1d"); // daily only, per approval

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const safe = (k: string) => k.replace(/[^A-Za-z0-9]+/g, "_");
const token = (() => {
  const m = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").match(/^UPSTOX_ANALYTICS_TOKEN=(.+)$/m);
  if (!m) throw new Error("token not configured");
  return m[1].trim();
})();
const freeBytes = () => { const s = fs.statfsSync(OUT); return Number(s.bavail) * Number(s.bsize); };

async function call(key: string, c: Chunk, job: (typeof JOBS)[number]) {
  const p = `/v3/historical-candle/${encodeURIComponent(key)}/${job.unit}/${job.n}/${c.to}/${c.from}`;
  let status = 0, text = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(API + p, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
      status = res.status; text = await res.text();
      if (status === 429 || status >= 500) { await sleep(5000 * attempt); continue; }
      break;
    } catch (e) { status = 0; text = String((e as Error).message); await sleep(2000 * attempt); }
  }
  await sleep(SPACING_MS);
  let body: unknown = null;
  try { body = JSON.parse(text); } catch { /* keep raw */ }
  const errs = ((body as { errors?: { errorCode?: string }[] })?.errors ?? []).map((e) => e.errorCode).filter(Boolean);
  const candles = (body as { data?: { candles?: unknown[] } })?.data?.candles;
  return { status, text, body, errs, count: Array.isArray(candles) ? candles.length : null, path: p };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  for (const j of JOBS) fs.mkdirSync(path.join(OUT, j.interval), { recursive: true });
  const universe = JSON.parse(fs.readFileSync(path.join(OUT, "universe.json"), "utf8")) as { equities: { key: string; symbol: string }[] };
  const manifest = path.join(OUT, "manifest.jsonl");
  const t0 = Date.now();
  let requests = 0, stored = 0, skipped = 0, failed = 0;
  let consecutive429 = 0;
  for (const inst of universe.equities) {
    for (const job of JOBS) {
      for (const c of planChunks(job.start, END, job.interval)) {
        const dir = path.join(OUT, job.interval);
        const name = `${safe(inst.key)}__${job.interval}__${c.from}_${c.to}.json`;
        const target = path.join(dir, name);
        if (fs.existsSync(target)) { skipped++; continue; }
        if (freeBytes() < FLOOR) { console.log(JSON.stringify({ stop: "disk floor", freeGiB: (freeBytes() / 1024 ** 3).toFixed(2) })); return; }
        const r = await call(inst.key, c, job);
        requests++;
        const row = { at: new Date().toISOString(), key: inst.key, symbol: inst.symbol, interval: job.interval, from: c.from, to: c.to, httpStatus: r.status, errorCodes: r.errs, candleCount: r.count };
        if (r.status === 401 || r.status === 403) {
          fs.appendFileSync(manifest, JSON.stringify({ ...row, stop: "access restricted" }) + "\n");
          console.log(JSON.stringify({ stop: "access restricted", status: r.status, symbol: inst.symbol, interval: job.interval })); return;
        }
        if (r.status === 429) {
          consecutive429++;
          fs.appendFileSync(manifest, JSON.stringify({ ...row, result: "RATE-LIMITED" }) + "\n");
          if (consecutive429 >= 3) { console.log(JSON.stringify({ stop: "repeated 429" })); return; }
          continue;
        }
        consecutive429 = 0;
        if (r.status !== 200 || r.count === null) {
          failed++;
          fs.appendFileSync(manifest, JSON.stringify({ ...row, result: "FAILED" }) + "\n");
          continue;
        }
        const record = { schema: "upstox-raw-chunk-1", instrumentKey: inst.key, symbol: inst.symbol, interval: job.interval, from: c.from, to: c.to, requestPath: r.path, httpStatus: r.status, fetchedAt: row.at, candleCount: r.count, bodySha256: sha(r.text), body: r.body ?? r.text };
        fs.writeFileSync(target + ".tmp", JSON.stringify(record));
        fs.renameSync(target + ".tmp", target);
        fs.appendFileSync(manifest, JSON.stringify({ ...row, result: "STORED", file: name, bodySha256: record.bodySha256 }) + "\n");
        stored++;
      }
    }
  }
  console.log(JSON.stringify({ done: true, requests, stored, skipped, failed, seconds: Math.round((Date.now() - t0) / 1000) }));
}
main();
