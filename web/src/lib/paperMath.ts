// Pure paper-trading arithmetic shared by the engine, the performance report and the ledger reconciliation.
// No I/O, no clocks. Everything here is SIMULATION math, never a broker interaction.
import type { PaperTradeLeg } from "./paperTypes.ts";
import { costsFor, type Fill, type TradeCosts, type TransactionCostConfig } from "./services/transactionCosts.ts";

export const r2 = (n: number): number => Math.round(n * 100) / 100;

// IST calendar date (YYYY-MM-DD) of an instant. Day boundaries must not depend on the server's time zone.
export function istDay(at: string | Date): string {
  return new Date(new Date(at).getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);
}

/**
 * The instant at which an options contract expires. Contract-master dates are date-only and
 * therefore mean the 15:30 IST close; a full ISO instant already identifies its own moment.
 */
export function expiryInstant(expiry: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(expiry)
    ? new Date(`${expiry}T15:30:00+05:30`)
    : new Date(expiry);
}

/**
 * Independent P&L Calculation per unit for any strategy plan and set of leg prices.
 */
export function calculateNetValue(
  legs: { side: "BUY" | "SELL"; type: "CE" | "PE"; strike: number }[],
  getLegPrice: (leg: { side: "BUY" | "SELL"; type: "CE" | "PE"; strike: number }) => number,
): number {
  let total = 0;
  for (const leg of legs) {
    const price = getLegPrice(leg);
    if (leg.side === "BUY") {
      total += price;
    } else {
      total -= price;
    }
  }
  return Math.round(total * 100) / 100;
}

/**
 * Calculates total GROSS P&L in INR for a paper trade (before transaction costs).
 * For long single-leg / debit: (exitNet - entryNet) * quantity
 * For multi-leg: sum of (exitLeg - entryLeg) * sideMult * quantity
 */
export function calculateTradePnL(
  legs: PaperTradeLeg[],
  quantity: number,
  isClosed = false,
): { pnl: number; currentNetPrice: number } {
  let totalPnL = 0;
  let currentNet = 0;

  for (const leg of legs) {
    const activePrice = isClosed ? (leg.exitPrice ?? leg.entryFillPrice) : (leg.currentPrice ?? leg.entryFillPrice);
    if (leg.side === "BUY") {
      currentNet += activePrice;
      totalPnL += (activePrice - leg.entryFillPrice) * quantity;
    } else {
      currentNet -= activePrice;
      totalPnL += (leg.entryFillPrice - activePrice) * quantity;
    }
  }

  return {
    pnl: Math.round(totalPnL * 100) / 100,
    currentNetPrice: Math.round(currentNet * 100) / 100,
  };
}

/**
 * Round-trip modeled costs for a position: each leg is one entry order and one opposite-side exit order.
 * `exitPrice` supplies the (actual or hypothetical) exit fill of each leg.
 */
export function tradeCostsFor(
  legs: PaperTradeLeg[],
  quantity: number,
  exitPrice: (leg: PaperTradeLeg) => number,
  cfg: TransactionCostConfig,
): TradeCosts {
  const fills: Fill[] = [];
  for (const leg of legs) {
    fills.push({ side: leg.side, price: leg.entryFillPrice, quantity });
    fills.push({ side: leg.side === "BUY" ? "SELL" : "BUY", price: exitPrice(leg), quantity });
  }
  return costsFor(fills, cfg);
}
