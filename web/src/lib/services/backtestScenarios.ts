// Descriptive what-if runs on the SAME candles + strategy + risk config. Nothing here optimizes or recommends.
import type { BacktestResult, BacktestRunConfig, BacktestRunMeta } from "../backtestTypes.ts";
import type { Candle } from "../types.ts";
import type { HistoricalContext } from "./historicalContext.ts";
import { BacktestEngine } from "../backtestEngine.ts";
import { buildPerformanceReport } from "./performance/report.ts";
import type { Metric } from "./performance/metrics.ts";

export const CAPITAL_SCENARIOS = [100_000, 200_000, 500_000, 1_000_000, 2_500_000, 5_000_000];
export const CAPITAL_NOTE = "Capital scenario analysis is descriptive. It does not optimize or recommend account size.";

export function summaryRow(r: BacktestResult) {
  const p = buildPerformanceReport(r);
  const reasons = r.noTradeAnalytics.rejectionReasons;
  return {
    runId: r.runId,
    capital: r.config.startingCapital,
    executionModel: r.execution.model,
    flattenOnDailyLossLimit: r.execution.flattenOnDailyLossLimit,
    trades: p.core.totalTrades,
    wins: p.core.winningTrades,
    losses: p.core.losingTrades,
    winRate: p.core.winRate,
    netPnL: p.core.netPnL,
    returnPercent: p.core.totalReturnPercent,
    profitFactor: p.core.profitFactor,
    expectancy: p.core.expectancy,
    averageR: p.core.averageR,
    maxDrawdownPercent: p.drawdown.maxDrawdownPercent,
    sharpe: p.ratios.sharpe.annualized,
    sortino: p.ratios.sortino.annualized,
    grossPnL: r.costSummary?.grossPnL ?? null,
    transactionCosts: r.costSummary?.modeled ? r.costSummary.totalCosts : "NOT MODELED",
    dataModel: r.metadata?.dataModel ?? "PHASE9_LEGACY",
    dataQuality: r.scorecard ? Object.fromEntries(Object.entries(r.scorecard).map(([k, v]) => [k, v.quality])) : null,
    validation: r.validation?.status ?? null,
    positionSizeRejections: reasons.POSITION_SIZE_ZERO ?? 0,
    riskRejections: r.riskMetrics.riskRejections,
    dailyLossBlocks: reasons.DAILY_LOSS_LIMIT_BLOCK ?? 0,
    dailyLossFlattens: r.execution.dailyLossFlattens,
    lossesBeyondPlannedRisk: p.risk.lossesBeyondPlannedRisk,
    feasibility: r.capitalFeasibility.status,
  };
}

export function runCapitalScenarios(config: BacktestRunConfig, candles: Candle[], daily: Candle[], meta: BacktestRunMeta, ctx: HistoricalContext | null = null, capitals = CAPITAL_SCENARIOS) {
  const engine = new BacktestEngine();
  const runs = capitals.map((c) => engine.run({ ...config, startingCapital: c }, candles, daily, meta, ctx));
  return { note: CAPITAL_NOTE, feasibility: runs[0]?.capitalFeasibility ?? null, rows: runs.map(summaryRow), runs };
}

// Sensitivity thresholds (documented): HIGH when the two models' returns differ by more than 20 percentage
// points or net P&L changes sign; MODERATE above 5 points; otherwise LOW.
export const SENSITIVITY_THRESHOLDS = { highReturnDiffPp: 20, moderateReturnDiffPp: 5 };

export function compareExecutionModels(config: BacktestRunConfig, candles: Candle[], daily: Candle[], meta: BacktestRunMeta, ctx: HistoricalContext | null = null) {
  const engine = new BacktestEngine();
  const close = engine.run({ ...config, executionModel: "CLOSE_ONLY" }, candles, daily, meta, ctx);
  const intrabar = engine.run({ ...config, executionModel: "INTRABAR_MODEL_DERIVED" }, candles, daily, meta, ctx);
  const a = summaryRow(close);
  const b = summaryRow(intrabar);
  const diff = Math.round((b.returnPercent - a.returnPercent) * 100) / 100;
  const flip = a.netPnL !== 0 && b.netPnL !== 0 && Math.sign(a.netPnL) !== Math.sign(b.netPnL);
  const sensitivity = Math.abs(diff) > SENSITIVITY_THRESHOLDS.highReturnDiffPp || flip ? "HIGH" : Math.abs(diff) > SENSITIVITY_THRESHOLDS.moderateReturnDiffPp ? "MODERATE" : "LOW";
  const mv = (m: Metric) => m.value;
  return {
    closeOnly: a,
    intrabar: b,
    returnDifferencePp: diff,
    netPnLSignFlip: flip,
    sensitivity,
    thresholds: SENSITIVITY_THRESHOLDS,
    averageRDelta: mv(a.averageR) !== null && mv(b.averageR) !== null ? Math.round((mv(b.averageR)! - mv(a.averageR)!) * 100) / 100 : null,
    runs: { close, intrabar },
  };
}

// Side-by-side comparison of any runs (e.g. A–D). Data quality is part of the row: a better-looking result from
// lower-quality inputs must not be preferred automatically, so nothing here ranks or picks a "best" run.
export const COMPARISON_NOTE = "Descriptive comparison. Runs are not ranked; compare data quality before comparing results.";
export function compareRuns(runs: { label: string; result: BacktestResult }[]) {
  return { note: COMPARISON_NOTE, rows: runs.map(({ label, result }) => ({ label, index: result.config.index, ...summaryRow(result) })) };
}
