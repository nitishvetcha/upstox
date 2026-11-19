// Options Pricing Engine — Phase 2: Executable Pricing, Payoff & Risk Architecture.
// Pure calculation engine: no I/O, no vendor spend, no account capital requirement.
// Implements strict bid/ask executable pricing, single-leg and multi-leg combined payoffs,
// and separates observed market values from calculated and estimated values.

import type { Quote } from "./types.ts";
import { bs } from "./services/mock.ts";
import { tradeFreshnessOf } from "./time.ts";
import { costsFor, DEFAULT_TRANSACTION_COSTS, type TradeCosts, type TransactionCostConfig } from "./services/transactionCosts.ts";

export const r2 = (n: number | null | undefined): number | null =>
  n === null || n === undefined || !Number.isFinite(n) ? null : Math.round((n + Number.EPSILON) * 100) / 100;

export const r2Strict = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export type OptionSide = "BUY" | "SELL";
export type OptionType = "CE" | "PE";
export type SingleOrMultiStrategy =
  | "LONG_CALL"
  | "LONG_PUT"
  | "BULL_CALL_SPREAD"
  | "BEAR_PUT_SPREAD"
  | "IRON_CONDOR";

// ── 1. Executable Pricing Validation ──────────────────────────────────────────

export interface ExecutableQuoteValidation {
  valid: boolean;
  entryPrice: number | null; // Ask for BUY, Bid for SELL
  exitPrice: number | null;  // Bid for BUY, Ask for SELL
  spread: number | null;     // Ask - Bid
  spreadPct: number | null;  // (Ask - Bid) / ltp * 100
  rejectionReason: string | null;
}

export function validateExecutableQuote(
  q: { ltp: number; bid: number | null; ask: number | null },
  side: OptionSide,
  maxSpreadPct = 12.0,
): ExecutableQuoteValidation {
  if (q.bid === null || q.ask === null || typeof q.bid !== "number" || typeof q.ask !== "number") {
    return {
      valid: false,
      entryPrice: null,
      exitPrice: null,
      spread: null,
      spreadPct: null,
      rejectionReason: "Missing bid or ask quote: executable pricing unavailable",
    };
  }

  if (q.bid <= 0 || q.ask <= 0) {
    return {
      valid: false,
      entryPrice: null,
      exitPrice: null,
      spread: null,
      spreadPct: null,
      rejectionReason: `Zero or negative bid/ask quote (bid: ${q.bid}, ask: ${q.ask})`,
    };
  }

  if (q.ask < q.bid) {
    return {
      valid: false,
      entryPrice: null,
      exitPrice: null,
      spread: r2Strict(q.ask - q.bid),
      spreadPct: null,
      rejectionReason: `Crossed market: ask (${q.ask}) is lower than bid (${q.bid})`,
    };
  }

  const ltpBase = q.ltp > 0 ? q.ltp : (q.bid + q.ask) / 2;
  const spread = r2Strict(q.ask - q.bid);
  const spreadPct = r2Strict((spread / ltpBase) * 100);

  if (spreadPct > maxSpreadPct) {
    return {
      valid: false,
      entryPrice: side === "BUY" ? q.ask : q.bid,
      exitPrice: side === "BUY" ? q.bid : q.ask,
      spread,
      spreadPct,
      rejectionReason: `Wide bid-ask spread: ${spreadPct}% exceeds maximum allowed ${maxSpreadPct}%`,
    };
  }

  return {
    valid: true,
    entryPrice: side === "BUY" ? q.ask : q.bid,
    exitPrice: side === "BUY" ? q.bid : q.ask,
    spread,
    spreadPct,
    rejectionReason: null,
  };
}

// ── 2. Payoff Data Structures ──────────────────────────────────────────────────

export interface LegPricingDetail {
  side: OptionSide;
  type: OptionType;
  strike: number;
  ltp: number;
  bid: number | null;
  ask: number | null;
  spreadPct: number | null;
  executablePrice: number; // Ask if BUY, Bid if SELL
  instrumentKey: string | null;
  expiry?: string | null;
}

export interface OptionsPayoff {
  strategy: SingleOrMultiStrategy;
  isCredit: boolean;
  netEntryPrice: number;
  entryZone: [number, number];
  stopLossPrice: number;
  target1Price: number;
  target2Price: number;
  maxTheoreticalLoss: number;
  maxTheoreticalLossPerLot: number;
  maxTheoreticalProfit: number | null;
  maxTheoreticalProfitPerLot: number | null;
  breakevens: number[];
  grossRewardToRisk: number;
  target1ProfitPerLot: number;
  target2ProfitPerLot: number;
  stopLossAmountPerLot: number;
  observedValues: {
    spot: number;
    legs: LegPricingDetail[];
  };
  calculatedValues: {
    executableEntry: number;
    currentLiquidationValue?: number; // Pre-expiry executable liquidation value (Bid for long, Bid - Ask for spread)
    currentLiquidationCost?: number;  // Pre-expiry executable buyback cost (Ask - Bid for credit strategies)
    immediateUnrealizedPnL?: number;   // Immediate liquidation P&L per unit (after bid-ask crossing friction)
    immediateUnrealizedPnLPerLot?: number; // Immediate liquidation P&L per lot
    spreadWidth?: number;
    callWingWidth?: number;
    putWingWidth?: number;
    breakevens: number[];
    maxTheoreticalLoss: number;
    maxTheoreticalProfit: number | null;
    target1Premium: number;
    stopPremium: number;
    grossRewardToRisk: number;
  };
  estimatedValues: {
    isModelEstimate?: boolean;
    holdingHours?: number;
    constantIvAssumption?: boolean;
    orderCount?: number;
    brokeragePerOrder?: number;
    entrySlippagePercent: number;
    exitSlippagePercent: number;
    stopGapPercent: number;
    targetSlippagePerLot?: number;
    transactionCosts: TradeCosts;
    netRewardToRisk: number | null;
    netProfitTarget1PerLot: number | null;
    netRiskPerLot: number;
    targetPricingModel?:
      | "BLACK_SCHOLES_REPRICED"
      | "EXPIRY_PAYOFF"
      | "CONVEXITY_GREEK_ADJUSTED"
      | "DELTA_APPROXIMATION_FALLBACK";
    horizonStatus?:
      | "EXPIRES_AFTER_HORIZON"
      | "EXPIRES_AT_HORIZON"
      | "EXPIRES_BEFORE_HORIZON"
      | "DATA_INSUFFICIENT";
    deltaApproximationTarget1?: number;
    deltaApproximationTarget2?: number;
    convexityAdjustment?: number;
    greeksQuality?: "INDEPENDENTLY_DERIVED" | "VENDOR_REPORTED" | "DATA_INSUFFICIENT";
    underlyingMoveCalibrated?: boolean;
    isHypotheticalDiagnostic?: boolean;
    hypotheticalDiagnosticNote?: string | null;
    terminalPayoffByLeg?: {
      strike: number;
      side: OptionSide;
      type: OptionType;
      intrinsicValueTarget1: number;
      intrinsicValueTarget2: number;
    }[];
  };
}

// ── 3. Single-Leg Payoff Calculation ───────────────────────────────────────────

export interface SingleLegPayoffParams {
  strategy: "LONG_CALL" | "LONG_PUT";
  strike: number;
  spot: number;
  quote: {
    ltp: number;
    bid: number | null;
    ask: number | null;
    instrumentKey?: string | null;
    iv?: number | null;
    gamma?: number | null;
    theta?: number | null;
    vega?: number | null;
  };
  delta: number | null;
  srRoom: number;
  atr: number;
  lotSize: number;
  expiryYears?: number | null;
  holdingHours?: number;
  costConfig?: TransactionCostConfig;
  slippageConfig?: {
    entrySlippagePercent?: number;
    exitSlippagePercent?: number;
    stopGapPercent?: number;
  };
}

/**
 * Calculates time to expiry in calendar years (365 days * 24 hours = 8,760 hours/yr).
 * NSE F&O contracts expire at 15:30:00 IST on the expiry date.
 * If expiry is in format YYYY-MM-DD:
 *   Expiry timestamp is ${expiry}T15:30:00+05:30.
 * If expiry is already an ISO timestamp:
 *   Expiry timestamp is parsed directly.
 * Returns:
 *   - positive number if expiry is in the future (> 0)
 *   - 0.0 if now is exactly at 15:30:00 IST on expiry day
 *   - negative number if expiry is in the past (< 0)
 *   - null if expiry is missing, malformed, or invalid
 */
export function calculateExpiryYears(expiry: string | undefined | null, now: Date): number | null {
  if (!expiry || typeof expiry !== "string") return null;
  const trimmed = expiry.trim();
  let expiryMs: number;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    expiryMs = new Date(`${trimmed}T15:30:00+05:30`).getTime();
  } else {
    expiryMs = new Date(trimmed).getTime();
  }
  if (!Number.isFinite(expiryMs) || isNaN(expiryMs)) return null;
  const years = (expiryMs - now.getTime()) / (365 * 86_400_000);
  return Number.isFinite(years) ? years : null;
}

export function calculateSingleLegPayoff(params: SingleLegPayoffParams): {
  success: boolean;
  payoff: OptionsPayoff | null;
  rejectionReason: string | null;
} {
  const { strategy, strike, spot, quote, delta, srRoom, atr, lotSize, expiryYears, holdingHours } = params;
  const isCall = strategy === "LONG_CALL";
  const type: OptionType = isCall ? "CE" : "PE";

  // Expired contract validation: Fail closed immediately without inventing positive time-to-expiry
  if (typeof expiryYears === "number" && expiryYears <= 0) {
    return {
      success: false,
      payoff: null,
      rejectionReason: `Contract has expired (expiryYears: ${expiryYears} <= 0)`,
    };
  }

  // Input validation: spot and strike must be positive finite numbers
  if (!Number.isFinite(spot) || spot <= 0 || !Number.isFinite(strike) || strike <= 0) {
    return {
      success: false,
      payoff: null,
      rejectionReason: `Invalid spot (${spot}) or strike (${strike}) for options payoff calculation`,
    };
  }

  const val = validateExecutableQuote(quote, "BUY");
  if (!val.valid || val.entryPrice === null) {
    return { success: false, payoff: null, rejectionReason: val.rejectionReason };
  }

  const entry = val.entryPrice; // Executable ASK price
  const d = Math.abs(delta ?? 0.35);

  // Stop: 50% of executable entry price
  const stop = r2Strict(entry * 0.50);
  const risk = r2Strict(entry - stop);

  // Projected underlying spot move
  const useRoom = Math.max(srRoom, atr * 0.4);
  const move1 = useRoom * 0.45;
  const move2 = useRoom * 0.85;

  // Linear Delta approximation baseline
  const deltaT1 = r2Strict(entry + d * move1);
  const deltaT2 = r2Strict(entry + d * move2);

  // Repricing using Black-Scholes, Expiry Payoff, or second-order Greeks (Gamma, Theta)
  let t1 = deltaT1;
  let t2 = deltaT2;
  let targetPricingModel:
    | "BLACK_SCHOLES_REPRICED"
    | "EXPIRY_PAYOFF"
    | "CONVEXITY_GREEK_ADJUSTED"
    | "DELTA_APPROXIMATION_FALLBACK" = "DELTA_APPROXIMATION_FALLBACK";
  let greeksQuality: "INDEPENDENTLY_DERIVED" | "VENDOR_REPORTED" | "DATA_INSUFFICIENT" = "DATA_INSUFFICIENT";
  let horizonStatus:
    | "EXPIRES_AFTER_HORIZON"
    | "EXPIRES_AT_HORIZON"
    | "EXPIRES_BEFORE_HORIZON"
    | "DATA_INSUFFICIENT" = "DATA_INSUFFICIENT";
  let underlyingMoveCalibrated = true;
  let isHypotheticalDiagnostic = false;
  let hypotheticalDiagnosticNote: string | null = null;

  const iv = quote.iv;
  const gamma = quote.gamma;
  const theta = quote.theta;
  const hours = holdingHours ?? 2.0;

  if (typeof expiryYears === "number" && expiryYears > 0) {
    const dtYears = hours / (365 * 24);
    const isAtHorizon = Math.abs(expiryYears - dtYears) < 1e-9;
    const isBeforeHorizon = expiryYears < dtYears - 1e-9;

    if (isBeforeHorizon || isAtHorizon) {
      // Expiry occurs DURING or EXACTLY AT the holding horizon (0 < expiryYears <= dtYears).
      // The option reaches expiration at or before the end of the holding horizon.
      // At expiration, remaining time is strictly zero (tRemaining = 0), so extrinsic / volatility
      // time value is strictly zero (0.00). Do NOT use Black-Scholes with artificial remaining time.
      // Terminal value is strictly the intrinsic payoff at the projected underlying target prices:
      // Call: max(0, TargetSpot - Strike)
      // Put:  max(0, Strike - TargetSpot)
      const targetSpot1 = isCall ? spot + move1 : Math.max(1, spot - move1);
      const targetSpot2 = isCall ? spot + move2 : Math.max(1, spot - move2);

      const expiryValue1 = isCall ? Math.max(0, targetSpot1 - strike) : Math.max(0, strike - targetSpot1);
      const expiryValue2 = isCall ? Math.max(0, targetSpot2 - strike) : Math.max(0, strike - targetSpot2);

      t1 = r2Strict(expiryValue1);
      t2 = r2Strict(Math.max(t1, expiryValue2));
      targetPricingModel = "EXPIRY_PAYOFF";
      if (isBeforeHorizon) {
        // Expiry occurs BEFORE the full holding horizon (0 < expiryYears < dtYears).
        // The projected underlying move (move1, move2) was calibrated for the full 2-hour horizon.
        // Over a shorter window (e.g. 15 minutes), the model cannot reliably forecast movement.
        // Fail closed: do NOT invent a time-scaling heuristic; mark DATA_INSUFFICIENT and flag as hypothetical.
        horizonStatus = "EXPIRES_BEFORE_HORIZON";
        greeksQuality = "DATA_INSUFFICIENT";
        underlyingMoveCalibrated = false;
        isHypotheticalDiagnostic = true;
        hypotheticalDiagnosticNote = "Underlying target projection reflects unscaled full-horizon move; cannot reliably forecast movement over shortened expiry window. Marked DATA_INSUFFICIENT.";
      } else {
        // Expiry occurs EXACTLY AT the holding horizon (expiryYears == dtYears).
        // The 2-hour movement projection is time-calibrated to the 2-hour holding duration.
        horizonStatus = "EXPIRES_AT_HORIZON";
        greeksQuality = typeof iv === "number" && iv > 0 ? "INDEPENDENTLY_DERIVED" : "DATA_INSUFFICIENT";
        underlyingMoveCalibrated = true;
        isHypotheticalDiagnostic = false;
        hypotheticalDiagnosticNote = null;
      }
    } else if (typeof iv === "number" && iv > 0) {
      // Expiry occurs strictly AFTER the holding horizon (expiryYears > dtYears).
      // Genuine remaining time exists: tRemaining = expiryYears - dtYears > 0.
      // Exact Black-Scholes repricing at projected underlying spot and time horizon.
      // Time units: calendar year (365 days * 24 hours = 8,760 hours/yr), strictly matching expiryYears.
      // Constant-IV assumption: target valuation assumes implied volatility remains constant at entry level (iv).
      // Holding-time horizon: targets reflect option price after an assumed holding period of `hours` (default 2h).
      // Projected underlying targets: Spot ± move1 and Spot ± move2 (where move = effectiveRoom * {0.45, 0.85}).
      const tRemaining = expiryYears - dtYears;
      const targetSpot1 = isCall ? spot + move1 : Math.max(1, spot - move1);
      const targetSpot2 = isCall ? spot + move2 : Math.max(1, spot - move2);

      const p0 = bs(spot, strike, expiryYears, iv / 100)[isCall ? "call" : "put"];
      const p1 = bs(targetSpot1, strike, tRemaining, iv / 100)[isCall ? "call" : "put"];
      const p2 = bs(targetSpot2, strike, tRemaining, iv / 100)[isCall ? "call" : "put"];

      const projectedGain1 = Math.max(0.1, p1 - p0);
      const projectedGain2 = Math.max(projectedGain1 + 0.1, p2 - p0);

      t1 = r2Strict(entry + projectedGain1);
      t2 = r2Strict(entry + projectedGain2);
      targetPricingModel = "BLACK_SCHOLES_REPRICED";
      greeksQuality = "INDEPENDENTLY_DERIVED";
      horizonStatus = "EXPIRES_AFTER_HORIZON";
    } else if (typeof gamma === "number" && gamma > 0) {
      // Second-order Taylor expansion: Delta + 0.5 * Gamma * (dS)^2 + Theta * dt
      // In mock.ts, Theta is divided by 365, representing decay per calendar day (24 hours).
      // Holding for `hours` incurs Theta decay = theta * (hours / 24).
      const thetaDecay = (typeof theta === "number" ? theta : 0) * (hours / 24);
      const gammaGain1 = 0.5 * gamma * move1 * move1;
      const gammaGain2 = 0.5 * gamma * move2 * move2;

      const gain1 = Math.max(0.1, d * move1 + gammaGain1 + thetaDecay);
      const gain2 = Math.max(gain1 + 0.1, d * move2 + gammaGain2 + thetaDecay);

      t1 = r2Strict(entry + gain1);
      t2 = r2Strict(entry + gain2);
      targetPricingModel = "CONVEXITY_GREEK_ADJUSTED";
      greeksQuality = "VENDOR_REPORTED";
      horizonStatus = "EXPIRES_AFTER_HORIZON";
    } else {
      // Baseline delta approximation fallback
      t1 = deltaT1;
      t2 = deltaT2;
      targetPricingModel = "DELTA_APPROXIMATION_FALLBACK";
      greeksQuality = "DATA_INSUFFICIENT";
      horizonStatus = "EXPIRES_AFTER_HORIZON";
    }
  } else if (typeof gamma === "number" && gamma > 0) {
    // Second-order Taylor expansion when expiry is not provided
    const thetaDecay = (typeof theta === "number" ? theta : 0) * (hours / 24);
    const gammaGain1 = 0.5 * gamma * move1 * move1;
    const gammaGain2 = 0.5 * gamma * move2 * move2;

    const gain1 = Math.max(0.1, d * move1 + gammaGain1 + thetaDecay);
    const gain2 = Math.max(gain1 + 0.1, d * move2 + gammaGain2 + thetaDecay);

    t1 = r2Strict(entry + gain1);
    t2 = r2Strict(entry + gain2);
    targetPricingModel = "CONVEXITY_GREEK_ADJUSTED";
    greeksQuality = "VENDOR_REPORTED";
    horizonStatus = "DATA_INSUFFICIENT";
  } else {
    // Baseline delta approximation fallback
    t1 = deltaT1;
    t2 = deltaT2;
    targetPricingModel = "DELTA_APPROXIMATION_FALLBACK";
    greeksQuality = "DATA_INSUFFICIENT";
    horizonStatus = "DATA_INSUFFICIENT";
  }

  const convexityAdjustment = r2Strict(t1 - deltaT1);
  const grossRR = risk > 0 ? r2Strict((t1 - entry) / risk) : 0;

  // Breakeven: Strike + Entry for CE; Strike - Entry for PE
  const be = r2Strict(isCall ? strike + entry : strike - entry);

  // Max theoretical loss is the entire premium paid
  const maxLoss = entry;
  const maxLossPerLot = r2Strict(maxLoss * lotSize);

  // Max theoretical profit: open-ended for calls, capped at (strike - entry) for puts
  const maxProfit = isCall ? null : r2Strict(Math.max(0, strike - entry));
  const maxProfitPerLot = maxProfit !== null ? r2Strict(maxProfit * lotSize) : null;

  const target1ProfitPerLot = r2Strict((t1 - entry) * lotSize);
  const target2ProfitPerLot = r2Strict((t2 - entry) * lotSize);
  const stopLossAmountPerLot = r2Strict((entry - stop) * lotSize);

  // Transaction costs & slippage (Diagnostic estimation)
  const costCfg = params.costConfig ?? DEFAULT_TRANSACTION_COSTS;
  const sE = (params.slippageConfig?.entrySlippagePercent ?? 1.0) / 100;
  const sX = (params.slippageConfig?.exitSlippagePercent ?? 1.0) / 100;
  const gap = (params.slippageConfig?.stopGapPercent ?? 2.0) / 100;

  const entryFill = r2Strict(entry * (1 + sE));
  const stopFill = r2Strict(Math.max(0, stop * (1 - sX - gap)));
  const targetFill = r2Strict(t1 * (1 - sX));

  // Costs at stop exit
  const stopCosts = costsFor(
    [
      { side: "BUY", price: entryFill, quantity: lotSize, orderId: "single-leg-entry" },
      { side: "SELL", price: stopFill, quantity: lotSize, orderId: "single-leg-exit" },
    ],
    costCfg,
  );

  // Costs at target exit
  const targetCosts = costsFor(
    [
      { side: "BUY", price: entryFill, quantity: lotSize, orderId: "single-leg-entry" },
      { side: "SELL", price: targetFill, quantity: lotSize, orderId: "single-leg-exit" },
    ],
    costCfg,
  );

  const netRiskPerLot = r2Strict((entryFill - stopFill) * lotSize + stopCosts.totalCosts);
  const netRewardPerLot = r2Strict((targetFill - entryFill) * lotSize - targetCosts.totalCosts);
  const netRewardToRisk = netRiskPerLot > 0 ? r2Strict(netRewardPerLot / netRiskPerLot) : null;

  const legDetail: LegPricingDetail = {
    side: "BUY",
    type,
    strike,
    ltp: quote.ltp,
    bid: quote.bid,
    ask: quote.ask,
    spreadPct: val.spreadPct,
    executablePrice: entry,
    instrumentKey: quote.instrumentKey ?? null,
  };

  const currentLiquidationValue = r2Strict(val.exitPrice!);
  const immediateUnrealizedPnL = r2Strict(currentLiquidationValue - entry);
  const immediateUnrealizedPnLPerLot = r2Strict(immediateUnrealizedPnL * lotSize);

  const payoff: OptionsPayoff = {
    strategy,
    isCredit: false,
    netEntryPrice: entry,
    entryZone: [r2Strict(entry * 0.97), r2Strict(entry * 1.03)],
    stopLossPrice: stop,
    target1Price: t1,
    target2Price: t2,
    maxTheoreticalLoss: maxLoss,
    maxTheoreticalLossPerLot: maxLossPerLot,
    maxTheoreticalProfit: maxProfit,
    maxTheoreticalProfitPerLot: maxProfitPerLot,
    breakevens: [be],
    grossRewardToRisk: grossRR,
    target1ProfitPerLot,
    target2ProfitPerLot,
    stopLossAmountPerLot,
    observedValues: {
      spot,
      legs: [legDetail],
    },
    calculatedValues: {
      executableEntry: entry,
      currentLiquidationValue,
      immediateUnrealizedPnL,
      immediateUnrealizedPnLPerLot,
      breakevens: [be],
      maxTheoreticalLoss: maxLoss,
      maxTheoreticalProfit: maxProfit,
      target1Premium: t1,
      stopPremium: stop,
      grossRewardToRisk: grossRR,
    },
    estimatedValues: {
      isModelEstimate: true,
      holdingHours: hours,
      constantIvAssumption: targetPricingModel === "BLACK_SCHOLES_REPRICED",
      orderCount: 2,
      brokeragePerOrder: costCfg.brokeragePerOrder,
      entrySlippagePercent: sE * 100,
      exitSlippagePercent: sX * 100,
      stopGapPercent: gap * 100,
      targetSlippagePerLot: r2Strict((t1 - entry) * lotSize - (targetFill - entryFill) * lotSize),
      transactionCosts: targetCosts,
      netRewardToRisk,
      netProfitTarget1PerLot: netRewardPerLot,
      netRiskPerLot,
      targetPricingModel,
      horizonStatus,
      deltaApproximationTarget1: deltaT1,
      deltaApproximationTarget2: deltaT2,
      convexityAdjustment,
      greeksQuality,
      underlyingMoveCalibrated,
      isHypotheticalDiagnostic,
      hypotheticalDiagnosticNote,
      terminalPayoffByLeg: targetPricingModel === "EXPIRY_PAYOFF"
        ? [
            {
              strike,
              side: "BUY" as OptionSide,
              type,
              intrinsicValueTarget1: t1,
              intrinsicValueTarget2: t2,
            },
          ]
        : undefined,
    },
  };

  return { success: true, payoff, rejectionReason: null };
}

// ── 4. Multi-Leg Debit Spread Payoff Calculation ──────────────────────────────

export interface DebitSpreadPayoffParams {
  strategy: "BULL_CALL_SPREAD" | "BEAR_PUT_SPREAD";
  spot: number;
  lotSize: number;
  expiryYears?: number | null;
  expiry?: string | null;
  holdingHours?: number;
  srRoom?: number;
  atr?: number;
  longLeg: {
    strike: number;
    expiry?: string | null;
    expiryYears?: number | null;
    quote: {
      ltp: number;
      bid: number | null;
      ask: number | null;
      instrumentKey?: string | null;
    };
    targetQuote?: {
      bid: number | null;
      ask: number | null;
    };
  };
  shortLeg: {
    strike: number;
    expiry?: string | null;
    expiryYears?: number | null;
    quote: {
      ltp: number;
      bid: number | null;
      ask: number | null;
      instrumentKey?: string | null;
    };
    targetQuote?: {
      bid: number | null;
      ask: number | null;
    };
  };
  costConfig?: TransactionCostConfig;
  slippageConfig?: {
    entrySlippagePercent?: number;
    exitSlippagePercent?: number;
    stopGapPercent?: number;
  };
}

export function calculateDebitSpreadPayoff(params: DebitSpreadPayoffParams): {
  success: boolean;
  payoff: OptionsPayoff | null;
  rejectionReason: string | null;
} {
  const { strategy, spot, lotSize, longLeg, shortLeg, expiryYears, expiry, holdingHours, srRoom, atr } = params;

  // 1. Leg expiry metadata validation: all legs must share identical expiry metadata
  const longExp = longLeg.expiry ?? expiry ?? null;
  const shortExp = shortLeg.expiry ?? expiry ?? null;
  if (longExp !== null && shortExp !== null && longExp !== shortExp) {
    return {
      success: false,
      payoff: null,
      rejectionReason: `Inconsistent leg expiries: long leg (${longExp}) !== short leg (${shortExp})`,
    };
  }

  const longExpY = longLeg.expiryYears ?? null;
  const shortExpY = shortLeg.expiryYears ?? null;
  if (typeof longExpY === "number" && typeof shortExpY === "number" && Math.abs(longExpY - shortExpY) > 1e-6) {
    return {
      success: false,
      payoff: null,
      rejectionReason: `Inconsistent leg expiryYears: long leg (${longExpY}) !== short leg (${shortExpY})`,
    };
  }

  const effectiveExpiryYears = typeof expiryYears === "number"
    ? expiryYears
    : typeof longExpY === "number"
    ? longExpY
    : typeof shortExpY === "number"
    ? shortExpY
    : null;

  if (typeof expiryYears === "number") {
    if (typeof longExpY === "number" && Math.abs(expiryYears - longExpY) > 1e-6) {
      return {
        success: false,
        payoff: null,
        rejectionReason: `Inconsistent expiryYears: spread (${expiryYears}) !== long leg (${longExpY})`,
      };
    }
    if (typeof shortExpY === "number" && Math.abs(expiryYears - shortExpY) > 1e-6) {
      return {
        success: false,
        payoff: null,
        rejectionReason: `Inconsistent expiryYears: spread (${expiryYears}) !== short leg (${shortExpY})`,
      };
    }
  }

  // Expired contract validation: Fail closed immediately without inventing positive time-to-expiry
  if (typeof effectiveExpiryYears === "number" && effectiveExpiryYears <= 0) {
    return {
      success: false,
      payoff: null,
      rejectionReason: `Contract has expired (expiryYears: ${effectiveExpiryYears} <= 0)`,
    };
  }

  const isBull = strategy === "BULL_CALL_SPREAD";
  const type: OptionType = isBull ? "CE" : "PE";

  // Strike geometry validation
  if (isBull && !(shortLeg.strike > longLeg.strike)) {
    return {
      success: false,
      payoff: null,
      rejectionReason: `Bull Call Spread short strike (${shortLeg.strike}) must be strictly higher than long strike (${longLeg.strike})`,
    };
  }
  if (!isBull && !(shortLeg.strike < longLeg.strike)) {
    return {
      success: false,
      payoff: null,
      rejectionReason: `Bear Put Spread short strike (${shortLeg.strike}) must be strictly lower than long strike (${longLeg.strike})`,
    };
  }

  // Validate executable pricing for both legs:
  // Long leg buys at Ask; Short leg sells at Bid
  const longVal = validateExecutableQuote(longLeg.quote, "BUY");
  if (!longVal.valid || longVal.entryPrice === null) {
    return { success: false, payoff: null, rejectionReason: `Long leg ${type} ${longLeg.strike}: ${longVal.rejectionReason}` };
  }

  const shortVal = validateExecutableQuote(shortLeg.quote, "SELL");
  if (!shortVal.valid || shortVal.entryPrice === null) {
    return { success: false, payoff: null, rejectionReason: `Short leg ${type} ${shortLeg.strike}: ${shortVal.rejectionReason}` };
  }

  const longAsk = longVal.entryPrice;
  const shortBid = shortVal.entryPrice;
  const netDebit = r2Strict(longAsk - shortBid);

  if (netDebit <= 0) {
    return {
      success: false,
      payoff: null,
      rejectionReason: `Invalid debit spread pricing: Long ask (${longAsk}) <= Short bid (${shortBid}); net debit must be positive`,
    };
  }

  const spreadWidth = Math.abs(shortLeg.strike - longLeg.strike);
  if (netDebit >= spreadWidth) {
    return {
      success: false,
      payoff: null,
      rejectionReason: `Net debit (${netDebit}) cannot exceed spread width (${spreadWidth})`,
    };
  }

  // Max theoretical loss is the net debit paid
  const maxLoss = netDebit;
  const maxLossPerLot = r2Strict(maxLoss * lotSize);

  // Max theoretical profit is the spread width minus net debit
  const maxProfit = r2Strict(spreadWidth - netDebit);
  const maxProfitPerLot = r2Strict(maxProfit * lotSize);

  // Breakeven:
  // Bull Call Spread: Long strike + Net Debit
  // Bear Put Spread: Long strike - Net Debit
  const be = r2Strict(isBull ? longLeg.strike + netDebit : longLeg.strike - netDebit);

  // Combined targets and stop on the spread debit
  // Stop at 50% loss of net debit
  const stop = r2Strict(netDebit * 0.50);
  const risk = r2Strict(netDebit - stop);

  const hours = holdingHours ?? 2.0;
  const dtYears = hours / (365 * 24);

  let t1: number;
  let t2: number;
  let targetPricingModel: "BLACK_SCHOLES_REPRICED" | "EXPIRY_PAYOFF" | "CONVEXITY_GREEK_ADJUSTED" | "DELTA_APPROXIMATION_FALLBACK" = "DELTA_APPROXIMATION_FALLBACK";
  let greeksQuality: "INDEPENDENTLY_DERIVED" | "VENDOR_REPORTED" | "DATA_INSUFFICIENT" = "INDEPENDENTLY_DERIVED";
  let horizonStatus: "EXPIRES_AFTER_HORIZON" | "EXPIRES_AT_HORIZON" | "EXPIRES_BEFORE_HORIZON" | "DATA_INSUFFICIENT" = "DATA_INSUFFICIENT";
  let underlyingMoveCalibrated = true;
  let isHypotheticalDiagnostic = false;
  let hypotheticalDiagnosticNote: string | null = null;
  let terminalPayoffByLeg: {
    strike: number;
    side: OptionSide;
    type: OptionType;
    intrinsicValueTarget1: number;
    intrinsicValueTarget2: number;
  }[] | undefined;

  if (typeof effectiveExpiryYears === "number" && effectiveExpiryYears > 0 && effectiveExpiryYears <= dtYears + 1e-9) {
    // Expiry occurs during or exactly at the holding horizon (0 < effectiveExpiryYears <= dtYears).
    // Terminal value is strictly the terminal portfolio payoff across ALL legs at projected underlying target spot prices:
    // Bull Call Spread: max(0, TargetSpot - LongStrike) - max(0, TargetSpot - ShortStrike)
    // Bear Put Spread:  max(0, LongStrike - TargetSpot) - max(0, ShortStrike - TargetSpot)
    const useRoom = Math.max(srRoom ?? 0, (atr ?? 0) * 0.4);
    const move1 = useRoom * 0.45;
    const move2 = useRoom * 0.85;

    const targetSpot1 = isBull ? spot + move1 : Math.max(1, spot - move1);
    const targetSpot2 = isBull ? spot + move2 : Math.max(1, spot - move2);

    const longVal1 = isBull ? Math.max(0, targetSpot1 - longLeg.strike) : Math.max(0, longLeg.strike - targetSpot1);
    const shortVal1 = isBull ? Math.max(0, targetSpot1 - shortLeg.strike) : Math.max(0, shortLeg.strike - targetSpot1);
    const spreadTerminal1 = r2Strict(Math.max(0, longVal1 - shortVal1));

    const longVal2 = isBull ? Math.max(0, targetSpot2 - longLeg.strike) : Math.max(0, longLeg.strike - targetSpot2);
    const shortVal2 = isBull ? Math.max(0, targetSpot2 - shortLeg.strike) : Math.max(0, shortLeg.strike - targetSpot2);
    const spreadTerminal2 = r2Strict(Math.max(0, longVal2 - shortVal2));

    t1 = spreadTerminal1;
    t2 = Math.max(t1, spreadTerminal2);
    targetPricingModel = "EXPIRY_PAYOFF";

    terminalPayoffByLeg = [
      {
        strike: longLeg.strike,
        side: "BUY",
        type,
        intrinsicValueTarget1: r2Strict(longVal1),
        intrinsicValueTarget2: r2Strict(longVal2),
      },
      {
        strike: shortLeg.strike,
        side: "SELL",
        type,
        intrinsicValueTarget1: r2Strict(shortVal1),
        intrinsicValueTarget2: r2Strict(shortVal2),
      },
    ];

    const isAtHorizon = Math.abs(effectiveExpiryYears - dtYears) < 1e-9;
    if (isAtHorizon) {
      horizonStatus = "EXPIRES_AT_HORIZON";
      greeksQuality = "INDEPENDENTLY_DERIVED";
      underlyingMoveCalibrated = true;
      isHypotheticalDiagnostic = false;
      hypotheticalDiagnosticNote = null;
    } else {
      horizonStatus = "EXPIRES_BEFORE_HORIZON";
      greeksQuality = "DATA_INSUFFICIENT";
      underlyingMoveCalibrated = false;
      isHypotheticalDiagnostic = true;
      hypotheticalDiagnosticNote = "Underlying target projection reflects unscaled full-horizon move; cannot reliably forecast movement over shortened expiry window. Marked DATA_INSUFFICIENT.";
    }
  } else {
    // If explicit target exit quotes are supplied for both legs, use exact target quotes:
    // Long leg exits by selling at Target Bid; Short leg exits by buying at Target Ask
    const hasTargetQuotes = longLeg.targetQuote?.bid != null && shortLeg.targetQuote?.ask != null;
    if (hasTargetQuotes) {
      t1 = r2Strict(longLeg.targetQuote!.bid! - shortLeg.targetQuote!.ask!);
      t2 = t1;
    } else {
      // Standard spread expansion targets (Target 1 = 60% expansion, Target 2 = 90% expansion)
      t1 = r2Strict(netDebit + maxProfit * 0.60);
      t2 = r2Strict(netDebit + maxProfit * 0.90);
    }
    targetPricingModel = "DELTA_APPROXIMATION_FALLBACK";
    horizonStatus = typeof effectiveExpiryYears === "number" ? "EXPIRES_AFTER_HORIZON" : "DATA_INSUFFICIENT";
    greeksQuality = "INDEPENDENTLY_DERIVED";
    underlyingMoveCalibrated = true;
    isHypotheticalDiagnostic = false;
    hypotheticalDiagnosticNote = null;
  }

  const grossRR = risk > 0 ? r2Strict((t1 - netDebit) / risk) : 0;
  const target1ProfitPerLot = r2Strict((t1 - netDebit) * lotSize);
  const target2ProfitPerLot = r2Strict((t2 - netDebit) * lotSize);
  const stopLossAmountPerLot = r2Strict((netDebit - stop) * lotSize);

  // Transaction costs & slippage (4 executions: 2 legs entry, 2 legs exit)
  const costCfg = params.costConfig ?? DEFAULT_TRANSACTION_COSTS;
  const sE = (params.slippageConfig?.entrySlippagePercent ?? 1.0) / 100;
  const sX = (params.slippageConfig?.exitSlippagePercent ?? 1.0) / 100;
  const gap = (params.slippageConfig?.stopGapPercent ?? 2.0) / 100;

  // Entry: long pays ask*(1+sE), short receives bid*(1-sE)
  const longEntryFill = r2Strict(longAsk * (1 + sE));
  const shortEntryFill = r2Strict(shortBid * (1 - sE));
  const netEntryFill = r2Strict(longEntryFill - shortEntryFill);

  // Exit at target: long sells at target bid, short buys back at target ask
  const hasTargetQuotes = longLeg.targetQuote?.bid != null && shortLeg.targetQuote?.ask != null;
  const longTargetFill = hasTargetQuotes
    ? r2Strict(longLeg.targetQuote!.bid! * (1 - sX))
    : r2Strict(longAsk * (t1 / netDebit) * (1 - sX));
  const shortTargetFill = hasTargetQuotes
    ? r2Strict(shortLeg.targetQuote!.ask! * (1 + sX))
    : r2Strict(shortBid * (t1 / netDebit) * (1 + sX));

  // Exit at stop
  const stopRatio = stop / netDebit;
  const longStopFill = r2Strict(Math.max(0, longAsk * stopRatio * (1 - sX - gap)));
  const shortStopFill = r2Strict(shortBid * stopRatio * (1 + sX + gap));

  // 4 fills for target with explicit orderId grouping
  const targetCosts = costsFor(
    [
      { side: "BUY", price: longEntryFill, quantity: lotSize, orderId: "spread-long-entry" },
      { side: "SELL", price: shortEntryFill, quantity: lotSize, orderId: "spread-short-entry" },
      { side: "SELL", price: longTargetFill, quantity: lotSize, orderId: "spread-long-exit" },
      { side: "BUY", price: shortTargetFill, quantity: lotSize, orderId: "spread-short-exit" },
    ],
    costCfg,
  );

  // 4 fills for stop with explicit orderId grouping
  const stopCosts = costsFor(
    [
      { side: "BUY", price: longEntryFill, quantity: lotSize, orderId: "spread-long-entry" },
      { side: "SELL", price: shortEntryFill, quantity: lotSize, orderId: "spread-short-entry" },
      { side: "SELL", price: longStopFill, quantity: lotSize, orderId: "spread-long-exit" },
      { side: "BUY", price: shortStopFill, quantity: lotSize, orderId: "spread-short-exit" },
    ],
    costCfg,
  );

  const netRiskPerLot = r2Strict((netEntryFill - (longStopFill - shortStopFill)) * lotSize + stopCosts.totalCosts);
  const netRewardPerLot = r2Strict(((longTargetFill - shortTargetFill) - netEntryFill) * lotSize - targetCosts.totalCosts);
  const netRewardToRisk = netRiskPerLot > 0 ? r2Strict(netRewardPerLot / netRiskPerLot) : null;

  const longDetail: LegPricingDetail = {
    side: "BUY",
    type,
    strike: longLeg.strike,
    ltp: longLeg.quote.ltp,
    bid: longLeg.quote.bid,
    ask: longLeg.quote.ask,
    spreadPct: longVal.spreadPct,
    executablePrice: longAsk,
    instrumentKey: longLeg.quote.instrumentKey ?? null,
    expiry: longExp,
  };

  const shortDetail: LegPricingDetail = {
    side: "SELL",
    type,
    strike: shortLeg.strike,
    ltp: shortLeg.quote.ltp,
    bid: shortLeg.quote.bid,
    ask: shortLeg.quote.ask,
    spreadPct: shortVal.spreadPct,
    executablePrice: shortBid,
    instrumentKey: shortLeg.quote.instrumentKey ?? null,
    expiry: shortExp,
  };

  const currentLiquidationValue = r2Strict(longVal.exitPrice! - shortVal.exitPrice!);
  const immediateUnrealizedPnL = r2Strict(currentLiquidationValue - netDebit);
  const immediateUnrealizedPnLPerLot = r2Strict(immediateUnrealizedPnL * lotSize);

  const payoff: OptionsPayoff = {
    strategy,
    isCredit: false,
    netEntryPrice: netDebit,
    entryZone: [r2Strict(netDebit * 0.95), r2Strict(netDebit * 1.05)],
    stopLossPrice: stop,
    target1Price: t1,
    target2Price: t2,
    maxTheoreticalLoss: maxLoss,
    maxTheoreticalLossPerLot: maxLossPerLot,
    maxTheoreticalProfit: maxProfit,
    maxTheoreticalProfitPerLot: maxProfitPerLot,
    breakevens: [be],
    grossRewardToRisk: grossRR,
    target1ProfitPerLot,
    target2ProfitPerLot,
    stopLossAmountPerLot,
    observedValues: {
      spot,
      legs: [longDetail, shortDetail],
    },
    calculatedValues: {
      executableEntry: netDebit,
      currentLiquidationValue,
      immediateUnrealizedPnL,
      immediateUnrealizedPnLPerLot,
      spreadWidth,
      breakevens: [be],
      maxTheoreticalLoss: maxLoss,
      maxTheoreticalProfit: maxProfit,
      target1Premium: t1,
      stopPremium: stop,
      grossRewardToRisk: grossRR,
    },
    estimatedValues: {
      isModelEstimate: true,
      holdingHours: hours,
      orderCount: 4,
      brokeragePerOrder: costCfg.brokeragePerOrder,
      entrySlippagePercent: sE * 100,
      exitSlippagePercent: sX * 100,
      stopGapPercent: gap * 100,
      targetSlippagePerLot: r2Strict(target1ProfitPerLot - ((longTargetFill - shortTargetFill) - netEntryFill) * lotSize),
      transactionCosts: targetCosts,
      netRewardToRisk,
      netProfitTarget1PerLot: netRewardPerLot,
      netRiskPerLot,
      targetPricingModel,
      horizonStatus,
      greeksQuality,
      underlyingMoveCalibrated,
      isHypotheticalDiagnostic,
      hypotheticalDiagnosticNote,
      terminalPayoffByLeg,
    },
  };

  return { success: true, payoff, rejectionReason: null };
}

// ── 5. Multi-Leg Credit Strategy: Four-Leg Iron Condor Payoff Calculation ──

export interface IronCondorLegInput {
  strike: number;
  expiry?: string | null;
  expiryYears?: number | null;
  quote: {
    ltp: number;
    bid: number | null;
    ask: number | null;
    instrumentKey?: string | null;
    lastTradeTime?: string | null;
    contractPriceQuality?: string | null;
  };
  targetQuote?: {
    bid: number | null;
    ask: number | null;
  };
}

export interface IronCondorPayoffParams {
  spot: number;
  lotSize: number;
  expiryYears?: number | null;
  expiry?: string | null;
  holdingHours?: number;
  srRoom?: number;
  atr?: number;
  wingWidth?: number;
  callWingWidth?: number;
  putWingWidth?: number;
  shortCall: IronCondorLegInput;
  longCall: IronCondorLegInput;
  shortPut: IronCondorLegInput;
  longPut: IronCondorLegInput;
  now?: Date;
  costConfig?: TransactionCostConfig;
  slippageConfig?: {
    entrySlippagePercent?: number;
    exitSlippagePercent?: number;
    stopGapPercent?: number;
  };
}

export function calculateIronCondorPayoff(params: IronCondorPayoffParams): {
  success: boolean;
  payoff: OptionsPayoff | null;
  rejectionReason: string | null;
} {
  const { spot, lotSize, shortCall, longCall, shortPut, longPut, now, expiryYears, expiry, holdingHours, srRoom, atr } = params;

  // 1. Expiry metadata consistency validation across all four legs
  const legsList = [
    { name: "shortCall", leg: shortCall },
    { name: "longCall", leg: longCall },
    { name: "shortPut", leg: shortPut },
    { name: "longPut", leg: longPut },
  ];

  const stringExpiries = legsList
    .map((l) => ({ name: l.name, exp: l.leg.expiry ?? expiry ?? null }))
    .filter((x): x is { name: string; exp: string } => typeof x.exp === "string" && x.exp.length > 0);

  if (stringExpiries.length > 1) {
    const firstExp = stringExpiries[0];
    for (let i = 1; i < stringExpiries.length; i++) {
      if (stringExpiries[i].exp !== firstExp.exp) {
        return {
          success: false,
          payoff: null,
          rejectionReason: `Inconsistent leg expiries across Iron Condor legs: ${firstExp.name} (${firstExp.exp}) !== ${stringExpiries[i].name} (${stringExpiries[i].exp})`,
        };
      }
    }
  }

  const yearExpiries = legsList
    .map((l) => ({ name: l.name, expY: l.leg.expiryYears }))
    .filter((x): x is { name: string; expY: number } => typeof x.expY === "number");

  if (yearExpiries.length > 1) {
    const firstExpY = yearExpiries[0];
    for (let i = 1; i < yearExpiries.length; i++) {
      if (Math.abs(yearExpiries[i].expY - firstExpY.expY) > 1e-6) {
        return {
          success: false,
          payoff: null,
          rejectionReason: `Inconsistent leg expiryYears across Iron Condor legs: ${firstExpY.name} (${firstExpY.expY}) !== ${yearExpiries[i].name} (${yearExpiries[i].expY})`,
        };
      }
    }
  }

  const effectiveExpiryYears = typeof expiryYears === "number"
    ? expiryYears
    : yearExpiries.length > 0
    ? yearExpiries[0].expY
    : null;

  if (typeof expiryYears === "number" && yearExpiries.length > 0) {
    for (const item of yearExpiries) {
      if (Math.abs(item.expY - expiryYears) > 1e-6) {
        return {
          success: false,
          payoff: null,
          rejectionReason: `Inconsistent expiryYears: condor (${expiryYears}) !== ${item.name} (${item.expY})`,
        };
      }
    }
  }

  // Expired contract validation: Fail closed immediately without inventing positive time-to-expiry
  if (typeof effectiveExpiryYears === "number" && effectiveExpiryYears <= 0) {
    return {
      success: false,
      payoff: null,
      rejectionReason: `Contract has expired (expiryYears: ${effectiveExpiryYears} <= 0)`,
    };
  }

  // Validate lot size
  if (!Number.isFinite(lotSize) || lotSize <= 0) {
    return {
      success: false,
      payoff: null,
      rejectionReason: `Invalid lot size: ${lotSize}`,
    };
  }

  // Geometry checks
  if (shortPut.strike >= shortCall.strike) {
    return {
      success: false,
      payoff: null,
      rejectionReason: `Iron Condor short put strike (${shortPut.strike}) must be strictly below short call strike (${shortCall.strike})`,
    };
  }
  if (longCall.strike <= shortCall.strike) {
    return {
      success: false,
      payoff: null,
      rejectionReason: `Iron Condor long call wing (${longCall.strike}) must be strictly above short call (${shortCall.strike})`,
    };
  }
  if (longPut.strike >= shortPut.strike) {
    return {
      success: false,
      payoff: null,
      rejectionReason: `Iron Condor long put wing (${longPut.strike}) must be strictly below short put (${shortPut.strike})`,
    };
  }

  // Wing widths: call wing and put wing can be equal or unequal
  const callWing = params.callWingWidth ?? Math.abs(longCall.strike - shortCall.strike);
  const putWing = params.putWingWidth ?? Math.abs(shortPut.strike - longPut.strike);

  if (callWing <= 0 || putWing <= 0) {
    return {
      success: false,
      payoff: null,
      rejectionReason: `Invalid wing width: call wing (${callWing}) and put wing (${putWing}) must be strictly positive`,
    };
  }

  // Check leg freshness if `now` or contractPriceQuality is present
  const checkLegFreshness = (name: string, quote: IronCondorLegInput["quote"]) => {
    if (quote.contractPriceQuality === "CONTRACT_PRICE_STALE") {
      return `Leg ${name} quote is marked STALE`;
    }
    if (quote.contractPriceQuality === "CONTRACT_PRICE_MISMATCH") {
      return `Leg ${name} quote has price mismatch`;
    }
    if (now && quote.lastTradeTime) {
      const fresh = tradeFreshnessOf(quote.lastTradeTime, now);
      if (fresh.freshness === "STALE") {
        return `Leg ${name} quote is stale (LTT: ${quote.lastTradeTime})`;
      }
    }
    return null;
  };

  const scFreshErr = checkLegFreshness("Short Call", shortCall.quote);
  if (scFreshErr) return { success: false, payoff: null, rejectionReason: scFreshErr };
  const lcFreshErr = checkLegFreshness("Long Call", longCall.quote);
  if (lcFreshErr) return { success: false, payoff: null, rejectionReason: lcFreshErr };
  const spFreshErr = checkLegFreshness("Short Put", shortPut.quote);
  if (spFreshErr) return { success: false, payoff: null, rejectionReason: spFreshErr };
  const lpFreshErr = checkLegFreshness("Long Put", longPut.quote);
  if (lpFreshErr) return { success: false, payoff: null, rejectionReason: lpFreshErr };

  // Executable validation for all 4 legs:
  // Short legs sell at Bid, buy back at Ask
  // Long wings buy at Ask, sell to close at Bid
  const scVal = validateExecutableQuote(shortCall.quote, "SELL");
  if (!scVal.valid || scVal.entryPrice === null) {
    return { success: false, payoff: null, rejectionReason: `Short Call ${shortCall.strike}: ${scVal.rejectionReason}` };
  }
  const lcVal = validateExecutableQuote(longCall.quote, "BUY");
  if (!lcVal.valid || lcVal.entryPrice === null) {
    return { success: false, payoff: null, rejectionReason: `Long Call ${longCall.strike}: ${lcVal.rejectionReason}` };
  }
  const spVal = validateExecutableQuote(shortPut.quote, "SELL");
  if (!spVal.valid || spVal.entryPrice === null) {
    return { success: false, payoff: null, rejectionReason: `Short Put ${shortPut.strike}: ${spVal.rejectionReason}` };
  }
  const lpVal = validateExecutableQuote(longPut.quote, "BUY");
  if (!lpVal.valid || lpVal.entryPrice === null) {
    return { success: false, payoff: null, rejectionReason: `Long Put ${longPut.strike}: ${lpVal.rejectionReason}` };
  }

  const scBid = scVal.entryPrice;
  const lcAsk = lcVal.entryPrice;
  const spBid = spVal.entryPrice;
  const lpAsk = lpVal.entryPrice;

  // Executable net credit = (Bid_sc + Bid_sp) - (Ask_lc + Ask_lp)
  const premiumReceived = scBid + spBid;
  const premiumPaid = lcAsk + lpAsk;
  const netCredit = r2Strict(premiumReceived - premiumPaid);

  if (netCredit <= 0) {
    return {
      success: false,
      payoff: null,
      rejectionReason: `Invalid Iron Condor executable credit: Premium received (${premiumReceived}) <= Premium paid (${premiumPaid}); net credit must be positive`,
    };
  }

  const callCredit = r2Strict(scBid - lcAsk);
  const putCredit = r2Strict(spBid - lpAsk);

  if (callCredit >= callWing) {
    return {
      success: false,
      payoff: null,
      rejectionReason: `Call spread credit (${callCredit}) cannot exceed call wing width (${callWing})`,
    };
  }

  if (putCredit >= putWing) {
    return {
      success: false,
      payoff: null,
      rejectionReason: `Put spread credit (${putCredit}) cannot exceed put wing width (${putWing})`,
    };
  }

  const minWing = Math.min(callWing, putWing);
  const maxWing = Math.max(callWing, putWing);

  // Maximum theoretical profit is the net credit received
  const maxProfit = netCredit;
  const maxProfitPerLot = r2Strict(maxProfit * lotSize);

  // Maximum theoretical loss using worst-case side-specific loss:
  // On upside: callWing - netCredit; on downside: putWing - netCredit
  const maxLoss = r2Strict(Math.max(0, callWing - netCredit, putWing - netCredit));
  const maxLossPerLot = r2Strict(maxLoss * lotSize);

  // Breakevens
  const lowerBE = r2Strict(shortPut.strike - netCredit);
  const upperBE = r2Strict(shortCall.strike + netCredit);

  // Strategy 11.4 Stop and Targets for credit strategies:
  // Stop: buy back at 2x credit (loss of 1x credit)
  const stop = r2Strict(netCredit * 2.0);
  const risk = r2Strict(stop - netCredit); // 1.0 * netCredit

  const hours = holdingHours ?? 2.0;
  const dtYears = hours / (365 * 24);

  let t1: number;
  let t2: number;
  let targetPricingModel: "BLACK_SCHOLES_REPRICED" | "EXPIRY_PAYOFF" | "CONVEXITY_GREEK_ADJUSTED" | "DELTA_APPROXIMATION_FALLBACK" = "DELTA_APPROXIMATION_FALLBACK";
  let greeksQuality: "INDEPENDENTLY_DERIVED" | "VENDOR_REPORTED" | "DATA_INSUFFICIENT" = "INDEPENDENTLY_DERIVED";
  let horizonStatus: "EXPIRES_AFTER_HORIZON" | "EXPIRES_AT_HORIZON" | "EXPIRES_BEFORE_HORIZON" | "DATA_INSUFFICIENT" = "DATA_INSUFFICIENT";
  let underlyingMoveCalibrated = true;
  let isHypotheticalDiagnostic = false;
  let hypotheticalDiagnosticNote: string | null = null;
  let terminalPayoffByLeg: {
    strike: number;
    side: OptionSide;
    type: OptionType;
    intrinsicValueTarget1: number;
    intrinsicValueTarget2: number;
  }[] | undefined;

  if (typeof effectiveExpiryYears === "number" && effectiveExpiryYears > 0 && effectiveExpiryYears <= dtYears + 1e-9) {
    // Expiry occurs during or exactly at the holding horizon (0 < effectiveExpiryYears <= dtYears).
    // The position is evaluated at expiry across ALL four legs.
    // For Iron Condor, the terminal buyback cost to close across all four legs at target underlying spot ST is:
    // Short Put:  max(0, shortPut.strike - ST)
    // Long Put:   max(0, longPut.strike - ST)
    // Short Call: max(0, ST - shortCall.strike)
    // Long Call:  max(0, ST - longCall.strike)
    // Cost to close(ST) = [max(0, shortPut.strike - ST) - max(0, longPut.strike - ST)] +
    //                     [max(0, ST - shortCall.strike) - max(0, ST - longCall.strike)]
    // At neutral range target ST1 = spot:
    // If shortPut.strike <= spot <= shortCall.strike, all four legs expire worthless -> Cost to close = 0.00.
    const useRoom = Math.max(srRoom ?? 0, (atr ?? 0) * 0.4);
    const move1 = useRoom * 0.45;
    const targetSpot1 = spot; // Neutral thesis: spot stays rangebound
    const targetSpot2 = spot + move1; // Scenario testing upper boundary

    const calcLegIntrinsics = (st: number) => {
      const spVal = Math.max(0, shortPut.strike - st);
      const lpVal = Math.max(0, longPut.strike - st);
      const scVal = Math.max(0, st - shortCall.strike);
      const lcVal = Math.max(0, st - longCall.strike);
      const closeCost = Math.max(0, (spVal - lpVal) + (scVal - lcVal));
      return { spVal, lpVal, scVal, lcVal, closeCost };
    };

    const c1 = calcLegIntrinsics(targetSpot1);
    const c2 = calcLegIntrinsics(targetSpot2);

    t1 = r2Strict(c1.closeCost);
    t2 = r2Strict(c2.closeCost);
    targetPricingModel = "EXPIRY_PAYOFF";

    terminalPayoffByLeg = [
      { strike: shortCall.strike, side: "SELL", type: "CE", intrinsicValueTarget1: r2Strict(c1.scVal), intrinsicValueTarget2: r2Strict(c2.scVal) },
      { strike: longCall.strike, side: "BUY", type: "CE", intrinsicValueTarget1: r2Strict(c1.lcVal), intrinsicValueTarget2: r2Strict(c2.lcVal) },
      { strike: shortPut.strike, side: "SELL", type: "PE", intrinsicValueTarget1: r2Strict(c1.spVal), intrinsicValueTarget2: r2Strict(c2.spVal) },
      { strike: longPut.strike, side: "BUY", type: "PE", intrinsicValueTarget1: r2Strict(c1.lpVal), intrinsicValueTarget2: r2Strict(c2.lpVal) },
    ];

    const isAtHorizon = Math.abs(effectiveExpiryYears - dtYears) < 1e-9;
    if (isAtHorizon) {
      horizonStatus = "EXPIRES_AT_HORIZON";
      greeksQuality = "INDEPENDENTLY_DERIVED";
      underlyingMoveCalibrated = true;
      isHypotheticalDiagnostic = false;
      hypotheticalDiagnosticNote = null;
    } else {
      horizonStatus = "EXPIRES_BEFORE_HORIZON";
      greeksQuality = "DATA_INSUFFICIENT";
      underlyingMoveCalibrated = false;
      isHypotheticalDiagnostic = true;
      hypotheticalDiagnosticNote = "Underlying target projection reflects unscaled full-horizon move; cannot reliably forecast movement over shortened expiry window. Marked DATA_INSUFFICIENT.";
    }
  } else {
    // Check if explicit target quotes are provided for all 4 legs:
    // Short Call exits by buying at Ask
    // Long Call exits by selling at Bid
    // Short Put exits by buying at Ask
    // Long Put exits by selling at Bid
    const hasTargetQuotes =
      shortCall.targetQuote?.ask != null &&
      longCall.targetQuote?.bid != null &&
      shortPut.targetQuote?.ask != null &&
      longPut.targetQuote?.bid != null;

    if (hasTargetQuotes) {
      const scExitAsk = shortCall.targetQuote!.ask!;
      const lcExitBid = longCall.targetQuote!.bid!;
      const spExitAsk = shortPut.targetQuote!.ask!;
      const lpExitBid = longPut.targetQuote!.bid!;

      t1 = r2Strict((scExitAsk + spExitAsk) - (lcExitBid + lpExitBid));
      t2 = t1;
    } else {
      // Standard Strategy 11.4 target buybacks (Target 1: buy back at 50% credit, Target 2: buy back at 20% credit)
      t1 = r2Strict(netCredit * 0.5);
      t2 = r2Strict(netCredit * 0.2);
    }
    targetPricingModel = "DELTA_APPROXIMATION_FALLBACK";
    horizonStatus = typeof effectiveExpiryYears === "number" ? "EXPIRES_AFTER_HORIZON" : "DATA_INSUFFICIENT";
    greeksQuality = "INDEPENDENTLY_DERIVED";
    underlyingMoveCalibrated = true;
    isHypotheticalDiagnostic = false;
    hypotheticalDiagnosticNote = null;
  }

  // Gross R:R for credit strategies: (credit - target1) / (stop - credit) = 0.5 / 1.0 = 0.50
  const grossRR = risk > 0 ? r2Strict((netCredit - t1) / risk) : 0;
  const target1ProfitPerLot = r2Strict((netCredit - t1) * lotSize);
  const target2ProfitPerLot = r2Strict((netCredit - t2) * lotSize);
  const stopLossAmountPerLot = r2Strict((stop - netCredit) * lotSize);

  // Transaction costs & slippage (8 order executions: 4 legs entry, 4 legs exit)
  const costCfg = params.costConfig ?? DEFAULT_TRANSACTION_COSTS;
  const sE = (params.slippageConfig?.entrySlippagePercent ?? 1.0) / 100;
  const sX = (params.slippageConfig?.exitSlippagePercent ?? 1.0) / 100;
  const gap = (params.slippageConfig?.stopGapPercent ?? 2.0) / 100;

  // Entry fills: sells receive bid*(1-sE), buys pay ask*(1+sE)
  const scEntryFill = r2Strict(scBid * (1 - sE));
  const lcEntryFill = r2Strict(lcAsk * (1 + sE));
  const spEntryFill = r2Strict(spBid * (1 - sE));
  const lpEntryFill = r2Strict(lpAsk * (1 + sE));
  const netEntryFill = r2Strict((scEntryFill + spEntryFill) - (lcEntryFill + lpEntryFill));

  // Target exit fills: buy back shorts at ask, sell wings at bid
  const hasTargetQuotes =
    shortCall.targetQuote?.ask != null &&
    longCall.targetQuote?.bid != null &&
    shortPut.targetQuote?.ask != null &&
    longPut.targetQuote?.bid != null;

  const targetRatio = t1 / netCredit;
  const scTargetFill = hasTargetQuotes
    ? r2Strict(shortCall.targetQuote!.ask! * (1 + sX))
    : r2Strict(scVal.exitPrice! * targetRatio * (1 + sX));
  const lcTargetFill = hasTargetQuotes
    ? r2Strict(longCall.targetQuote!.bid! * (1 - sX))
    : r2Strict(lcVal.exitPrice! * targetRatio * (1 - sX));
  const spTargetFill = hasTargetQuotes
    ? r2Strict(shortPut.targetQuote!.ask! * (1 + sX))
    : r2Strict(spVal.exitPrice! * targetRatio * (1 + sX));
  const lpTargetFill = hasTargetQuotes
    ? r2Strict(longPut.targetQuote!.bid! * (1 - sX))
    : r2Strict(lpVal.exitPrice! * targetRatio * (1 - sX));

  // Stop exit fills
  const stopRatio = stop / netCredit;
  const scStopFill = r2Strict(scVal.exitPrice! * stopRatio * (1 + sX + gap));
  const lcStopFill = r2Strict(Math.max(0, lcVal.exitPrice! * stopRatio * (1 - sX - gap)));
  const spStopFill = r2Strict(spVal.exitPrice! * stopRatio * (1 + sX + gap));
  const lpStopFill = r2Strict(Math.max(0, lpVal.exitPrice! * stopRatio * (1 - sX - gap)));

  // 8 fills for target with explicit orderId grouping
  const targetCosts = costsFor(
    [
      { side: "SELL", price: scEntryFill, quantity: lotSize, orderId: "sc-entry" },
      { side: "BUY", price: lcEntryFill, quantity: lotSize, orderId: "lc-entry" },
      { side: "SELL", price: spEntryFill, quantity: lotSize, orderId: "sp-entry" },
      { side: "BUY", price: lpEntryFill, quantity: lotSize, orderId: "lp-entry" },
      { side: "BUY", price: scTargetFill, quantity: lotSize, orderId: "sc-exit" },
      { side: "SELL", price: lcTargetFill, quantity: lotSize, orderId: "lc-exit" },
      { side: "BUY", price: spTargetFill, quantity: lotSize, orderId: "sp-exit" },
      { side: "SELL", price: lpTargetFill, quantity: lotSize, orderId: "lp-exit" },
    ],
    costCfg,
  );

  // 8 fills for stop with explicit orderId grouping
  const stopCosts = costsFor(
    [
      { side: "SELL", price: scEntryFill, quantity: lotSize, orderId: "sc-entry" },
      { side: "BUY", price: lcEntryFill, quantity: lotSize, orderId: "lc-entry" },
      { side: "SELL", price: spEntryFill, quantity: lotSize, orderId: "sp-entry" },
      { side: "BUY", price: lpEntryFill, quantity: lotSize, orderId: "lp-entry" },
      { side: "BUY", price: scStopFill, quantity: lotSize, orderId: "sc-exit" },
      { side: "SELL", price: lcStopFill, quantity: lotSize, orderId: "lc-exit" },
      { side: "BUY", price: spStopFill, quantity: lotSize, orderId: "sp-exit" },
      { side: "SELL", price: lpStopFill, quantity: lotSize, orderId: "lp-exit" },
    ],
    costCfg,
  );

  const netExitCostTarget = r2Strict((scTargetFill + spTargetFill) - (lcTargetFill + lpTargetFill));
  const netRewardPerLot = r2Strict((netEntryFill - netExitCostTarget) * lotSize - targetCosts.totalCosts);

  const netExitCostStop = r2Strict((scStopFill + spStopFill) - (lcStopFill + lpStopFill));
  const netRiskPerLot = r2Strict((netExitCostStop - netEntryFill) * lotSize + stopCosts.totalCosts);
  const netRewardToRisk = netRiskPerLot > 0 ? r2Strict(netRewardPerLot / netRiskPerLot) : null;

  const legs: LegPricingDetail[] = [
    {
      side: "SELL",
      type: "CE",
      strike: shortCall.strike,
      ltp: shortCall.quote.ltp,
      bid: shortCall.quote.bid,
      ask: shortCall.quote.ask,
      spreadPct: scVal.spreadPct,
      executablePrice: scBid,
      instrumentKey: shortCall.quote.instrumentKey ?? null,
    },
    {
      side: "BUY",
      type: "CE",
      strike: longCall.strike,
      ltp: longCall.quote.ltp,
      bid: longCall.quote.bid,
      ask: longCall.quote.ask,
      spreadPct: lcVal.spreadPct,
      executablePrice: lcAsk,
      instrumentKey: longCall.quote.instrumentKey ?? null,
    },
    {
      side: "SELL",
      type: "PE",
      strike: shortPut.strike,
      ltp: shortPut.quote.ltp,
      bid: shortPut.quote.bid,
      ask: shortPut.quote.ask,
      spreadPct: spVal.spreadPct,
      executablePrice: spBid,
      instrumentKey: shortPut.quote.instrumentKey ?? null,
    },
    {
      side: "BUY",
      type: "PE",
      strike: longPut.strike,
      ltp: longPut.quote.ltp,
      bid: longPut.quote.bid,
      ask: longPut.quote.ask,
      spreadPct: lpVal.spreadPct,
      executablePrice: lpAsk,
      instrumentKey: longPut.quote.instrumentKey ?? null,
    },
  ];

  const currentLiquidationCost = r2Strict((scVal.exitPrice! + spVal.exitPrice!) - (lcVal.exitPrice! + lpVal.exitPrice!));
  const immediateUnrealizedPnL = r2Strict(netCredit - currentLiquidationCost);
  const immediateUnrealizedPnLPerLot = r2Strict(immediateUnrealizedPnL * lotSize);

  const payoff: OptionsPayoff = {
    strategy: "IRON_CONDOR",
    isCredit: true,
    netEntryPrice: netCredit,
    entryZone: [r2Strict(netCredit * 0.95), r2Strict(netCredit * 1.05)],
    stopLossPrice: stop,
    target1Price: t1,
    target2Price: t2,
    maxTheoreticalLoss: maxLoss,
    maxTheoreticalLossPerLot: maxLossPerLot,
    maxTheoreticalProfit: maxProfit,
    maxTheoreticalProfitPerLot: maxProfitPerLot,
    breakevens: [lowerBE, upperBE],
    grossRewardToRisk: grossRR,
    target1ProfitPerLot,
    target2ProfitPerLot,
    stopLossAmountPerLot,
    observedValues: {
      spot,
      legs,
    },
    calculatedValues: {
      executableEntry: netCredit,
      currentLiquidationCost,
      immediateUnrealizedPnL,
      immediateUnrealizedPnLPerLot,
      spreadWidth: maxWing,
      callWingWidth: callWing,
      putWingWidth: putWing,
      breakevens: [lowerBE, upperBE],
      maxTheoreticalLoss: maxLoss,
      maxTheoreticalProfit: maxProfit,
      target1Premium: t1,
      stopPremium: stop,
      grossRewardToRisk: grossRR,
    },
    estimatedValues: {
      isModelEstimate: true,
      holdingHours: hours,
      orderCount: 8,
      brokeragePerOrder: costCfg.brokeragePerOrder,
      entrySlippagePercent: sE * 100,
      exitSlippagePercent: sX * 100,
      stopGapPercent: gap * 100,
      targetSlippagePerLot: r2Strict(target1ProfitPerLot - (netEntryFill - netExitCostTarget) * lotSize),
      transactionCosts: targetCosts,
      netRewardToRisk,
      netProfitTarget1PerLot: netRewardPerLot,
      netRiskPerLot,
      targetPricingModel,
      horizonStatus,
      greeksQuality,
      underlyingMoveCalibrated,
      isHypotheticalDiagnostic,
      hypotheticalDiagnosticNote,
      terminalPayoffByLeg,
    },
  };

  return { success: true, payoff, rejectionReason: null };
}
