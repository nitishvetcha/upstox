import type { BacktestRunConfig, BacktestResult, BacktestTrade } from "./backtestTypes.ts";
import { BacktestEngine } from "./backtestEngine.ts";
import type { Candle } from "./types.ts";
import type { HistoricalContext } from "./services/historicalContext.ts";
import { summaryRow } from "./services/backtestScenarios.ts";

export type WindowType = "ROLLING" | "EXPANDING";

export interface WalkForwardConfig {
  windowType: WindowType;
  trainMonths: number;
  testMonths: number;
  stepMonths: number;
  initialCapital: number;
  executionModel: "CLOSE_ONLY" | "INTRABAR_MODEL_DERIVED";
  compounding: boolean;
  flattenOnDailyLossLimit: boolean;
  slippagePercent: number;
}

export interface WindowDefinition {
  windowIndex: number;
  trainStartDate: string;
  trainEndDate: string;
  testStartDate: string;
  testEndDate: string;
}

export interface WindowResult {
  window: WindowDefinition;
  trainResult: BacktestResult;
  testResult: BacktestResult;
  trainSummary: ReturnType<typeof summaryRow>;
  testSummary: ReturnType<typeof summaryRow>;
  degradation: {
    profitFactorDelta: number | null;
    expectancyDelta: number | null;
    winRateDelta: number | null;
    returnDeltaPp: number;
  };
}

export type WalkForwardValidationGate =
  | "INSUFFICIENT_HISTORY"
  | "INSUFFICIENT_SAMPLE"
  | "OOS_FAILURE"
  | "OOS_UNSTABLE"
  | "PARTIAL_OOS_SUPPORT"
  | "OOS_EVIDENCE_WARRANTS_FURTHER_VALIDATION";

export interface AggregateOOSMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number | null;
  netPnL: number;
  grossProfit: number;
  grossLoss: number;
  returnPercent: number;
  profitFactor: number | null;
  expectancy: number | null;
  averageR: number | null;
  medianR: number | null;
  maxDrawdownPercent: number;
  sharpe: number | null;
  sortino: number | null;
  calmar: number | null;
  largestWin: number | null;
  largestLoss: number | null;
  holdingMinutesAvg: number | null;
}

export interface ConcentrationWarning {
  largestWindowPnL: number;
  totalOOSPnL: number;
  contributionPercent: number;
  triggered: boolean;
  top1TradePnL: number;
  top1ContributionPercent: number;
  top5TradePnL: number;
  top5ContributionPercent: number;
  top10TradePnL: number;
  top10ContributionPercent: number;
}

export interface WalkForwardResult {
  wfRunId: string;
  config: BacktestRunConfig;
  wfConfig: WalkForwardConfig;
  datasetHash: string;
  versions: {
    strategyVersion: string;
    riskConfigVersion: string;
    executionModelVersion: string;
    dataModelVersion: string;
    costConfigVersion: string;
  };
  windows: WindowResult[];
  aggregateOOS: AggregateOOSMetrics;
  oosTrades: BacktestTrade[];
  concentration: ConcentrationWarning;
  regimePerformance: Record<string, { trades: number; wins: number; losses: number; winRate: number | null; netPnL: number; profitFactor: number | null; averageR: number | null }>;
  expiryPerformance: Record<string, { trades: number; wins: number; losses: number; winRate: number | null; netPnL: number; profitFactor: number | null }>;
  monthlyOOS: Array<{ month: string; trades: number; wins: number; losses: number; netPnL: number; returnPercent: number }>;
  streaks: {
    maxConsecutiveWins: number;
    maxConsecutiveLosses: number;
    longestDrawdownDays: number;
  };
  gate: WalkForwardValidationGate;
  dataQualityNotice: Record<string, string>;
  createdAt: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function addMonthsIST(dateStr: string, months: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function generateWindowDefinitions(
  startDate: string,
  endDate: string,
  wfConfig: WalkForwardConfig
): WindowDefinition[] {
  const windows: WindowDefinition[] = [];
  let wIndex = 1;
  let trainStart = startDate;

  while (true) {
    const trainEnd = addMonthsIST(trainStart, wfConfig.trainMonths);
    const testStart = trainEnd; // Next day/session starts test
    const testEnd = addMonthsIST(testStart, wfConfig.testMonths);

    if (testEnd > endDate && testStart >= endDate) {
      break;
    }

    const actualTestEnd = testEnd > endDate ? endDate : testEnd;

    windows.push({
      windowIndex: wIndex,
      trainStartDate: wfConfig.windowType === "EXPANDING" ? startDate : trainStart,
      trainEndDate: trainEnd,
      testStartDate: testStart,
      testEndDate: actualTestEnd,
    });

    wIndex++;
    trainStart = addMonthsIST(trainStart, wfConfig.stepMonths);
    if (trainStart >= endDate) break;
  }

  return windows;
}

export function sliceCandles(candles: Candle[], startISO: string, endISO: string): Candle[] {
  return candles.filter((c) => {
    const day = c.timestamp.slice(0, 10);
    return day >= startISO && day <= endISO;
  });
}

export function filterHistoricalContext(ctx: HistoricalContext | null, startISO: string, endISO: string): HistoricalContext | null {
  if (!ctx) return null;
  return {
    ...ctx,
    vix: sliceCandles(ctx.vix, startISO, endISO),
    vixDaily: ctx.vixDaily.filter((c) => c.timestamp.slice(0, 10) <= endISO),
    constituents: ctx.constituents.map((c) => ({
      symbol: c.symbol,
      candles: sliceCandles(c.candles, startISO, endISO),
    })),
  };
}

export function runWalkForward(
  config: BacktestRunConfig,
  candles: Candle[],
  daily: Candle[],
  wfConfig: WalkForwardConfig,
  ctx: HistoricalContext | null = null,
  dsHash = ""
): WalkForwardResult {
  const engine = new BacktestEngine();

  // 1. Generate window definitions
  const windowDefs = generateWindowDefinitions(config.startDate, config.endDate, wfConfig);

  const windowResults: WindowResult[] = [];
  const oosTrades: BacktestTrade[] = [];

  for (const def of windowDefs) {
    // Train run
    const trainConfig: BacktestRunConfig = {
      ...config,
      startDate: def.trainStartDate,
      endDate: def.trainEndDate,
      executionModel: wfConfig.executionModel,
      startingCapital: wfConfig.initialCapital,
      compounding: wfConfig.compounding,
      flattenOnDailyLossLimit: wfConfig.flattenOnDailyLossLimit,
      slippagePercent: wfConfig.slippagePercent,
    };
    const trainCandles = sliceCandles(candles, def.trainStartDate, def.trainEndDate);
    const trainDaily = daily.filter((c) => c.timestamp.slice(0, 10) <= def.trainEndDate);
    const trainCtx = filterHistoricalContext(ctx, def.trainStartDate, def.trainEndDate);

    const trainResult = engine.run(trainConfig, trainCandles, trainDaily, { candleSource: "END_OF_DAY" }, trainCtx);

    // Test (OOS) run
    const testConfig: BacktestRunConfig = {
      ...config,
      startDate: def.testStartDate,
      endDate: def.testEndDate,
      executionModel: wfConfig.executionModel,
      startingCapital: wfConfig.initialCapital,
      compounding: wfConfig.compounding,
      flattenOnDailyLossLimit: wfConfig.flattenOnDailyLossLimit,
      slippagePercent: wfConfig.slippagePercent,
    };
    const testCandles = sliceCandles(candles, def.testStartDate, def.testEndDate);
    const testDaily = daily.filter((c) => c.timestamp.slice(0, 10) <= def.testEndDate);
    const testCtx = filterHistoricalContext(ctx, def.testStartDate, def.testEndDate);

    const testResult = engine.run(testConfig, testCandles, testDaily, { candleSource: "END_OF_DAY" }, testCtx);

    const trainSum = summaryRow(trainResult);
    const testSum = summaryRow(testResult);

    const pfTrain = typeof trainSum.profitFactor === "number" ? trainSum.profitFactor : null;
    const pfTest = typeof testSum.profitFactor === "number" ? testSum.profitFactor : null;

    const expTrain = typeof trainSum.expectancy === "number" ? trainSum.expectancy : null;
    const expTest = typeof testSum.expectancy === "number" ? testSum.expectancy : null;

    const wrTrain = typeof trainSum.winRate === "number" ? trainSum.winRate : null;
    const wrTest = typeof testSum.winRate === "number" ? testSum.winRate : null;

    windowResults.push({
      window: def,
      trainResult,
      testResult,
      trainSummary: trainSum,
      testSummary: testSum,
      degradation: {
        profitFactorDelta: pfTrain !== null && pfTest !== null ? r2(pfTest - pfTrain) : null,
        expectancyDelta: expTrain !== null && expTest !== null ? r2(expTest - expTrain) : null,
        winRateDelta: wrTrain !== null && wrTest !== null ? r2(wrTest - wrTrain) : null,
        returnDeltaPp: r2(testSum.returnPercent - trainSum.returnPercent),
      },
    });

    // Tag and collect OOS trades
    for (const t of testResult.trades) {
      if (t.exitTimestamp) {
        oosTrades.push({
          ...t,
          tradeId: `oos_w${def.windowIndex}_${t.tradeId}`,
        });
      }
    }
  }

  // Aggregate OOS metrics
  const totalTrades = oosTrades.length;
  const wins = oosTrades.filter((t) => t.realizedPnL > 0);
  const losses = oosTrades.filter((t) => t.realizedPnL < 0);

  const grossProfit = r2(sum(wins.map((t) => t.realizedPnL)));
  const grossLoss = r2(Math.abs(sum(losses.map((t) => t.realizedPnL))));
  const netPnL = r2(sum(oosTrades.map((t) => t.realizedPnL)));

  const winRate = totalTrades ? r2((wins.length / totalTrades) * 100) : null;
  const profitFactor = grossLoss > 0 ? r2(grossProfit / grossLoss) : grossProfit > 0 ? null : null;
  const expectancy = totalTrades ? r2(netPnL / totalTrades) : null;

  const rs = oosTrades.map((t) => t.rMultiple);
  const averageR = totalTrades ? r2(sum(rs) / totalTrades) : null;

  let medianR: number | null = null;
  if (totalTrades > 0) {
    const sorted = [...rs].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    medianR = sorted.length % 2 !== 0 ? sorted[mid] : r2((sorted[mid - 1] + sorted[mid]) / 2);
  }

  // Concentration calculations
  const windowPnLs = windowResults.map((w) => w.testSummary.netPnL);
  const largestWindowPnL = windowPnLs.length ? Math.max(...windowPnLs) : 0;
  const contributionPercent = netPnL > 0 ? r2((largestWindowPnL / netPnL) * 100) : 0;
  const concTriggered = contributionPercent > 70;

  const sortedPnLs = oosTrades.map((t) => t.realizedPnL).sort((a, b) => b - a);
  const top1TradePnL = sortedPnLs.length > 0 ? sortedPnLs[0] : 0;
  const top5TradePnL = sum(sortedPnLs.slice(0, 5));
  const top10TradePnL = sum(sortedPnLs.slice(0, 10));

  const concentration: ConcentrationWarning = {
    largestWindowPnL,
    totalOOSPnL: netPnL,
    contributionPercent,
    triggered: concTriggered,
    top1TradePnL,
    top1ContributionPercent: netPnL > 0 ? r2((top1TradePnL / netPnL) * 100) : 0,
    top5TradePnL,
    top5ContributionPercent: netPnL > 0 ? r2((top5TradePnL / netPnL) * 100) : 0,
    top10TradePnL,
    top10ContributionPercent: netPnL > 0 ? r2((top10TradePnL / netPnL) * 100) : 0,
  };

  // Regime Performance
  const regimePerf: WalkForwardResult["regimePerformance"] = {};
  for (const t of oosTrades) {
    const reg = t.regime || "UNKNOWN";
    if (!regimePerf[reg]) {
      regimePerf[reg] = { trades: 0, wins: 0, losses: 0, winRate: null, netPnL: 0, profitFactor: null, averageR: null };
    }
    const r = regimePerf[reg];
    r.trades++;
    if (t.realizedPnL > 0) r.wins++;
    if (t.realizedPnL < 0) r.losses++;
    r.netPnL = r2(r.netPnL + t.realizedPnL);
  }
  for (const reg in regimePerf) {
    const r = regimePerf[reg];
    r.winRate = r.trades ? r2((r.wins / r.trades) * 100) : null;
    const rWins = oosTrades.filter((t) => t.regime === reg && t.realizedPnL > 0);
    const rLosses = oosTrades.filter((t) => t.regime === reg && t.realizedPnL < 0);
    const gp = sum(rWins.map((t) => t.realizedPnL));
    const gl = Math.abs(sum(rLosses.map((t) => t.realizedPnL)));
    r.profitFactor = gl > 0 ? r2(gp / gl) : null;
    const rRs = oosTrades.filter((t) => t.regime === reg).map((t) => t.rMultiple);
    r.averageR = r.trades ? r2(sum(rRs) / r.trades) : null;
  }

  // Expiry Performance
  const expiryPerf: WalkForwardResult["expiryPerformance"] = {};
  for (const t of oosTrades) {
    const expType = t.expiry ? (t.expiry.endsWith("-W") ? "WEEKLY" : "MONTHLY") : "NON_EXPIRY";
    if (!expiryPerf[expType]) {
      expiryPerf[expType] = { trades: 0, wins: 0, losses: 0, winRate: null, netPnL: 0, profitFactor: null };
    }
    const ep = expiryPerf[expType];
    ep.trades++;
    if (t.realizedPnL > 0) ep.wins++;
    if (t.realizedPnL < 0) ep.losses++;
    ep.netPnL = r2(ep.netPnL + t.realizedPnL);
  }
  for (const expType in expiryPerf) {
    const ep = expiryPerf[expType];
    ep.winRate = ep.trades ? r2((ep.wins / ep.trades) * 100) : null;
  }

  // Monthly OOS P&L
  const monthlyMap = new Map<string, { trades: number; wins: number; losses: number; netPnL: number }>();
  for (const t of oosTrades) {
    const m = t.exitTimestamp.slice(0, 7);
    if (!monthlyMap.has(m)) monthlyMap.set(m, { trades: 0, wins: 0, losses: 0, netPnL: 0 });
    const item = monthlyMap.get(m)!;
    item.trades++;
    if (t.realizedPnL > 0) item.wins++;
    if (t.realizedPnL < 0) item.losses++;
    item.netPnL = r2(item.netPnL + t.realizedPnL);
  }
  const monthlyOOS = [...monthlyMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, data]) => ({
    month,
    ...data,
    returnPercent: r2((data.netPnL / wfConfig.initialCapital) * 100),
  }));

  // Streaks
  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;
  let curWins = 0;
  let curLosses = 0;
  for (const t of oosTrades) {
    if (t.realizedPnL > 0) {
      curWins++;
      curLosses = 0;
      maxConsecutiveWins = Math.max(maxConsecutiveWins, curWins);
    } else if (t.realizedPnL < 0) {
      curLosses++;
      curWins = 0;
      maxConsecutiveLosses = Math.max(maxConsecutiveLosses, curLosses);
    }
  }

  // Validation Gate Decision
  let gate: WalkForwardValidationGate = "OOS_EVIDENCE_WARRANTS_FURTHER_VALIDATION";
  if (totalTrades < 10) {
    gate = "INSUFFICIENT_SAMPLE";
  } else if (netPnL < 0 || (profitFactor !== null && profitFactor < 1)) {
    gate = "OOS_FAILURE";
  } else if (concTriggered || (profitFactor !== null && profitFactor < 1.1)) {
    gate = "OOS_UNSTABLE";
  } else if (netPnL > 0 && profitFactor !== null && profitFactor >= 1.1) {
    gate = "PARTIAL_OOS_SUPPORT";
  }

  // Deterministic WF Run ID
  const sStr = JSON.stringify({ config, wfConfig, windowCount: windowDefs.length, dsHash });
  let hash = 0x811c9dc5;
  for (let i = 0; i < sStr.length; i++) hash = Math.imul(hash ^ sStr.charCodeAt(i), 0x01000193) >>> 0;
  const wfRunId = `wf_${hash.toString(16).padStart(8, "0")}`;

  return {
    wfRunId,
    config,
    wfConfig,
    datasetHash: dsHash || "ds_measured",
    versions: {
      strategyVersion: "strategy-2026.10-p9",
      riskConfigVersion: "risk-2026.10-p10",
      executionModelVersion: wfConfig.executionModel,
      dataModelVersion: "PHASE10",
      costConfigVersion: "nse-options-2024-10",
    },
    windows: windowResults,
    aggregateOOS: {
      totalTrades,
      winningTrades: wins.length,
      losingTrades: losses.length,
      winRate,
      netPnL,
      grossProfit,
      grossLoss,
      returnPercent: r2((netPnL / wfConfig.initialCapital) * 100),
      profitFactor,
      expectancy,
      averageR,
      medianR,
      maxDrawdownPercent: 0, // calculated from equity if needed
      sharpe: null,
      sortino: null,
      calmar: null,
      largestWin: wins.length ? Math.max(...wins.map((t) => t.realizedPnL)) : null,
      largestLoss: losses.length ? Math.min(...losses.map((t) => t.realizedPnL)) : null,
      holdingMinutesAvg: null,
    },
    oosTrades,
    concentration,
    regimePerformance: regimePerf,
    expiryPerformance: expiryPerf,
    monthlyOOS,
    streaks: {
      maxConsecutiveWins,
      maxConsecutiveLosses,
      longestDrawdownDays: 0,
    },
    gate,
    dataQualityNotice: {
      spot: "HISTORICAL_MEASURED",
      technicals: "HISTORICAL_MEASURED",
      options: "MODEL_DERIVED",
      iv: "HISTORICAL_RECONSTRUCTED",
      oi: "NOT_AVAILABLE",
      breadth: "HISTORICAL_RECONSTRUCTED",
      news: "NOT_AVAILABLE",
      events: "NOT_AVAILABLE",
      execution: "SIMULATED",
      costs: "MODELED",
    },
    createdAt: new Date().toISOString(),
  };
}
