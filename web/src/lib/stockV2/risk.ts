// Stock V2 & V3 risk, sizing, costs and market gates.
// Cost rates match verified 2026 Upstox schedule for equity intraday & delivery.
export const COSTS = {
  brokeragePct: 0.001, // min(0.001 * turnover, 20) per executed order
  brokerageCapPerOrder: 20,
  exchangePct: 0.0000307, // NSE Txn 0.00307%
  sebiPct: 0.000001, // SEBI ₹10/crore (0.0001%)
  sttSellPct: 0.00025, // STT 0.025% sell-side only (intraday)
  stampBuyPct: 0.00003, // Stamp 0.003% buy-side only
  gstPct: 0.18, // 18% GST on (brokerage + exchange + SEBI)
  slippagePct: 0.0005,
} as const;

// 2026 Upstox Equity Delivery schedule
export const DELIVERY_COSTS = {
  brokerageFlatPerOrder: 20, // Flat ₹20 per executed order
  exchangePct: 0.0000307, // NSE Txn 0.00307%
  sebiPct: 0.000001, // SEBI 0.0001%
  sttBuyPct: 0.001, // Delivery STT 0.1% buy-side
  sttSellPct: 0.001, // Delivery STT 0.1% sell-side
  stampBuyPct: 0.00015, // Stamp 0.015% buy-side
  dpChargePerSell: 20, // Depository Participant charge ₹20 (+ 18% GST = ₹23.60)
  gstPct: 0.18,
} as const;

export const RISK = {
  defaultCapital: 1_000_000, // assumption, not user-supplied
  riskPct: 0.01,
  minRewardToRisk: 1.5,
  mediumEventFactor: 0.5,
  maxIndiaVix: 25,
  maxNiftyAtrPct: 1.5,
  minVerifiedLiveStocks: 20,
} as const;

// Capital and sizing profile tailored for small account (₹10,000)
export const RISK_V3_10K = {
  accountCapital: 10_000,
  riskPct: 0.015, // 1.5% per trade = ₹150 risk budget
  minRewardToRisk: 2.0, // Strict 2.0x R:R after costs
  maxTradesPerDay: 2, // Max 2 trades per session across the portfolio
  minPrice: 100, // Filter out penny stocks
  maxPrice: 3500, // Affordability filter: skip stocks > ₹3500 (DIXON, MARUTI, ULTRACEMCO)
  minRvol: 1.5, // Volume confirmation >= 1.5x avg
  minRelativeStrengthPct: 1.0, // Outperformance vs NIFTY >= 1.0%
} as const;

export type Side = "LONG" | "SHORT";
export type EventRisk = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "EXTREME";

export interface OrderCharges {
  brokerage: number;
  exchange: number;
  sebi: number;
  stt: number;
  stamp: number;
  gst: number;
  total: number;
}

export interface DeliveryOrderCharges {
  brokerage: number;
  exchange: number;
  sebi: number;
  stt: number;
  stamp: number;
  dpCharge: number;
  gst: number;
  total: number;
}

// Charges for one complete round trip: a buy and a sell of `qty` shares.
export interface CostScenario {
  name: string;
  slippagePct: number;
  costMultiplier: number;
}

export const SCENARIOS = {
  BASE: { name: "BASE", slippagePct: COSTS.slippagePct, costMultiplier: 1 },
  CONSERVATIVE: { name: "CONSERVATIVE", slippagePct: 0.001, costMultiplier: 1.5 },
  ADVERSE_SLIPPAGE: { name: "ADVERSE_SLIPPAGE", slippagePct: 0.002, costMultiplier: 1 },
} as const satisfies Record<string, CostScenario>;

export function roundTripCharges(side: Side, entryPx: number, exitPx: number, qty: number, costMultiplier = 1): OrderCharges {
  const buyTurnover = (side === "LONG" ? entryPx : exitPx) * qty;
  const sellTurnover = (side === "LONG" ? exitPx : entryPx) * qty;
  const brokerage = Math.min(COSTS.brokeragePct * buyTurnover, COSTS.brokerageCapPerOrder) + Math.min(COSTS.brokeragePct * sellTurnover, COSTS.brokerageCapPerOrder);
  const turnover = buyTurnover + sellTurnover;
  const exchange = COSTS.exchangePct * turnover;
  const sebi = COSTS.sebiPct * turnover;
  const stt = COSTS.sttSellPct * sellTurnover;
  const stamp = COSTS.stampBuyPct * buyTurnover;
  const gst = COSTS.gstPct * (brokerage + exchange + sebi);
  const total = (brokerage + exchange + sebi + stt + stamp + gst) * costMultiplier;
  return { brokerage, exchange, sebi, stt, stamp, gst, total };
}

/**
 * Calculate complete equity delivery round-trip costs under 2026 Upstox tariff.
 * Includes flat ₹20/order brokerage, 0.1% STT buy/sell, 0.015% stamp buy, ₹20 DP charge on sell, and 18% GST.
 */
export function roundTripDeliveryCharges(side: Side, entryPx: number, exitPx: number, qty: number): DeliveryOrderCharges {
  const buyTurnover = (side === "LONG" ? entryPx : exitPx) * qty;
  const sellTurnover = (side === "LONG" ? exitPx : entryPx) * qty;
  const turnover = buyTurnover + sellTurnover;
  const brokerage = DELIVERY_COSTS.brokerageFlatPerOrder * 2; // ₹20 entry + ₹20 exit
  const exchange = DELIVERY_COSTS.exchangePct * turnover;
  const sebi = DELIVERY_COSTS.sebiPct * turnover;
  const stt = DELIVERY_COSTS.sttBuyPct * buyTurnover + DELIVERY_COSTS.sttSellPct * sellTurnover;
  const stamp = DELIVERY_COSTS.stampBuyPct * buyTurnover;
  const dpCharge = DELIVERY_COSTS.dpChargePerSell; // ₹20 flat DP charge on sell
  // 18% GST applies to brokerage + exchange + sebi + DP charge
  const gst = DELIVERY_COSTS.gstPct * (brokerage + exchange + sebi + dpCharge);
  const total = brokerage + exchange + sebi + stt + stamp + dpCharge + gst;
  return { brokerage, exchange, sebi, stt, stamp, dpCharge, gst, total };
}

export function adverse(side: Side, px: number, kind: "ENTRY" | "STOP_EXIT" | "TIME_EXIT" | "GAP_EXIT", slippagePct: number = COSTS.slippagePct): number {
  if (kind === "ENTRY") return side === "LONG" ? px * (1 + slippagePct) : px * (1 - slippagePct);
  return side === "LONG" ? px * (1 - slippagePct) : px * (1 + slippagePct);
}

export type SizeResult = { ok: true; qty: number; riskAmount: number; eventFactor: number; cappedByCapital: boolean } | { ok: false; reason: string };

// Quantity is the smaller of the risk-based quantity and the quantity whose notional equals capital (no leverage).
export function sizePosition(
  entryFill: number,
  stop: number,
  eventRisk: EventRisk,
  capital: number = RISK.defaultCapital,
  riskPct: number = RISK.riskPct
): SizeResult {
  if (eventRisk === "HIGH" || eventRisk === "EXTREME") return { ok: false, reason: `EVENT_RISK_${eventRisk}` };
  const eventFactor = eventRisk === "MEDIUM" ? RISK.mediumEventFactor : 1;
  const riskPerShare = Math.abs(entryFill - stop);
  if (!(riskPerShare > 0) || !(entryFill > 0)) return { ok: false, reason: "ZERO_RISK_PER_SHARE" };
  const budget = capital * riskPct * eventFactor;
  const riskQty = Math.floor(budget / riskPerShare);
  const capitalQty = Math.floor(capital / entryFill);
  const qty = Math.min(riskQty, capitalQty);
  if (qty < 1) return { ok: false, reason: capitalQty < 1 ? "CAPITAL_BELOW_ONE_SHARE" : "QTY_BELOW_ONE" };
  return { ok: true, qty, riskAmount: qty * riskPerShare, eventFactor, cappedByCapital: capitalQty < riskQty };
}

export function rewardToRisk(entryFill: number, stop: number, target: number): number | null {
  const risk = Math.abs(entryFill - stop);
  if (!(risk > 0)) return null;
  return Math.abs(target - entryFill) / risk;
}

// Session market gates. A null input means the dependency is missing: the gate does not pass (fail closed).
export interface GateInputs {
  marketState: string | null;
  eventRisk: EventRisk | null;
  indiaVix: number | null;
  niftyAtrPct: number | null;
  verifiedLiveStocks: number | null;
}

export interface GateResult {
  allowed: boolean;
  eventFactor: number;
  reasons: string[];
}

export function evaluateGates(g: GateInputs): GateResult {
  const reasons: string[] = [];
  let eventFactor = 1;
  if (g.marketState === null) reasons.push("MISSING_DEPENDENCY:market_state");
  else if (g.marketState !== "NORMAL_OPEN") reasons.push(`MARKET_STATE_${g.marketState}`);
  if (g.eventRisk === null) reasons.push("MISSING_DEPENDENCY:event_risk");
  else if (g.eventRisk === "HIGH" || g.eventRisk === "EXTREME") reasons.push(`EVENT_RISK_${g.eventRisk}`);
  else if (g.eventRisk === "MEDIUM") eventFactor = RISK.mediumEventFactor;
  if (g.indiaVix === null) reasons.push("MISSING_DEPENDENCY:india_vix");
  else if (g.indiaVix > RISK.maxIndiaVix) reasons.push("INDIA_VIX_ABOVE_25");
  if (g.niftyAtrPct === null) reasons.push("MISSING_DEPENDENCY:nifty_atr");
  else if (g.niftyAtrPct > RISK.maxNiftyAtrPct) reasons.push("NIFTY_ATR_ABOVE_1_5_PCT");
  if (g.verifiedLiveStocks === null) reasons.push("MISSING_DEPENDENCY:verified_live_stocks");
  else if (g.verifiedLiveStocks < RISK.minVerifiedLiveStocks) reasons.push("FEWER_THAN_20_VERIFIED_LIVE_STOCKS");
  return { allowed: reasons.length === 0, eventFactor, reasons };
}
