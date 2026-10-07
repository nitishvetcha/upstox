// Enriches the Analysis output with contract-level details and natural-language reasoning.
// Does NOT compute scores or make strategy decisions — those come from analyze().
import type { Analysis, Quote, Snapshot, TradePlan } from "./types.ts";
import type { RiskAssessment } from "./services/risk/riskTypes.ts";
import { calculateEntryFill } from "./paperEngine.ts";
import { getRiskConfig } from "./services/risk/riskConfig.ts";

const r2 = (n: number) => Math.round(n * 100) / 100;

// Display label only — NOT a canonical contract identity. Never used as an API key.
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
export function buildDisplaySymbol(expiry: string, strike: number, type: "CE" | "PE", name: string): string {
  const [yy, mm, dd] = expiry.split("-");
  const mon = MONTHS[parseInt(mm, 10) - 1];
  return `${name} ${dd} ${mon} ${yy} ${strike} ${type}`;
}

export interface ContractDetail {
  /** Canonical Upstox instrument key from the live chain. null when not available (mock/backtest). */
  instrumentKey: string | null;
  /** Human-readable label only — not the canonical key */
  displaySymbol: string;
  symbol: string;
  strike: number;
  optionType: "CE" | "PE";
  expiry: string;
  ltp: number | null;
  bid: number | null;
  ask: number | null;
  iv: number | null;
  oi: number | null;
  changeOi: number | null;
  volume: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
}

export interface EntryDetail {
  ltp: number | null;
  bid: number | null;
  ask: number | null;
  paperEntry: number;
  paperEntrySource: string;
}

export interface OiAnalysisResult {
  highestCallOiStrike: number | null;
  highestPutOiStrike: number | null;
  callOiTotal: number | null;
  putOiTotal: number | null;
  callOiChange: number | null;
  putOiChange: number | null;
  interpretation: string[];
}

export type Decision = "TRADE" | "WAIT" | "NO_TRADE";

export interface RecommendationResponse {
  recommendationId: string;
  generatedAt: string;
  source: "LIVE" | "END_OF_DAY" | "STALE" | "UNAVAILABLE" | "MOCK";
  underlying: string;
  decision: Decision;
  direction: "BULLISH" | "BEARISH" | "NEUTRAL";
  strategy: string;
  confidence: number;
  contract: ContractDetail | null;
  entryDetail: EntryDetail | null;
  execution: {
    entry: number;
    stopLoss: number;
    target1: number;
    target2: number;
    breakeven: number | null;
    lots: number;
    quantity: number;
    capitalRequired: number;
    plannedRisk: number;
    maximumLoss: number | null;
    target1Profit: number;
    target2Profit: number;
    rrTarget1: number;
    rrTarget2: number;
  } | null;
  market: {
    spot: number | null;
    expiry: string | null;
    regime: string;
    pcr: number | null;
    maxPain: number | null;
    support: number | null;
    resistance: number | null;
  };
  score: {
    total: number;
    factors: Record<string, { score: number; max: number; available: boolean }>;
  };
  reasons: string[];
  blockers: string[];
  oiAnalysis: OiAnalysisResult;
  whyReasons: string[];
  dataQuality: Record<string, string>;
  blockedCandidate: { strategy: string; strike: number | null; type: string | null; blocker: string } | null;
  /** true when the contract.instrumentKey came directly from the live chain (not constructed) */
  instrumentKeyAvailable: boolean;
  marketSnapshotTimestamp: string | null;
  optionChainTimestamp: string | null;
}

// Primary (BUY) leg of a plan — the leg whose strike/type we display as "the option".
export function primaryLeg(plan: TradePlan): { strike: number; type: "CE" | "PE" } | null {
  const buy = plan.legs.find((l) => l.side === "BUY");
  return buy ? { strike: buy.strike, type: buy.type } : null;
}

export function contractDetails(s: Snapshot, plan: TradePlan): ContractDetail | null {
  const leg = primaryLeg(plan);
  if (!leg) return null;
  const row = s.chain.find((r) => r.strike === leg.strike);
  if (!row) return null;
  const q: Quote = leg.type === "CE" ? row.call : row.put;
  // Use the real key from the chain; null means the chain didn't provide one.
  const instrumentKey = q.instrumentKey ?? null;
  return {
    instrumentKey,
    displaySymbol: buildDisplaySymbol(s.expiry, leg.strike, leg.type, s.name),
    symbol: `${s.name} ${s.expiry} ${leg.strike} ${leg.type}`,
    strike: leg.strike,
    optionType: leg.type,
    expiry: s.expiry,
    ltp: q.ltp || null,
    bid: q.bid,
    ask: q.ask,
    iv: q.iv || null,
    oi: q.oi || null,
    changeOi: q.chgOi,
    volume: q.volume || null,
    delta: q.delta,
    gamma: q.gamma ?? null,
    theta: q.theta ?? null,
    vega: q.vega ?? null,
  };
}

export function entryDetail(s: Snapshot, plan: TradePlan, slippagePct = 1.0): EntryDetail | null {
  const leg = primaryLeg(plan);
  if (!leg) return null;
  const row = s.chain.find((r) => r.strike === leg.strike);
  const q = row ? (leg.type === "CE" ? row.call : row.put) : undefined;
  const row2 = plan.legs.find((l) => l.side === "BUY" && l.strike === leg.strike);
  const fill = calculateEntryFill({ side: "BUY", type: leg.type, strike: leg.strike, ltp: row2?.ltp ?? q?.ltp ?? 0 }, q, slippagePct);
  return { ltp: q?.ltp || null, bid: q?.bid ?? null, ask: q?.ask ?? null, paperEntry: fill.fillPrice, paperEntrySource: fill.source };
}

export function buildOiAnalysis(s: Snapshot, a: Analysis): OiAnalysisResult {
  const chain = a.chain;
  const oiAvailable = s.chain.some((r) => r.call.oi > 0 || r.put.oi > 0);
  if (!oiAvailable) {
    return { highestCallOiStrike: null, highestPutOiStrike: null, callOiTotal: null, putOiTotal: null, callOiChange: null, putOiChange: null, interpretation: ["OI data is not available for this session (historical data or market closed)."] };
  }

  const callOiTotal = s.chain.reduce((t, r) => t + r.call.oi, 0);
  const putOiTotal = s.chain.reduce((t, r) => t + r.put.oi, 0);
  const chgKnown = s.chain.some((r) => r.call.chgOi !== null || r.put.chgOi !== null);
  const callOiChange = chgKnown ? s.chain.reduce((t, r) => t + (r.call.chgOi ?? 0), 0) : null;
  const putOiChange = chgKnown ? s.chain.reduce((t, r) => t + (r.put.chgOi ?? 0), 0) : null;

  const highestCallRow = [...s.chain].sort((a, b) => b.call.oi - a.call.oi)[0];
  const highestPutRow = [...s.chain].sort((a, b) => b.put.oi - a.put.oi)[0];

  const lines: string[] = [];
  if (chain.resistance) lines.push(`Call OI concentration at ${chain.resistance} suggests resistance.`);
  if (chain.support) lines.push(`Put OI concentration at ${chain.support} suggests support.`);
  if (chain.pcrOi !== null) {
    if (chain.pcrOi > 1.3) lines.push(`PCR ${chain.pcrOi.toFixed(2)} — more puts than calls, supports a bullish bias.`);
    else if (chain.pcrOi < 0.7) lines.push(`PCR ${chain.pcrOi.toFixed(2)} — more calls than puts, supports a bearish bias.`);
    else lines.push(`PCR ${chain.pcrOi.toFixed(2)} is in neutral territory.`);
  }
  if (putOiChange !== null && putOiChange > 0 && chain.support) lines.push(`Fresh put writing near ${chain.support} indicates support is being actively defended.`);
  if (callOiChange !== null && callOiChange > 0 && chain.resistance) lines.push(`Fresh call writing near ${chain.resistance} indicates resistance is strengthening.`);
  if (!lines.length) lines.push("Option chain data is available but signals are mixed.");

  return { highestCallOiStrike: highestCallRow.strike, highestPutOiStrike: highestPutRow.strike, callOiTotal, putOiTotal, callOiChange, putOiChange, interpretation: lines };
}

export function buildWhyReasons(a: Analysis): string[] {
  const s = a.snapshot;
  const t = s.technical;
  const reasons: string[] = [];

  for (const f of a.factors) {
    if (!f.available) continue;
    const dir = f.direction > 0.1 ? "bullish" : f.direction < -0.1 ? "bearish" : "neutral";
    if (f.key === "trend") {
      const vwapNote = t?.futuresVwap?.state && t.futuresVwap.state !== "UNAVAILABLE" ? ` (futures ${t.futuresVwap.state.toLowerCase()})` : "";
      reasons.push(`Market Structure: ${s.name} trend is ${dir}${vwapNote} (score ${f.score}/${f.max}).`);
    } else if (f.key === "oi") {
      reasons.push(`Option Chain / OI: disposition is ${dir} — PCR ${a.chain.pcrOi?.toFixed(2) ?? "N/A"} (score ${f.score}/${f.max}).`);
    } else if (f.key === "price") {
      const vs = t ? (s.spot > (t.ema21 ?? 0) ? "above EMA21" : "below EMA21") : "";
      reasons.push(`Price Action: ${s.name} is ${vs}${vs ? ", " : ""}${dir} (score ${f.score}/${f.max}).`);
    } else if (f.key === "technical") {
      const rsi = t?.rsi;
      const note = rsi !== null && rsi !== undefined ? ` RSI ${rsi.toFixed(0)}` : "";
      reasons.push(`Technical Indicators:${note}, ${dir} (score ${f.score}/${f.max}).`);
    } else if (f.key === "iv") {
      const iv = a.chain.atmIv.average;
      reasons.push(`Volatility / IV: ATM IV ${iv !== null ? iv.toFixed(1) + "%" : "N/A"}, regime ${a.volatilityRegime ?? "unknown"} (score ${f.score}/${f.max}).`);
    } else if (f.key === "news") {
      const senti = s.news.score > 0.1 ? "positive" : s.news.score < -0.1 ? "negative" : "neutral";
      reasons.push(`News: sentiment is ${senti} (score ${f.score}/${f.max}).`);
    } else if (f.key === "breadth") {
      reasons.push(`Market Breadth: ${dir} (score ${f.score}/${f.max}).`);
    }
  }

  // Add support/resistance context
  if (a.chain.support && a.chain.resistance) {
    reasons.push(`Support/Resistance: OI-based support at ${a.chain.support}, resistance at ${a.chain.resistance}.`);
  }

  return reasons;
}

export function buildRecommendationResponse(a: Analysis, now = new Date()): RecommendationResponse {
  const s = a.snapshot;
  const plan = a.plan;
  const risk: RiskAssessment | undefined = plan?.risk;
  const cfg = getRiskConfig();

  const source = s.sources.market.source as RecommendationResponse["source"];

  // Contract details — use the real chain key; fail-close if absent at execution time.
  const contract = plan ? contractDetails(s, plan) : null;
  const instrumentKeyAvailable = !!contract?.instrumentKey;

  // Fail-close: if the engine says TRADE but we have no canonical key, downgrade to WAIT.
  const missingKeyBlocker = a.status === "TRADE" && !instrumentKeyAvailable
    ? "OPTION_INSTRUMENT_ID_UNAVAILABLE: canonical Upstox contract identity not returned by the option chain"
    : null;

  const effectiveDecision: Decision = missingKeyBlocker ? "WAIT" : (a.status === "TRADE" ? "TRADE" : a.status === "WAIT" ? "WAIT" : "NO_TRADE");
  const effectiveBlockers = missingKeyBlocker ? [...a.blockers, missingKeyBlocker] : a.blockers;

  let execution: RecommendationResponse["execution"] = null;
  if (plan && risk && effectiveDecision === "TRADE") {
    const qty = risk.quantity;
    const t1Profit = r2((plan.target1 - plan.entry) * qty);
    const t2Profit = r2((plan.target2 - plan.entry) * qty);
    const riskPerUnit = plan.entry - plan.stop;
    const rrT1 = riskPerUnit > 0 ? r2((plan.target1 - plan.entry) / riskPerUnit) : 0;
    const rrT2 = riskPerUnit > 0 ? r2((plan.target2 - plan.entry) / riskPerUnit) : 0;
    execution = {
      entry: plan.entry,
      stopLoss: plan.stop,
      target1: plan.target1,
      target2: plan.target2,
      breakeven: plan.breakevens[0] ?? null,
      lots: risk.lots,
      quantity: qty,
      capitalRequired: risk.capitalRequired,
      plannedRisk: risk.totalRisk,
      maximumLoss: plan.maxLoss !== null ? r2(plan.maxLoss * qty) : null,
      target1Profit: t1Profit,
      target2Profit: t2Profit,
      rrTarget1: rrT1,
      rrTarget2: rrT2,
    };
  }

  // Blocked candidate: the top rejected candidate for display when no TRADE
  const topBlocked = effectiveDecision !== "TRADE" ? (a.candidates.find((c) => c.rejected) ?? null) : null;
  const blockedCandidate = topBlocked ? {
    strategy: topBlocked.strategy,
    strike: topBlocked.legs[0]?.strike ?? null,
    type: topBlocked.legs[0]?.type ?? null,
    blocker: topBlocked.rejected!,
  } : null;

  const direction: RecommendationResponse["direction"] =
    a.bias === "BULLISH" ? "BULLISH" : a.bias === "BEARISH" ? "BEARISH" : "NEUTRAL";

  return {
    recommendationId: `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    generatedAt: now.toISOString(),
    source,
    underlying: s.index === "nifty" ? "NIFTY" : "BANKNIFTY",
    decision: effectiveDecision,
    direction,
    strategy: plan?.strategy ?? "NONE",
    confidence: plan?.score ?? a.total,
    contract,
    entryDetail: plan ? entryDetail(s, plan, cfg.optionSlippagePercent) : null,
    execution,
    market: {
      spot: s.spot,
      expiry: s.expiry,
      regime: a.regime,
      pcr: a.chain.pcrOi,
      maxPain: a.chain.maxPain,
      support: a.chain.support,
      resistance: a.chain.resistance,
    },
    score: {
      total: a.total,
      factors: Object.fromEntries(a.factors.map((f) => [f.key, { score: f.score, max: f.max, available: f.available }])),
    },
    reasons: effectiveBlockers,
    blockers: effectiveBlockers,
    oiAnalysis: buildOiAnalysis(s, a),
    whyReasons: buildWhyReasons(a),
    dataQuality: Object.fromEntries(Object.entries(s.sources).map(([k, v]) => [k, v.source])),
    blockedCandidate,
    instrumentKeyAvailable,
    marketSnapshotTimestamp: s.sources.market.fetchedAt,
    optionChainTimestamp: s.sources.optionChain.fetchedAt,
  };
}
