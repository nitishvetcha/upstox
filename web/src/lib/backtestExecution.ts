// Intrabar execution model (pure, deterministic). Historical option OHLC does not exist here: option prices
// inside a bar are MODEL DERIVED from the underlying's historical OHLC through the backtest's pricing model.
import type { Candle } from "./types.ts";

export type ExecutionModel = "CLOSE_ONLY" | "INTRABAR_MODEL_DERIVED";
export const INTRABAR_PATH_MODEL = "DETERMINISTIC_OHLC_PATH" as const;
export const SAME_BAR_EXIT_POLICY = "CONSERVATIVE_STOP_FIRST" as const;

// Assumed path inside one underlying bar (the real path is unknown):
//   bullish/flat bar (close ≥ open): Open → Low → High → Close
//   bearish bar      (close < open): Open → High → Low → Close
export function intrabarPath(c: Pick<Candle, "open" | "high" | "low" | "close">): [number, number, number, number] {
  return c.close >= c.open ? [c.open, c.low, c.high, c.close] : [c.open, c.high, c.low, c.close];
}

export interface IntrabarExit {
  reason: "STOP_LOSS" | "TARGET";
  fillSpot: number; // underlying level at which the option position reached the exit price (or the gapped open)
  gap: boolean; // true when the bar opened beyond the level: fill at the open, never at the better stop/target
  bothTouched: boolean; // stop and target both reached in this bar → stop wins (conservative)
}

const SAMPLES = 24; // per path segment, then bisection; handles non-monotonic values (straddles, condors)

// `value(spot)` = position value per unit (debit: what it's worth; credit: cost to close).
// Long/debit: stop when value ≤ stop, target when value ≥ target. Credit: reversed.
export function evaluateIntrabarExit(
  path: number[],
  value: (spot: number) => number,
  credit: boolean,
  stop: number,
  target: number,
): { exit: IntrabarExit | null; optionOHLC: { open: number; high: number; low: number; close: number } } {
  const stopHit = (v: number) => (credit ? v >= stop : v <= stop);
  const targetHit = (v: number) => (credit ? v <= target : v >= target);

  // Model-derived option value along the path (sampled densely so extremes inside a segment are not missed).
  const pts: number[] = [path[0]];
  for (let i = 1; i < path.length; i++) for (let k = 1; k <= SAMPLES; k++) pts.push(path[i - 1] + ((path[i] - path[i - 1]) * k) / SAMPLES);
  const vals = pts.map(value);
  const optionOHLC = { open: vals[0], high: Math.max(...vals), low: Math.min(...vals), close: vals[vals.length - 1] };

  if (stopHit(vals[0])) return { exit: { reason: "STOP_LOSS", fillSpot: pts[0], gap: true, bothTouched: targetHit(vals[0]) }, optionOHLC };
  if (targetHit(vals[0])) return { exit: { reason: "TARGET", fillSpot: pts[0], gap: true, bothTouched: false }, optionOHLC };

  const firstStop = vals.findIndex(stopHit);
  const firstTarget = vals.findIndex(targetHit);
  if (firstStop < 0 && firstTarget < 0) return { exit: null, optionOHLC };
  // The path is an assumption, not evidence of order: if the bar touched both, the stop wins.
  const useStop = firstStop >= 0;
  const idx = useStop ? firstStop : firstTarget;
  const hit = useStop ? stopHit : targetHit;
  // Bisect between the last sample before the crossing and the crossing sample for the exact level.
  let lo = pts[idx - 1];
  let hi = pts[idx];
  for (let n = 0; n < 40; n++) {
    const mid = (lo + hi) / 2;
    if (hit(value(mid))) hi = mid;
    else lo = mid;
  }
  return { exit: { reason: useStop ? "STOP_LOSS" : "TARGET", fillSpot: hi, gap: false, bothTouched: firstStop >= 0 && firstTarget >= 0 }, optionOHLC };
}
