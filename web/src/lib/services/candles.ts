// Candle plan + normalization (pure). Upstox v3 candles arrive newest-first as
// [timestamp, open, high, low, close, volume, oi]; we return oldest-first `Candle`s.
import type { Candle, Timeframe } from "../types.ts";
import { UpstoxError } from "./errors.ts";

export const TIMEFRAMES: Timeframe[] = ["5m", "15m", "30m", "1h", "1d"];
export const DEFAULT_TIMEFRAME: Timeframe = "15m";

export function isTimeframe(v: string): v is Timeframe {
  return (TIMEFRAMES as string[]).includes(v);
}

// historyDays: enough calendar days for EMA 200 (~25 bars/day at 15m) within Upstox's range limits
// (≤ 1 month for ≤15-minute units, ≤ 1 quarter for 30m/hours). intradayTtl follows the spec's cache table.
export const CANDLE_PLAN: Record<Timeframe, { unit: string; interval: number; historyDays: number; intradayTtlMs: number | null }> = {
  "5m": { unit: "minutes", interval: 5, historyDays: 10, intradayTtlMs: 45_000 },
  "15m": { unit: "minutes", interval: 15, historyDays: 25, intradayTtlMs: 60_000 },
  "30m": { unit: "minutes", interval: 30, historyDays: 60, intradayTtlMs: 120_000 },
  "1h": { unit: "hours", interval: 1, historyDays: 85, intradayTtlMs: 300_000 },
  "1d": { unit: "days", interval: 1, historyDays: 450, intradayTtlMs: null }, // completed days only
};
export const HISTORY_TTL_MS = 60 * 60_000; // history excludes today, so it barely changes
export const DAILY_TTL_MS = 15 * 60_000;

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function normalizeCandles(data: unknown): Candle[] {
  const raw = (data as { candles?: unknown } | null)?.candles;
  if (!Array.isArray(raw)) throw new UpstoxError("UPSTOX_BAD_RESPONSE", "candles missing");
  const out: Candle[] = [];
  for (const c of raw) {
    if (!Array.isArray(c) || typeof c[0] !== "string" || Number.isNaN(Date.parse(c[0]))) continue;
    const [open, high, low, close] = [c[1], c[2], c[3], c[4]].map(num);
    if (open === null || high === null || low === null || close === null) continue; // never patch a bad candle
    out.push({ timestamp: c[0], open, high, low, close, volume: num(c[5]) });
  }
  if (raw.length && !out.length) throw new UpstoxError("UPSTOX_BAD_RESPONSE", "no valid candles");
  // Indices report volume 0 on every candle: that is "no volume", not zero trading.
  if (out.every((c) => !c.volume)) for (const c of out) c.volume = null;
  return out.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

// History + today's intraday, de-duplicated by timestamp, oldest first.
export function mergeCandles(...sets: Candle[][]): Candle[] {
  const byTime = new Map<number, Candle>();
  for (const set of sets) for (const c of set) byTime.set(Date.parse(c.timestamp), c);
  return [...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([, c]) => c);
}
