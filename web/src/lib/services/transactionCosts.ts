// Statutory + broker costs for NSE/BSE/MCX index & commodity OPTIONS (per executed order leg), configurable. Kept separate from
// market movement and slippage. Rates reflect verified circulars and published broker schedules.
// NSE Circular NSE/FA/73061 (dated February 27, 2026, effective March 1, 2026).
// MCX Circular MCX/TRD/678/2024 & CTT schedule (Finance Act).
// Finance Act STT schedule (effective April 1, 2026).

import type { UnderlyingId } from "../types.ts";

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
// Upstox official Help Center confirms two active plans:
// - BASIC: ₹20 per executed order
// - UPSTOX PLUS: ₹30 per executed order
// When an account plan has not been confirmed by the account owner, it resolves to UNKNOWN.
// The engine never assumes the user has either plan without confirmation.
// For conservative pre-trade risk research modeling, UNKNOWN applies the Plus rate (₹30),
// explicitly labeled CONSERVATIVE_RESEARCH_FALLBACK.
export function resolveAccountPlan(configuredPlan?: string | null): {
  plan: UpstoxAccountPlan;
  brokeragePerOrder: number;
  status: PlanStatus;
} {
  const p = (configuredPlan ?? (typeof process !== "undefined" ? process.env?.UPSTOX_ACCOUNT_PLAN : undefined) ?? "UNKNOWN").toUpperCase();
  if (p === "BASIC" || p === "STANDARD") {
    return { plan: "BASIC", brokeragePerOrder: 20, status: "CONFIRMED" };
  }
  if (p === "PLUS" || p === "UPSTOX_PLUS") {
    return { plan: "PLUS", brokeragePerOrder: 30, status: "CONFIRMED" };
  }
  return { plan: "UNKNOWN", brokeragePerOrder: 30, status: "CONSERVATIVE_RESEARCH_FALLBACK" };
}

// Default rates:
// - Account Plan: UNKNOWN (requires owner confirmation; Plus ₹30 used only as conservative research fallback)
// - STT: 0.15% on sell-side option premium (effective 2026-04-01 per Finance Act)
// - NSE options combined charges: 0.03553% (₹3,553.00 per crore per side) based on revised NSE Circular NSE/FA/73061
//   Decomposition (effective 1 March 2026):
//     * NSE transaction fee: ₹3,552.99 per crore per side (0.0355299%, decimal multiplier: 0.000355299)
//     * NSE IPFT contribution: ₹0.01 per crore per side (0.0000001%, decimal multiplier: 0.000000001)
//     * Combined rate: ₹3,553.00 per crore per side (0.03553%, decimal multiplier: 0.0003553).
//   IPFT is already included in 0.0003553: NEVER add it separately.
// - GST: 18% on (brokerage + exchange charges/IPFT + SEBI charges).
//   * Published Calculator alignment: Upstox's online brokerage calculator explicitly computes GST on (brokerage + exchange + SEBI).
//   * Published Charges page: Upstox's brokerage charges schedule states GST is on (brokerage + transaction + IPFT) without mentioning SEBI.
//   * Implementation policy: Uses the calculator-aligned (SEBI-inclusive) base. Contract-note level identicality cannot be conclusively claimed without physical contract note inspection.
// - SEBI turnover fee: ₹10 per crore (0.000001).
// - Stamp duty: 0.003% (0.00003) on buyer-side premium.
export const DEFAULT_TRANSACTION_COSTS: TransactionCostConfig = {
  version: "nse-options-2026-03",
  plan: "UNKNOWN",
  planStatus: "CONSERVATIVE_RESEARCH_FALLBACK",
  brokeragePerOrder: 30, // Conservative research fallback (Upstox Plus rate: ₹30/order)
  sttRate: 0.0015,
  exchangeTxnRate: 0.0003553, // ₹3,553.00/cr (₹3,552.99 exch + ₹0.01 IPFT)
  gstRate: 0.18,
  sebiRate: 0.000001,
  stampDutyRate: 0.00003,
  source: "NSE Circular NSE/FA/73061 (0.03553% effective 2026-03-01: ₹3,552.99 exch + ₹0.01 IPFT/cr); Finance Act 2024/2026 STT (0.15% on sell); Upstox Help Center (Basic ₹20, Plus ₹30); Upstox Calculator (GST on brokerage + exchange/IPFT + SEBI).",
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

export const ZERO_COSTS: TradeCosts = {
  brokerage: 0,
  stt: 0,
  exchangeCharges: 0,
  gst: 0,
  sebiCharges: 0,
  stampDuty: 0,
  totalCosts: 0,
};

// Deterministic two-decimal half-up monetary rounding.
// Does not claim to exactly match an individual broker contract note where intermediate rounding rules may vary.
export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// One fill = one execution record (full or partial fill).
// If an order executes in multiple partial fills, they share the same orderId.
export interface Fill {
  side: "BUY" | "SELL";
  price: number;
  quantity: number;
  orderId?: string; // Optional: identifies the executed order to prevent double-charging brokerage across partial fills
}

export function costsFor(
  fills: Fill[],
  cfg: TransactionCostConfig = DEFAULT_TRANSACTION_COSTS,
  orderCountOverride?: number,
): TradeCosts {
  let buy = 0, sell = 0;
  for (const f of fills) {
    if (f.side === "BUY") buy += f.price * f.quantity;
    else sell += f.price * f.quantity;
  }
  const turnover = buy + sell;
  // Brokerage is charged per executed order, not per partial fill.
  // 1. If explicit orderCountOverride is supplied, use it.
  // 2. If fills specify orderId, count distinct executed orders.
  // 3. Otherwise, assume one order per fill.
  const distinctOrders = orderCountOverride !== undefined
    ? orderCountOverride
    : fills.some((f) => f.orderId !== undefined)
      ? new Set(fills.map((f, i) => f.orderId ?? `__fill_${i}`)).size
      : fills.length;

  const brokerage = cfg.brokeragePerOrder * distinctOrders;
  const stt = sell * cfg.sttRate;
  const exchangeCharges = turnover * cfg.exchangeTxnRate;
  const sebiCharges = turnover * cfg.sebiRate;
  // Upstox published options brokerage calculator GST base:
  // 18% on (Brokerage + Exchange Transaction charges/IPFT + SEBI turnover charges).
  // Note on statutory interpretation vs published calculator:
  // While certain statutory interpretations consider SEBI regulatory fees exempt under Notification 12/2017,
  // Upstox's published brokerage calculator explicitly applies 18% GST to (Brokerage + Exchange Charges + SEBI Charges).
  // Stamp duty and STT are sovereign taxes and strictly excluded from the GST base.
  const gst = (brokerage + exchangeCharges + sebiCharges) * cfg.gstRate;
  const stampDuty = buy * cfg.stampDutyRate;
  const parts = {
    brokerage: r2(brokerage),
    stt: r2(stt),
    exchangeCharges: r2(exchangeCharges),
    gst: r2(gst),
    sebiCharges: r2(sebiCharges),
    stampDuty: r2(stampDuty),
  };
  return {
    ...parts,
    totalCosts: r2(Object.values(parts).reduce((a, b) => a + b, 0)),
  };
}

// -----------------------------------------------------------------------------
// Exchange Profiles & Asset-Specific Statutory Cost Models (NSE, BSE, MCX)
// -----------------------------------------------------------------------------

export type ExchangeId = "NSE_FO" | "BSE_FO" | "MCX_FO";
export type StatutoryTaxType = "STT" | "CTT";

export interface ExchangeTradingHours {
  regular: { open: string; close: string }; // e.g. "09:15" to "15:30" or "09:00" to "17:00"
  eveningSession?: { open: string; close: string }; // e.g. "17:00" to "23:30"
}

export interface ExchangeProfile {
  exchangeId: ExchangeId;
  name: string;
  segment: "EQUITY_DERIVATIVES" | "COMMODITY_DERIVATIVES";
  tradingHours: ExchangeTradingHours;
  autoSquareOffTime: string; // e.g. "15:15" for NSE/BSE, "23:15" for MCX
  taxType: StatutoryTaxType;
  taxRate: number; // STT 0.15% (NSE/BSE) or CTT 0.125% (MCX) on sell turnover
  exchangeTxnRate: number; // 0.03553% for NSE, 0.0375% for BSE, 0.05% for MCX
  sebiRate: number; // ₹10/cr
  stampDutyRate: number; // 0.003% on buy turnover
  gstRate: number; // 18% on (brokerage + exchange + sebi)
  defaultBrokeragePerOrder: number;
  tickSize: number;
  defaultLotSize: number;
}

export const NSE_FO_PROFILE: ExchangeProfile = {
  exchangeId: "NSE_FO",
  name: "National Stock Exchange - Equity Derivatives",
  segment: "EQUITY_DERIVATIVES",
  tradingHours: { regular: { open: "09:15", close: "15:30" } },
  autoSquareOffTime: "15:15",
  taxType: "STT",
  taxRate: 0.0015, // 0.15% on sell-side premium turnover
  exchangeTxnRate: 0.0003553, // ₹3,553.00/cr (NSE Circular NSE/FA/73061)
  sebiRate: 0.000001, // ₹10/cr
  stampDutyRate: 0.00003, // 0.003% on buy-side premium
  gstRate: 0.18,
  defaultBrokeragePerOrder: 30, // conservative fallback
  tickSize: 0.05,
  defaultLotSize: 65,
};

export const BSE_FO_PROFILE: ExchangeProfile = {
  exchangeId: "BSE_FO",
  name: "Bombay Stock Exchange - Equity Derivatives",
  segment: "EQUITY_DERIVATIVES",
  tradingHours: { regular: { open: "09:15", close: "15:30" } },
  autoSquareOffTime: "15:15",
  taxType: "STT",
  taxRate: 0.0015,
  exchangeTxnRate: 0.000375, // 0.0375%
  sebiRate: 0.000001,
  stampDutyRate: 0.00003,
  gstRate: 0.18,
  defaultBrokeragePerOrder: 30,
  tickSize: 0.05,
  defaultLotSize: 10,
};

export const MCX_FO_PROFILE: ExchangeProfile = {
  exchangeId: "MCX_FO",
  name: "Multi Commodity Exchange - Commodity Options",
  segment: "COMMODITY_DERIVATIVES",
  tradingHours: {
    regular: { open: "09:00", close: "17:00" },
    eveningSession: { open: "17:00", close: "23:30" },
  },
  autoSquareOffTime: "23:15", // RMS cutoff 15 min prior to 23:30 evening close
  taxType: "CTT", // Commodity Transaction Tax
  taxRate: 0.00125, // 0.125% on sell-side premium turnover (Finance Act)
  exchangeTxnRate: 0.0005, // 0.05% (₹5,000/cr on option premium turnover)
  sebiRate: 0.000001, // ₹10/cr
  stampDutyRate: 0.00003, // 0.003% on buy-side premium
  gstRate: 0.18,
  defaultBrokeragePerOrder: 30,
  tickSize: 1.0, // Crude Oil tick size
  defaultLotSize: 100, // Crude Oil lot size
};

export const EXCHANGE_PROFILES: Record<ExchangeId, ExchangeProfile> = {
  NSE_FO: NSE_FO_PROFILE,
  BSE_FO: BSE_FO_PROFILE,
  MCX_FO: MCX_FO_PROFILE,
};

export function getExchangeProfile(underlying: UnderlyingId): ExchangeProfile {
  if (underlying === "crudeoil" || underlying === "naturalgas" || underlying === "goldm" || underlying === "silverm") {
    return MCX_FO_PROFILE;
  }
  if (underlying === "sensex" || underlying === "bankex") {
    return BSE_FO_PROFILE;
  }
  return NSE_FO_PROFILE;
}

export function configForAsset(underlying: UnderlyingId, plan?: UpstoxAccountPlan): TransactionCostConfig {
  const profile = getExchangeProfile(underlying);
  const resolved = resolveAccountPlan(plan);
  return {
    version: `${profile.exchangeId.toLowerCase()}-options-2026`,
    plan: resolved.plan,
    planStatus: resolved.status,
    brokeragePerOrder: resolved.brokeragePerOrder,
    sttRate: profile.taxRate, // stores STT or CTT rate
    exchangeTxnRate: profile.exchangeTxnRate,
    gstRate: profile.gstRate,
    sebiRate: profile.sebiRate,
    stampDutyRate: profile.stampDutyRate,
    source: `${profile.name} Statutory Schedule`,
  };
}

export function costsForAsset(
  fills: Fill[],
  underlying: UnderlyingId,
  plan?: UpstoxAccountPlan,
  orderCountOverride?: number,
): TradeCosts & { exchange: ExchangeId; taxType: StatutoryTaxType } {
  const profile = getExchangeProfile(underlying);
  const base = costsFor(fills, configForAsset(underlying, plan), orderCountOverride);
  return {
    ...base,
    exchange: profile.exchangeId,
    taxType: profile.taxType,
  };
}
