// Statutory + broker costs for NSE index OPTIONS (per executed order leg), configurable. Kept separate from
// market movement and slippage. Rates reflect verified circulars and published broker schedules.
// NSE Circular NSE/FA/73061 (dated February 27, 2026, effective March 1, 2026).
// Finance Act STT schedule (effective April 1, 2026).

export type UpstoxAccountPlan = "BASIC" | "PLUS" | "UNKNOWN";
export type PlanStatus = "CONFIRMED" | "OWNER_CONFIRMATION_REQUIRED" | "CONSERVATIVE_RESEARCH_FALLBACK";

export interface TransactionCostConfig {
  version: string;
  plan?: UpstoxAccountPlan;
  planStatus?: PlanStatus;
  brokeragePerOrder: number; // ₹ per executed order (each leg, entry and exit)
  sttRate: number; // on SELL-side premium turnover (0.15% from 2026-04-01)
  exchangeTxnRate: number; // on premium turnover (both sides) — includes IPFT (0.03553% total outflow)
  gstRate: number; // 18% on (brokerage + exchange transaction charges/IPFT)
  sebiRate: number; // on premium turnover (both sides, ₹10/crore)
  stampDutyRate: number; // on BUY-side premium turnover (0.003%)
  source: string;
}

// Auto-square-off penalties (Upstox RMS backstop at 3:25 PM IST).
// Kept separate from ordinary operator-executed trade exits.
// Auto-square-off is an operational backstop, NEVER a guaranteed execution or risk control mechanism.
export const AUTO_SQUARE_OFF_RATES = {
  BASIC: { penalty: 75, gst: 13.50, total: 88.50 },
  PLUS: { penalty: 50, gst: 9.00, total: 59.00 },
} as const;

export interface AutoSquareOffResult {
  penalty: number;
  gst: number;
  totalPenalty: number;
  plan: UpstoxAccountPlan;
  status: PlanStatus;
  guaranteed: false;
  notice: string;
}

export function autoSquareOffPenalty(plan: UpstoxAccountPlan): AutoSquareOffResult {
  if (plan === "UNKNOWN") {
    // UNKNOWN requires owner confirmation. PLUS rates are used only as conservative research fallback.
    const base = AUTO_SQUARE_OFF_RATES.PLUS;
    return {
      penalty: base.penalty,
      gst: base.gst,
      totalPenalty: base.total,
      plan: "UNKNOWN",
      status: "CONSERVATIVE_RESEARCH_FALLBACK",
      guaranteed: false,
      notice: "Auto-square-off is an RMS operational backstop, not a guaranteed execution. Owner confirmation required for active account plan.",
    };
  }
  const base = plan === "BASIC" ? AUTO_SQUARE_OFF_RATES.BASIC : AUTO_SQUARE_OFF_RATES.PLUS;
  return {
    penalty: base.penalty,
    gst: base.gst,
    totalPenalty: base.total,
    plan,
    status: "CONFIRMED",
    guaranteed: false,
    notice: "Auto-square-off is an RMS operational backstop, not a guaranteed execution.",
  };
}

// Account plan resolver:
// - BASIC: ₹20/order
// - PLUS: ₹30/order
// - UNKNOWN: owner confirmation required. Never silently assumed as BASIC.
//   Conservative research fallback uses PLUS rates (₹30), clearly labelled CONSERVATIVE_RESEARCH_FALLBACK.
export function resolveAccountPlan(configuredPlan?: string | null): {
  plan: UpstoxAccountPlan;
  brokeragePerOrder: number;
  status: PlanStatus;
} {
  const p = (configuredPlan ?? (typeof process !== "undefined" ? process.env?.UPSTOX_ACCOUNT_PLAN : undefined) ?? "UNKNOWN").toUpperCase();
  if (p === "BASIC") {
    return { plan: "BASIC", brokeragePerOrder: 20, status: "CONFIRMED" };
  }
  if (p === "PLUS") {
    return { plan: "PLUS", brokeragePerOrder: 30, status: "CONFIRMED" };
  }
  return { plan: "UNKNOWN", brokeragePerOrder: 30, status: "CONSERVATIVE_RESEARCH_FALLBACK" };
}

// Default rates:
// - Account Plan: UNKNOWN (requires owner confirmation; Plus ₹30 used only as conservative research fallback)
// - STT: 0.15% on sell-side option premium (effective 2026-04-01)
// - NSE options combined charges: 0.03553% (₹3,553.00 per crore) based on official NSE Circular NSE/FA/73061
//   (Exchange transaction charge ₹3,552.99/cr + NSE IPFT contribution ₹0.01/cr = ₹3,553.00/cr).
//   IPFT is already included in 0.0003553: NEVER add it separately.
// - GST: 18% on (brokerage + exchange charges/IPFT). Excludes SEBI turnover fee and stamp duty per published Upstox schedule.
// - SEBI turnover fee: ₹10 per crore (0.000001).
// - Stamp duty: 0.003% (0.00003) on buyer-side premium.
export const DEFAULT_TRANSACTION_COSTS: TransactionCostConfig = {
  version: "nse-options-2026-03",
  plan: "UNKNOWN",
  planStatus: "CONSERVATIVE_RESEARCH_FALLBACK",
  brokeragePerOrder: 30, // Conservative research fallback (Plus plan rate: ₹30/order)
  sttRate: 0.0015,
  exchangeTxnRate: 0.0003553,
  gstRate: 0.18,
  sebiRate: 0.000001,
  stampDutyRate: 0.00003,
  source: "NSE Circular NSE/FA/73061 (0.03553% effective 2026-03-01: ₹3,552.99 exch + ₹0.01 IPFT/cr); Finance Act 2024/2026 STT (0.15% on sell); Upstox published schedule (Plus fallback ₹30, Basic ₹20; GST on brokerage + exchange/IPFT).",
};

export const BASIC_PLAN_COSTS: TransactionCostConfig = {
  ...DEFAULT_TRANSACTION_COSTS,
  plan: "BASIC",
  planStatus: "CONFIRMED",
  brokeragePerOrder: 20,
};

export const PLUS_PLAN_COSTS: TransactionCostConfig = {
  ...DEFAULT_TRANSACTION_COSTS,
  plan: "PLUS",
  planStatus: "CONFIRMED",
  brokeragePerOrder: 30,
};

// Legacy 2024-10 configuration preserved for historical backtest reproduction
export const LEGACY_2024_10_TRANSACTION_COSTS: TransactionCostConfig = {
  version: "nse-options-2024-10",
  plan: "BASIC",
  planStatus: "CONFIRMED",
  brokeragePerOrder: 20,
  sttRate: 0.001,
  exchangeTxnRate: 0.0003503,
  gstRate: 0.18,
  sebiRate: 0.000001,
  stampDutyRate: 0.00003,
  source: "Configured legacy defaults (Upstox brokerage page; NSE/SEBI/stamp-duty published rates as of 2024-10).",
};

// Not modeled (reported as such, never invented): STT on exercised ITM options at expiry (trades are
// closed before the 15:15 expiry cutoff, so no exercise occurs), DP charges (not applicable to F&O).
// Note: IPFT IS modeled as part of the combined exchangeTxnRate (0.03553%).
export const COSTS_NOT_MODELED = ["STT on exercise (no exercise occurs: exits before 15:15 on expiry)"];

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

// Deterministic two-decimal half-up monetary rounding.
// Does not claim to exactly match an individual broker contract note where intermediate rounding rules may vary.
export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// One fill = one executed order: side + premium per unit + quantity (units).
export interface Fill {
  side: "BUY" | "SELL";
  price: number;
  quantity: number;
}

export function costsFor(fills: Fill[], cfg: TransactionCostConfig = DEFAULT_TRANSACTION_COSTS): TradeCosts {
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
  // Published Upstox options GST base: Brokerage + Exchange Transaction charges (which includes IPFT).
  // Excludes SEBI turnover fee and stamp duty.
  const gst = (brokerage + exchangeCharges) * cfg.gstRate;
  const stampDuty = buy * cfg.stampDutyRate;
  const parts = {
    brokerage: r2(brokerage),
    stt: r2(stt),
    exchangeCharges: r2(exchangeCharges),
    gst: r2(gst),
    sebiCharges: r2(sebiCharges),
    stampDuty: r2(stampDuty),
  };
  return { ...parts, totalCosts: r2(Object.values(parts).reduce((a, b) => a + b, 0)) };
}
