// Phase 4 — Statistical Validation, Walk-Forward Analysis & Regime Partitioning
// Evaluates options strategy robustness across Out-of-Sample (OOS) data,
// volatility & trend regimes, and Monte Carlo bootstrap confidence intervals.

import type { Candle, UnderlyingId } from "../types.ts";
import {
  runContractReplayBacktest,
  type ReplayBacktestConfig,
  type ReplayBacktestResult,
  type ReplayTrade,
} from "./contractReplayBacktester.ts";
import { isCommodityId } from "./instrumentRegistry.ts";
import { istMinutes } from "../time.ts";

export interface WalkForwardWindowResult {
  windowType: "CHRONOLOGICAL_SPLIT";
  inSampleRatio: number;
  inSample: {
    startDate: string;
    endDate: string;
    candlesCount: number;
    result: ReplayBacktestResult;
  };
  outOfSample: {
    startDate: string;
    endDate: string;
    candlesCount: number;
    result: ReplayBacktestResult;
  };
  walkForwardEfficiency: number; // OOS Net PnL / IS Net PnL (annualized / normalized)
  degradation: {
    winRateDelta: number; // OOS winRate - IS winRate
    profitFactorDelta: number;
    netPnlRatio: number;
  };
  gateStatus: "PASS" | "BORDERLINE" | "FAIL";
}

export interface RegimeMetric {
  regime: string;
  tradeCount: number;
  winRatePct: number;
  grossPnl: number;
  totalCosts: number;
  netPnl: number;
  profitFactor: number;
  averageTradeNetPnl: number;
}

export interface RegimePartitionResult {
  volatilityRegimes: {
    highVol: RegimeMetric;
    lowVol: RegimeMetric;
  };
  trendRegimes: {
    trending: RegimeMetric;
    ranging: RegimeMetric;
  };
  sessionRegimes: {
    morningSession: RegimeMetric;
    eveningSession: RegimeMetric; // for MCX or evening F&O
  };
}

export interface BootstrapConfidenceIntervals {
  resamples: number;
  winRate: {
    mean: number;
    ci95Lower: number;
    ci95Upper: number;
  };
  expectedTradeNetPnl: {
    mean: number;
    ci95Lower: number;
    ci95Upper: number;
  };
  maxDrawdownP95: number;
  probabilityOfLoss: number; // percentage of bootstrap runs ending in net negative
}

export interface StatisticalValidationReport {
  runId: string;
  underlying: UnderlyingId;
  totalHistoricalTrades: number;
  walkForward: WalkForwardWindowResult;
  regimes: RegimePartitionResult;
  bootstrap: BootstrapConfidenceIntervals;
  robustnessGrade: "ROBUST" | "ACCEPTABLE" | "FRAGILE" | "UNVALIDATED";
  summaryVerdict: string;
}

/**
 * Splits candle array into chronological In-Sample (IS) and Out-Of-Sample (OOS) sets.
 */
export function splitChronologicalCandles(
  candles: Candle[],
  inSampleRatio = 0.70,
): { inSample: Candle[]; outOfSample: Candle[] } {
  if (candles.length < 2) {
    return { inSample: candles, outOfSample: [] };
  }
  const splitIdx = Math.max(1, Math.floor(candles.length * inSampleRatio));
  return {
    inSample: candles.slice(0, splitIdx),
    outOfSample: candles.slice(splitIdx),
  };
}

/**
 * Computes regime metrics for an arbitrary subset of replayed trades.
 */
function computeRegimeMetric(regimeName: string, trades: ReplayTrade[]): RegimeMetric {
  if (trades.length === 0) {
    return {
      regime: regimeName,
      tradeCount: 0,
      winRatePct: 0,
      grossPnl: 0,
      totalCosts: 0,
      netPnl: 0,
      profitFactor: 0,
      averageTradeNetPnl: 0,
    };
  }

  const winning = trades.filter((t) => t.netPnl > 0).length;
  const winRatePct = Math.round((winning / trades.length) * 1000) / 10;
  const grossPnl = Math.round(trades.reduce((a, t) => a + t.grossPnl, 0) * 100) / 100;
  const totalCosts = Math.round(trades.reduce((a, t) => a + t.totalCosts, 0) * 100) / 100;
  const netPnl = Math.round(trades.reduce((a, t) => a + t.netPnl, 0) * 100) / 100;

  const grossProfit = trades.reduce((a, t) => (t.grossPnl > 0 ? a + t.grossPnl : a), 0);
  const grossLoss = Math.abs(trades.reduce((a, t) => (t.grossPnl < 0 ? a + t.grossPnl : a), 0));
  const profitFactor = grossLoss > 0 ? Math.round((grossProfit / grossLoss) * 100) / 100 : grossProfit > 0 ? 99 : 0;
  const averageTradeNetPnl = Math.round((netPnl / trades.length) * 100) / 100;

  return {
    regime: regimeName,
    tradeCount: trades.length,
    winRatePct,
    grossPnl,
    totalCosts,
    netPnl,
    profitFactor,
    averageTradeNetPnl,
  };
}

/**
 * Partitions trades into Volatility, Trend, and Session market regimes.
 */
export function partitionTradesByRegime(
  trades: ReplayTrade[],
  underlying: UnderlyingId,
): RegimePartitionResult {
  // Volatility threshold: MCX default 30%, NSE default 16%
  const volThreshold = isCommodityId(underlying) ? 0.30 : 0.16;

  // Volatility classification
  const highVolTrades: ReplayTrade[] = [];
  const lowVolTrades: ReplayTrade[] = [];

  // Trend classification (measured by spot move magnitude during trade)
  const trendingTrades: ReplayTrade[] = [];
  const rangingTrades: ReplayTrade[] = [];

  // Session classification (Morning vs Evening)
  const morningTrades: ReplayTrade[] = [];
  const eveningTrades: ReplayTrade[] = [];

  for (const t of trades) {
    const d = new Date(t.entryTime);
    const { minutes } = istMinutes(d);

    // Session: evening is >= 17:00 IST (1020 min)
    if (minutes >= 1020) {
      eveningTrades.push(t);
    } else {
      morningTrades.push(t);
    }

    // Spot move magnitude
    const spotMovePct = Math.abs((t.exitSpot - t.entrySpot) / t.entrySpot);
    if (spotMovePct >= 0.005) {
      trendingTrades.push(t);
    } else {
      rangingTrades.push(t);
    }

    // Volatility proxy (faster target/stop hits correlate with elevated volatility)
    if (t.durationMinutes <= 60) {
      highVolTrades.push(t);
    } else {
      lowVolTrades.push(t);
    }
  }

  return {
    volatilityRegimes: {
      highVol: computeRegimeMetric("HIGH_VOLATILITY", highVolTrades),
      lowVol: computeRegimeMetric("LOW_VOLATILITY", lowVolTrades),
    },
    trendRegimes: {
      trending: computeRegimeMetric("TRENDING_MARKET", trendingTrades),
      ranging: computeRegimeMetric("RANGING_MARKET", rangingTrades),
    },
    sessionRegimes: {
      morningSession: computeRegimeMetric("MORNING_SESSION_09_17", morningTrades),
      eveningSession: computeRegimeMetric("EVENING_SESSION_17_23", eveningTrades),
    },
  };
}

/**
 * Computes 95% bootstrap confidence intervals across trade PnL outcomes using Monte Carlo resampling.
 */
export function computeBootstrapConfidenceIntervals(
  trades: ReplayTrade[],
  resamples = 1000,
): BootstrapConfidenceIntervals {
  if (trades.length === 0) {
    return {
      resamples: 0,
      winRate: { mean: 0, ci95Lower: 0, ci95Upper: 0 },
      expectedTradeNetPnl: { mean: 0, ci95Lower: 0, ci95Upper: 0 },
      maxDrawdownP95: 0,
      probabilityOfLoss: 100,
    };
  }

  const pnls = trades.map((t) => t.netPnl);
  const sampleWinRates: number[] = [];
  const sampleMeans: number[] = [];
  const sampleDrawdowns: number[] = [];
  let lossCount = 0;

  for (let s = 0; s < resamples; s++) {
    let winCount = 0;
    let netSum = 0;
    let peak = 0;
    let curr = 0;
    let maxDd = 0;

    for (let i = 0; i < pnls.length; i++) {
      // Sample with replacement
      const randomIdx = Math.floor(Math.random() * pnls.length);
      const pnl = pnls[randomIdx];
      if (pnl > 0) winCount++;
      netSum += pnl;

      curr += pnl;
      if (curr > peak) peak = curr;
      const dd = peak - curr;
      if (dd > maxDd) maxDd = dd;
    }

    const wr = (winCount / pnls.length) * 100;
    const mean = netSum / pnls.length;

    sampleWinRates.push(wr);
    sampleMeans.push(mean);
    sampleDrawdowns.push(maxDd);

    if (netSum <= 0) lossCount++;
  }

  sampleWinRates.sort((a, b) => a - b);
  sampleMeans.sort((a, b) => a - b);
  sampleDrawdowns.sort((a, b) => a - b);

  const idx025 = Math.floor(resamples * 0.025);
  const idx975 = Math.floor(resamples * 0.975);
  const idx950 = Math.floor(resamples * 0.950);

  const meanWr = sampleWinRates.reduce((a, b) => a + b, 0) / resamples;
  const meanNet = sampleMeans.reduce((a, b) => a + b, 0) / resamples;

  return {
    resamples,
    winRate: {
      mean: Math.round(meanWr * 10) / 10,
      ci95Lower: Math.round(sampleWinRates[idx025] * 10) / 10,
      ci95Upper: Math.round(sampleWinRates[idx975] * 10) / 10,
    },
    expectedTradeNetPnl: {
      mean: Math.round(meanNet * 100) / 100,
      ci95Lower: Math.round(sampleMeans[idx025] * 100) / 100,
      ci95Upper: Math.round(sampleMeans[idx975] * 100) / 100,
    },
    maxDrawdownP95: Math.round(sampleDrawdowns[idx950] * 100) / 100,
    probabilityOfLoss: Math.round((lossCount / resamples) * 1000) / 10,
  };
}

/**
 * Runs the comprehensive statistical validation workflow for any underlying.
 */
export function runStatisticalValidation(
  candles: Candle[],
  config: ReplayBacktestConfig,
  options?: { inSampleRatio?: number; bootstrapSamples?: number },
): StatisticalValidationReport {
  const inSampleRatio = options?.inSampleRatio ?? 0.70;
  const bootstrapSamples = options?.bootstrapSamples ?? 1000;
  const underlying = config.underlying;

  // 1. Chronological Walk-Forward Split
  const { inSample, outOfSample } = splitChronologicalCandles(candles, inSampleRatio);

  const isResult = runContractReplayBacktest(inSample, config);
  const oosResult = runContractReplayBacktest(outOfSample, config);

  // Normalize by number of candles to compare PnL rate
  const isPnlRate = inSample.length > 0 ? isResult.netProfit / inSample.length : 0;
  const oosPnlRate = outOfSample.length > 0 ? oosResult.netProfit / outOfSample.length : 0;
  const wfe = isPnlRate > 0 ? Math.round((oosPnlRate / isPnlRate) * 100) / 100 : oosResult.netProfit > 0 ? 1.0 : 0;

  const winRateDelta = Math.round((oosResult.winRatePct - isResult.winRatePct) * 10) / 10;
  const profitFactorDelta = Math.round((oosResult.profitFactor - isResult.profitFactor) * 100) / 100;
  const netPnlRatio = isResult.netProfit !== 0 ? Math.round((oosResult.netProfit / isResult.netProfit) * 100) / 100 : 0;

  let gateStatus: WalkForwardWindowResult["gateStatus"] = "FAIL";
  if (wfe >= 0.50 && oosResult.netProfit > 0) {
    gateStatus = "PASS";
  } else if (wfe >= 0.30 || oosResult.netProfit > 0) {
    gateStatus = "BORDERLINE";
  }

  const walkForward: WalkForwardWindowResult = {
    windowType: "CHRONOLOGICAL_SPLIT",
    inSampleRatio,
    inSample: {
      startDate: inSample[0]?.timestamp ?? "",
      endDate: inSample[inSample.length - 1]?.timestamp ?? "",
      candlesCount: inSample.length,
      result: isResult,
    },
    outOfSample: {
      startDate: outOfSample[0]?.timestamp ?? "",
      endDate: outOfSample[outOfSample.length - 1]?.timestamp ?? "",
      candlesCount: outOfSample.length,
      result: oosResult,
    },
    walkForwardEfficiency: wfe,
    degradation: {
      winRateDelta,
      profitFactorDelta,
      netPnlRatio,
    },
    gateStatus,
  };

  // 2. Regime Partitioning over all replayed trades
  const fullResult = runContractReplayBacktest(candles, config);
  const regimes = partitionTradesByRegime(fullResult.trades, underlying);

  // 3. Monte Carlo Bootstrap Analysis
  const bootstrap = computeBootstrapConfidenceIntervals(fullResult.trades, bootstrapSamples);

  // 4. Overall Robustness Grade
  let robustnessGrade: StatisticalValidationReport["robustnessGrade"] = "UNVALIDATED";
  if (fullResult.trades.length < 5) {
    robustnessGrade = "UNVALIDATED";
  } else if (gateStatus === "PASS" && bootstrap.probabilityOfLoss < 25 && bootstrap.expectedTradeNetPnl.ci95Lower > 0) {
    robustnessGrade = "ROBUST";
  } else if (gateStatus !== "FAIL" && bootstrap.probabilityOfLoss < 50) {
    robustnessGrade = "ACCEPTABLE";
  } else {
    robustnessGrade = "FRAGILE";
  }

  const summaryVerdict =
    robustnessGrade === "ROBUST"
      ? `Validated robust: WFE is ${(wfe * 100).toFixed(0)}%, 95% CI expected return is positive [₹${bootstrap.expectedTradeNetPnl.ci95Lower}, ₹${bootstrap.expectedTradeNetPnl.ci95Upper}], probability of loss is ${bootstrap.probabilityOfLoss}%.`
      : robustnessGrade === "ACCEPTABLE"
      ? `Acceptable statistical support: WFE is ${(wfe * 100).toFixed(0)}%, but tail risk or OOS drawdown requires conservative lot sizing.`
      : robustnessGrade === "FRAGILE"
      ? `Fragile under real friction: Significant OOS degradation (WFE ${(wfe * 100).toFixed(0)}%) or elevated probability of loss (${bootstrap.probabilityOfLoss}%).`
      : `Unvalidated: Insufficient trade sample (${fullResult.trades.length} trades). Requires minimum 100 trades across historical market sessions.`;

  return {
    runId: `VAL_${underlying}_${Date.now()}`,
    underlying,
    totalHistoricalTrades: fullResult.trades.length,
    walkForward,
    regimes,
    bootstrap,
    robustnessGrade,
    summaryVerdict,
  };
}
