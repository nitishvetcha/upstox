// Statutory + broker costs for NSE index OPTIONS (per executed order leg), configurable. Kept separate from
// market movement and slippage. Rates are configuration, not facts: verify against the broker's and exchange's
// current schedules before relying on them.
export interface TransactionCostConfig {
  version: string;
  brokeragePerOrder: number; // ₹ per executed order (each leg, entry and exit)
  sttRate: number; // on SELL-side premium turnover
  exchangeTxnRate: number; // on premium turnover (both sides)
  gstRate: number; // on brokerage + exchange charges + SEBI fees
  sebiRate: number; // on premium turnover (both sides)
  stampDutyRate: number; // on BUY-side premium turnover
  source: string;
}

// Default rates: Upstox flat brokerage ₹20/order; STT 0.1% of sell premium (options rate effective 2024-10-01);
// NSE options transaction charge 0.03503% of premium; GST 18%; SEBI ₹10 per crore; stamp duty 0.003% on buys.
// UNVERIFIED for later revisions (e.g. a 2026 STT change would need this config updated).
export const DEFAULT_TRANSACTION_COSTS: TransactionCostConfig = {
  version: "nse-options-2024-10",
  brokeragePerOrder: 20,
  sttRate: 0.001,
  exchangeTxnRate: 0.0003503,
  gstRate: 0.18,
  sebiRate: 0.000001,
  stampDutyRate: 0.00003,
  source: "Configured defaults (Upstox brokerage page; NSE/SEBI/stamp-duty published rates as of 2024-10). Verify before use.",
};

// Not modeled (reported as such, never invented): NSE IPFT charge, STT on exercised ITM options at expiry (trades are
// closed before the 15:15 expiry cutoff, so no exercise occurs), DP charges (not applicable to F&O).
export const COSTS_NOT_MODELED = ["IPFT charge", "STT on exercise (no exercise occurs: exits before 15:15 on expiry)"];

export interface TradeCosts {
  brokerage: number;
  stt: number;
  exchangeCharges: number;
  gst: number;
  sebiCharges: number;
  stampDuty: number;
  totalCosts: number;
}

export const ZERO_COSTS: TradeCosts = { brokerage: 0, stt: 0, exchangeCharges: 0, gst: 0, sebiCharges: 0, stampDuty: 0, totalCosts: 0 };

const r2 = (n: number) => Math.round(n * 100) / 100;

// One fill = one executed order: side + premium per unit + quantity (units).
export interface Fill {
  side: "BUY" | "SELL";
  price: number;
  quantity: number;
}

export function costsFor(fills: Fill[], cfg: TransactionCostConfig): TradeCosts {
  let buy = 0, sell = 0;
  for (const f of fills) {
    if (f.side === "BUY") buy += f.price * f.quantity;
    else sell += f.price * f.quantity;
  }
  const turnover = buy + sell;
  const brokerage = cfg.brokeragePerOrder * fills.length;
  const stt = sell * cfg.sttRate;
  const exchangeCharges = turnover * cfg.exchangeTxnRate;
  const sebiCharges = turnover * cfg.sebiRate;
  const gst = (brokerage + exchangeCharges + sebiCharges) * cfg.gstRate;
  const stampDuty = buy * cfg.stampDutyRate;
  const parts = { brokerage: r2(brokerage), stt: r2(stt), exchangeCharges: r2(exchangeCharges), gst: r2(gst), sebiCharges: r2(sebiCharges), stampDuty: r2(stampDuty) };
  return { ...parts, totalCosts: r2(Object.values(parts).reduce((a, b) => a + b, 0)) };
}
