// Phase 8 performance report: one deterministic function from a completed BacktestResult (+ optional trade
// filters) to every dashboard/API figure. Analytics consume completed results only; nothing flows back into
// strategy or trade generation.
import type { BacktestResult, BacktestTrade, EquityCurvePoint } from "../../backtestTypes.ts";
import { getRiskConfig } from "../risk/riskConfig.ts";
import {
  annualizedReturn, calmar, coreMetrics, dailyReturns, drawdownAnalytics, exitReasonStats, groupStats, holdingAnalysis,
  istDay, monthlyStats, PERIODS_PER_YEAR, rDistribution, realizedEquity, sharpe, sortino, weekdayOf, type Metric,
} from "./metrics.ts";

export const PERFORMANCE_LABEL = "SIMULATED HISTORICAL PERFORMANCE";

// Prominent, non-dismissable warnings derived from the run's own data-quality labels.
export function historicalWarnings(result: BacktestResult): string[] {
  const sc = result.scorecard;
  const w = ["HISTORICAL SIMULATION — NOT LIVE MARKET DATA"];
  w.push("WARNING: Historical option prices are model-derived. Results are not equivalent to observed historical option quotes.");
  if (!sc || sc.news.quality !== "HISTORICAL_MEASURED") w.push(sc?.news.quality === "NOT_AVAILABLE" ? "Historical news is NOT AVAILABLE (neutral placeholder: news neither confirms nor vetoes)." : "Historical news coverage is partial / mock.");
  if (!sc || sc.breadth.quality === "SYNTHETIC") w.push("Historical breadth is synthetic and should not be interpreted as observed constituent breadth.");
  else if (sc.breadth.quality === "HISTORICAL_RECONSTRUCTED") w.push("Historical breadth is reconstructed from today's constituent list (survivorship-bias risk).");
  if (!sc || sc.oi.quality === "SYNTHETIC") w.push("Historical OI is synthetic and should not be interpreted as observed market positioning.");
  else if (sc.oi.quality === "NOT_AVAILABLE") w.push("Historical OI is NOT AVAILABLE: the option-chain factor carries no positioning information.");
  return w;
}
export const REGIME_ORDER = ["STRONG BULLISH", "BULLISH", "RANGE", "BEARISH", "STRONG BEARISH", "HIGH VOLATILITY", "EVENT RISK"];

export interface TradeFilters {
  strategy?: string;
  regime?: string;
  from?: string; // YYYY-MM-DD (IST, by entry)
  to?: string;
  outcome?: "win" | "loss" | "breakeven";
  exitReason?: BacktestTrade["exitReason"];
  minR?: number;
  maxR?: number;
}

export function filterTrades(trades: BacktestTrade[], f: TradeFilters): BacktestTrade[] {
  return trades.filter((t) => {
    const day = istDay(t.entryTimestamp);
    if (f.strategy && t.strategy !== f.strategy) return false;
    if (f.regime && t.regime !== f.regime) return false;
    if (f.from && day < f.from) return false;
    if (f.to && day > f.to) return false;
    if (f.outcome === "win" && !(t.realizedPnL > 0)) return false;
    if (f.outcome === "loss" && !(t.realizedPnL < 0)) return false;
    if (f.outcome === "breakeven" && t.realizedPnL !== 0) return false;
    if (f.exitReason && t.exitReason !== f.exitReason) return false;
    if (f.minR !== undefined && t.rMultiple < f.minR) return false;
    if (f.maxR !== undefined && t.rMultiple > f.maxR) return false;
    return true;
  });
}
const hasFilters = (f: TradeFilters) => Object.values(f).some((v) => v !== undefined && v !== "");

// Short, non-promissory explanations shown as tooltips.
export const METRIC_HELP: Record<string, string> = {
  netPnL: "Sum of realized P&L of the selected simulated trades (after modeled slippage, and statutory costs when modeled).",
  totalReturnPercent: "Net P&L as a percentage of initial capital.",
  winRate: "Share of trades with positive P&L. Says nothing about the size of wins vs losses.",
  profitFactor: "Gross profit ÷ gross loss. Above 1 means winners outweighed losers in this sample; undefined with no losing trades.",
  expectancy: "Average P&L per trade in this sample.",
  averageR: "Average P&L in units of the risk taken at entry (R). Sensitive to stop gaps between bar closes.",
  maxDrawdown: "Largest peak-to-trough fall of the equity curve.",
  sharpe: "Mean daily return ÷ its standard deviation, annualized ×√252. Highly dependent on sample size and assumptions; needs ≥ 5 daily observations.",
  sortino: "Like Sharpe, but divides by downside deviation only (returns below 0%). Undefined with no down days.",
  calmar: "Annualized return ÷ |max drawdown %|. Needs ≥ 20 trading days; short samples make it unreliable.",
};

export interface ReportOptions {
  riskFreeRateAnnualPercent?: number; // default 0
  periodsPerYear?: number; // default 252 (daily)
}

export function buildPerformanceReport(result: BacktestResult, filters: TradeFilters = {}, opts: ReportOptions = {}) {
  const initial = result.config.startingCapital || 100_000;
  const periodsPerYear = opts.periodsPerYear ?? PERIODS_PER_YEAR;
  const rfPerPeriod = (1 + (opts.riskFreeRateAnnualPercent ?? 0) / 100) ** (1 / periodsPerYear) - 1;
  const filtered = hasFilters(filters);
  const trades = filterTrades(result.trades.filter((t) => t.exitTimestamp), filters);

  // Unfiltered: the engine's mark-to-market curve (one point per evaluated bar). Filtered: rebuilt from the
  // selected trades' realized exits (a subset can't be marked to market from aggregated bars).
  const equity: EquityCurvePoint[] = filtered
    ? realizedEquity(trades, initial, result.equityCurve[0]?.timestamp ?? trades[0]?.entryTimestamp ?? result.config.startDate)
    : result.equityCurve;
  const core = coreMetrics(trades, initial);
  const dd = drawdownAnalytics(equity, initial);
  const daily = dailyReturns(equity, initial);
  const rets = daily.map((d) => d.ret);
  const annual = annualizedReturn(initial, core.finalCapital, daily.length, periodsPerYear);
  const sh = sharpe(rets, rfPerPeriod, periodsPerYear);
  const so = sortino(rets, 0, periodsPerYear);

  const strategies = groupStats(trades, (t) => t.strategy, initial).sort((a, b) => b.tradeCount - a.tradeCount);
  const regimes = groupStats(trades, (t) => t.regime, initial).sort((a, b) => REGIME_ORDER.indexOf(a.key) - REGIME_ORDER.indexOf(b.key));
  const weekdayGroups = groupStats(trades, weekdayOf, initial);
  const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((d) => {
    const g = weekdayGroups.find((w) => w.key === d);
    return { day: d, tradeCount: g?.tradeCount ?? 0, winRate: g?.winRate ?? ({ value: null, reason: "no trades" } as Metric), netPnL: g?.netPnL ?? 0, averageR: g?.averageR ?? ({ value: null, reason: "no trades" } as Metric) };
  });

  // Risk utilization against the configured limits (defaults unchanged).
  const cfg = getRiskConfig({ ...result.config.riskConfig, accountCapital: initial });
  const budget = initial * (cfg.riskPerTradePercent / 100);
  const utils = trades.map((t) => t.riskAmount / budget);
  const dayLoss = new Map<string, number>();
  for (const t of trades) dayLoss.set(istDay(t.exitTimestamp), (dayLoss.get(istDay(t.exitTimestamp)) ?? 0) + t.realizedPnL);
  const maxDayLoss = Math.max(0, ...[...dayLoss.values()].map((p) => -p));
  const dailyLimit = initial * (cfg.maxDailyLossPercent / 100);
  const openPts = result.equityCurve.filter((p) => p.openPositions > 0);
  const r2 = (n: number) => Math.round(n * 100) / 100;

  const noTrade = result.noTradeAnalytics;
  const reasons = Object.entries(noTrade.rejectionReasons)
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([code, count]) => ({ code, count, percentOfEvaluated: noTrade.totalEvaluated ? r2((count / noTrade.totalEvaluated) * 100) : 0 }));

  const slippage = r2(trades.reduce((a, t) => a + (t.slippageCost ?? 0), 0));
  const q = result.dataQuality;

  return {
    runId: result.runId,
    label: PERFORMANCE_LABEL,
    coverage: result.meta.coverage ?? null,
    execution: result.execution ?? null,
    capitalFeasibility: result.capitalFeasibility ?? null,
    config: result.config,
    filters,
    equityBasis: filtered ? ("REALIZED_ONLY" as const) : ("MARK_TO_MARKET" as const),
    dataQuality: {
      overall: "PARTIAL" as const,
      spotCandles: q.spot,
      technicals: q.technicals,
      breadth: q.breadth,
      optionPrices: q.optionData,
      iv: q.iv,
      oi: q.oi,
      greeks: q.greeks,
      news: q.news,
      eventRisk: q.eventRisk,
      execution: q.execution,
      intrabarOptionPrices: q.intrabarOptionPrices ?? "NOT AVAILABLE",
      historicalOptionOHLC: q.historicalOptionOHLC ?? "NOT AVAILABLE",
      transactionCosts: q.transactionCosts,
      note: q.note,
    },
    core,
    ratios: {
      annualizedReturnPercent: annual,
      sharpe: sh,
      sortino: so,
      calmar: calmar(annual, dd.maxDrawdownPercent),
      returnObservations: rets.length,
      tradingDays: daily.length,
      riskFreeRateAnnualPercent: opts.riskFreeRateAnnualPercent ?? 0,
      periodsPerYear,
    },
    drawdown: dd,
    equity,
    dailyReturns: daily,
    strategies,
    regimes,
    monthly: monthlyStats(trades, initial, result.config.startDate, result.config.endDate),
    weekdays,
    holding: holdingAnalysis(trades),
    rDistribution: rDistribution(trades),
    exitReasons: exitReasonStats(trades),
    noTrade: { ...noTrade, reasons, note: "A bar can carry several blockers, so reason percentages can sum to more than 100%." },
    risk: {
      limits: {
        riskPerTradePercent: cfg.riskPerTradePercent,
        maxDailyLossPercent: cfg.maxDailyLossPercent,
        maxOpenRiskPercent: cfg.maxOpenRiskPercent,
        maxPositionValuePercent: cfg.maxPositionValuePercent,
        maxConcurrentPositions: cfg.maxConcurrentPositions,
        maxLotsPerTrade: cfg.maxLotsPerTrade,
        minRiskReward: cfg.minRiskReward,
        slippagePercent: result.config.slippagePercent ?? 1,
        capital: initial,
      },
      averageRiskPerTrade: trades.length ? r2(trades.reduce((a, t) => a + t.riskAmount, 0) / trades.length) : null,
      maxRiskPerTrade: trades.length ? r2(Math.max(...trades.map((t) => t.riskAmount))) : null,
      averageRiskUtilizationPercent: utils.length ? r2((utils.reduce((a, b) => a + b, 0) / utils.length) * 100) : null,
      maxRiskUtilizationPercent: utils.length ? r2(Math.max(...utils) * 100) : null,
      maxDailyRealizedLoss: r2(maxDayLoss),
      dailyLossUtilizationPercent: r2((maxDayLoss / dailyLimit) * 100),
      dailyLossBreachDays: [...dayLoss.values()].filter((p) => -p >= dailyLimit).length,
      // Portfolio-level (whole run; not decomposable by trade filters):
      averageOpenRisk: openPts.length ? r2(openPts.reduce((a, p) => a + p.openRisk, 0) / openPts.length) : 0,
      maxOpenRisk: result.riskMetrics.maxOpenRisk,
      maxOpenRiskUtilizationPercent: r2((result.riskMetrics.maxOpenRisk / (initial * (cfg.maxOpenRiskPercent / 100))) * 100),
      maxConcurrentPositionsObserved: result.riskMetrics.maxConcurrentPositions,
      maxLotsObserved: trades.length ? Math.max(...trades.map((t) => t.lots)) : 0,
      riskRejections: result.riskMetrics.riskRejections ?? 0,
      lossesBeyondPlannedRisk: trades.filter((t) => t.rMultiple < -1).length,
    },
    costs: {
      slippage,
      transactionCosts: result.costSummary?.modeled ? result.costSummary.totalCosts : ("NOT MODELED" as const),
      breakdown: result.costSummary ?? null,
      grossPnLBeforeSlippage: r2(core.netPnL + slippage + (result.costSummary?.modeled && !filtered ? result.costSummary.totalCosts : 0)),
    },
    warnings: historicalWarnings(result),
    scorecard: result.scorecard ?? null,
    validation: result.validation ?? null,
    sample: result.sample ?? null,
    metadata: result.metadata ?? null,
    metricHelp: METRIC_HELP,
    interpretation: interpretation(core.netPnL, trades.length, daily.length, q.spot, result.metadata?.dataModel === "PHASE10"),
  };
}

// Factual, non-advisory summary. Never recommends trading.
function interpretation(net: number, n: number, days: number, spot: string, p10 = false): string {
  if (!n) return "No simulated trades in the selected scope, so there is no performance to interpret.";
  const dir = net > 0 ? "positive" : net < 0 ? "negative" : "flat";
  return (
    `The selected backtest produced ${dir} simulated returns from ${n} trade${n === 1 ? "" : "s"} over ${days} trading day${days === 1 ? "" : "s"}. ` +
    `Spot/candle inputs are ${spot === "HISTORICAL MEASURED" ? "historical Upstox data" : "MOCK (not historical)"}, but option prices are ` +
    (p10
      ? "model-derived (Black-Scholes at India VIX), breadth is reconstructed from today's constituents, and OI and news are not available. "
      : "synthetic (Black-Scholes at a flat IV benchmark), breadth is synthetic and news is mock. ") +
    "Treat these as strategy-engine simulation results, " +
    "not verified historical options-market performance. Small samples make every ratio here unstable."
  );
}

export type PerformanceReport = ReturnType<typeof buildPerformanceReport>;
