// Research-Only Audit Methodology Experiments (Phase 5)
// Pure research functions exploring:
//   Experiment A: Next-weekly expiry stability
//   Experiment B: Tick-aware price comparison
//   Experiment C: Bid/Ask consistency
//   Experiment D: Black-Scholes IV numerical sensitivity
//
// STRICT PROTECTION: This module is research-only. It does NOT alter active audit
// thresholds, verdict logic, historical records, or strategy behavior.

import { bs } from "../services/mock.ts";
import { impliedVolPct } from "../optionsAudit.ts";

export const AUTHORITATIVE_TICK_SIZE = 0.05; // 5 paise (₹0.05) verified from Upstox contract master

// ── Experiment B: Tick-Aware Comparison ───────────────────────────────────────

export interface TickComparisonSample {
  chainLtp: number;
  quoteLtp: number | null;
  liquid: boolean;
}

export interface TickComparisonResult {
  total: number;
  passStandard2Pct: number;
  passTickAware: number;
  deltaCount: number;
  passRateStandard: number | null;
  passRateTickAware: number | null;
  diffLessThan1Tick: number;
  diffLessThan2Ticks: number;
  diffLessThan5Ticks: number;
  diffGreaterThan1Rupee: number;
  diffGreaterThan5Rupees: number;
  medianAbsoluteDiff: number | null;
}

const pct = (arr: number[], p: number): number | null => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

export function evaluateTickAwareComparison(
  samples: TickComparisonSample[],
  tickSize = AUTHORITATIVE_TICK_SIZE
): TickComparisonResult {
  const valid = samples.filter(
    (s) => s.liquid && s.quoteLtp !== null && s.quoteLtp > 0 && s.chainLtp > 0
  );

  let passStandard = 0;
  let passTick = 0;
  let lt1Tick = 0;
  let lt2Ticks = 0;
  let lt5Ticks = 0;
  let gt1Rupee = 0;
  let gt5Rupees = 0;
  const absDiffs: number[] = [];

  for (const s of valid) {
    const rawDiff = Math.abs(s.chainLtp - s.quoteLtp!);
    const diff = Math.round(rawDiff * 10000) / 10000;
    absDiffs.push(diff);

    const passStd = diff / s.quoteLtp! <= 0.02 + 1e-6;
    const passTk = diff <= Math.max(0.02 * s.quoteLtp!, tickSize) + 1e-6;

    if (passStd) passStandard++;
    if (passTk) passTick++;

    if (!passStd) {
      if (diff <= tickSize) lt1Tick++;
      if (diff <= 2 * tickSize) lt2Ticks++;
      if (diff <= 5 * tickSize) lt5Ticks++;
      if (diff > 1.0) gt1Rupee++;
      if (diff > 5.0) gt5Rupees++;
    }
  }

  const rate = (n: number, total: number) => (total > 0 ? n / total : null);

  return {
    total: valid.length,
    passStandard2Pct: passStandard,
    passTickAware: passTick,
    deltaCount: passTick - passStandard,
    passRateStandard: rate(passStandard, valid.length),
    passRateTickAware: rate(passTick, valid.length),
    diffLessThan1Tick: lt1Tick,
    diffLessThan2Ticks: lt2Ticks,
    diffLessThan5Ticks: lt5Ticks,
    diffGreaterThan1Rupee: gt1Rupee,
    diffGreaterThan5Rupees: gt5Rupees,
    medianAbsoluteDiff: pct(absDiffs, 0.5),
  };
}

// ── Experiment C: Bid/Ask Consistency ─────────────────────────────────────────

export type BidAskClassification = "WITHIN_SPREAD" | "OUTSIDE_SPREAD" | "INDETERMINATE";

export interface BidAskClassificationResult {
  classification: BidAskClassification;
  spreadWidth: number | null;
}

export function classifyBidAskSpread(
  chainLtp: number,
  bestBid: number | null,
  bestAsk: number | null
): BidAskClassificationResult {
  if (
    bestBid === null ||
    bestAsk === null ||
    bestBid <= 0 ||
    bestAsk < bestBid ||
    chainLtp <= 0
  ) {
    return { classification: "INDETERMINATE", spreadWidth: null };
  }

  const spreadWidth = Math.round((bestAsk - bestBid) * 100) / 100;
  if (chainLtp >= bestBid && chainLtp <= bestAsk) {
    return { classification: "WITHIN_SPREAD", spreadWidth };
  }
  return { classification: "OUTSIDE_SPREAD", spreadWidth };
}

// ── Experiment D: IV Sensitivity ──────────────────────────────────────────────

export interface IvSensitivityResult {
  theoreticalPrice: number;
  vega: number;
  deltaIv50p: number | null;
  deltaIv100p: number | null;
  stable: boolean;
}

export function evaluateIvSensitivity(
  S: number,
  K: number,
  T: number,
  baseIv: number,
  type: "CE" | "PE" = "CE"
): IvSensitivityResult {
  const theoretical = bs(S, K, T, baseIv);
  const price = type === "CE" ? theoretical.call : theoretical.put;
  const vega = theoretical.vega;

  const ivPlus50p = impliedVolPct(price + 0.5, S, K, T, type);
  const ivPlus100p = impliedVolPct(price + 1.0, S, K, T, type);

  const deltaIv50p = ivPlus50p !== null ? Math.abs(ivPlus50p - baseIv * 100) : null;
  const deltaIv100p = ivPlus100p !== null ? Math.abs(ivPlus100p - baseIv * 100) : null;

  return {
    theoreticalPrice: price,
    vega,
    deltaIv50p,
    deltaIv100p,
    stable: vega >= 0.2,
  };
}
