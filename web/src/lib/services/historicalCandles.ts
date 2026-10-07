// Historical candle range loader (read-only). Splits a requested range into Upstox-sized chunks, fetches each,
// merges/sorts/de-duplicates, and reports session-aware coverage in IST. It never silently shortens a range:
// whatever could not be fetched shows up as PARTIAL coverage with the missing sessions listed.
import type { Candle, Timeframe } from "../types.ts";
import { isTradingDay, NSE_HOLIDAYS, NSE_SPECIAL_SESSIONS, REGULAR_SESSION, sessionWindow } from "../time.ts";
import { normalizeCandles } from "./candles.ts";
import { cached } from "./cache.ts";

// Max calendar days per request (Upstox v3 historical-candle limits: ≤15-minute units → 1 month; 30m/hours →
// 1 quarter; days → 1 decade). Chunks stay a little inside each limit.
export const MAX_CHUNK_DAYS: Record<Timeframe, number> = { "5m": 28, "15m": 28, "30m": 85, "1h": 85, "1d": 3000 };
const MINUTES: Record<Timeframe, number> = { "5m": 5, "15m": 15, "30m": 30, "1h": 60, "1d": 1440 };
const IST_MS = 330 * 60_000;
export const HISTORICAL_TTL_MS = 6 * 60 * 60_000;

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => ymd(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000);
export const istDay = (iso: string) => ymd(Date.parse(iso) + IST_MS);

// Bars a session should contain (bars start every `interval` minutes from the open and before the close: 09:15–15:30
// for a regular session, the published window for a special-timing session).
export function expectedBarsPerSession(interval: Timeframe, day?: string): number {
  const w = (day && sessionWindow(day)) || REGULAR_SESSION;
  return interval === "1d" ? 1 : Math.ceil((w.close - w.open) / MINUTES[interval]);
}

export interface Chunk {
  from: string; // YYYY-MM-DD inclusive
  to: string; // YYYY-MM-DD inclusive
}

export function planChunks(startDate: string, endDate: string, interval: Timeframe): Chunk[] {
  if (startDate > endDate) return [];
  const out: Chunk[] = [];
  for (let from = startDate; from <= endDate; from = addDays(from, MAX_CHUNK_DAYS[interval])) {
    const to = addDays(from, MAX_CHUNK_DAYS[interval] - 1);
    out.push({ from, to: to < endDate ? to : endDate });
  }
  return out;
}

export function tradingDays(startDate: string, endDate: string): { trading: string[]; weekends: number; holidays: string[]; specialSessions: string[] } {
  const trading: string[] = [];
  const holidays: string[] = [];
  const specialSessions: string[] = [];
  let weekends = 0;
  for (let d = startDate; d <= endDate; d = addDays(d, 1)) {
    const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (NSE_SPECIAL_SESSIONS[d]) {
      specialSessions.push(d);
      trading.push(d);
    } else if (wd === 0 || wd === 6) weekends++;
    else if (NSE_HOLIDAYS.has(d)) holidays.push(d);
    else if (isTradingDay(d)) trading.push(d);
  }
  return { trading, weekends, holidays, specialSessions };
}

export interface Coverage {
  requestedStart: string;
  requestedEnd: string;
  actualStart: string | null;
  actualEnd: string | null;
  barCount: number;
  expectedBars: number;
  coveragePercent: number;
  tradingDaysExpected: number;
  missingSessions: string[]; // trading days with no bars at all
  partialSessions: { day: string; bars: number; expected: number }[];
  weekendDays: number; // excluded, not missing
  holidays: string[]; // excluded, not missing (from NSE_HOLIDAYS)
  specialSessions: string[]; // SPECIAL_TIMING trading days, expected bars from their own window
  duplicateBars: number;
  outOfOrderBars: number;
  outsideRangeBars: number; // fetched but outside the requested range: dropped, never used
  chunks: number;
  failedChunks: Chunk[];
  status: "FULL" | "PARTIAL" | "EMPTY";
  reason: string | null;
}

// Merge chunk results in arrival order: count duplicates and out-of-order bars, then sort + de-duplicate and keep
// only bars inside [startDate, endDate] (IST dates).
export function mergeAndValidate(
  chunkCandles: Candle[][],
  startDate: string,
  endDate: string,
  interval: Timeframe,
  chunks: number,
  failedChunks: Chunk[] = [],
): { candles: Candle[]; coverage: Coverage } {
  const seen = new Set<number>();
  let duplicateBars = 0;
  let outOfOrderBars = 0;
  let last = -Infinity;
  const unique: Candle[] = [];
  for (const c of chunkCandles.flat()) {
    const t = Date.parse(c.timestamp);
    if (seen.has(t)) {
      duplicateBars++;
      continue;
    }
    if (t < last) outOfOrderBars++;
    last = Math.max(last, t);
    seen.add(t);
    unique.push(c);
  }
  unique.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const inRange = unique.filter((c) => istDay(c.timestamp) >= startDate && istDay(c.timestamp) <= endDate);
  const { trading, weekends, holidays, specialSessions } = tradingDays(startDate, endDate);
  const perDay = new Map<string, number>();
  for (const c of inRange) perDay.set(istDay(c.timestamp), (perDay.get(istDay(c.timestamp)) ?? 0) + 1);
  const exp = (d: string) => expectedBarsPerSession(interval, d);
  const missingSessions = trading.filter((d) => !perDay.has(d));
  const partialSessions = trading.filter((d) => perDay.has(d) && perDay.get(d)! < exp(d)).map((d) => ({ day: d, bars: perDay.get(d)!, expected: exp(d) }));
  const expectedBars = trading.reduce((a, d) => a + exp(d), 0);
  const counted = trading.reduce((a, d) => a + Math.min(perDay.get(d) ?? 0, exp(d)), 0);
  const coveragePercent = expectedBars ? Math.round((counted / expectedBars) * 10000) / 100 : 0;
  const status: Coverage["status"] = !inRange.length ? "EMPTY" : coveragePercent >= 100 && !failedChunks.length ? "FULL" : "PARTIAL";
  const reason =
    status === "FULL"
      ? null
      : status === "EMPTY"
        ? "Historical API returned no candles for the requested range"
        : failedChunks.length
          ? `Historical API did not return complete data (${failedChunks.length} chunk request(s) failed)`
          : `Historical API did not return complete data (${missingSessions.length} missing session(s), ${partialSessions.length} partial)`;
  return {
    candles: inRange,
    coverage: {
      requestedStart: startDate,
      requestedEnd: endDate,
      actualStart: inRange[0] ? istDay(inRange[0].timestamp) : null,
      actualEnd: inRange.length ? istDay(inRange[inRange.length - 1].timestamp) : null,
      barCount: inRange.length,
      expectedBars,
      coveragePercent,
      tradingDaysExpected: trading.length,
      missingSessions,
      partialSessions,
      weekendDays: weekends,
      holidays,
      specialSessions,
      duplicateBars,
      outOfOrderBars,
      outsideRangeBars: unique.length - inRange.length,
      chunks,
      failedChunks,
      status,
      reason,
    },
  };
}

export interface RangeRequest {
  instrumentKey: string;
  interval: Timeframe;
  startDate: string;
  endDate: string;
}

export type ChunkFetcher = (req: RangeRequest, chunk: Chunk) => Promise<unknown>; // returns raw { candles: [...] }

export interface HistoricalRange {
  request: RangeRequest;
  candles: Candle[];
  coverage: Coverage;
  source: "UPSTOX_HISTORICAL";
  fetchedAt: string; // metadata only; never part of backtest results
}

export const CHUNK_RETRIES = 2; // a GET is idempotent, so a failed chunk is retried (with backoff) before being reported

// Fetch every chunk (sequentially, to respect rate limits), tolerate failed chunks (reported, not hidden).
export async function fetchHistoricalRange(req: RangeRequest, fetchChunk: ChunkFetcher, now = () => new Date(), backoffMs = 750): Promise<HistoricalRange> {
  const plan = planChunks(req.startDate, req.endDate, req.interval);
  const results: Candle[][] = [];
  const failed: Chunk[] = [];
  for (const chunk of plan) {
    for (let attempt = 0; ; attempt++) {
      try {
        results.push(normalizeCandles(await fetchChunk(req, chunk)));
        break;
      } catch {
        if (attempt >= CHUNK_RETRIES) {
          failed.push(chunk);
          break;
        }
        await new Promise((r) => setTimeout(r, backoffMs * (attempt + 1)));
      }
    }
  }
  const { candles, coverage } = mergeAndValidate(results, req.startDate, req.endDate, req.interval, plan.length, failed);
  return { request: req, candles, coverage, source: "UPSTOX_HISTORICAL", fetchedAt: now().toISOString() };
}

// Cached by exactly (instrument, interval, start, end): another range never leaks into this one. Failures and
// incomplete ranges are not cached, so a retry can fill them.
export function loadHistoricalRange(req: RangeRequest, fetchChunk: ChunkFetcher, now = () => new Date()): Promise<HistoricalRange> {
  const key = `historical:${req.instrumentKey}:${req.interval}:${req.startDate}:${req.endDate}`;
  return cached(key, HISTORICAL_TTL_MS, async () => {
    const r = await fetchHistoricalRange(req, fetchChunk, now);
    if (r.coverage.failedChunks.length) throw Object.assign(new Error("incomplete"), { partial: r });
    return r;
  }).catch((e: { partial?: HistoricalRange }) => {
    if (e?.partial) return e.partial;
    throw e;
  });
}

// Coverage of a sub-range (the requested backtest range inside a fetch that also includes warmup history),
// carrying over the fetch's duplicate / out-of-order / failed-chunk counts.
export function coverageFor(r: HistoricalRange, startDate: string, endDate: string): Coverage {
  const { coverage } = mergeAndValidate([r.candles], startDate, endDate, r.request.interval, r.coverage.chunks, r.coverage.failedChunks);
  return { ...coverage, duplicateBars: r.coverage.duplicateBars, outOfOrderBars: r.coverage.outOfOrderBars };
}

export const addCalendarDays = addDays;
