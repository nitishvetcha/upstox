import { listPaperOpportunities, updatePaperOpportunity, TERMINAL_STATES, type PaperStatus } from "./paperOpportunityStore.ts";
import { getPaperTradingEngine } from "./paperStore.ts";
import type { PaperTradeStatus } from "../paperTypes.ts";

const TRADE_TO_OPPORTUNITY: Partial<Record<PaperTradeStatus, PaperStatus>> = {
  TARGET_HIT: "TARGET1_HIT",
  STOPPED_OUT: "STOP_HIT",
  EXPIRED: "EXPIRED",
  CLOSED: "EOD_EXIT",
};

// Mirrors the terminal state of each linked PaperTrade onto its opportunity, so readiness never sees a closed trade
// attached to an opportunity still marked open. Opportunities already terminal are left to the monitor that set them.
export function syncLinkedOpportunities(): number {
  const trades = new Map(getPaperTradingEngine().getTrades().map((t) => [t.id, t]));
  let synced = 0;
  for (const opp of listPaperOpportunities()) {
    if (!opp.openedPaperTradeId || TERMINAL_STATES.includes(opp.status)) continue;
    const trade = trades.get(opp.openedPaperTradeId);
    const status = trade ? TRADE_TO_OPPORTUNITY[trade.status] : undefined;
    if (!trade || !status) continue;
    const realizedR = trade.realizedPnL !== null && trade.riskAmount > 0
      ? Math.round((trade.realizedPnL / trade.riskAmount) * 100) / 100
      : null;
    updatePaperOpportunity(opp.id, {
      status,
      closedAt: trade.exitTimestamp ?? new Date().toISOString(),
      exitPrice: trade.exitPrice ?? null,
      realizedR,
    });
    synced++;
  }
  return synced;
}
