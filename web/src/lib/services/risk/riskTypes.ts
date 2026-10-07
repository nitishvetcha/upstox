import type { IndexId } from "../../types.ts";

export type RiskStatus = "APPROVED" | "REJECTED" | "WARNING";

export type RiskRejectionReason =
  | "RISK_LIMIT_EXCEEDED"
  | "ZERO_LOTS"
  | "MAX_LOTS_EXCEEDED"
  | "DAILY_LOSS_LIMIT"
  | "OPEN_RISK_LIMIT"
  | "MAX_CONCURRENT_POSITIONS"
  | "UNKNOWN_LOT_SIZE"
  | "INVALID_STOP"
  | "INVALID_ENTRY"
  | "INVALID_TARGET"
  | "INSUFFICIENT_RR"
  | "UNKNOWN_MAX_LOSS"
  | "INSUFFICIENT_CAPITAL"
  | "STALE_PRICE"
  | "WIDE_BID_ASK"
  | "EXTREME_EVENT_RISK"
  | "VOLATILITY_RESTRICTION";

export interface RiskInputs {
  existingOpenRisk?: number; // In INR, default 0
  realizedDailyLoss?: number; // In INR, default 0
  currentOpenPositions?: number; // Count of active open positions, default 0
  overrideCapital?: number; // In INR
}

export interface RiskAssessment {
  status: RiskStatus;
  allowed: boolean;
  index: IndexId;
  lotSize: number;
  entryPrice: number; // Combined entry per unit
  stopPrice: number; // Combined stop per unit
  targetPrice: number; // Combined target 1 per unit
  riskPerUnit: number; // Risk per unit (incl slippage)
  riskPerLot: number; // Risk per lot
  quantity: number; // Total quantity (lots * lotSize)
  lots: number; // Number of lots allocated
  maxLotsAllowed: number;
  totalRisk: number; // Stop risk (lots * riskPerLot)
  maxTheoreticalLoss: number | null; // Theoretical max loss for trade
  maxProfit: number | null; // Theoretical max profit for trade (null = unlimited)
  riskRewardRatio: number | null;
  capitalRequired: number; // Capital required to take position
  riskPercent: number; // totalRisk / accountCapital * 100
  breakevens: number[];
  reasons: RiskRejectionReason[];
  warnings: string[];
  humanReasons: string[];
}
