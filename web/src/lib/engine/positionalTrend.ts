// Positional (multi-day, long-only) stock signals from DAILY candles.
// Separate from the 11.4-frozen strategy and from the intraday scanner. Candidate filter only, not a promise of profit.
import type { Candle } from "../types.ts";
import { atr as calcAtr } from "../services/technicalAnalysis.ts";

// RETIRED as a trading strategy (positional-v1): 5Y backtest −35% vs NIFTY +26%, PF 0.87, gross edge ≈ 0.
// Frozen baseline: .data/positional-backtest/BASELINE_positional-v1_frozen.json. Do not tune these rules;
// test new ideas as new, pre-registered versions instead.
export const POSITIONAL_VERSION = "positional-v1-retired";
export const POSITIONAL_RETIRED_NOTE = "Retired strategy: lost money in a 5-year backtest (−35% vs NIFTY +26%). Shown for observation only — not a trade signal.";

export type PositionalSetup = "BREAKOUT" | "TREND_CONTINUATION_LONG" | "MOMENTUM";

export interface PositionalSignal {
  ok: true;
  setup: PositionalSetup;
  score: number;       // 0-100
  confidence: number;  // 0-100, from how many independent checks agree + data quality
  close: number;
  sma20: number;
  sma50: number;
  atr: number;
  high20: number;
  volumeRatio: number | null;
  rs20: number | null; // stock 20-session return minus benchmark's, in % points
  entry: number;
  stop: number;
  target1: number;
  target2: number;
  rr: number;
  reasons: string[];
  invalidation: string;
}

export interface PositionalReject { ok: false; reason: string }

export const MIN_BARS = 60;
const MAX_STALE_DAYS = 6; // last bar older than this → stale (covers weekend + one holiday)

const sma = (xs: number[], n: number, end = xs.length) => (end < n ? null : xs.slice(end - n, end).reduce((a, b) => a + b, 0) / n);
const r2 = (n: number) => Math.round(n * 100) / 100;
const day = (c: Candle) => c.timestamp.slice(0, 10);

// Candles must be complete, ascending, one per session, and recent.
export function checkDailyCandles(c: Candle[], now: Date): string | null {
  if (c.length < MIN_BARS) return `Only ${c.length} daily candles (need ${MIN_BARS})`;
  for (let i = 0; i < c.length; i++) {
    const k = c[i];
    if (![k.open, k.high, k.low, k.close].every((v) => Number.isFinite(v) && v > 0) || k.high < k.low) return `Bad candle on ${day(k)}`;
    if (i && day(k) <= day(c[i - 1])) return `Candles out of order or duplicated at ${day(k)}`;
  }
  const ageDays = (now.getTime() - new Date(c[c.length - 1].timestamp).getTime()) / 86_400_000;
  if (ageDays > MAX_STALE_DAYS) return `Latest daily candle is ${Math.floor(ageDays)} days old`;
  return null;
}

const ret20 = (c: Candle[]) => (c.length > 20 ? (c[c.length - 1].close / c[c.length - 21].close - 1) * 100 : null);

// An overnight jump beyond ±25% in a NIFTY stock is almost always a split, bonus or demerger in unadjusted
// candles (e.g. TMPV demerger, 2025-10-14). Averages must not straddle it: keep only the bars after the last one.
const CORP_ACTION_GAP = 0.25;
export function sinceLastCorporateAction(c: Candle[]): { candles: Candle[]; date: string | null } {
  for (let i = c.length - 1; i > 0; i--) {
    if (Math.abs(c[i].open / c[i - 1].close - 1) > CORP_ACTION_GAP) return { candles: c.slice(i), date: day(c[i]) };
  }
  return { candles: c, date: null };
}

export function evaluatePositional(all: Candle[], benchmark: Candle[] | null, now: Date, liveQuote = false): PositionalSignal | PositionalReject {
  const { candles, date: actionDate } = sinceLastCorporateAction(all);
  if (actionDate && candles.length < MIN_BARS) return { ok: false, reason: `Likely split/demerger on ${actionDate} — not enough clean history yet` };
  const bad = checkDailyCandles(candles, now);
  if (bad) return { ok: false, reason: bad };

  const closes = candles.map((c) => c.close);
  const last = candles[candles.length - 1];
  const close = last.close;
  const sma20 = sma(closes, 20)!;
  const sma50 = sma(closes, 50)!;
  const sma20Prev = sma(closes, 20, closes.length - 5)!;
  const atr = calcAtr(candles, 14)!;
  const prior = candles.slice(-21, -1); // the 20 sessions before today
  const high20 = Math.max(...prior.map((c) => c.high));
  const low5 = Math.min(...candles.slice(-6, -1).map((c) => c.low));
  const vols = prior.map((c) => c.volume).filter((v): v is number => v !== null && v > 0);
  const volumeRatio = last.volume && vols.length >= 15 ? last.volume / (vols.reduce((a, b) => a + b, 0) / vols.length) : null;
  const sRet = ret20(candles);
  const bRet = benchmark ? ret20(benchmark) : null;
  const rs20 = sRet !== null && bRet !== null ? sRet - bRet : null;

  // Gate: only stocks already in an uptrend. Longs only: cash shorts can't be held overnight in India.
  if (!(close > sma50 && sma20 > sma50)) return { ok: false, reason: "Not in an uptrend (price/20-day avg not above 50-day avg)" };
  if (close > sma20 + 3 * atr) return { ok: false, reason: "Too stretched above the 20-day average — wait for a pullback" };

  const breakout = close > high20;
  const nearHigh = !breakout && close >= high20 * 0.98;
  const rising = sma20 > sma20Prev;
  const pullback = close <= sma20 + atr && close >= sma20 - 0.5 * atr;

  // Stop: just below the 5-session swing low, kept between 1 and 2 ATR from entry.
  const stop = r2(Math.min(close - atr, Math.max(low5 - 0.25 * atr, close - 2 * atr)));
  const risk = close - stop;
  const target1 = r2(close + 3 * atr);
  const target2 = r2(close + 5 * atr);
  const rr = r2((target1 - close) / risk);
  if (rr < 1.5) return { ok: false, reason: `Reward/risk ${rr} below 1.5` };

  const reasons: string[] = [];
  let score = 0;
  // Trend (25)
  score += 10; reasons.push(`Above 50-day average (₹${r2(sma50)})`);
  if (close > sma20) { score += 10; reasons.push(`Above 20-day average (₹${r2(sma20)})`); }
  score += 5; // sma20 > sma50 (gated)
  // Momentum (25)
  if (rising) { score += 10; reasons.push("20-day average is rising"); }
  if (rs20 !== null) {
    if (rs20 >= 5) score += 15; else if (rs20 >= 2) score += 10; else if (rs20 > 0) score += 5;
    reasons.push(`${rs20 >= 0 ? "Beat" : "Lagged"} NIFTY by ${Math.abs(rs20).toFixed(1)}% over 20 sessions`);
  }
  // Breakout (20)
  if (breakout) { score += 20; reasons.push(`${liveQuote ? "Trading" : "Closed"} above 20-session high ₹${r2(high20)}`); }
  else if (nearHigh) { score += 10; reasons.push(`Within 2% of 20-session high ₹${r2(high20)}`); }
  // Volume (15)
  if (volumeRatio !== null) {
    if (volumeRatio >= 1.5) { score += 15; reasons.push(`Volume ${volumeRatio.toFixed(1)}× the 20-day average`); }
    else if (volumeRatio >= 1.2) score += 8;
  }
  // Risk (15)
  score += rr >= 2.5 ? 15 : rr >= 2 ? 10 : 5;

  // During market hours today's bar is still forming: "close" is the live price and volume is partial.
  if (liveQuote) reasons.push("⚠ Today's candle is still forming — confirm after the 3:30 PM close");

  const checks = [close > sma20, rising, rs20 !== null && rs20 > 0, breakout || nearHigh, volumeRatio !== null && volumeRatio >= 1.2];
  const dataQ = (liveQuote ? 0.5 : 0) + (volumeRatio !== null ? 0.25 : 0) + (rs20 !== null ? 0.25 : 0);
  const confidence = Math.round((checks.filter(Boolean).length / checks.length) * 70 + dataQ * 30);

  const setup: PositionalSetup = breakout && (volumeRatio ?? 0) >= 1.2 ? "BREAKOUT" : pullback && rising ? "TREND_CONTINUATION_LONG" : "MOMENTUM";

  return {
    ok: true, setup, score: Math.min(100, score), confidence, close, sma20: r2(sma20), sma50: r2(sma50), atr: r2(atr),
    high20: r2(high20), volumeRatio: volumeRatio === null ? null : r2(volumeRatio), rs20: rs20 === null ? null : r2(rs20),
    entry: close, stop, target1, target2, rr, reasons,
    invalidation: `Daily close below ₹${stop}, or below the 50-day average ₹${r2(sma50)}`,
  };
}

// Today's bar from the live quote replaces/extends the history (Upstox daily history lags the live session).
export function withTodayBar(history: Candle[], q: { ltp: number | null; open?: number; high?: number; low?: number; volume?: number }, sessionDate: string): Candle[] {
  if (q.ltp === null || q.open === undefined || q.high === undefined || q.low === undefined) return history;
  const bar: Candle = { timestamp: `${sessionDate}T09:15:00+05:30`, open: q.open, high: q.high, low: q.low, close: q.ltp, volume: q.volume ?? null };
  const past = history.filter((c) => day(c) < sessionDate);
  return [...past, bar];
}
