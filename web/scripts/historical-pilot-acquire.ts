// Historical pilot raw-candle acquisition. PREPARED, NOT RUN.
// Exactly 60 candle calls, one per leg listed in docs/phase0/historical-coverage-probe.json. No discovery calls. No retries.
// Runs only with HISTORICAL_PILOT_APPROVED=yes. Stops on any non-200 response, network error or unexpected condition.
// Saves OHLC, volume and OI per returned bar to .research-data/historical-pilot-raw/ and a metadata log to docs/phase0/.
// Never writes the access token. Refuses to overwrite existing output. Does not modify the probe evidence.
// Historical market-structure research only: not strategy, profitability or execution-quality evidence.
// Usage: HISTORICAL_PILOT_APPROVED=yes MARKET_DATA_PROVIDER=upstox UPSTOX_COLLECTION_ENABLED=true node --experimental-strip-types scripts/historical-pilot-acquire.ts
import fs from "node:fs";
import path from "node:path";
import { assertCollectionAuthorized } from "./lib/collectionGuard.mjs";
assertCollectionAuthorized("historical-pilot-acquire.ts", "upstox");
import { UPSTOX_API_BASE } from "../src/lib/services/upstoxEndpoints.ts";

const cwd = process.cwd();
const PROBE = path.join(cwd, "docs", "phase0", "historical-coverage-probe.json");
const RAW_DIR = path.join(cwd, ".research-data", "historical-pilot-raw");
const RAW = path.join(RAW_DIR, "candles.csv");
const LOG = path.join(cwd, "docs", "phase0", "historical-pilot-acquisition-log.json");

if (process.env.HISTORICAL_PILOT_APPROVED !== "yes") {
  console.log("NOT RUN: HISTORICAL_PILOT_APPROVED=yes is not set. No request made.");
  process.exit(0);
}
if (fs.existsSync(RAW) || fs.existsSync(LOG)) {
  console.log("STOP: output already exists. Refusing to overwrite.");
  process.exit(1);
}

type ProbeLeg = { label: string; type: string; listedStrike?: number; expiredInstrumentKey?: string; candles?: { count: number } };
type ProbeIndex = { index: string; expiries: { expiry: string; legs?: ProbeLeg[] }[] };
const probe = JSON.parse(fs.readFileSync(PROBE, "utf8")) as { indices: ProbeIndex[] };

type Target = { index: string; expiry: string; label: string; type: string; strike: number; key: string; from: string; to: string; probeBars: number };
const targets: Target[] = [];
for (const i of probe.indices) for (const e of i.expiries) for (const l of e.legs ?? []) {
  if (!l.expiredInstrumentKey || typeof l.listedStrike !== "number") continue;
  const to = e.expiry;
  const from = new Date(Date.parse(to + "T00:00:00Z") - 14 * 86_400_000).toISOString().slice(0, 10);
  targets.push({ index: i.index, expiry: e.expiry, label: l.label, type: l.type, strike: l.listedStrike, key: l.expiredInstrumentKey, from, to, probeBars: l.candles?.count ?? 0 });
}
if (targets.length !== 60) {
  console.log(`STOP: expected 60 legs in the probe file, found ${targets.length}. No request made.`);
  process.exit(1);
}

const tokenFile = path.join(cwd, ".data", "upstox-token.json");
const stored = JSON.parse(fs.readFileSync(tokenFile, "utf8")) as { accessToken?: string; expiresAt?: string; invalidatedAt?: string | null };
if (!stored.accessToken || stored.invalidatedAt || !stored.expiresAt || Date.parse(stored.expiresAt) <= Date.now()) {
  console.log("STOP: token missing, invalidated or expired. No request made.");
  process.exit(1);
}
const token = stored.accessToken;

fs.mkdirSync(RAW_DIR, { recursive: true });
fs.writeFileSync(RAW, "index,expiry,label,type,strike,expired_instrument_key,request_seq,retrieved_at,bar_timestamp,open,high,low,close,volume,oi\n");

type LogRow = { seq: number; index: string; expiry: string; label: string; startedAt: string; httpStatus: number | null; latencyMs: number; bars: number; outcome: string; probeBars: number };
const log: LogRow[] = [];
let stopped: string | null = null;
let status: "RUNNING" | "STOPPED" | "COMPLETE" = "RUNNING";

function save() {
  fs.writeFileSync(LOG, JSON.stringify({ status, checkedAt: new Date().toISOString(), requestsUsed: log.length, maxRequests: 60, stopped, scope: "Historical market-structure research pilot. Not strategy or profitability evidence.", note: "metadata only; no token. Bars are in .research-data/historical-pilot-raw/candles.csv", rows: log }, null, 2));
}

for (let k = 0; k < targets.length; k++) {
  const t = targets[k];
  const seq = k + 1;
  const endpoint = `/v2/expired-instruments/historical-candle/${encodeURIComponent(t.key)}/30minute/${t.to}/${t.from}`;
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(`${UPSTOX_API_BASE}${endpoint}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" });
  } catch (e) {
    log.push({ seq, index: t.index, expiry: t.expiry, label: t.label, startedAt, httpStatus: null, latencyMs: Date.now() - t0, bars: 0, outcome: `network error: ${(e as Error).name}`, probeBars: t.probeBars });
    stopped = `network error on call ${seq}`;
    break;
  }
  const latencyMs = Date.now() - t0;
  const body = (await res.json().catch(() => null)) as { status?: string; data?: { candles?: unknown[][] }; errors?: { errorCode?: string }[] } | null;
  if (!res.ok || body?.status !== "success") {
    const code = body?.errors?.[0]?.errorCode ?? `HTTP_${res.status}`;
    log.push({ seq, index: t.index, expiry: t.expiry, label: t.label, startedAt, httpStatus: res.status, latencyMs, bars: 0, outcome: code, probeBars: t.probeBars });
    stopped = `call ${seq} (${t.index} ${t.expiry} ${t.label}) returned ${code}; stopping, no retry`;
    break;
  }
  const candles = Array.isArray(body.data?.candles) ? body.data!.candles! : [];
  const retrievedAt = new Date().toISOString();
  const rows = candles.map((c) => [t.index, t.expiry, t.label, t.type, t.strike, t.key, seq, retrievedAt, c[0], c[1], c[2], c[3], c[4], c[5], c[6] ?? ""].join(","));
  if (rows.length) fs.appendFileSync(RAW, rows.join("\n") + "\n");
  log.push({ seq, index: t.index, expiry: t.expiry, label: t.label, startedAt, httpStatus: res.status, latencyMs, bars: candles.length, outcome: candles.length ? "ok" : "ok-empty", probeBars: t.probeBars });
  save();
}

status = stopped ? "STOPPED" : "COMPLETE";
save();
console.log(JSON.stringify({ status, requestsUsed: log.length, maxRequests: 60, stopped, raw: RAW, log: LOG }, null, 2));
