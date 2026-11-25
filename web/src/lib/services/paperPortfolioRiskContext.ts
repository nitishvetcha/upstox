// Derive the live portfolio facts used by the circuit breaker from the durable
// paper ledger. Keeping this pure avoids a route accidentally checking the
// breaker with zero positions while risk is already open.
import type { PaperTrade } from "../paperTypes.ts";

const ACTIVE = new Set<PaperTrade["status"]>([
  "OPEN", "PENDING", "SETTLEMENT_PENDING", "SETTLEMENT_UNVERIFIED",
]);

export interface PaperPortfolioRiskContext {
  openPositionsCount: number;
  unrealizedMtmLoss: number;
  openUnderlyingSymbols: string[];
}

export function paperPortfolioRiskContext(trades: PaperTrade[]): PaperPortfolioRiskContext {
  const active = trades.filter((trade) => ACTIVE.has(trade.status));
  return {
    openPositionsCount: active.length,
    unrealizedMtmLoss: active.reduce((sum, trade) => sum + Math.max(0, -(trade.unrealizedPnL ?? 0)), 0),
    openUnderlyingSymbols: active.map((trade) => trade.index),
  };
}
