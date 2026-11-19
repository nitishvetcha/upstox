// Historical expired-options access probe, all six indices. PREPARED, NOT RUN.
// Exactly 18 read-only requests, one per step per index: expiries, expired CE contract list, one 30-minute candle request.
// Runs only with HISTORICAL_PROBE_APPROVED=yes. No retries. Stops the whole run on UDAPI1149 (Plus plan) or HTTP 401.
// Saves metadata only (no token, no raw candles) to docs/phase0/historical-expired-probe.json. Refuses to overwrite.
// Usage: HISTORICAL_PROBE_APPROVED=yes MARKET_DATA_PROVIDER=upstox UPSTOX_COLLECTION_ENABLED=true node --experimental-strip-types scripts/historical-expired-probe.ts
import fs from "node:fs";
import path from "node:path";
import { assertCollectionAuthorized } from "./lib/collectionGuard.mjs";
assertCollectionAuthorized("historical-expired-probe.ts", "upstox");
import { UPSTOX_API_BASE } from "../src/lib/services/upstoxEndpoints.ts";

const OUT = path.join(process.cwd(), "docs", "phase0", "historical-expired-probe.json");
if (process.env.HISTORICAL_PROBE_APPROVED !== "yes") {
  console.log("NOT RUN: HISTORICAL_PROBE_APPROVED=yes is not set. No request made.");
  process.exit(0);
}
if (fs.existsSync(OUT)) {
  console.log(`STOP: ${OUT} exists. Refusing to overwrite evidence.`);
  process.exit(1);
}

const INDICES = [
  { id: "NIFTY", underlyingKey: "NSE_INDEX|Nifty 50" },
  { id: "BANKNIFTY", underlyingKey: "NSE_INDEX|Nifty Bank" },
  { id: "FINNIFTY", underlyingKey: "NSE_INDEX|Nifty Fin Service" },
  { id: "MIDCPNIFTY", underlyingKey: "NSE_INDEX|NIFTY MID SELECT" },
  { id: "SENSEX", underlyingKey: "BSE_INDEX|SENSEX" },
  { id: "BANKEX", underlyingKey: "BSE_INDEX|BANKEX" },
];

const tokenFile = path.join(process.cwd(), ".data", "upstox-token.json");
const stored = JSON.parse(fs.readFileSync(tokenFile, "utf8")) as { accessToken?: string; expiresAt?: string; invalidatedAt?: string | null };
if (!stored.accessToken || stored.invalidatedAt || !stored.expiresAt || Date.parse(stored.expiresAt) <= Date.now()) {
  console.log("STOP: token missing, invalidated or expired. No request made. Owner must run npm run upstox:login.");
  process.exit(1);
}
const token = stored.accessToken;

const MAX_REQUESTS = 18;
let requestCount = 0;
class StopRun extends Error {}

type Call = { httpStatus: number | null; latencyMs: number; errorCode: string | null; message: string | null; data: unknown };

interface ExpiredContractItem {
  instrument_type?: string;
  instrument_key?: string;
  strike_price?: number;
  lot_size?: number;
}

interface HistoricalCandlePayload {
  candles?: unknown[][];
}

async function call(endpoint: string, query: Record<string, string> = {}): Promise<Call> {
  if (requestCount >= MAX_REQUESTS) throw new StopRun("request budget exhausted");
  requestCount++;
  const qs = new URLSearchParams(query).toString();
  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(`${UPSTOX_API_BASE}${endpoint}${qs ? `?${qs}` : ""}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
  } catch (e) {
    return { httpStatus: null, latencyMs: Date.now() - t0, errorCode: "NETWORK_ERROR", message: (e as Error).name, data: null };
  }
  const latencyMs = Date.now() - t0;
  const body = (await res.json().catch(() => null)) as { status?: string; data?: unknown; errors?: { errorCode?: string; message?: string }[] } | null;
  const out: Call = {
    httpStatus: res.status,
    latencyMs,
    errorCode: body?.errors?.[0]?.errorCode ?? (res.ok ? null : `HTTP_${res.status}`),
    message: body?.errors?.[0]?.message ?? null,
    data: res.ok && body?.status === "success" ? body.data : null,
  };
  if (out.errorCode === "UDAPI1149" || res.status === 401) throw new StopRun(`${out.errorCode ?? res.status}: stopping whole run, no retry`);
  return out;
}

const addDays = (date: string, days: number) => new Date(Date.parse(date + "T00:00:00Z") + days * 86_400_000).toISOString().slice(0, 10);

const report: Record<string, unknown>[] = [];
let stopped: string | null = null;

try {
  for (const idx of INDICES) {
    const row: Record<string, unknown> = { index: idx.id, underlyingKey: idx.underlyingKey };
    report.push(row);

    // 1. Expiries
    const ex = await call("/v2/expired-instruments/expiries", { instrument_key: idx.underlyingKey });
    row.expiriesCall = { httpStatus: ex.httpStatus, latencyMs: ex.latencyMs, errorCode: ex.errorCode, message: ex.message };
    const today = new Date().toISOString().slice(0, 10);
    const expired = Array.isArray(ex.data) ? (ex.data as string[]).filter((d: string) => d < today).sort() : [];
    if (!expired.length) { row.result = "no expired expiries returned"; continue; }
    const expiry = expired[expired.length - 1];
    row.expiryChosen = expiry;
    row.expiriesReturned = Array.isArray(ex.data) ? ex.data.length : 0;

    // 2. Expired option contracts for that expiry (CE only)
    const oc = await call("/v2/expired-instruments/option/contract", { instrument_key: idx.underlyingKey, expiry_date: expiry });
    row.contractsCall = { httpStatus: oc.httpStatus, latencyMs: oc.latencyMs, errorCode: oc.errorCode, message: oc.message };
    const rawContracts = Array.isArray(oc.data) ? (oc.data as ExpiredContractItem[]) : [];
    const ces = rawContracts.filter(
      (c): c is ExpiredContractItem & { strike_price: number; instrument_key: string } =>
        c?.instrument_type === "CE" && typeof c?.instrument_key === "string" && typeof c?.strike_price === "number",
    );
    if (!ces.length) { row.result = "no CE contracts returned"; continue; }
    ces.sort((a, b) => a.strike_price - b.strike_price);
    const mid = ces[Math.floor(ces.length / 2)];
    row.contract = { expiredInstrumentKey: mid.instrument_key, strike: mid.strike_price, lotSize: mid.lot_size ?? null, ceRowsReturned: ces.length };

    // 3. One 30-minute candle request, last 5 days to expiry
    const from = addDays(expiry, -5);
    const cd = await call(`/v2/expired-instruments/historical-candle/${encodeURIComponent(mid.instrument_key)}/30minute/${expiry}/${from}`);
    row.candlesCall = { httpStatus: cd.httpStatus, latencyMs: cd.latencyMs, errorCode: cd.errorCode, message: cd.message };
    const candlePayload = cd.data as HistoricalCandlePayload | null;
    const candles = Array.isArray(candlePayload?.candles) ? candlePayload.candles : [];
    row.candles = {
      count: candles.length,
      fieldsPerCandle: candles[0]?.length ?? null,
      firstTimestamp: candles[0]?.[0] ?? null,
      lastTimestamp: candles[candles.length - 1]?.[0] ?? null,
      oiPresent: candles.filter((c) => typeof c?.[6] === "number").length,
      oiNonZero: candles.filter((c) => typeof c?.[6] === "number" && c[6] !== 0).length,
      volumePresent: candles.filter((c) => typeof c?.[5] === "number").length,
    };
  }
} catch (e) {
  stopped = e instanceof StopRun ? e.message : `unexpected: ${(e as Error).message}`;
}

fs.writeFileSync(OUT, JSON.stringify({ checkedAt: new Date().toISOString(), requestsUsed: requestCount, maxRequests: MAX_REQUESTS, stopped, note: "metadata only; no token, no raw candles", indices: report }, null, 2));
console.log(JSON.stringify({ requestsUsed: requestCount, stopped, saved: OUT }, null, 2));
