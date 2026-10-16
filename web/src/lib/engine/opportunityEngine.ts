// Phase 20 — Opportunity Engine v20.0 → 20.1
// Two-stage: underlying analysis (analyzeMarket) → contract selection & ranking.
// Independent of 11.4-frozen strategy. Reuses existing analysis infrastructure.
// No order execution; no strategy changes.
import type { OptionRow, Snapshot } from "../types.ts";
import { analyzeMarket } from "./analysis.ts";
import { atmStrike, chainMetrics } from "../services/optionChainAnalytics.ts";
import type { ChainMetrics } from "../types.ts";

export const OPPORTUNITY_ENGINE_VERSION = "20.1";

// ── Configurable weights (must sum to 100) ────────────────────────────────────
// Document purpose of each weight so they can be tuned from live results.
export const WEIGHTS = {
  underlying_direction: 30, // analyzeMarket() total — covers trend/OI/VWAP/RSI/MACD/news/breadth
  oi_intelligence:      12, // PCR + OI-change interpretation (builds/unwinds)
  sr_room:              10, // room from entry to resistance (CE) or support (PE)
  liquidity:            15, // OI + volume + bid-ask spread quality
  delta:                10, // sweet-spot delta (0.35–0.55)
  iv_attractiveness:    10, // IV percentile (lower = cheaper, better for buyers)
  rr_quality:            8, // computed R:R after applying S/R levels
  expected_move_fit:     5, // target achievable within 1σ expected move
  // TOTAL: 100
} as const;

// Hard filters — reject any contract that fails these before scoring.
export const FILTERS = {
  minOi:           50,
  minVolume:        5,
  maxSpreadPct:    12,   // as % of LTP
  maxStrikesAtm:    7,
  minDeltaAbs:    0.10,
  maxDeltaAbs:    0.80,
  minRr:           1.0,
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export type StrategyType = "LONG_CALL" | "LONG_PUT" | "BULL_CALL_SPREAD" | "BEAR_PUT_SPREAD" | "NO_TRADE";

// ── Opportunity quality grade ─────────────────────────────────────────────────
// Derived after scoring. Serves as a single actionability signal.
// Rules: A+ = exceptional (score≥75, rr≥2.0, conf≥70), A = strong (≥65/1.5/60),
//        B = tradable (≥50/1.2/50), C = watch-only (≥40/1.0), REJECT = fails filters.
export type OpportunityGrade = "A+" | "A" | "B" | "C" | "REJECT";

export function gradeOpportunity(
  score: number, rr: number, confidence: number, liveSources: number,
): OpportunityGrade {
  if (liveSources < 3) return "REJECT";
  if (score >= 75 && rr >= 2.0 && confidence >= 70) return "A+";
  if (score >= 65 && rr >= 1.5 && confidence >= 60) return "A";
  if (score >= 50 && rr >= 1.2 && confidence >= 50) return "B";
  if (score >= 40 && rr >= 1.0) return "C";
  return "REJECT";
}

export interface SignalLine {
  label: string;
  direction: "BULLISH" | "BEARISH" | "NEUTRAL";
  text: string;
  agrees: boolean; // agrees with recommended direction
}

export interface ContractOpportunity {
  rank: number;
  underlying: string;
  expiry: string | null;
  strike: number;
  optionType: "CE" | "PE";
  instrumentKey: string | null;
  strategyType: StrategyType;
  // Quote
  ltp: number;
  bid: number | null;
  ask: number | null;
  spreadPct: number | null;
  oi: number;
  volume: number;
  iv: number | null;
  delta: number | null;
  // Trade plan
  entry: number;
  entryLow: number;
  entryHigh: number;
  stop: number;
  target1: number;
  target2: number;
  rr: number;
  maxLoss: number;
  breakeven: number;
  // Scoring
  opportunityScore: number;
  scoreBreakdown: Record<string, number>;
  confidence: number;        // 0-100, based on signal agreement + data quality
  signalAgreement: number;   // count of agreeing signals
  signalAgreementOf: number; // count of available signals
  signals: SignalLine[];     // full signal list for transparency
  reasons: string[];         // curated "Why" list
  invalidation: string;
  // Analysis
  srRoom: number;            // pts from spot to resistance/support
  expectedMove: number | null;
  grade: OpportunityGrade;
}

export interface RejectedContract {
  strike: number;
  optionType: "CE" | "PE";
  reason: string;
}

export interface OptionsOpportunityResult {
  timestamp: string;
  engineVersion: string;
  underlying: "NIFTY" | "BANKNIFTY";
  source: string;
  dataQuality: Record<string, string>;
  marketRegime: string;
  marketDirection: string;
  directionScore: number;
  spot: number;
  atmStrike: number;
  support: number;
  resistance: number;
  expectedMove: number | null;
  pcrOi: number | null;
  contractsEvaluated: number;
  contractsRejected: number;
  topOpportunities: ContractOpportunity[];
  rejectedContracts: RejectedContract[];
  eventRiskPenalty: number;
  eventRiskReason: string | null;
  recommendedStrategy: StrategyType;
  noOpportunityReason: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const r2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function calcSpreadPct(ltp: number, bid: number | null, ask: number | null): number | null {
  if (bid === null || ask === null || ltp <= 0) return null;
  return r2(((ask - bid) / ltp) * 100);
}

// ── OI signal intelligence ────────────────────────────────────────────────────
// Interprets price×OI combinations for bulls and bears.

function oiSignalScore(
  type: "CE" | "PE",
  chain: ChainMetrics,
  rows: OptionRow[],
): { score: number; notes: string[] } {
  const callAdd = rows.reduce((t, r) => t + (r.call.chgOi ?? 0), 0);
  const putAdd = rows.reduce((t, r) => t + (r.put.chgOi ?? 0), 0);
  const pcr = chain.pcrOi;
  const hasChange = rows.some((r) => r.call.chgOi !== null || r.put.chgOi !== null);

  const notes: string[] = [];
  let score = 6; // neutral baseline (half of max 12)

  if (type === "CE") {
    if (pcr !== null) {
      if (pcr > 1.2) { score += 3; notes.push(`PCR ${pcr.toFixed(2)}: heavy put writing (bullish positioning)`); }
      else if (pcr > 1.0) { score += 1; notes.push(`PCR ${pcr.toFixed(2)}: slightly put-heavy`); }
      else if (pcr < 0.8) { score -= 3; notes.push(`PCR ${pcr.toFixed(2)}: call-heavy (bearish pressure)`); }
    }
    if (hasChange) {
      if (putAdd > 0 && callAdd < 0) { score += 3; notes.push(`OI change: puts added + calls removed → long buildup`); }
      else if (putAdd > 0) { score += 1; notes.push(`OI change: put writing (support building)`); }
      else if (callAdd > 0 && putAdd < 0) { score -= 2; notes.push(`OI change: calls added + puts removed → short buildup`); }
      else if (callAdd > 0) { score -= 1; notes.push(`OI change: call writing (resistance building)`); }
    }
    if (chain.supportByOiChange !== null) {
      notes.push(`Fresh put OI at ${chain.supportByOiChange} (active support)`);
    }
  } else {
    if (pcr !== null) {
      if (pcr < 0.8) { score += 3; notes.push(`PCR ${pcr.toFixed(2)}: heavy call writing (bearish positioning)`); }
      else if (pcr < 1.0) { score += 1; notes.push(`PCR ${pcr.toFixed(2)}: slightly call-heavy`); }
      else if (pcr > 1.2) { score -= 3; notes.push(`PCR ${pcr.toFixed(2)}: put-heavy (bullish pressure vs put)`); }
    }
    if (hasChange) {
      if (callAdd > 0 && putAdd < 0) { score += 3; notes.push(`OI change: calls added + puts removed → short buildup`); }
      else if (callAdd > 0) { score += 1; notes.push(`OI change: call writing (resistance building)`); }
      else if (putAdd > 0 && callAdd < 0) { score -= 2; notes.push(`OI change: puts added + calls removed → long buildup`); }
    }
    if (chain.resistanceByOiChange !== null) {
      notes.push(`Fresh call OI at ${chain.resistanceByOiChange} (active resistance)`);
    }
  }

  return { score: clamp(score, 0, 12), notes };
}

// ── Support/resistance room ───────────────────────────────────────────────────
// Checks how much room exists between spot and the next structural level.
// Low room = poor quality setup; don't buy CE immediately below resistance.

function srRoomScore(
  type: "CE" | "PE",
  spot: number,
  chain: ChainMetrics,
  atr: number,
): { score: number; room: number; note: string } {
  const level = type === "CE" ? chain.resistance : chain.support;
  const room = type === "CE" ? level - spot : spot - level;
  const atrMultiple = room / Math.max(atr, 1);
  const score = atrMultiple >= 2.0 ? 10 : atrMultiple >= 1.0 ? 7 : atrMultiple >= 0.5 ? 3 : 0;
  const levelLabel = type === "CE" ? "OI resistance" : "OI support";
  const note = room > 0
    ? `${Math.round(room)} pts to ${levelLabel} at ${level} (${atrMultiple.toFixed(1)}× ATR)`
    : `At/beyond ${levelLabel} ${level} — limited movement room`;
  return { score, room, note };
}

// ── Strategy selection ────────────────────────────────────────────────────────
// Choose the simplest defined-risk strategy that suits current conditions.

function selectStrategy(type: "CE" | "PE", ivp: number, regime: string): StrategyType {
  const isHighIv = ivp > 65 || regime === "HIGH VOLATILITY";
  if (type === "CE") return isHighIv ? "BULL_CALL_SPREAD" : "LONG_CALL";
  return isHighIv ? "BEAR_PUT_SPREAD" : "LONG_PUT";
}

// ── Trade plan with S/R levels ────────────────────────────────────────────────

function calcTradePoints(
  type: "CE" | "PE",
  strike: number,
  ltp: number,
  delta: number | null,
  spot: number,
  chain: ChainMetrics,
  atr: number,
): { stop: number; target1: number; target2: number; rr: number; breakeven: number } {
  const d = Math.abs(delta ?? 0.35);
  // Stop: 50% of premium (standard long-option position management)
  const stop = r2(ltp * 0.50);
  const risk = ltp - stop;

  // Target based on room to structural level, scaled by delta.
  const level = type === "CE" ? chain.resistance : chain.support;
  const room = Math.abs(level - spot);
  // Use at least 0.4× ATR as minimum room (avoids zero target when at structural level)
  const useRoom = Math.max(room, atr * 0.4);

  const t1 = r2(ltp + d * useRoom * 0.45);
  const t2 = r2(ltp + d * useRoom * 0.85);
  const rr = r2((t1 - ltp) / Math.max(risk, 0.01));
  const be = r2(type === "CE" ? strike + ltp : strike - ltp);

  return { stop, target1: t1, target2: t2, rr, breakeven: be };
}

// ── Signal extraction ─────────────────────────────────────────────────────────
// Converts factor notes into a structured, human-readable signal list.

function buildSignalList(
  m: ReturnType<typeof analyzeMarket>,
  type: "CE" | "PE",
): SignalLine[] {
  const preferBull = type === "CE";
  const signals: SignalLine[] = [];

  for (const f of m.factors) {
    if (!f.available) continue;
    const dir: SignalLine["direction"] =
      f.direction > 0.1 ? "BULLISH" : f.direction < -0.1 ? "BEARISH" : "NEUTRAL";
    const agrees = preferBull ? dir === "BULLISH" : dir === "BEARISH";
    const note = f.notes.find((n) => n.sign !== 0);
    if (note) {
      signals.push({ label: f.label, direction: dir, text: note.text, agrees });
    }
  }

  return signals;
}

// ── Confidence ────────────────────────────────────────────────────────────────
// Combines signal agreement and data freshness.

function computeConfidence(
  signals: SignalLine[],
  dataQuality: Record<string, string>,
): number {
  const available = signals.length;
  if (available === 0) return 0;
  const agreeing = signals.filter((s) => s.agrees).length;
  const signalPct = agreeing / available;

  const liveCount = Object.values(dataQuality).filter((v) => v === "LIVE").length;
  const dataFraction = liveCount / Math.max(Object.keys(dataQuality).length, 1);

  // Confidence: 70% signal agreement + 30% data freshness
  return Math.round((signalPct * 0.7 + dataFraction * 0.3) * 100);
}

// ── Event risk ────────────────────────────────────────────────────────────────

function eventRiskInfo(s: Snapshot): { penalty: number; reason: string | null; level: string } {
  const evDetail = s.news.detail?.eventRisk;
  const level = evDetail?.level ?? (s.news.eventRisk ? "HIGH" : "NONE");
  const penalty = level === "EXTREME" ? 20 : level === "HIGH" ? 12 : level === "MEDIUM" ? 5 : 0;
  const reason = penalty > 0 ? (evDetail?.reason ?? s.news.eventRisk ?? null) : null;
  return { penalty, reason, level };
}

// ── Main evaluator ────────────────────────────────────────────────────────────

export function evaluateOptionsOpportunity(
  s: Snapshot,
  underlyingLabel: "NIFTY" | "BANKNIFTY",
  now = new Date(),
): OptionsOpportunityResult {
  const timestamp = now.toISOString();

  if (!s.chain || s.chain.length === 0) {
    return {
      timestamp, engineVersion: OPPORTUNITY_ENGINE_VERSION, underlying: underlyingLabel,
      source: s.sources.market.source, dataQuality: {}, marketRegime: "NEUTRAL",
      marketDirection: "NEUTRAL", directionScore: 0, spot: s.spot, atmStrike: s.spot,
      support: s.spot, resistance: s.spot, expectedMove: null, pcrOi: null,
      contractsEvaluated: 0, contractsRejected: 0, topOpportunities: [], rejectedContracts: [],
      eventRiskPenalty: 0, eventRiskReason: null, recommendedStrategy: "NO_TRADE",
      noOpportunityReason: "No option chain data available.",
    };
  }

  // Stage 1: Underlying analysis
  const m = analyzeMarket(s, now);
  const chain = m.chain; // from chainMetrics() inside analyzeMarket
  const atm = atmStrike(s.chain, s.spot);
  const atr = s.indicators?.atr ?? (s.spot * 0.01);
  const ivp = s.ivPercentile ?? 50;

  const dq: Record<string, string> = {
    market: s.sources.market.source,
    optionChain: s.sources.optionChain.source,
    technical: s.sources.technical.source,
    news: s.sources.news.source,
    breadth: s.sources.breadth?.source ?? "UNAVAILABLE",
  };

  const ev = eventRiskInfo(s);
  const dir = m.direction;
  const type: "CE" | "PE" = dir >= 0 ? "CE" : "PE";
  const regime = m.regime ?? "NEUTRAL";
  const strategyType = selectStrategy(type, ivp, regime);

  const strikeList = [...new Set(s.chain.map((r) => r.strike))].sort((a, b) => a - b);
  const atmIdx = strikeList.indexOf(atm);

  const evaluated: ContractOpportunity[] = [];
  const rejected: RejectedContract[] = [];

  // Stage 2: Contract selection
  const sortedByAtm = [...s.chain].sort(
    (a, b) => Math.abs(a.strike - s.spot) - Math.abs(b.strike - s.spot),
  );
  const candidates = sortedByAtm.filter((r) => {
    const idx = strikeList.indexOf(r.strike);
    return Math.abs(idx - atmIdx) <= FILTERS.maxStrikesAtm;
  }).slice(0, 15);

  // Pre-compute OI signals and S/R room (same for all contracts)
  const oiSig = oiSignalScore(type, chain, s.chain);
  const srInfo = srRoomScore(type, s.spot, chain, atr);
  const signals = buildSignalList(m, type);
  const confidence = computeConfidence(signals, dq);
  const signalAgreement = signals.filter((sig) => sig.agrees).length;

  // Build the "Why" reasons list
  const whyReasons: string[] = [];
  for (const sig of signals) {
    if (sig.agrees) whyReasons.push(`✓ ${sig.text}`);
  }
  for (const note of oiSig.notes.slice(0, 2)) {
    whyReasons.push(`✓ ${note}`);
  }
  whyReasons.push(srInfo.note.startsWith("At/") ? `⚠ ${srInfo.note}` : `✓ ${srInfo.note}`);
  if (ev.penalty > 0) whyReasons.push(`⚠ Event risk: ${ev.reason ?? "active"} (−${ev.penalty} pts)`);

  for (const row of candidates) {
    const q = type === "CE" ? row.call : row.put;
    const sp = calcSpreadPct(q.ltp, q.bid, q.ask);
    const d = Math.abs(q.delta ?? 0);

    const rej = (reason: string) => rejected.push({ strike: row.strike, optionType: type, reason });

    if (q.ltp <= 0) { rej("Zero LTP"); continue; }
    if (q.oi < FILTERS.minOi) { rej(`Low OI (${q.oi})`); continue; }
    if (q.volume < FILTERS.minVolume) { rej(`Low volume (${q.volume})`); continue; }
    if (sp !== null && sp > FILTERS.maxSpreadPct) { rej(`Wide spread (${sp.toFixed(1)}%)`); continue; }
    if (q.delta !== null && (d < FILTERS.minDeltaAbs || d > FILTERS.maxDeltaAbs)) {
      rej(`Delta ${q.delta.toFixed(2)} outside [${FILTERS.minDeltaAbs}, ${FILTERS.maxDeltaAbs}]`);
      continue;
    }

    const pts = calcTradePoints(type, row.strike, q.ltp, q.delta, s.spot, chain, atr);
    if (pts.rr < FILTERS.minRr) { rej(`R:R ${pts.rr} below ${FILTERS.minRr}`); continue; }

    // ── Score breakdown ──────────────────────────────────────────────────────
    const strikesFromAtm = Math.abs(strikeList.indexOf(row.strike) - atmIdx);
    const dirBase = clamp(Math.round((m.total / 100) * WEIGHTS.underlying_direction), 0, WEIGHTS.underlying_direction);

    let liq = 0;
    if (q.oi > 50000) liq += 8; else if (q.oi > 10000) liq += 6; else if (q.oi > 1000) liq += 4; else if (q.oi > 50) liq += 1;
    if (q.volume > 5000) liq += 5; else if (q.volume > 500) liq += 3; else if (q.volume > 50) liq += 1;
    if (sp !== null) {
      if (sp < 2) liq += 2; else if (sp < 5) liq += 1; else if (sp > 8) liq -= 1;
    }
    liq = clamp(liq, 0, WEIGHTS.liquidity);

    const deltaScore = d >= 0.35 && d <= 0.55 ? WEIGHTS.delta
      : d >= 0.28 && d <= 0.65 ? Math.round(WEIGHTS.delta * 0.7)
      : d >= 0.18 && d <= 0.75 ? Math.round(WEIGHTS.delta * 0.4) : 0;

    const ivScore = ivp > 80 ? Math.round(WEIGHTS.iv_attractiveness * 0.2)
      : ivp > 65 ? Math.round(WEIGHTS.iv_attractiveness * 0.5)
      : ivp > 50 ? Math.round(WEIGHTS.iv_attractiveness * 0.7)
      : ivp > 30 ? Math.round(WEIGHTS.iv_attractiveness * 0.9)
      : WEIGHTS.iv_attractiveness;

    const rrScore = pts.rr >= 2.5 ? WEIGHTS.rr_quality
      : pts.rr >= 2.0 ? Math.round(WEIGHTS.rr_quality * 0.85)
      : pts.rr >= 1.5 ? Math.round(WEIGHTS.rr_quality * 0.65)
      : Math.round(WEIGHTS.rr_quality * 0.35);

    // Expected move fit: target1 within 1σ move is achievable
    let emFit = Math.round(WEIGHTS.expected_move_fit * 0.5);
    if (chain.expectedMove !== null) {
      const tgtUnderlying = pts.target1 > pts.stop ? (pts.target1 - q.ltp) / Math.max(Math.abs(q.delta ?? 0.35), 0.1) : 0;
      emFit = tgtUnderlying <= chain.expectedMove
        ? WEIGHTS.expected_move_fit
        : Math.round(WEIGHTS.expected_move_fit * 0.3);
    }

    const breakdown: Record<string, number> = {
      underlying_direction: dirBase,
      oi_intelligence: oiSig.score,
      sr_room: srInfo.score,
      liquidity: liq,
      delta: deltaScore,
      iv_attractiveness: ivScore,
      rr_quality: rrScore,
      expected_move_fit: emFit,
      event_penalty: -ev.penalty,
    };
    const raw = Object.values(breakdown).reduce((a, b) => a + b, 0);
    const oppScore = clamp(raw, 0, 100);

    const invalidation = type === "CE"
      ? `Spot breaks below ${r2(chain.support)} (OI support)`
      : `Spot breaks above ${r2(chain.resistance)} (OI resistance)`;

    evaluated.push({
      rank: 0,
      underlying: underlyingLabel,
      expiry: s.expiry,
      strike: row.strike,
      optionType: type,
      instrumentKey: q.instrumentKey ?? null,
      strategyType,
      ltp: q.ltp, bid: q.bid, ask: q.ask, spreadPct: sp,
      oi: q.oi, volume: q.volume, iv: q.iv, delta: q.delta,
      entry: q.ltp,
      entryLow: r2(q.ltp * 0.97),
      entryHigh: r2(q.ltp * 1.03),
      stop: pts.stop,
      target1: pts.target1,
      target2: pts.target2,
      rr: pts.rr,
      maxLoss: q.ltp,
      breakeven: pts.breakeven,
      opportunityScore: oppScore,
      scoreBreakdown: breakdown,
      confidence,
      signalAgreement,
      signalAgreementOf: signals.length,
      signals,
      reasons: [...whyReasons],
      invalidation,
      srRoom: srInfo.room,
      expectedMove: chain.expectedMove,
      grade: gradeOpportunity(oppScore, pts.rr, confidence, Object.values(dq).filter((v) => v === "LIVE").length),
    });
  }

  evaluated.sort((a, b) => b.opportunityScore - a.opportunityScore);
  const top3 = evaluated.slice(0, 3).map((c, i) => ({ ...c, rank: i + 1 }));

  // Direction always reflects underlying analysis. Regime (e.g. EVENT RISK) is separate — it
  // affects scoring via penalty but must not obscure which way the market is moving.
  const dirLabel =
    dir > 0.40 ? "STRONG BULLISH"
    : dir > 0.15 ? "BULLISH"
    : dir < -0.40 ? "STRONG BEARISH"
    : dir < -0.15 ? "BEARISH"
    : "RANGE";

  const noOpportunityReason = top3.length === 0
    ? `No contract passed quality filters (${rejected.length} rejected). Regime: ${regime}.${ev.penalty > 0 ? ` Event risk active: ${ev.reason}.` : ""}`
    : null;

  return {
    timestamp,
    engineVersion: OPPORTUNITY_ENGINE_VERSION,
    underlying: underlyingLabel,
    source: s.sources.market.source,
    dataQuality: dq,
    marketRegime: regime,
    marketDirection: dirLabel,
    directionScore: m.total,
    spot: s.spot,
    atmStrike: atm,
    support: chain.support,
    resistance: chain.resistance,
    expectedMove: chain.expectedMove,
    pcrOi: chain.pcrOi,
    contractsEvaluated: evaluated.length,
    contractsRejected: rejected.length,
    topOpportunities: top3,
    rejectedContracts: rejected,
    eventRiskPenalty: ev.penalty,
    eventRiskReason: ev.reason,
    recommendedStrategy: strategyType,
    noOpportunityReason,
  };
}
