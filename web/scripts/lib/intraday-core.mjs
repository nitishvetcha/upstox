// Pure, offline logic for the research-only 1-minute stock collector. No network, no paper endpoints, no production data-root paths.
import * as fs from "node:fs";
import * as path from "node:path";

export const OUT_SUBDIR = ".research-data/intraday-bars";
export const EXPECTED_BARS_REGULAR = 375; // 09:15 .. 15:29 inclusive, one bar per minute
export const REGULAR_OPEN_MIN = 9 * 60 + 15;
export const REGULAR_CLOSE_MIN = 15 * 60 + 30;
const IST_OFFSET_MS = 330 * 60_000;
const MAX_GAP_MS = 60_000; // consecutive 1-minute bars are exactly 60 s apart

export class AuthError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuthError";
  }
}

export function resolveOutDir(cwd) {
  const out = path.resolve(cwd, OUT_SUBDIR);
  const dataRoot = path.resolve(cwd, ".data");
  if (out === dataRoot || out.startsWith(dataRoot + path.sep)) {
    throw new Error(`refusing to write research data under the production data root: ${out}`);
  }
  return out;
}

export function istDate(iso) {
  return new Date(Date.parse(iso) + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function istMinutes(iso) {
  const d = new Date(Date.parse(iso) + IST_OFFSET_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

// Raw Upstox V3 array: [timestamp, open, high, low, close, volume, openInterest]. Returns null when malformed.
export function normalizeCandle(raw) {
  if (!Array.isArray(raw) || raw.length < 6) return null;
  const [ts, open, high, low, close, volume, oi] = raw;
  if (typeof ts !== "string" || Number.isNaN(Date.parse(ts))) return null;
  const nums = [open, high, low, close, volume];
  if (!nums.every((v) => typeof v === "number" && Number.isFinite(v))) return null;
  return { timestamp: ts, open, high, low, close, volume, openInterest: typeof oi === "number" ? oi : 0 };
}

// Oldest-first. Malformed entries are dropped and counted by the caller through validateSession's invalidCount.
export function normalizeCandles(rawCandles) {
  if (!Array.isArray(rawCandles)) return { candles: [], malformed: 0 };
  const candles = [];
  let malformed = 0;
  for (const r of rawCandles) {
    const c = normalizeCandle(r);
    if (c) candles.push(c);
    else malformed++;
  }
  candles.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  return { candles, malformed };
}

// Validates one stock's candles for one session. Zero-volume bars are kept and reported, never rejected.
export function validateSession(candles, { date, expectedBars = EXPECTED_BARS_REGULAR, malformed = 0 }) {
  const issues = [];
  const seen = new Set();
  let duplicateCount = 0, zeroVolumeCount = 0, outsideWindowCount = 0, wrongDateCount = 0, invalidCount = malformed, missingIntervals = 0, distinctInWindow = 0;
  let prev = null;
  for (const c of candles) {
    if (c.high < c.low || c.open < 0 || c.close < 0 || c.open > c.high || c.open < c.low) {
      invalidCount++;
      issues.push(`invalid OHLC at ${c.timestamp}`);
    }
    if (c.volume < 0) {
      invalidCount++;
      issues.push(`negative volume at ${c.timestamp}`);
    }
    if (c.volume === 0) zeroVolumeCount++;
    if (seen.has(c.timestamp)) {
      duplicateCount++;
      issues.push(`duplicate timestamp ${c.timestamp}`);
    }
    seen.add(c.timestamp);
    const dateOk = istDate(c.timestamp) === date;
    if (!dateOk) wrongDateCount++;
    const m = istMinutes(c.timestamp);
    const inWindow = m >= REGULAR_OPEN_MIN && m < REGULAR_CLOSE_MIN;
    if (!inWindow) outsideWindowCount++;
    if (dateOk && inWindow) distinctInWindow++;
    if (prev !== null && Date.parse(c.timestamp) - Date.parse(prev) > MAX_GAP_MS) missingIntervals++;
    prev = c.timestamp;
  }
  if (missingIntervals) issues.push(`${missingIntervals} gap(s) longer than one minute`);
  if (wrongDateCount) issues.push(`${wrongDateCount} candle(s) dated outside ${date}`);
  if (outsideWindowCount) issues.push(`${outsideWindowCount} candle(s) outside the regular session window`);
  const missingBars = Math.max(0, expectedBars - distinctInWindow);
  if (missingBars) issues.push(`${missingBars} of ${expectedBars} expected bars missing`);

  let status;
  if (candles.length === 0) status = "EMPTY";
  else if (invalidCount || duplicateCount || wrongDateCount || outsideWindowCount || missingBars || missingIntervals) status = "PARTIAL";
  else status = "OK";

  return {
    status,
    candleCount: candles.length,
    expectedBars,
    missingBars,
    zeroVolumeCount,
    duplicateCount,
    outsideWindowCount,
    wrongDateCount,
    invalidCount,
    missingIntervals,
    issues,
  };
}

// A session is complete only once its regular close has passed on the IST clock (or the date is in the past).
export function sessionComplete(date, nowIso) {
  const today = istDate(nowIso);
  if (date < today) return true;
  if (date > today) return false;
  return istMinutes(nowIso) >= REGULAR_CLOSE_MIN;
}

export async function fetchWithRetry({ url, fetchImpl, attempts = 3, baseMs = 1000, sleep }) {
  let lastErr;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await sleep(baseMs * 2 ** (attempt - 1));
    let res;
    try {
      res = await fetchImpl(url);
    } catch (err) {
      lastErr = err;
      continue;
    }
    if (res.status === 401 || res.status === 403) {
      throw new AuthError(`HTTP ${res.status}: authentication not valid — stop the run and log in again`);
    }
    if (!res.ok) {
      lastErr = new Error(`HTTP ${res.status}`);
      continue;
    }
    return res.json();
  }
  throw lastErr;
}

export function atomicWriteJson(filePath, data) {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, filePath);
}

// Existing records are never overwritten. Returns the action for one stock/session file.
export function writeDecision(filePath) {
  return fs.existsSync(filePath) ? "SKIP_EXISTS" : "WRITE";
}

export function candleRequestUrl(base, instrumentKey, interval) {
  return `${base}/api/research/stock-candles?instrumentKey=${encodeURIComponent(instrumentKey)}&interval=${interval}`;
}

// Orchestrates one session across the universe. Dry-run performs no fetch and no write.
export async function runCollection({ constituents, date, nowIso, live, base, outDir, fetchImpl, sleep, delayMs = 300 }) {
  const result = { mode: live ? "LIVE" : "DRY_RUN", date, stocks: [], aborted: null, counts: { OK: 0, PARTIAL: 0, EMPTY: 0, FAILED: 0, SKIPPED: 0 } };
  if (!sessionComplete(date, nowIso)) {
    result.aborted = "SESSION_NOT_COMPLETE";
    return result;
  }
  for (const { symbol, instrumentKey } of constituents) {
    const outPath = path.join(outDir, `${date}-${symbol}.json`);
    if (!live) {
      result.stocks.push({ symbol, action: writeDecision(outPath) === "WRITE" ? "WOULD_FETCH" : "SKIP_EXISTS" });
      continue;
    }
    if (writeDecision(outPath) === "SKIP_EXISTS") {
      result.stocks.push({ symbol, action: "SKIP_EXISTS" });
      result.counts.SKIPPED++;
      continue;
    }
    try {
      const raw = await fetchWithRetry({ url: candleRequestUrl(base, instrumentKey, "1"), fetchImpl, sleep });
      const { candles, malformed } = normalizeCandles(raw?.candles ?? []);
      const validation = validateSession(candles, { date, malformed });
      const record = {
        date,
        symbol,
        instrumentKey,
        interval: "1minute",
        provider: "upstox",
        collectedAt: nowIso,
        candles,
        status: validation.status,
        validation,
      };
      atomicWriteJson(outPath, record);
      result.stocks.push({ symbol, action: "WRITTEN", status: validation.status, candleCount: candles.length });
      result.counts[validation.status]++;
    } catch (err) {
      if (err instanceof AuthError) {
        result.aborted = "AUTH";
        result.error = err.message;
        return result;
      }
      result.stocks.push({ symbol, action: "FAILED", error: err.message });
      result.counts.FAILED++;
    }
    await sleep(delayMs);
  }
  return result;
}
