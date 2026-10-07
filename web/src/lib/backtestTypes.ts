import type { DataSource, IndexId, StrategyName, Timeframe } from "./types.ts";
import type { ExecutionModel } from "./backtestExecution.ts";
import type { Coverage } from "./services/historicalCandles.ts";
import type { RiskConfig } from "./services/risk/riskConfig.ts";
import type { ComponentQuality } from "./services/historicalContext.ts";
import type { TradeCosts, TransactionCostConfig } from "./services/transactionCosts.ts";

export type BacktestMode = "FULL" | "PARTIAL" | "LIMITED";

export interface BacktestRunMeta {
  candleSource: DataSource; // where the candles came from: LIVE / END_OF_DAY = real Upstox history
  coverage?: Coverage; // requested vs actual historical range (set by the run route / caller)
}

export interface CapitalFeasibility {
  configuredCapital: number;
  riskPerTradePercent: number;
  lotSize: number | null;
  riskPerLot: { min: number; median: number; max: number; samples: number } | null; // from evaluateTradeRisk, per signal
  minimumCapitalForOneLot: { min: number; median: number } | null; // riskPerLot / risk %
  status: "SUFFICIENT" | "SOMETIMES SUFFICIENT" | "INSUFFICIENT CAPITAL" | "NO SIGNALS";
  note: string;
}

export interface BacktestRunConfig {
  id?: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  index: IndexId;
  timeframe: Timeframe;
  strategyFilter?: StrategyName | "ALL";
  startingCapital: number; // e.g. 100000
  riskConfig?: Partial<RiskConfig>;
  slippagePercent?: number; // default 1.0
  compounding?: boolean; // default false (fixed capital)
  executionModel?: ExecutionModel; // default CLOSE_ONLY (Phase 7/8 behaviour)
  flattenOnDailyLossLimit?: boolean; // default false: limit only blocks new entries
  transactionCosts?: TransactionCostConfig; // Phase 10 runs: default DEFAULT_TRANSACTION_COSTS
}

export interface BacktestTradeLeg {
  side: "BUY" | "SELL";
  type: "CE" | "PE";
  strike: number;
  entryPrice: number; // fill incl. slippage
  exitPrice: number; // fill incl. slippage
  entryMid: number; // model price before slippage
  exitMid: number;
  quantity: number;
}

export interface BacktestTrade {
  tradeId: string;
  index: IndexId;
  strategy: StrategyName;
  signalTimestamp: string;
  entryTimestamp: string;
  exitTimestamp: string;
  expiry: string;
  legs: BacktestTradeLeg[];
  credit: boolean; // true: entry is premium received; stop/targets are buy-back prices

  entryPrice: number; // net per unit: positive debit paid, negative credit received
  exitPrice: number;
  quantity: number;
  lots: number;
  lotSize: number;

  stopLoss: number;
  target1: number;
  target2: number;

  riskAmount: number;
  riskReward: number;

  realizedPnL: number;
  pnlPercent: number;
  rMultiple: number;
  slippageCost: number; // ₹, entry + exit, vs model mid

  exitReason: "TARGET" | "STOP_LOSS" | "GAP_EXIT" | "EXPIRY" | "END_OF_BACKTEST" | "DAILY_LOSS_LIMIT_FLATTEN";
  grossPnL?: number; // market movement at model mids (before slippage and costs)
  costs?: TradeCosts; // statutory + brokerage (zeros when not modeled)
  netPnL?: number; // gross − slippage − costs (= realizedPnL)
  plannedRiskAmount?: number; // risk engine figure before slippage-aware re-sizing
  executionDataQuality?: "CLOSE_ONLY_SYNTHETIC" | "MODEL_DERIVED_INTRABAR";
  exitGap?: boolean; // exit filled at a gapped open beyond the stop/target level
  exitBarOptionOHLC?: { open: number; high: number; low: number; close: number } | null; // MODEL DERIVED, per unit
  entrySession?: string; // IST date
  exitSession?: string;
  overnightCount?: number; // trading sessions held beyond the entry session

  signalScore: number;
  confidence: number;
  regime: string;
}

// One point per evaluated bar (a known historical valuation point): open positions marked at the
// SYNTHETIC model price, no slippage. No intra-bar points are invented.
export interface EquityCurvePoint {
  timestamp: string;
  equity: number;
  cash: number;
  realizedPnL: number;
  unrealizedPnL: number;
  drawdown: number;
  drawdownPercent: number;
  openRisk: number;
  openPositions: number;
}

export interface MonthlyPerformance {
  month: string; // YYYY-MM
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnL: number;
  returnPercent: number;
  maxDrawdownPercent: number;
}

export interface StrategyPerformance {
  strategy: StrategyName;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnL: number;
  profitFactor: number | null;
  avgR: number | null;
}

export interface RegimePerformance {
  regime: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnL: number;
  avgR: number | null;
}

export interface NoTradeAnalytics {
  totalEvaluated: number;
  tradeCount: number;
  waitCount: number;
  noTradeCount: number;
  tradePercent: number;
  waitPercent: number;
  noTradePercent: number;
  rejectionReasons: Record<string, number>;
}

export type DataQualityLabel =
  | "HISTORICAL MEASURED"
  | "RECONSTRUCTED"
  | "SYNTHETIC"
  | "SYNTHETIC BENCHMARK"
  | "MODEL DERIVED"
  | "PARTIAL / MOCK"
  | "MOCK"
  | "MODEL DERIVED INTRABAR"
  | "NOT AVAILABLE"
  | "SIMULATED"
  | "MODELED";

// What each backtest input really is. Never upgraded (synthetic ≠ historical).
export interface DataQualityReport {
  mode: BacktestMode;
  /** Phase 11.6 — top-level dataset mode for option data. */
  datasetMode: "REAL" | "MIXED" | "MODEL_DERIVED" | "SYNTHETIC";
  spot: DataQualityLabel; // HISTORICAL MEASURED only when candles came from Upstox history
  technicals: DataQualityLabel;
  breadth: DataQualityLabel;
  optionData: DataQualityLabel;
  bidAsk: DataQualityLabel;
  oi: DataQualityLabel;
  iv: DataQualityLabel;
  greeks: DataQualityLabel;
  news: DataQualityLabel;
  eventRisk: DataQualityLabel;
  execution: DataQualityLabel;
  intrabarOptionPrices: DataQualityLabel; // MODEL DERIVED INTRABAR when used; NOT AVAILABLE (unused) for CLOSE_ONLY
  historicalOptionOHLC: "NOT AVAILABLE";
  transactionCosts: "NOT MODELED" | "MODELED";
  note: string;
}

export interface BacktestResult {
  runId: string;
  createdAt: string;
  config: BacktestRunConfig;
  dataQuality: DataQualityReport;

  summary: {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    grossProfit: number;
    grossLoss: number;
    netPnL: number;
    returnPercent: number;
    profitFactor: number | null;
    expectancy: number | null;
    maxDrawdown: number;
    maxDrawdownPercent: number;
    bestTrade: number | null;
    worstTrade: number | null;
    averageTrade: number | null;
    averageWin: number | null;
    averageLoss: number | null;
    averageR: number | null;
  };

  riskMetrics: {
    startingCapital: number;
    endingCapital: number;
    peakCapital: number;
    maxOpenRisk: number; // observed peak open risk, ₹
    maxConcurrentPositions: number; // observed
    dailyLossBreaches: number; // IST days where realized loss reached the daily limit
    dailyLossLimit: number; // ₹ at starting capital
    maxDailyRealizedLoss: number; // ₹, worst IST day
    maxLotsObserved: number;
    riskRejections: number; // TRADE signals refused by the risk engine
  };

  trades: BacktestTrade[];
  equityCurve: EquityCurvePoint[];
  monthlyPerformance: MonthlyPerformance[];
  strategyPerformance: StrategyPerformance[];
  regimePerformance: RegimePerformance[];
  noTradeAnalytics: NoTradeAnalytics;
  meta: BacktestRunMeta;
  execution: {
    model: ExecutionModel;
    intrabarPathModel: "DETERMINISTIC_OHLC_PATH" | null;
    sameBarExitPolicy: "CONSERVATIVE_STOP_FIRST" | null;
    flattenOnDailyLossLimit: boolean;
    dailyLossDefinition: "REALIZED_ONLY"; // same as the live/paper risk engine (realizedDailyLoss)
    dailyLossFlattens: number;
  };
  capitalFeasibility: CapitalFeasibility;
  metadata?: Record<string, unknown> & { datasetHash: string; dataModel: "PHASE10" | "PHASE9_LEGACY"; resultStatus: BacktestValidation["status"] };
  scorecard?: DataScorecard;
  validation?: BacktestValidation;
  sample?: SampleStats;
  costSummary?: { grossPnL: number; slippage: number; brokerage: number; stt: number; exchangeCharges: number; gst: number; sebiCharges: number; stampDuty: number; totalCosts: number; netPnL: number; modeled: boolean };
  historicalInputs?: Record<string, unknown> | null;
}

export type DataScorecard = Record<"spot" | "technicals" | "options" | "iv" | "oi" | "greeks" | "breadth" | "news" | "events" | "execution" | "transactionCosts", ComponentQuality>;

export interface BacktestValidation {
  status: "INSUFFICIENT_DATA" | "INSUFFICIENT_SAMPLE" | "PARTIAL_VALIDATION" | "HISTORICALLY_SUPPORTED" | "NOT_SUPPORTED";
  reasons: string[];
}

export interface SampleStats {
  evaluatedSessions: number;
  evaluatedBars: number;
  candidateBars: number; // bars where the strategy built at least one candidate
  tradeBars: number;
  noTradeBars: number;
  executedTrades: number;
  rejectedSignals: number; // TRADE signals refused by risk/sizing/expiry cutoff
  tradesPerMonth: number | null;
  barRegimes: Record<string, number>;
  regimeCoverage: string;
  contractExpiries: number;
  weeklyExpiries: number;
  monthlyExpiries: number;
  tradedExpiries: number;
}
