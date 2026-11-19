// Technical candle freshness (Issue 2 / B5). Pure functions: no I/O, no cache, no clock except the `now` passed in.
//
// Rules (engineering safety thresholds chosen for B5, not market-data validation):
// - Only COMPLETED candles feed indicators and prices. A candle is completed when its interval has closed:
//   start + interval <= now. A forming candle is never used as a completed one.
// - The newest completed candle's CLOSE time is what ages. Fetch time is not a substitute.
// - Maximum completed-candle age while the market is OPEN = interval + 2 min delivery grace.
//   For 15m that is 17 min: a bar closes every 15 min, and the next one should be visible within about 2 min of its close.
//   The grace is per timeframe, so 5m, 30m and 1h do not inherit the 15m value.
// - Anything malformed, missing a timestamp, or future-dated beyond the 5 s skew in the newest expected candle blocks the cycle.
// - Non-empty is not fresh. A stale, previous-session or forming-only series is never LIVE.
import type { Candle, DataSource, Timeframe } from "../types.ts";
import { FUTURE_TIMESTAMP_TOLERANCE_MS } from "../time.ts";

export type TechnicalReasonCode = "DATA_QUALITY" | "NO_CANDLES" | "NO_INTRADAY_CANDLES" | "PRE_OPEN" | "STALE_CANDLE" | "STALE_FETCH";

// The frozen engine blocks technicals whose fetch is older than 300 s (strategy.ts: stale("technical", 2.5), i.e. 120 s × 2.5).
// The candle classification applies the same limit upstream, so a LIVE label can never coexist with an engine block.
export const TECHNICAL_FETCH_LIMIT_MS = 300_000;
export type MarketSession = "OPEN" | "PRE-OPEN" | "CLOSED";

export const CANDLE_INTERVAL_MS: Partial<Record<Timeframe, number>> = {
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "30m": 30 * 60_000,
  "1h": 60 * 60_000,
};
// Delivery grace after a candle closes. Engineering threshold chosen for B5 (see the B5 implementation report).
export const CANDLE_DELIVERY_GRACE_MS = 2 * 60_000;

// Maximum age of the newest completed candle's close while the market is open. null for 1d (daily = end-of-day).
export function maxCompletedCandleAgeMs(timeframe: Timeframe): number | null {
  const interval = CANDLE_INTERVAL_MS[timeframe];
  return interval === undefined ? null : interval + CANDLE_DELIVERY_GRACE_MS;
}

export const istDay = (ms: number) => new Date(ms + 330 * 60_000).toISOString().slice(0, 10);

// Completed intraday candles only: the interval has closed at `now`.
export function completedIntradayCandles(candles: Candle[], timeframe: Timeframe, now: Date): Candle[] {
  const interval = CANDLE_INTERVAL_MS[timeframe];
  if (interval === undefined) return candles;
  return candles.filter((c) => Date.parse(c.timestamp) + interval <= now.getTime());
}

// Daily candles are end-of-day by nature; only sessions before today are complete.
export function completedDailyCandles(candles: Candle[], now: Date): Candle[] {
  const today = istDay(now.getTime());
  return candles.filter((c) => istDay(Date.parse(c.timestamp)) < today);
}

// Structural check of a single raw candle row (the newest one in an intraday response).
export function newestRowShape(raw: unknown[] | undefined): { wellFormed: boolean; startMs: number | null } {
  if (!Array.isArray(raw) || raw.length === 0) return { wellFormed: true, startMs: null }; // empty: handled as NO_CANDLES
  const row = raw[0];
  if (!Array.isArray(row) || typeof row[0] !== "string") return { wellFormed: false, startMs: null };
  const startMs = Date.parse(row[0]);
  if (!Number.isFinite(startMs)) return { wellFormed: false, startMs: null };
  const ohlc = [row[1], row[2], row[3], row[4]].map((v) => (typeof v === "number" && Number.isFinite(v) ? v : null));
  if (ohlc.some((v) => v === null)) return { wellFormed: false, startMs };
  return { wellFormed: true, startMs };
}

// The newest expected candle is usable only if it is well-formed and not future-dated beyond the existing 5 s skew.
export function newestCandleUsable(shape: { wellFormed: boolean; startMs: number | null }, now: Date): boolean {
  if (!shape.wellFormed) return false;
  if (shape.startMs === null) return true; // empty series
  return shape.startMs <= now.getTime() + FUTURE_TIMESTAMP_TOLERANCE_MS;
}

export interface TechnicalClassification {
  source: DataSource;
  reasonCode: TechnicalReasonCode | null;
  reason: string | null;
  lastCompletedAt: string | null; // close time of the newest completed candle
  ageMs: number | null;           // now − close of the newest completed candle
}

export function classifyTechnicalSeries(input: {
  timeframe: Timeframe;
  completed: Candle[]; // already filtered to completed candles
  now: Date;
  market: MarketSession;
  newestUsable: boolean;
  fetchAgeMs?: number | null; // age of the upstream response that produced the series (B6)
}): TechnicalClassification {
  const { timeframe, completed, now, market, newestUsable, fetchAgeMs = null } = input;
  const unavailable = (reasonCode: TechnicalReasonCode, reason: string, lastCompletedAt: string | null = null, ageMs: number | null = null): TechnicalClassification =>
    ({ source: "UNAVAILABLE", reasonCode, reason, lastCompletedAt, ageMs });

  if (!newestUsable) {
    return unavailable("DATA_QUALITY", "Newest intraday candle is malformed, missing a timestamp or future-dated: technical analysis is blocked until the feed is valid.");
  }
  if (!completed.length) {
    return unavailable("NO_CANDLES", "No completed candles are available for technical analysis.");
  }
  const last = completed.at(-1)!;
  const interval = CANDLE_INTERVAL_MS[timeframe];
  const closeMs = interval === undefined ? Date.parse(last.timestamp) + 24 * 60 * 60_000 : Date.parse(last.timestamp) + interval;
  const lastCompletedAt = new Date(closeMs).toISOString();
  const ageMs = now.getTime() - closeMs;

  if (timeframe === "1d") {
    // Completed daily candles are end-of-day data by definition; never a live source.
    return { source: "END_OF_DAY", reasonCode: null, reason: null, lastCompletedAt, ageMs };
  }
  if (market === "CLOSED") {
    // Closed session (after close, weekend, holiday): the newest completed candles are end-of-day data.
    return { source: "END_OF_DAY", reasonCode: null, reason: null, lastCompletedAt, ageMs };
  }

  const today = istDay(now.getTime());
  const lastDay = istDay(Date.parse(last.timestamp));
  if (lastDay !== today) {
    return market === "PRE-OPEN"
      ? unavailable("PRE_OPEN", "Pre-open: no intraday candles for today yet. Recommendations wait for the first completed candle after the open.", lastCompletedAt, ageMs)
      : unavailable("NO_INTRADAY_CANDLES", "Market open but no completed intraday candle for today yet. The newest candle on file is from a previous session, so it is not used.", lastCompletedAt, ageMs);
  }

  const maxAge = maxCompletedCandleAgeMs(timeframe)!;
  if (ageMs > maxAge) {
    return { source: "STALE", reasonCode: "STALE_CANDLE", reason: `Newest completed ${timeframe} candle closed ${Math.round(ageMs / 60_000)} min ago; limit is ${Math.round(maxAge / 60_000)} min.`, lastCompletedAt, ageMs };
  }
  if (fetchAgeMs !== null && fetchAgeMs > TECHNICAL_FETCH_LIMIT_MS) {
    return { source: "STALE", reasonCode: "STALE_FETCH", reason: `Technical data was fetched ${Math.round(fetchAgeMs / 1000)} s ago; the limit is ${TECHNICAL_FETCH_LIMIT_MS / 1000} s.`, lastCompletedAt, ageMs };
  }
  return { source: "LIVE", reasonCode: null, reason: null, lastCompletedAt, ageMs };
}
