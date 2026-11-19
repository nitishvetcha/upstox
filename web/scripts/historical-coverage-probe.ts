// Historical coverage probe, all six indices. PREPARED, NOT RUN. Plan: docs/phase0/HISTORICAL_COVERAGE_PROBE_SPEC.md
// Maximum 102 read-only calls. Runs only with HISTORICAL_COVERAGE_APPROVED=yes. No retries.
// Stops the whole run on ANY non-200 response or network error.
// Status field: RUNNING during the run, STOPPED or COMPLETE at the end. A RUNNING file means the run was interrupted.
// Refuses to overwrite an existing output file. Saves metadata only (no token, no raw candles).
// Historical coverage only: not strategy, profitability or execution-quality evidence.
// Usage: HISTORICAL_COVERAGE_APPROVED=yes MARKET_DATA_PROVIDER=upstox UPSTOX_COLLECTION_ENABLED=true node --experimental-strip-types scripts/historical-coverage-probe.ts
import fs from "node:fs";
import path from "node:path";
import { assertCollectionAuthorized } from "./lib/collectionGuard.mjs";
assertCollectionAuthorized("historical-coverage-probe.ts", "upstox");
import { UPSTOX_API_BASE } from "../src/lib/services/upstoxEndpoints.ts";
import { pickSpotCandle, nearestStrike, localStep, verifyContract, nearestListed, type Candle } from "../src/lib/historicalCoverageSelect.ts";

const OUT = path.join(process.cwd(), "docs", "phase0", "historical-coverage-probe.json");
if (process.env.HISTORICAL_COVERAGE_APPROVED !== "yes") {
  console.log("NOT RUN: HISTORICAL_COVERAGE_APPROVED=yes is not set. No request made.");
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

type ContractRow = { instrument_type?: string; expiry?: unknown; strike_price?: number; instrument_key?: unknown; lot_size?: number };
type LogEntry = { seq: number; startedAt: string; endpoint: string; httpStatus: number | null; latencyMs: number; outcome: string };

const tokenFile = path.join(process.cwd(), ".data", "upstox-token.json");
const stored = JSON.parse(fs.readFileSync(tokenFile, "utf8")) as { accessToken?: string; expiresAt?: string; invalidatedAt?: string | null };
if (!stored.accessToken || stored.invalidatedAt || !stored.expiresAt || Date.parse(stored.expiresAt) <= Date.now()) {
  console.log("STOP: token missing, invalidated or expired. No request made. Owner must run the login step again.");
  process.exit(1);
}
const token = stored.accessToken;

const MAX_REQUESTS = 102;
let requestCount = 0;
class StopRun extends Error {}

const requestLog: LogEntry[] = [];
const report: Record<string, unknown>[] = [];
let stopped: string | null = null;
let status: "RUNNING" | "STOPPED" | "COMPLETE" = "RUNNING";

// Writes after every call, so an interrupted run leaves status RUNNING rather than a file that looks complete.
function save() {
  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        status,
        checkedAt: new Date().toISOString(),
        requestsUsed: requestCount,
        maxRequests: MAX_REQUESTS,
        stopped,
        scope: "Historical coverage only. Not strategy, profitability or execution-quality evidence.",
        note: "metadata only; no token, no raw candles",
        requestLog,
        indices: report,
      },
      null,
      2,
    ),
  );
}

async function call(endpoint: string, query: Record<string, string> = {}): Promise<unknown> {
  if (requestCount >= MAX_REQUESTS) throw new StopRun("request budget exhausted");
  requestCount++;
  const seq = requestCount;
  const qs = new URLSearchParams(query).toString();
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(`${UPSTOX_API_BASE}${endpoint}${qs ? `?${qs}` : ""}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
  } catch (e) {
    requestLog.push({ seq, startedAt, endpoint, httpStatus: null, latencyMs: Date.now() - t0, outcome: `network error: ${(e as Error).name}` });
    throw new StopRun(`network error on call ${seq}`);
  }
  const latencyMs = Date.now() - t0;
  const body = (await res.json().catch(() => null)) as { status?: string; data?: unknown; errors?: { errorCode?: string }[] } | null;
  const errorCode = body?.errors?.[0]?.errorCode ?? (res.ok ? null : `HTTP_${res.status}`);
  if (!res.ok || body?.status !== "success") {
    requestLog.push({ seq, startedAt, endpoint, httpStatus: res.status, latencyMs, outcome: errorCode ?? "non-success" });
    throw new StopRun(`call ${seq} returned ${errorCode ?? res.status} (HTTP ${res.status}); stopping, no retry`);
  }
  requestLog.push({ seq, startedAt, endpoint, httpStatus: res.status, latencyMs, outcome: "ok" });
  save();
  return body.data;
}

const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const addDays = (date: string, days: number) => new Date(Date.parse(date + "T00:00:00Z") + days * 86_400_000).toISOString().slice(0, 10);

function candleSummary(candles: Candle[]) {
  return {
    count: candles.length,
    fieldsPerCandle: candles[0]?.length ?? null,
    firstTimestamp: candles[0]?.[0] ?? null,
    lastTimestamp: candles[candles.length - 1]?.[0] ?? null,
    volumePresent: candles.filter((c) => typeof c?.[5] === "number").length,
    oiPresent: candles.filter((c) => typeof c?.[6] === "number").length,
    oiNonZero: candles.filter((c) => typeof c?.[6] === "number" && c[6] !== 0).length,
  };
}

try {
  save();
  for (const idx of INDICES) {
    const row: Record<string, unknown> = { index: idx.id, underlyingKey: idx.underlyingKey, expiries: [] };
    report.push(row);

    // Expiries (1 call)
    const expiriesData = asArray<string>(await call("/v2/expired-instruments/expiries", { instrument_key: idx.underlyingKey }));
    const today = new Date().toISOString().slice(0, 10);
    const expired = expiriesData.filter((d) => d < today).sort();
    row.expiriesListed = expired.length;
    row.oldestExpiryListed = expired[0] ?? null;
    row.latestExpiryListed = expired[expired.length - 1] ?? null;
    if (!expired.length) { row.result = "no expired expiries listed"; save(); continue; }
    const target = addDays(today, -182);
    const latest = expired[expired.length - 1];
    const oldest = expired[0];
    const mid = expired.reduce((best, d) => (Math.abs(Date.parse(d) - Date.parse(target)) < Math.abs(Date.parse(best) - Date.parse(target)) ? d : best));
    const chosen = [...new Set([latest, mid, oldest])];
    row.expiriesChosen = chosen;

    for (const expiry of chosen) {
      const e: Record<string, unknown> = { expiry, isLatest: expiry === latest };
      (row.expiries as Record<string, unknown>[]).push(e);

      // Contract list (1 call): CE and PE rows for this expiry
      const rows = asArray<ContractRow>(await call("/v2/expired-instruments/option/contract", { instrument_key: idx.underlyingKey, expiry_date: expiry }));
      const strikes = [...new Set(rows.map((r) => r.strike_price).filter((s): s is number => typeof s === "number"))].sort((a, b) => a - b);
      e.contractRows = rows.length;
      e.strikesListed = strikes.length;

      // Underlying daily candles ending on expiry (1 call). Spot = latest candle on or before expiry, by timestamp.
      const und = (await call(`/v3/historical-candle/${encodeURIComponent(idx.underlyingKey)}/days/1/${expiry}/${addDays(expiry, -7)}`)) as { candles?: unknown } | null;
      const spotPick = pickSpotCandle(asArray<Candle>(und?.candles), expiry);
      if (!spotPick) { e.result = "no underlying candle on or before expiry; option candles skipped"; save(); continue; }
      const spot = spotPick.candle[4];
      e.spotDate = spotPick.date;
      e.spotClose = spot;
      e.spotWithinStrikeGrid = strikes.length > 0 && spot >= strikes[0] && spot <= strikes[strikes.length - 1];

      const atm = nearestStrike(strikes, spot);
      const ls = atm === null ? null : localStep(strikes, atm);
      if (atm === null || ls === null) { e.result = "no usable strike grid at ATM; option candles skipped"; save(); continue; }
      e.atmStrike = atm;
      e.strikeStep = ls.step;
      e.stepIntervalAbove = ls.above;
      e.stepIntervalBelow = ls.below;
      e.stepIntervalsAgree = ls.agree;

      // Legs: ATM CE and PE for every expiry; ITM/OTM on the latest expiry only, and only if the grid is regular at ATM
      const legs: [string, "CE" | "PE", number][] = [["ATM_CE", "CE", atm], ["ATM_PE", "PE", atm]];
      if (e.isLatest && ls.agree !== false) {
        legs.push(["ITM_CE", "CE", atm - 3 * ls.step], ["OTM_CE", "CE", atm + 3 * ls.step]);
        legs.push(["ITM_PE", "PE", atm + 3 * ls.step], ["OTM_PE", "PE", atm - 3 * ls.step]);
      } else if (e.isLatest) {
        e.itmOtmSkipped = "strike grid irregular at ATM: intervals above and below differ";
      }

      const legRows: Record<string, unknown>[] = [];
      e.legs = legRows;
      for (const [label, type, legTarget] of legs) {
        const pick = nearestListed(rows, type, legTarget);
        if (!pick) { legRows.push({ label, type, requestedStrike: legTarget, status: "no listed contract of this type" }); continue; }
        const strike = pick.strike_price as number;
        const reason = verifyContract(pick, expiry, type, strike);
        if (reason) { legRows.push({ label, type, requestedStrike: legTarget, listedStrike: strike, status: `not used: ${reason}` }); continue; }
        const cd = (await call(`/v2/expired-instruments/historical-candle/${encodeURIComponent(pick.instrument_key as string)}/30minute/${expiry}/${addDays(expiry, -14)}`)) as { candles?: unknown } | null;
        legRows.push({
          label,
          type,
          requestedStrike: legTarget,
          listedStrike: strike,
          expiredInstrumentKey: pick.instrument_key,
          expiryVerified: true,
          candles: candleSummary(asArray<Candle>(cd?.candles)),
        });
        save();
      }
      save();
    }
  }
} catch (err) {
  stopped = err instanceof StopRun ? err.message : `unexpected: ${(err as Error).message}`;
}

status = stopped ? "STOPPED" : "COMPLETE";
save();
console.log(JSON.stringify({ status, requestsUsed: requestCount, maxRequests: MAX_REQUESTS, stopped, saved: OUT }, null, 2));
