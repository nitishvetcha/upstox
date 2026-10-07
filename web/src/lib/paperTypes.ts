import type { IndexId, Leg, StrategyName, TradePlan } from "./types.ts";
import type { RiskAssessment } from "./services/risk/riskTypes.ts";
import type { RiskConfig } from "./services/risk/riskConfig.ts";

export type PaperTradeStatus =
  | "PENDING"
  | "OPEN"
  | "TARGET_HIT"
  | "STOPPED_OUT"
  | "EXPIRED"
  | "CLOSED"
  | "CANCELLED"
  | "REJECTED";

export type FillPriceSource = "ASK" | "BID" | "LTP_FALLBACK";

export type ExitReason = "TARGET" | "STOP_LOSS" | "EXPIRY" | "MANUAL_CLOSE" | "CANCELLED";

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
    | "PAPER_TRADE_REJECTED";
  marketDataTimestamp: string | null;
  price: number | null;
  reason: string;
  details?: Record<string, unknown>;
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

  realizedPnL: number | null; // Total INR realized
  unrealizedPnL: number | null; // Total INR unrealized

  maxProfit: number | null;
  maxLoss: number | null;

  exitReason: ExitReason | null;
  targetReached: 1 | 2 | 3 | null;

  recommendationScore: number;
  confidence: number;

  riskAmount: number;
  riskReward: number;

  marketDataTimestamp: string | null; // ISO
  marketDataSource: string; // e.g. UPSTOX_LIVE
  executionMode: "PAPER";

  riskConfigSnapshot: RiskConfig;
  riskAssessmentSnapshot: RiskAssessment;
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

  maxDrawdown: number | null;
}
