// One place that turns a backtest request into engine inputs (used by run / scenarios / compare routes):
// chunked historical candles for the requested range plus warmup, honest coverage, no fabricated candles.
import type { BacktestRunConfig, BacktestRunMeta } from "../backtestTypes.ts";
import type { Candle, IndexId, Timeframe } from "../types.ts";
import type { ExecutionModel } from "../backtestExecution.ts";
import { INSTRUMENTS } from "./instrumentRegistry.ts";
import { addCalendarDays, coverageFor, loadHistoricalRange, type ChunkFetcher } from "./historicalCandles.ts";
import { loadHistoricalContext, type HistoricalContext } from "./historicalContext.ts";

export const INTRADAY_WARMUP_DAYS = 14; // EMA 200 at 15m ≈ 8 sessions
export const DAILY_WARMUP_DAYS = 90; // daily ATR 14 needs ≥ 15 completed sessions

export function configFromBody(body: Record<string, unknown>): BacktestRunConfig {
  const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
  const tf = String(body.timeframe ?? "15m");
  return {
    index: (body.index === "banknifty" ? "banknifty" : "nifty") as IndexId,
    timeframe: (["5m", "15m", "30m", "1h"].includes(tf) ? tf : "15m") as Timeframe,
    startDate: String(body.startDate ?? "2026-09-01"),
    endDate: String(body.endDate ?? "2026-10-05"),
    startingCapital: num(body.startingCapital, 100_000),
    strategyFilter: (body.strategyFilter as BacktestRunConfig["strategyFilter"]) ?? "ALL",
    slippagePercent: body.slippagePercent === 0 || body.slippagePercent === "0" ? 0 : num(body.slippagePercent, 1),
    compounding: body.compounding === true || body.compounding === "on",
    riskConfig: Number(body.riskPerTradePercent) > 0 ? { riskPerTradePercent: Number(body.riskPerTradePercent) } : undefined,
    executionModel: (body.executionModel === "INTRABAR_MODEL_DERIVED" ? "INTRABAR_MODEL_DERIVED" : "CLOSE_ONLY") as ExecutionModel,
    flattenOnDailyLossLimit: body.flattenOnDailyLossLimit === true || body.flattenOnDailyLossLimit === "on",
  };
}

// PHASE10 (default): India VIX + constituent history. PHASE9_LEGACY: the Phase 9 synthetic model, kept only for
// before/after comparison on the same candles.
export const dataModelFromBody = (body: Record<string, unknown>) => (body.dataModel === "PHASE9_LEGACY" ? "PHASE9_LEGACY" : "PHASE10");

export async function loadBacktestInputs(
  config: BacktestRunConfig,
  fetchChunk: ChunkFetcher,
  dataModel: "PHASE10" | "PHASE9_LEGACY" = "PHASE9_LEGACY",
): Promise<{ candles: Candle[]; daily: Candle[]; meta: BacktestRunMeta; ctx: HistoricalContext | null }> {
  const key = INSTRUMENTS[config.index].underlyingKey;
  const intraday = await loadHistoricalRange({ instrumentKey: key, interval: config.timeframe, startDate: addCalendarDays(config.startDate, -INTRADAY_WARMUP_DAYS), endDate: config.endDate }, fetchChunk);
  const daily = await loadHistoricalRange({ instrumentKey: key, interval: "1d", startDate: addCalendarDays(config.startDate, -DAILY_WARMUP_DAYS), endDate: config.endDate }, fetchChunk);
  const ctx = dataModel === "PHASE10" ? await loadHistoricalContext(config.index, config.startDate, config.endDate, addCalendarDays(config.startDate, -INTRADAY_WARMUP_DAYS), fetchChunk) : null;
  return {
    ctx,
    candles: intraday.candles,
    daily: daily.candles,
    meta: { candleSource: intraday.candles.length ? "END_OF_DAY" : "UNAVAILABLE", coverage: coverageFor(intraday, config.startDate, config.endDate) },
  };
}
