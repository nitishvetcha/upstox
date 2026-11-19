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
  | "END_OF_DAY_DATA"
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
  allowed: boolean; // Recommendation eligibility: true when the market trade plan is structurally and mathematically sound
  strategyAllowed?: boolean; // Strategy-level trade plan eligibility (entry, stop, targets, R:R, freshness)
  portfolioAllowed?: boolean; // Portfolio-level affordability & limits (when account capital is provided)
  portfolioReasons?: RiskRejectionReason[]; // Portfolio-specific constraints (e.g. ZERO_LOTS, DAILY_LOSS_LIMIT)
  portfolioHumanReasons?: string[]; // Human-readable explanations for portfolio constraints
  sizingStatus?: "UNCONFIGURED" | "SIZED" | "ZERO_LOTS" | "PORTFOLIO_CONSTRAINED";
  index: IndexId;
  lotSize: number;
  entryPrice: number; // Combined entry per unit
  stopPrice: number; // Combined stop per unit
  targetPrice: number; // Combined target 1 per unit
  riskPerUnit: number; // Risk per unit (incl slippage)
  riskPerLot: number; // Risk per lot
  netRiskPerLot?: number; // Worst-case risk per lot incl. entry/exit slippage, stop gap and per-lot charges (sizing basis)
  fixedCostsInr?: number; // Brokerage per trade (entry and exit orders) incl. GST; does not scale with lots
  variableCostsPerLot?: number; // Percentage charges per lot (STT, exchange, SEBI, stamp duty, GST on them)
  entryFill?: number; // Entry price per unit after adverse slippage
  worstStopFill?: number; // Stop exit per unit after exit slippage and gap allowance
  targetFill?: number; // Target exit per unit after exit slippage
  netRewardRatio?: number | null; // Reward to target 1 after slippage and charges, divided by net risk
  assumptions?: string[]; // Stated assumptions behind the cost and slippage figures
  quantity: number; // Total quantity (lots * lotSize, 0 if unconfigured or unallocated)
  lots: number; // Number of lots allocated (0 if unconfigured or unallocated)
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
