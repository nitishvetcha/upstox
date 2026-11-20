// Stock V2 signal candidates. Every function reads only indices at or before the decision bar `i`.
import type { Side } from "./risk.ts";

export type StrategyId = "TREND_RECLAIM" | "PULLBACK_RECLAIM" | "ORB_CONTINUATION";

export const STRATEGIES: StrategyId[] = ["TREND_RECLAIM", "PULLBACK_RECLAIM", "ORB_CONTINUATION"];
export const PULLBACK_LOOKBACK = 3; // bars before the decision bar in which price must have touched EMA 21
export const OPENING_RANGE_BARS = 15; // 09:15–09:29; signals may begin from 09:30

export interface SignalInputs {
  i: number;
  close: number[];
  low: number[];
  high: number[];
  e9: (number | null)[];
  e21: (number | null)[];
  vwap: (number | null)[]; // session-aligned: vwap[i] is the VWAP at global index i, or null
  sessionStart?: number;
}

// TREND_RECLAIM: EMA 9 above EMA 21 and close above VWAP (LONG); mirror for SHORT.
// This is the Phase 1 rule, kept as a candidate so development can compare it with the pullback variant.
export function trendSignal(x: SignalInputs): Side | null {
  const { i, close, e9, e21, vwap } = x;
  const a9 = e9[i], a21 = e21[i], v = vwap[i];
  if (a9 === null || a21 === null || v === null) return null;
  if (a9 > a21 && close[i] > v) return "LONG";
  if (a9 < a21 && close[i] < v) return "SHORT";
  return null;
}

// PULLBACK_RECLAIM: trend is established, price pulled back to EMA 21 within the lookback, and the current bar
// closes back through EMA 9 and VWAP in the trend direction. LONG requires a low at or below EMA 21 in the lookback.
export function pullbackSignal(x: SignalInputs): Side | null {
  const { i, close, low, high, e9, e21, vwap } = x;
  const a9 = e9[i], a21 = e21[i], v = vwap[i];
  if (a9 === null || a21 === null || v === null) return null;
  const from = i - PULLBACK_LOOKBACK;
  if (from < 0) return null;
  let touchedLong = false, touchedShort = false;
  for (let j = from; j < i; j++) {
    const ej = e21[j];
    if (ej === null) return null;
    if (low[j] <= ej) touchedLong = true;
    if (high[j] >= ej) touchedShort = true;
  }
  if (a9 > a21 && touchedLong && close[i] > a9 && close[i] > v) return "LONG";
  if (a9 < a21 && touchedShort && close[i] < a9 && close[i] < v) return "SHORT";
  return null;
}

// ORB_CONTINUATION: the first close crossing the completed 15-minute opening range, confirmed by EMA trend and VWAP.
// The range contains only bars before the decision bar and the next bar open is still used for execution.
export function openingRangeSignal(x: SignalInputs): Side | null {
  const { i, close, low, high, e9, e21, vwap, sessionStart } = x;
  if (sessionStart == null || i < sessionStart + OPENING_RANGE_BARS || i <= 0) return null;
  const a9 = e9[i], a21 = e21[i], v = vwap[i];
  if (a9 === null || a21 === null || v === null) return null;
  const openingHigh = Math.max(...high.slice(sessionStart, sessionStart + OPENING_RANGE_BARS));
  const openingLow = Math.min(...low.slice(sessionStart, sessionStart + OPENING_RANGE_BARS));
  if (a9 > a21 && close[i] > v && close[i] > openingHigh && close[i - 1] <= openingHigh) return "LONG";
  if (a9 < a21 && close[i] < v && close[i] < openingLow && close[i - 1] >= openingLow) return "SHORT";
  return null;
}

export function signalFor(strategy: StrategyId, x: SignalInputs): Side | null {
  if (strategy === "TREND_RECLAIM") return trendSignal(x);
  if (strategy === "PULLBACK_RECLAIM") return pullbackSignal(x);
  return openingRangeSignal(x);
}
