// Shared, configuration-driven values for the screens. Indices come from the instrument registry and risk defaults from
// the risk configuration, so nothing here repeats them by hand. Lists that are purely presentation live in this one file.
import { INDICES, INSTRUMENTS } from "./services/instrumentRegistry.ts";
import { DEFAULT_RISK_CONFIG } from "./services/risk/riskConfig.ts";
import { istToday } from "./time.ts";

export const INDEX_OPTIONS = INDICES.map((id) => ({ id, label: INSTRUMENTS[id].name, symbol: INSTRUMENTS[id].symbol }));

// Timeframes offered by the price chart and the backtest form (intraday, as the backend supports them).
export const CHART_TIMEFRAMES = ["5m", "15m", "30m", "1h"] as const;

// Intervals offered on the market history page.
export const HISTORY_INTERVALS = ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w", "1mo"] as const;

// Backtest form defaults. Capital and risk come from the risk configuration; slippage is a backtest-only default.
export const BACKTEST_DEFAULTS = {
  startingCapital: DEFAULT_RISK_CONFIG.accountCapital,
  riskPerTradePercent: DEFAULT_RISK_CONFIG.riskPerTradePercent,
  slippagePercent: 1,
  timeframe: "15m" as const,
  lookbackMonths: 12,
};

// The default date range ends today (IST calendar day) and starts `lookbackMonths` earlier.
export function defaultDateRange(now = new Date(), lookbackMonths = BACKTEST_DEFAULTS.lookbackMonths) {
  const endDate = istToday(now); // UTC date would be yesterday between 00:00 and 05:30 IST
  const start = new Date(`${endDate}T00:00:00Z`);
  start.setUTCMonth(start.getUTCMonth() - lookbackMonths);
  return { startDate: start.toISOString().slice(0, 10), endDate };
}
