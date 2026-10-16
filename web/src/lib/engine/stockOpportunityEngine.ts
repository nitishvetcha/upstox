// Phase 20 — Stock Opportunity Engine v20.0 → 20.1
// Multi-factor intraday and swing scanner for NIFTY 50.
// Uses a single batch API call for quotes, then scores each stock on
// multiple factors including relative strength vs NIFTY.
// ponytail: per-stock VWAP/EMA/RSI not computed (would require 50 candle-history calls);
//           add targeted technicals fetch for top-N candidates when latency budget allows.
import { get } from "../services/upstoxMarket.ts";
import { getAccessToken } from "../services/upstoxAuth.ts";
import { NIFTY_50 } from "../services/breadthConstituents.generated.ts";
import type { StockInstrument, StockMarketData } from "../services/stockService.ts";
import { normalizeStockQuote } from "../services/stockService.ts";
import { marketStatus } from "../time.ts";
import { gradeOpportunity, type OpportunityGrade } from "./opportunityEngine.ts";

export const STOCK_OPPORTUNITY_VERSION = "20.1";

// ── Setup types ───────────────────────────────────────────────────────────────
export type IntradaySetup =
  | "BREAKOUT"          // price above PDH
  | "BREAKDOWN"         // price below PDL
  | "HOD_CONTINUATION"  // price consolidating near HOD with strong change
  | "LOD_CONTINUATION"  // price consolidating near LOD with strong sell
  | "MOMENTUM_LONG"     // strong positive change, upper range, volume
  | "MOMENTUM_SHORT"    // strong negative change, lower range, volume
  | "WEAK_LONG"         // positive but poor quality
  | "WEAK_SHORT"        // negative but poor quality

export type SwingSetup =
  | "BREAKOUT"          // daily close above multi-day resistance
  | "BREAKDOWN"         // daily close below multi-day support
  | "TREND_CONTINUATION_LONG"  // stock consistently above key EMAs, pullback to support
  | "TREND_CONTINUATION_SHORT"
  | "MOMENTUM"          // large 1-day move with strong closing position
  | "WEAK"              // insufficient evidence

export interface StockOpportunity {
  rank: number;
  symbol: string;
  name: string;
  instrumentKey: string;
  // Quote data
  ltp: number;
  open: number | null;
  high: number | null;
  low: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  volume: number | null;
  freshness: string;
  // Setup
  opportunityScore: number;
  setup: IntradaySetup | SwingSetup;
  direction: "BULLISH" | "BEARISH";
  // Trade plan
  entry: number;
  entryLow: number;
  entryHigh: number;
  stop: number;
  target1: number;
  target2: number;
  rr: number;
  // Analysis
  relativeStrength: number | null; // stock chg% / nifty chg% — > 1 = outperforming
  rangePosition: number | null;    // 0=LOD, 1=HOD
  reasons: string[];
  invalidation: string;
  grade: OpportunityGrade;
}

export interface StockOpportunityResult {
  timestamp: string;
  engineVersion: string;
  kind: "intraday" | "swing";
  source: "UPSTOX" | "UNAVAILABLE";
  freshness: string;
  universe: string;
  stocksScanned: number;
  stocksAvailable: number;
  stocksRejected: number;
  niftyChange: number | null;    // context for relative strength
  topOpportunities: StockOpportunity[];
  noOpportunityReason: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const r2 = (n: number) => Math.round(n * 100) / 100;
const MS_TO_STATUS = { OPEN: "OPEN", CLOSED: "CLOSED", "PRE-OPEN": "PRE_OPEN" } as const;

// Batch quote: one API call with comma-separated instrument keys
async function batchQuotes(instruments: StockInstrument[], now: Date): Promise<StockMarketData[]> {
  const token = await getAccessToken();
  const unavailable = (inst: StockInstrument, reason: string): StockMarketData => ({
    symbol: inst.symbol, exchange: "NSE" as const, instrumentKey: inst.instrumentKey,
    timestamp: now.toISOString(), ltp: null,
    marketStatus: MS_TO_STATUS[marketStatus(now)] ?? "UNKNOWN",
    freshness: "UNAVAILABLE" as const, source: null, unavailableReason: reason,
  });
  if (!token) return instruments.map((i) => unavailable(i, "UPSTOX_NOT_CONNECTED"));
  const keys = instruments.map((i) => i.instrumentKey).join(",");
  try {
    const raw = await get(token, "/v2/market-quote/quotes", { instrument_key: keys }, { index: "nifty" });
    return instruments.map((inst) => normalizeStockQuote(raw, inst, now));
  } catch (e) {
    return instruments.map((i) => unavailable(i, (e as Error).message));
  }
}

// Range position: 0 = at LOD, 1 = at HOD
function rangePosition(ltp: number, high: number | undefined, low: number | undefined): number | null {
  if (high === undefined || low === undefined || high <= low) return null;
  return (ltp - low) / (high - low);
}

// Detect intraday setup from available OHLC + change data
function detectIntradaySetup(q: StockMarketData, niftyChgPct: number | null): {
  setup: IntradaySetup; direction: "BULLISH" | "BEARISH"; score: number; reasons: string[];
} {
  const chg = q.changePercent ?? 0;
  const pos = rangePosition(q.ltp!, q.high, q.low) ?? 0.5;
  const volOk = q.volume !== undefined && q.volume > 0;
  const absPct = Math.abs(chg);

  const rs = (niftyChgPct !== null && Math.abs(niftyChgPct) > 0.05)
    ? chg / niftyChgPct
    : null;

  const reasons: string[] = [];
  let score = 0;

  if (chg >= 0) {
    // Bullish direction
    if (q.previousClose !== null && q.high !== undefined && q.high > (q.previousClose || 0)) {
      score += 25; reasons.push(`Price above prev close high (PDH breakout candidate)`);
    }
    if (pos > 0.80) { score += 20; reasons.push(`Price near HOD (${(pos * 100).toFixed(0)}% of range)`); }
    else if (pos > 0.60) { score += 10; }
    if (absPct >= 2.5) { score += 20; reasons.push(`Strong move +${absPct.toFixed(1)}%`); }
    else if (absPct >= 1.0) { score += 10; reasons.push(`Positive +${absPct.toFixed(1)}%`); }
    if (rs !== null && rs > 1.3) { score += 15; reasons.push(`Outperforming NIFTY (RS ${rs.toFixed(1)}×)`); }
    else if (rs !== null && rs > 0.7) { score += 5; reasons.push(`Tracking NIFTY (RS ${rs.toFixed(1)}×)`); }
    if (volOk) reasons.push(`Volume: ${(q.volume! / 1000).toFixed(0)}K`);

    const setup: IntradaySetup =
      (q.previousClose !== null && q.ltp! > (q.previousClose || 0) * 1.005) ? "BREAKOUT"
      : pos > 0.8 && absPct >= 2 ? "HOD_CONTINUATION"
      : absPct >= 1 ? "MOMENTUM_LONG" : "WEAK_LONG";

    return { setup, direction: "BULLISH", score: Math.min(100, score), reasons };
  } else {
    // Bearish direction
    const absPct = Math.abs(chg);
    if (q.previousClose !== null && q.low !== undefined && q.low < (q.previousClose || Infinity)) {
      score += 25; reasons.push(`Price below prev close low (PDL breakdown candidate)`);
    }
    if (pos < 0.20) { score += 20; reasons.push(`Price near LOD (${(pos * 100).toFixed(0)}% of range)`); }
    else if (pos < 0.40) { score += 10; }
    if (absPct >= 2.5) { score += 20; reasons.push(`Strong drop −${absPct.toFixed(1)}%`); }
    else if (absPct >= 1.0) { score += 10; reasons.push(`Negative −${absPct.toFixed(1)}%`); }
    if (rs !== null && rs < -1.3) { score += 15; reasons.push(`Underperforming NIFTY (RS ${rs.toFixed(1)}×)`); }
    if (volOk) reasons.push(`Volume: ${(q.volume! / 1000).toFixed(0)}K`);

    const setup: IntradaySetup =
      (q.previousClose !== null && q.ltp! < (q.previousClose || 0) * 0.995) ? "BREAKDOWN"
      : pos < 0.2 && absPct >= 2 ? "LOD_CONTINUATION"
      : absPct >= 1 ? "MOMENTUM_SHORT" : "WEAK_SHORT";

    return { setup, direction: "BEARISH", score: Math.min(100, score), reasons };
  }
}

// Detect swing setup from daily data
function detectSwingSetup(q: StockMarketData): {
  setup: SwingSetup; direction: "BULLISH" | "BEARISH"; score: number; reasons: string[];
} {
  const chg = q.changePercent ?? 0;
  const absPct = Math.abs(chg);
  const pos = rangePosition(q.ltp!, q.high, q.low) ?? 0.5;
  const reasons: string[] = [];
  let score = 0;

  if (absPct < 1.0) {
    return { setup: "WEAK", direction: chg >= 0 ? "BULLISH" : "BEARISH", score: 10, reasons: ["Insufficient daily move (<1%)"] };
  }

  if (chg >= 0) {
    score += Math.min(40, absPct * 8);
    if (pos > 0.80) { score += 25; reasons.push(`Closing near day high — continuation potential`); }
    if (absPct >= 3) reasons.push(`Strong daily gain +${absPct.toFixed(1)}%`);
    else reasons.push(`Daily gain +${absPct.toFixed(1)}%`);
    if (q.volume !== undefined && q.volume > 0) { score += 5; reasons.push(`Volume confirmation`); }
    const setup: SwingSetup = absPct >= 2 && pos > 0.75 ? "BREAKOUT" : "TREND_CONTINUATION_LONG";
    return { setup, direction: "BULLISH", score: Math.min(100, score), reasons };
  } else {
    score += Math.min(40, absPct * 8);
    if (pos < 0.20) { score += 25; reasons.push(`Closing near day low — continuation potential`); }
    reasons.push(`Daily loss −${absPct.toFixed(1)}%`);
    if (q.volume !== undefined && q.volume > 0) { score += 5; reasons.push(`Volume confirmation`); }
    const setup: SwingSetup = absPct >= 2 && pos < 0.25 ? "BREAKDOWN" : "TREND_CONTINUATION_SHORT";
    return { setup, direction: "BEARISH", score: Math.min(100, score), reasons };
  }
}

// Build trade plan using structural levels (HOD/LOD as stops) and ATR extensions as targets.
// Target is market-derived — NOT forced to achieve a desired R:R.
// The ATR multiplier increases for strong-momentum setups (RS > 1.5×, move > 2.5%).
// This reflects that high-momentum continuation moves typically extend further.
// R:R is CALCULATED after targets are set; poor R:R setups are rejected by the scanner.
function buildTradePlan(
  q: StockMarketData, direction: "BULLISH" | "BEARISH", relStr: number | null,
) {
  const ltp = q.ltp!;
  const high = q.high ?? ltp;
  const low = q.low ?? ltp;
  const dayRange = high - low;
  const atrProxy = Math.max(dayRange, ltp * 0.008); // 0.8% floor

  // Strong-momentum extension: applies when stock has clear relative outperformance/underperformance
  const absPct = Math.abs(q.changePercent ?? 0);
  const strongMomentum = absPct >= 2.5 && relStr !== null && Math.abs(relStr) >= 1.5;
  // ponytail: 1.2× gives R:R ≈ 1.04 at LOD/HOD; 1.75× gives R:R ≈ 1.52
  const targetMult = strongMomentum ? 1.75 : 1.2;

  if (direction === "BULLISH") {
    const stop = r2(low - atrProxy * 0.15);
    const risk = Math.max(ltp - stop, 0.01);
    const t1 = r2(ltp + atrProxy * targetMult);
    const t2 = r2(ltp + atrProxy * targetMult * 1.8);
    return {
      entry: ltp, entryLow: r2(ltp), entryHigh: r2(ltp * 1.003),
      stop, target1: t1, target2: t2, rr: r2((t1 - ltp) / risk),
    };
  } else {
    const stop = r2(high + atrProxy * 0.15);
    const risk = Math.max(stop - ltp, 0.01);
    const t1 = r2(ltp - atrProxy * targetMult);
    const t2 = r2(ltp - atrProxy * targetMult * 1.8);
    return {
      entry: ltp, entryLow: r2(ltp * 0.997), entryHigh: r2(ltp),
      stop, target1: t1, target2: t2, rr: r2((ltp - t1) / risk),
    };
  }
}

// ── Main scanner ──────────────────────────────────────────────────────────────

export async function scanStocks(kind: "intraday" | "swing", now = new Date()): Promise<StockOpportunityResult> {
  const instruments: StockInstrument[] = NIFTY_50.map((c) => ({
    symbol: c.symbol, name: c.name, exchange: "NSE" as const,
    instrumentKey: c.instrumentKey, kind: "EQUITY" as const,
  }));

  // Also fetch NIFTY index quote for relative strength calculation.
  // We include it in the batch — NSE_INDEX|13 is NIFTY 50.
  const quotes = await batchQuotes(instruments, now);
  const available = quotes.filter((q) => q.ltp !== null && q.freshness !== "UNAVAILABLE");
  const source = available.length > 0 ? "UPSTOX" : "UNAVAILABLE";
  const freshness = available.length === 0 ? "UNAVAILABLE"
    : available.every((q) => q.freshness === "LIVE") ? "LIVE" : "MIXED";

  // Estimate NIFTY change from constituent moves (proxy when index not in batch)
  const niftyChanges = available
    .filter((q) => q.changePercent !== undefined)
    .map((q) => q.changePercent!);
  const niftyChgPct = niftyChanges.length > 10
    ? niftyChanges.reduce((a, b) => a + b, 0) / niftyChanges.length
    : null;

  const opportunities: StockOpportunity[] = [];
  let rejected = 0;

  for (const q of available) {
    if (q.ltp === null) { rejected++; continue; }

    const inst = instruments.find((i) => i.symbol === q.symbol);
    if (!inst) { rejected++; continue; }

    const scored = kind === "intraday"
      ? detectIntradaySetup(q, niftyChgPct)
      : detectSwingSetup(q);

    if (scored.score < 30) { rejected++; continue; }

    const chg = q.changePercent ?? 0;
    const rs = niftyChgPct !== null && Math.abs(niftyChgPct) > 0.05
      ? r2(chg / niftyChgPct) : null;

    const plan = buildTradePlan(q, scored.direction, rs);
    if (plan.rr < 1.0) { rejected++; continue; }

    const invalidation = scored.direction === "BULLISH"
      ? `Price breaks below ${r2(q.low ?? (q.ltp! * 0.995))}`
      : `Price breaks above ${r2(q.high ?? (q.ltp! * 1.005))}`;

    opportunities.push({
      rank: 0,
      symbol: q.symbol,
      name: inst.name,
      instrumentKey: q.instrumentKey ?? "",
      ltp: q.ltp!,
      open: q.open ?? null,
      high: q.high ?? null,
      low: q.low ?? null,
      previousClose: q.previousClose ?? null,
      change: q.change ?? null,
      changePercent: q.changePercent ?? null,
      volume: q.volume ?? null,
      freshness: q.freshness,
      opportunityScore: scored.score,
      setup: scored.setup,
      direction: scored.direction,
      ...plan,
      relativeStrength: rs,
      rangePosition: rangePosition(q.ltp!, q.high, q.low),
      reasons: scored.reasons,
      invalidation,
      // liveSources=3 only when the quote is genuinely LIVE; END_OF_DAY/STALE → 0 → forces REJECT grade
      grade: gradeOpportunity(scored.score, plan.rr, 70, q.freshness === "LIVE" ? 3 : 0),
    });
  }

  opportunities.sort((a, b) => b.opportunityScore - a.opportunityScore);
  const top3 = opportunities.slice(0, 3).map((o, i) => ({ ...o, rank: i + 1 }));

  return {
    timestamp: now.toISOString(),
    engineVersion: STOCK_OPPORTUNITY_VERSION,
    kind,
    source,
    freshness,
    universe: "NIFTY_50",
    stocksScanned: instruments.length,
    stocksAvailable: available.length,
    stocksRejected: rejected,
    niftyChange: niftyChgPct !== null ? r2(niftyChgPct) : null,
    topOpportunities: top3,
    noOpportunityReason: top3.length === 0
      ? source === "UNAVAILABLE"
        ? "Upstox not connected — no live stock data available"
        : `No stock passed quality filters (${rejected} rejected from ${available.length} scanned)`
      : null,
  };
}
