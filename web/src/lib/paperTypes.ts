import type { IndexId, StrategyName } from "./types.ts";
import type { RiskAssessment } from "./services/risk/riskTypes.ts";
import type { RiskConfig } from "./services/risk/riskConfig.ts";
import type { TradeCosts } from "./services/transactionCosts.ts";

export type PaperTradeStatus =
  | "PENDING"
  | "OPEN"
  | "TARGET_HIT"
  | "STOPPED_OUT"
  | "EXPIRED"
  | "CLOSED"
  | "CANCELLED"
  | "REJECTED"
  | "SETTLEMENT_PENDING"
  | "SETTLED_VERIFIED"
  | "SETTLEMENT_UNVERIFIED";

export type FillPriceSource = "ASK" | "BID" | "LTP_FALLBACK" | "EXCHANGE_SETTLEMENT";

export type ExitReason = "TARGET" | "STOP_LOSS" | "EXPIRY" | "MANUAL_CLOSE" | "CANCELLED" | "SETTLEMENT";

export interface PaperTradeLeg {
  side: "BUY" | "SELL";
  type: "CE" | "PE";
  strike: number;
  entryLtp: number;
  entryFillPrice: number;
  entryFillSource: FillPriceSource;
  currentPrice: number | null;
  exitPrice: number | null;
  exitFillSource?: FillPriceSource | null;
  instrumentKey?: string | null;
}

export interface PaperTradeEvent {
  timestamp: string; // ISO
  tradeId: string;
  event:
    | "PAPER_TRADE_CREATED"
    | "PAPER_TRADE_OPENED"
    | "PAPER_TARGET_CHECK"
    | "PAPER_STOP_CHECK"
    | "PAPER_TRADE_EXITED"
    | "PAPER_TRADE_EXPIRED"
    | "PAPER_TRADE_REJECTED"
    // Open position could not be revalued: untrusted source or a missing/zero quote on a leg.
    | "PAPER_QUOTE_UNAVAILABLE"
    // Phase 2.3.14 settlement lifecycle events
    | "PAPER_TRADE_SETTLEMENT_PENDING"
    | "PAPER_TRADE_SETTLED_VERIFIED"
    | "PAPER_TRADE_SETTLEMENT_UNVERIFIED";
  marketDataTimestamp: string | null;
  price: number | null;
  reason: string;
  details?: Record<string, unknown>;
  // Durable Event Sourcing & Crash Recovery fields (WBS 2.3 Gate M1)
  eventId?: string; // UUID v4, globally unique, stable across retries
  sequenceNumber?: number; // 1-based monotonically increasing integer per ledger
  ledgerVersion?: number; // Snapshot version this event was applied on top of
  checksum?: string; // SHA-256 digest of canonical event representation
}

export interface PaperTradeSettlementLeg {
  strike: number;
  type: "CE" | "PE";
  settlementPrice: number;
  underlyingSettlementPrice?: number;
  intrinsicValue?: number;
  discrepancyFlag?: boolean;
}

export interface PaperTradeSettlementMetadata {
  settledAt: string; // ISO
  tradeDate: string; // YYYY-MM-DD
  archiveHash: string; // SHA-256
  csvHash: string; // SHA-256
  sourceFile: string;
  costVerificationStatus: "VERIFIED" | "UNVERIFIED_MISSING_EXERCISE_SPECIFICATION";
  legs: PaperTradeSettlementLeg[];
  unverifiedReason?: string;
  advisoryDiscrepancy?: boolean;
}

// Health of the price feed for an OPEN position. STALE_QUOTES = the last cycle could not value it,
// so no stop/target decision was taken on that cycle and unrealizedPnL is the last verified value.
export interface PaperTradeMonitoring {
  status: "OK" | "STALE_QUOTES";
  lastValidQuoteAt: string | null; // ISO
  reason: string | null;
}

export interface PaperTrade {
  id: string; // UUID / unique string
  status: PaperTradeStatus;
  index: IndexId;
  strategy: StrategyName;
  createdAt: string; // ISO
  updatedAt: string; // ISO

  signalTimestamp: string; // ISO
  entryTimestamp: string | null; // ISO
  exitTimestamp: string | null; // ISO

  expiry: string; // YYYY-MM-DD
  legs: PaperTradeLeg[];

  entryPrice: number; // Combined net entry per unit
  currentPrice: number | null; // Combined net current exit price per unit
  exitPrice: number | null; // Combined net exit price per unit

  quantity: number; // Total quantity (lots * lotSize)
  lots: number;
  lotSize: number;

  stopLoss: number;
  target1: number;
  target2: number;
  target3?: number | null;

  // Net of modeled transaction costs once closed. Gross and costs are kept alongside so the
  // ledger can be reconciled independently. Absent on records created before costs were modeled.
  realizedPnL: number | null; // Total INR realized (NET of transactionCosts when present)
  grossPnL?: number | null; // Total INR realized before transaction costs
  transactionCosts?: TradeCosts | null; // Modeled brokerage + statutory charges (entry + exit)
  unrealizedPnL: number | null; // Total INR unrealized (net of estimated round-trip costs)

  maxProfit: number | null;
  maxLoss: number | null;

  exitReason: ExitReason | null;
  targetReached: 1 | 2 | 3 | null;

  recommendationScore: number;
  confidence: number;

  riskAmount: number;
  riskReward: number;

  marketDataTimestamp: string | null; // ISO
  // UPSTOX_LIVE only when the snapshot source was LIVE; MOCK_SIMULATION when it was MOCK.
  marketDataSource: string;
  executionMode: "PAPER";
  monitoring?: PaperTradeMonitoring;

  riskConfigSnapshot: RiskConfig;
  riskAssessmentSnapshot: RiskAssessment;

  settlement?: PaperTradeSettlementMetadata;
}

export interface PaperPortfolioSummary {
  startingCapital: number;
  currentCapital: number;
  realizedPnL: number;
  unrealizedPnL: number;
  totalPnL: number;

  openRisk: number;
  usedRisk: number;
  availableRisk: number;

  openPositions: number;
  closedTrades: number;

  winningTrades: number;
  losingTrades: number;

  winRate: number | null; // 0..100 or null if 0 trades
  averageWin: number | null;
  averageLoss: number | null;

  maxDrawdown: number | null; // INR, peak-to-trough of cumulative net realized P&L (null if no closed trades)

  grossPnL: number; // realized, before costs
  totalCosts: number; // modeled costs on closed trades
  profitFactor: number | null; // null when there is no loss (never Infinity)
  expectancy: number | null; // mean net P&L per closed trade (INR)
}
