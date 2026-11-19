// Options successor recommendation engine (recommendation-only). Independent of Strategy 11.4, which is not modified.
// Every recommendation passes all gates; otherwise the result is NO_TRADE with explicit reasons.
import { greeks, impliedVol, yearsBetween, type OptionType } from "./greeks.ts";

export const OPT_GATES = {
  quoteMaxAgeSeconds: 60, // a contract quote older than this is stale
  maxSpreadPct: 5, // (ask − bid) / mid, percent
  minOpenInterest: 1000,
  minVolume: 100,
  minDaysToExpiry: 2, // calendar days; expiry day is excluded
  deltaWindow: { min: 0.3, max: 0.6 }, // absolute delta window for the selected strike
  minRewardToRisk: 1.5,
  maxRiskPctOfCapital: 1,
  rate: 0.065, // assumption: risk-free rate, to verify against a current T-bill yield
} as const;

export interface QuoteSide {
  ltp: number;
  bid: number | null;
  ask: number | null;
  oi: number | null;
  volume: number | null;
  lastTradeTime: string | null; // ISO
  instrumentKey: string | null;
}

export interface ChainRow {
  strike: number;
  expiry: string; // YYYY-MM-DD
  lotSize: number | null;
  call: QuoteSide | null;
  put: QuoteSide | null;
}

export interface UnderlyingState {
  index: string;
  spot: number;
  asOf: string; // ISO timestamp of the underlying snapshot
  marketState: string | null; // "OPEN" required
  trend: "LONG" | "SHORT" | "NONE";
  vwap: number | null;
  swingLow: number | null; // invalidation level for longs (underlying)
  swingHigh: number | null; // invalidation level for shorts (underlying)
  target: number | null; // underlying target level in the trend direction
  eventRisk: "NONE" | "LOW" | "MEDIUM" | "HIGH" | "EXTREME" | null;
  chainTimestamp: string | null; // local receipt time; NOT an exchange snapshot time
}

export interface RiskContext {
  capital: number;
  dailyLossSoFar: number;
  dailyLossLimitPct: number; // e.g. 2
  openRecommendations: number;
  maxConcurrent: number;
}

export interface Charges {
  brokerage: number;
  exchange: number;
  sebi: number;
  stt: number;
  stamp: number;
  gst: number;
  total: number;
}

export interface Recommendation {
  status: "RECOMMENDATION";
  index: string;
  direction: "LONG" | "SHORT";
  optionType: OptionType;
  expiry: string;
  daysToExpiry: number;
  strike: number;
  instrumentKey: string | null;
  lotSize: number;
  entryPremium: number;
  stopPremium: number;
  targetPremium: number;
  lots: number;
  quantity: number;
  capitalRequired: number;
  maxPlannedLoss: number;
  charges: Charges;
  rewardToRisk: number;
  greeks: { delta: number; gamma: number; theta: number; vega: number; iv: number };
  intrinsic: number;
  extrinsic: number;
  reasons: string[];
  invalidation: string;
  dataSource: "UPSTOX_OPTION_CHAIN_AND_QUOTES";
  dataTimestamp: string;
  dataQuality: string[];
}

export interface NoTrade {
  status: "NO_TRADE";
  index: string;
  reasons: string[];
}

export type Decision = Recommendation | NoTrade;

const MS_PER_DAY = 86_400_000;
const daysBetween = (fromIso: string, toDate: string) => Math.floor((Date.parse(`${toDate}T15:30:00+05:30`) - Date.parse(fromIso)) / MS_PER_DAY);

export function chargesFor(entry: number, exit: number, quantity: number): Charges {
  const buy = entry * quantity;
  const sell = exit * quantity;
  const turnover = buy + sell;
  const brokerage = Math.min(0.0003 * buy, 20) + Math.min(0.0003 * sell, 20);
  const exchange = 0.0003503 * turnover; // assumption: NSE options premium transaction charge, to verify
  const sebi = 0.000001 * turnover;
  const stt = 0.001 * sell; // assumption: STT on the sell side of options premium, to verify
  const stamp = 0.00003 * buy; // assumption
  const gst = 0.18 * (brokerage + exchange + sebi);
  return { brokerage, exchange, sebi, stt, stamp, gst, total: brokerage + exchange + sebi + stt + stamp + gst };
}

function sideValid(q: QuoteSide | null, now: string, reasons: string[], label: string): q is QuoteSide {
  if (!q) {
    reasons.push(`${label}: contract quote missing`);
    return false;
  }
  if (!(q.ltp > 0)) {
    reasons.push(`${label}: no traded price (LTP ${q.ltp})`);
    return false;
  }
  if (q.lastTradeTime === null) {
    reasons.push(`${label}: trade time missing (cannot verify freshness)`);
    return false;
  }
  const t = Date.parse(q.lastTradeTime);
  if (!Number.isFinite(t)) {
    reasons.push(`${label}: trade time invalid`);
    return false;
  }
  const ageS = (Date.parse(now) - t) / 1000;
  if (ageS < -5) {
    reasons.push(`${label}: trade time is in the future`);
    return false;
  }
  if (ageS > OPT_GATES.quoteMaxAgeSeconds) {
    reasons.push(`${label}: quote stale (${Math.round(ageS)} s old)`);
    return false;
  }
  return true;
}

// Selects the contract for one side. Returns the qualifying candidate with the highest open interest, or a NO_TRADE reason.
function pickStrike(rows: ChainRow[], type: OptionType, spot: number, expiry: string, now: string, reasons: string[]) {
  const candidates: { row: ChainRow; q: QuoteSide; mid: number; spreadPct: number; iv: number; greeks: ReturnType<typeof greeks>; intrinsic: number; extrinsic: number }[] = [];
  const why: string[] = [];
  const reject = (label: string, text: string) => why.push(`${label}: ${text}`);
  for (const row of rows.filter((r) => r.expiry === expiry)) {
    const q = type === "CE" ? row.call : row.put;
    const label = `${type} ${row.strike}`;
    const quoteReasons: string[] = [];
    if (!sideValid(q, now, quoteReasons, label)) {
      reject(label, quoteReasons[0] ?? "quote invalid");
      continue;
    }
    const quote = q as QuoteSide;
    if (quote.bid === null || quote.ask === null || !(quote.ask > 0) || !(quote.bid > 0) || quote.ask < quote.bid) {
      reject(label, "bid/ask missing or crossed");
      continue;
    }
    const mid = (quote.bid + quote.ask) / 2;
    const spreadPct = ((quote.ask - quote.bid) / mid) * 100;
    if (spreadPct > OPT_GATES.maxSpreadPct) {
      reject(label, `spread ${spreadPct.toFixed(1)}% above ${OPT_GATES.maxSpreadPct}%`);
      continue;
    }
    if ((quote.oi ?? 0) < OPT_GATES.minOpenInterest || (quote.volume ?? 0) < OPT_GATES.minVolume) {
      reject(label, `liquidity below minimum (OI ${quote.oi ?? 0}, volume ${quote.volume ?? 0})`);
      continue;
    }
    const tY = yearsBetween(now, `${expiry}T15:30:00+05:30`);
    if (!(tY > 0)) continue;
    const iv = impliedVol(mid, { spot, strike: row.strike, tYears: tY, rate: OPT_GATES.rate, type });
    if (iv === null) {
      reject(label, "implied volatility not solvable from the mid price");
      continue;
    }
    const g = greeks({ spot, strike: row.strike, tYears: tY, rate: OPT_GATES.rate, vol: iv, type });
    if (Math.abs(g.delta) < OPT_GATES.deltaWindow.min || Math.abs(g.delta) > OPT_GATES.deltaWindow.max) {
      reject(label, `delta ${g.delta.toFixed(2)} outside window`);
      continue;
    }
    const intrinsic = Math.max(0, type === "CE" ? spot - row.strike : row.strike - spot);
    candidates.push({ row, q: quote, mid, spreadPct, iv, greeks: g, intrinsic, extrinsic: Math.max(0, mid - intrinsic) });
  }
  if (!candidates.length) {
    reasons.push(`no ${type} contract passes quote, liquidity, spread and delta gates for expiry ${expiry}`);
    const distinct = [...new Set(why)].slice(0, 4);
    reasons.push(...distinct);
    return null;
  }
  const mid = (OPT_GATES.deltaWindow.min + OPT_GATES.deltaWindow.max) / 2;
  candidates.sort((a, b) => (b.q.oi ?? 0) - (a.q.oi ?? 0) || Math.abs(Math.abs(a.greeks.delta) - mid) - Math.abs(Math.abs(b.greeks.delta) - mid));
  return candidates[0];
}

export function evaluate(input: { underlying: UnderlyingState; chain: ChainRow[]; risk: RiskContext; now: string }): Decision {
  const { underlying: u, chain, risk, now } = input;
  const reasons: string[] = [];
  if (u.marketState !== "OPEN") reasons.push(`market state ${u.marketState ?? "unknown"}, not OPEN`);
  if (u.eventRisk === null) reasons.push("event risk data unavailable: no event gate can be evaluated");
  else if (u.eventRisk === "HIGH" || u.eventRisk === "EXTREME") reasons.push(`event risk ${u.eventRisk}`);
  if (u.trend === "NONE") reasons.push("no underlying trend direction");
  if (u.vwap === null) reasons.push("VWAP unavailable");
  if (risk.openRecommendations >= risk.maxConcurrent) reasons.push("maximum concurrent recommendations reached");
  if (risk.dailyLossSoFar >= (risk.dailyLossLimitPct / 100) * risk.capital) reasons.push("daily loss limit reached");
  if (reasons.length) {
    // Underlying gates already fail. Still report contract-level causes so every rejection is explained.
    const expiries = [...new Set(chain.map((r) => r.expiry))].sort().filter((e) => daysBetween(now, e) >= OPT_GATES.minDaysToExpiry);
    if (expiries.length) {
      for (const type of ["CE", "PE"] as OptionType[]) {
        const diag: string[] = [];
        pickStrike(chain, type, u.spot, expiries[0], now, diag);
        reasons.push(...diag.map((d) => `[${type} diagnostic] ${d}`));
      }
    }
    return { status: "NO_TRADE", index: u.index, reasons: [...new Set(reasons)] };
  }

  const direction = u.trend as "LONG" | "SHORT";
  const type: OptionType = direction === "LONG" ? "CE" : "PE";
  const expiries = [...new Set(chain.map((r) => r.expiry))].sort();
  const eligible = expiries.filter((e) => daysBetween(now, e) >= OPT_GATES.minDaysToExpiry);
  if (!eligible.length) return { status: "NO_TRADE", index: u.index, reasons: ["no expiry at least the minimum days away"] };
  const expiry = eligible[0];
  const days = daysBetween(now, expiry);

  const picked = pickStrike(chain, type, u.spot, expiry, now, reasons);
  if (!picked) return { status: "NO_TRADE", index: u.index, reasons };
  const lotSize = picked.row.lotSize;
  if (!lotSize || lotSize <= 0) return { status: "NO_TRADE", index: u.index, reasons: [...reasons, "lot size missing from contract master"] };

  // Structure-based exits. The underlying level is converted to premium with the entry delta (linear; gamma ignored).
  const underlyingStop = direction === "LONG" ? u.swingLow : u.swingHigh;
  const underlyingTarget = u.target;
  if (underlyingStop === null || underlyingTarget === null) return { status: "NO_TRADE", index: u.index, reasons: [...reasons, "structure levels unavailable for stop and target"] };
  const delta = picked.greeks.delta;
  const stopPremium = Math.max(0, picked.mid + delta * (underlyingStop - u.spot));
  const targetPremium = picked.mid + delta * (underlyingTarget - u.spot);
  const entry = picked.mid;
  const riskPerUnit = entry - stopPremium;
  const rewardPerUnit = targetPremium - entry;
  if (!(riskPerUnit > 0)) return { status: "NO_TRADE", index: u.index, reasons: [...reasons, "stop is not below entry (structure stop on the wrong side)"] };
  const rr = rewardPerUnit / riskPerUnit;
  if (!(rr >= OPT_GATES.minRewardToRisk)) return { status: "NO_TRADE", index: u.index, reasons: [...reasons, `reward-to-risk ${rr.toFixed(2)} below ${OPT_GATES.minRewardToRisk}`] };

  // Sizing: whole lots, risk budget and capital. A lot that exceeds the budget is NO_TRADE.
  const riskBudget = risk.capital * (OPT_GATES.maxRiskPctOfCapital / 100);
  const lossPerLot = riskPerUnit * lotSize;
  const lots = Math.floor(riskBudget / lossPerLot);
  if (lots < 1) return { status: "NO_TRADE", index: u.index, reasons: [...reasons, `one lot risks ₹${Math.round(lossPerLot)}, above the ₹${Math.round(riskBudget)} budget`] };
  const quantity = lots * lotSize;
  const capitalRequired = entry * quantity;
  if (capitalRequired > risk.capital) return { status: "NO_TRADE", index: u.index, reasons: [...reasons, "premium capital exceeds available capital"] };

  const charges = chargesFor(entry, targetPremium, quantity);
  const dataQuality: string[] = [];
  if (u.chainTimestamp) dataQuality.push("chain snapshot unverified: option chain has no exchange generation time; receipt time is shown only");
  dataQuality.push("Greeks are Black-Scholes model outputs, not market observations");
  dataQuality.push("stop and target are approximate: premium = entry premium + delta × underlying move");

  return {
    status: "RECOMMENDATION",
    index: u.index,
    direction,
    optionType: type,
    expiry,
    daysToExpiry: days,
    strike: picked.row.strike,
    instrumentKey: picked.q.instrumentKey,
    lotSize,
    entryPremium: entry,
    stopPremium,
    targetPremium,
    lots,
    quantity,
    capitalRequired,
    maxPlannedLoss: lossPerLot * lots + chargesFor(entry, stopPremium, quantity).total,
    charges,
    rewardToRisk: rr,
    greeks: { delta: picked.greeks.delta, gamma: picked.greeks.gamma, theta: picked.greeks.theta, vega: picked.greeks.vega, iv: picked.iv },
    intrinsic: picked.intrinsic,
    extrinsic: picked.extrinsic,
    reasons: [`${direction} trend on ${u.index}`, `${type} selected: delta ${picked.greeks.delta.toFixed(2)} inside ${OPT_GATES.deltaWindow.min}–${OPT_GATES.deltaWindow.max}, highest open interest, ties to the delta-window centre`, `expiry ${expiry}: nearest with ≥${OPT_GATES.minDaysToExpiry} calendar days`],
    invalidation: `underlying ${direction === "LONG" ? "closes below" : "closes above"} ${underlyingStop}`,
    dataSource: "UPSTOX_OPTION_CHAIN_AND_QUOTES",
    dataTimestamp: u.asOf,
    dataQuality,
  };
}
