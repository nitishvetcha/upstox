// Phase 20 — Opportunity Engine v20.0 → 20.1
// Two-stage: underlying analysis (analyzeMarket) → contract selection & ranking.
// Independent of 11.4-frozen strategy. Reuses existing analysis infrastructure.
// No order execution; no strategy changes.
import type { OptionRow, Snapshot } from "../types.ts";
import { analyzeMarket } from "./analysis.ts";
import { atmStrike, chainMetrics } from "../services/optionChainAnalytics.ts";
import { CANDIDATE_MAX_STRIKES_ATM, candidateWindow } from "../services/optionCandidateWindow.ts";
import type { ChainMetrics } from "../types.ts";
import { tradeFreshnessOf } from "../time.ts";
import { aggregateRequiredSource } from "../dataQuality.ts";
import type { ContractPriceQuality, OptionPriceVerificationSummary } from "../services/optionPriceVerification.ts";
import {
  calculateSingleLegPayoff,
  calculateDebitSpreadPayoff,
  calculateExpiryYears,
  validateExecutableQuote,
  r2Strict,
  type OptionsPayoff,
  type LegPricingDetail,
} from "../optionsPricingEngine.ts";

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
  maxStrikesAtm:    CANDIDATE_MAX_STRIKES_ATM, // shared with the chain verifier and per-leg guard (optionCandidateWindow.ts)
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
  theta?: number | null;
  gamma?: number | null;
  vega?: number | null;
  // Trade plan
  entry: number;
  entryLow: number;
  entryHigh: number;
  stop: number;
  target1: number;
  target2: number;
  rr: number;
  maxLoss: number;
  maxProfit?: number | null;
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
  resistance?: number;       // Major Call OI resistance wall
  support?: number;          // Major Put OI support wall
  expectedMove: number | null;
  grade: OpportunityGrade;
  gradeReasons?: string[];
  lastTradeTime?: string | null;
  independentQuoteLtp?: number | null;
  ltpDiscrepancy?: number | null;
  ltpConsistent?: boolean | null;
  contractPriceQuality?: ContractPriceQuality;
  analyticsProvenance?: "UPSTOX_FULL_QUOTES_V3_BOUNDED_REST_SNAPSHOT" | "UNAVAILABLE";
  ivProvenance?: "VENDOR_REPORTED_UNVERIFIED" | "INDEPENDENTLY_DERIVED" | "VERIFIED" | "UNAVAILABLE";
  greeksProvenance?: "VENDOR_REPORTED_UNVERIFIED" | "INDEPENDENTLY_DERIVED" | "VERIFIED" | "UNAVAILABLE";
  // Phase 2 enhancements:
  legs?: LegPricingDetail[];
  payoff?: OptionsPayoff;
  observedValues?: OptionsPayoff["observedValues"];
  calculatedValues?: OptionsPayoff["calculatedValues"];
  estimatedValues?: OptionsPayoff["estimatedValues"];
  executablePricing?: {
    entryPrice: number;
    exitPrice: number;
    spread: number;
    spreadPct: number;
    source: "BID_ASK";
  };
  isMultiLeg?: boolean;
  netDebit?: number | null;
  isZeroDte?: boolean;
  afternoonThetaGuard?: boolean;
}

export function validateSpreadIntegrity(contract: ContractOpportunity): { isValid: boolean; error?: string } {
  const isMultiLeg =
    contract.strategyType === "BEAR_PUT_SPREAD" ||
    contract.strategyType === "BULL_CALL_SPREAD" ||
    Boolean(contract.isMultiLeg) ||
    ((contract.legs?.length ?? 0) > 1);

  if (!isMultiLeg) {
    return { isValid: true };
  }

  const longLeg = contract.legs?.find((l) => l.side === "BUY");
  const shortLeg = contract.legs?.find((l) => l.side === "SELL");

  if (!longLeg || !shortLeg) {
    return { isValid: false, error: "Missing long or short leg in multi-leg spread" };
  }

  if (!longLeg.instrumentKey || !shortLeg.instrumentKey) {
    return { isValid: false, error: "Missing instrumentKey on long or short leg" };
  }

  if (!longLeg.expiry || !shortLeg.expiry) {
    return { isValid: false, error: "Missing expiry on long or short leg" };
  }

  if (typeof contract.netDebit !== "number" || !Number.isFinite(contract.netDebit) || contract.netDebit <= 0) {
    return { isValid: false, error: "netDebit must be a positive finite number" };
  }

  const longAsk = longLeg.executablePrice ?? longLeg.ask ?? null;
  const shortBid = shortLeg.executablePrice ?? shortLeg.bid ?? null;

  if (longAsk == null || shortBid == null || !Number.isFinite(longAsk) || !Number.isFinite(shortBid)) {
    return { isValid: false, error: "Missing executable price/bid/ask on spread legs" };
  }

  const calculatedDebit = Math.round((longAsk - shortBid) * 100) / 100;
  if (Math.abs(contract.netDebit - calculatedDebit) > 0.05) {
    return {
      isValid: false,
      error: `netDebit (${contract.netDebit}) does not match leg quotes longAsk(${longAsk}) - shortBid(${shortBid}) = ${calculatedDebit} within 0.05 tolerance`,
    };
  }

  const spreadWidth = Math.abs(longLeg.strike - shortLeg.strike);
  if (contract.netDebit >= spreadWidth) {
    return {
      isValid: false,
      error: `netDebit (${contract.netDebit}) exceeds or equals spread width (${spreadWidth})`,
    };
  }

  return { isValid: true };
}

export interface RejectedContract {
  strike: number;
  optionType: "CE" | "PE";
  reason: string;
}

export interface OptionsOpportunityResult {
  timestamp: string;
  engineVersion: string;
  underlying: string;
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
  pcrVolume?: number | null;
  contractsEvaluated: number;
  contractsRejected: number;
  topOpportunities: ContractOpportunity[];
  rejectedContracts: RejectedContract[];
  eventRiskPenalty: number;
  eventRiskReason: string | null;
  recommendedStrategy: StrategyType;
  noOpportunityReason: string | null;
  isZeroDte?: boolean;
  afternoonThetaGuard?: boolean;
  optionPriceQuality?: ContractPriceQuality | "CONTRACT_PRICE_UNAVAILABLE";
  chainAnalyticsQuality?: "CHAIN_ANALYTICS_VERIFIED_BOUNDED" | "CHAIN_ANALYTICS_UNVERIFIED";
  oiAnalyticsQuality?: "OI_ANALYTICS_VERIFIED_BOUNDED" | "OI_ANALYTICS_UNAVAILABLE";
  volumeAnalyticsQuality?: "VOLUME_ANALYTICS_VERIFIED_BOUNDED" | "VOLUME_ANALYTICS_UNAVAILABLE";
  candidateEligibility?: "ACTIONABLE_CANDIDATE_PRESENT" | "ALL_CANDIDATES_REJECTED" | "NO_CANDIDATES";
  newsDiagnostic?: {
    providerStatus: string;        // s.sources.news.source (LIVE / UNAVAILABLE / MOCK / …)
    freshness: string;             // s.news.status (LIVE / AGING / STALE / UNAVAILABLE)
    newestArticleAt: string | null;
    overall: string;               // BULLISH / BEARISH / NEUTRAL
    score: number;                 // −1..+1
    confidence: number;            // 0..1
    articleCount: number;
    bullishCount: number;
    bearishCount: number;
    fetchedCount: number;
    uniqueCount: number;
    factorAvailable: boolean;      // whether news was included in analyzeMarket() scoring
    factorScore: number;           // 0..10 pts contributed to underlying_direction
    newsConflictsWithMarket: boolean;
    unavailableReason: string | null;
    eventRiskLevel: string;        // NONE / MEDIUM / HIGH / EXTREME
    eventRiskPenalty: number;      // already on the result root; duplicated here for one-panel view
    eventRiskReason: string | null;
    doubleCountingNote: string | null; // explains sentiment + penalty from same articles
  };
  lotSize?: number | null;
  contractPriceDiagnostics?: Pick<OptionPriceVerificationSummary,
    "requestedKeys" | "coveredKeys" | "liveKeys" | "agingKeys" | "staleKeys" |
    "unavailableKeys" | "mismatchedKeys" | "eligibleKeys"
  >;
}

function contractPriceDiagnostics(summary: OptionPriceVerificationSummary | undefined): NonNullable<OptionsOpportunityResult["contractPriceDiagnostics"]> {
  return summary ? {
    requestedKeys: summary.requestedKeys,
    coveredKeys: summary.coveredKeys,
    liveKeys: summary.liveKeys,
    agingKeys: summary.agingKeys,
    staleKeys: summary.staleKeys,
    unavailableKeys: summary.unavailableKeys,
    mismatchedKeys: summary.mismatchedKeys,
    eligibleKeys: summary.eligibleKeys,
  } : {
    requestedKeys: 0,
    coveredKeys: 0,
    liveKeys: 0,
    agingKeys: 0,
    staleKeys: 0,
    unavailableKeys: 0,
    mismatchedKeys: 0,
    eligibleKeys: 0,
  };
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
): { score: number; room: number; note: string; isCapped: boolean } {
  const level = type === "CE" ? chain.resistance : chain.support;
  const room = type === "CE" ? level - spot : spot - level;
  const atrMultiple = room / Math.max(atr, 1);
  const score = atrMultiple >= 2.0 ? 10 : atrMultiple >= 1.0 ? 7 : atrMultiple >= 0.5 ? 3 : 0;
  const levelLabel = type === "CE" ? "Call OI resistance" : "Put OI support";
  const isCapped = room < 0.4 * atr || room <= 0;
  const note = isCapped
    ? (room > 0
        ? `⚠ Approaching institutional ${type === "CE" ? "Call" : "Put"} writer wall at ${level} (${Math.round(room)} pts away) — target room is capped`
        : `⚠ At/beyond institutional ${type === "CE" ? "Call" : "Put"} writer wall at ${level} — target room is capped`)
    : `${Math.round(room)} pts to ${levelLabel} at ${level} (${atrMultiple.toFixed(1)}× ATR)`;
  return { score, room, note, isCapped };
}

// ── 0-DTE Expiry Intelligence ────────────────────────────────────────────────
// Detects 0-DTE expiry day and intraday afternoon theta acceleration.

export function isZeroDteExpiry(expiry: string | null | undefined, now: Date): boolean {
  if (!expiry || typeof expiry !== "string") return false;
  const trimmed = expiry.trim();
  const expiryDateStr = trimmed.includes("T") ? trimmed.split("T")[0] : trimmed;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDateStr)) return false;
  try {
    const nowIstStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
    return expiryDateStr === nowIstStr;
  } catch {
    return false;
  }
}

export function getIstHourMinute(now: Date): { hour: number; minute: number; isAfterNoon: boolean; isAfterTwoPm: boolean } {
  try {
    const istTimeStr = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now);
    const [h, m] = istTimeStr.split(":").map(Number);
    return {
      hour: h,
      minute: m,
      isAfterNoon: h >= 12,
      isAfterTwoPm: h >= 14,
    };
  } catch {
    const utcHours = now.getUTCHours();
    const utcMinutes = now.getUTCMinutes();
    const istMinutesTotal = utcHours * 60 + utcMinutes + 330;
    const h = Math.floor((istMinutesTotal % 1440) / 60);
    const m = istMinutesTotal % 60;
    return {
      hour: h,
      minute: m,
      isAfterNoon: h >= 12,
      isAfterTwoPm: h >= 14,
    };
  }
}

// ── Strategy selection ────────────────────────────────────────────────────────
// Choose the simplest defined-risk strategy that suits current conditions.

function selectStrategy(type: "CE" | "PE", ivp = 50): StrategyType {
  if (ivp > 60) {
    return type === "CE" ? "BULL_CALL_SPREAD" : "BEAR_PUT_SPREAD";
  }
  return type === "CE" ? "LONG_CALL" : "LONG_PUT";
}

// ── Trade plan with S/R levels ────────────────────────────────────────────────

function calcTradePoints(
  type: "CE" | "PE",
  strike: number,
  entry: number,
  delta: number | null,
  spot: number,
  chain: ChainMetrics,
  atr: number,
  referenceLtp?: number,
): { stop: number; target1: number; target2: number; rr: number; breakeven: number } {
  const d = Math.abs(delta ?? 0.35);
  // Stop: 50% of premium (or reference LTP when available)
  const stopBase = referenceLtp && referenceLtp > 0 ? referenceLtp : entry;
  const stop = r2(stopBase * 0.50) ?? r2Strict(entry * 0.50);
  const risk = Math.max(entry - stop, 0.01);

  // Target based on room to structural level, scaled by delta.
  const level = type === "CE" ? chain.resistance : chain.support;
  const room = Math.abs(level - spot);
  // Use at least 0.4× ATR as minimum room (avoids zero target when at structural level)
  // Ceiling: bound room to 2.5× ATR (or 1.5× expected move) so targets stay realistic for intraday/tactical horizons.
  const maxRoom = Math.max(atr * 2.5, (chain.expectedMove ?? 0) * 1.5, 120);
  const useRoom = Math.min(Math.max(room, atr * 0.4), maxRoom);

  const t1 = r2(entry + d * useRoom * 0.45) ?? entry;
  const t2 = r2(entry + d * useRoom * 0.85) ?? entry;
  const rr = r2((t1 - entry) / Math.max(risk, 0.01)) ?? 0;
  const be = r2(type === "CE" ? strike + entry : strike - entry) ?? strike;

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
  underlyingLabel: string,
  now = new Date(),
): OptionsOpportunityResult {
  const timestamp = now.toISOString();

  if (!s.chain || s.chain.length === 0) {
    return {
      timestamp, engineVersion: OPPORTUNITY_ENGINE_VERSION, underlying: underlyingLabel,
      source: aggregateRequiredSource(Object.values(s.sources)), dataQuality: {}, marketRegime: "NEUTRAL",
      marketDirection: "NEUTRAL", directionScore: 0, spot: s.spot, atmStrike: s.spot,
      support: s.spot, resistance: s.spot, expectedMove: null, pcrOi: null, pcrVolume: null,
      contractsEvaluated: 0, contractsRejected: 0, topOpportunities: [], rejectedContracts: [],
      eventRiskPenalty: 0, eventRiskReason: null, recommendedStrategy: "NO_TRADE",
      noOpportunityReason: "No option chain data available.",
      optionPriceQuality: s.optionPriceVerification?.state ?? "CONTRACT_PRICE_UNAVAILABLE",
      chainAnalyticsQuality: "CHAIN_ANALYTICS_UNVERIFIED",
      oiAnalyticsQuality: s.optionPriceVerification?.oiAnalytics ?? "OI_ANALYTICS_UNAVAILABLE",
      volumeAnalyticsQuality: s.optionPriceVerification?.volumeAnalytics ?? "VOLUME_ANALYTICS_UNAVAILABLE",
      candidateEligibility: "NO_CANDIDATES",
      lotSize: s.lotSize ?? null,
      contractPriceDiagnostics: contractPriceDiagnostics(s.optionPriceVerification),
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
  const sideways = Math.abs(dir) < 0.15;
  const type: "CE" | "PE" = dir >= 0 ? "CE" : "PE";
  const regime = m.regime ?? "NEUTRAL";
  const strategyType = selectStrategy(type, ivp);
  const is0Dte = isZeroDteExpiry(s.expiry, now);
  const istTime = getIstHourMinute(now);
  const afternoonThetaGuard = is0Dte && istTime.isAfterNoon;

  // Candidate window: the same ATM ±N strike rule the verifier and per-leg guard use (optionCandidateWindow.ts).
  const window = candidateWindow(s.chain, s.spot, FILTERS.maxStrikesAtm);

  const evaluated: ContractOpportunity[] = [];
  const rejected: RejectedContract[] = [];

  // Stage 2: Contract selection
  const sortedByAtm = [...s.chain].sort(
    (a, b) => Math.abs(a.strike - s.spot) - Math.abs(b.strike - s.spot),
  );
  const candidates = sortedByAtm.filter((r) => window.strikeSet.has(r.strike)).slice(0, 15);

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
  whyReasons.push(srInfo.note.startsWith("⚠") || srInfo.note.startsWith("At/") ? srInfo.note : `✓ ${srInfo.note}`);
  if (is0Dte) {
    whyReasons.unshift("⚡ 0-DTE Expiry Day: Gamma risk elevated; trade strictly near-the-money and exit before 15:15 IST");
    if (afternoonThetaGuard) {
      whyReasons.push("⚠ 0-DTE Afternoon Theta Guard (Post-12:00 IST): Rapid time decay active; scalp only with hard trailing stop or roll to next expiry");
    }
  }
  if (ivp <= 50) {
    whyReasons.push(`⚡ Low IV (${Math.round(ivp)}% percentile) Volatility Switcher: Directional naked option prioritized for maximum capital efficiency and uncapped upside`);
  }
  if (ivp > 65) whyReasons.push(`⚠ Options are expensive now (IV percentile ${Math.round(ivp)}) — consider a spread to cut cost`);
  if (ev.penalty > 0) whyReasons.push(`⚠ Event risk: ${ev.reason ?? "active"} (−${ev.penalty} pts)`);

  // Chain Greeks/IV carry no timestamp and are unverified unless the chain itself is verified LIVE (options-audit-1).
  // Until then they must not influence filtering, targets, scores or ordering: those terms become neutral.
  const chainAnalyticsVerified = s.optionPriceVerification
    ? s.optionPriceVerification.chainAnalytics === "CHAIN_ANALYTICS_VERIFIED_BOUNDED"
    : dq.optionChain === "LIVE";
  if (!chainAnalyticsVerified) whyReasons.push("⚠ Chain analytics unverified: OI/volume surface is diagnostic only");

  const expiryYears = s.expiry ? calculateExpiryYears(s.expiry, now) : null;

  for (const row of sideways ? [] : candidates) {
    const q = type === "CE" ? row.call : row.put;
    const legacyVerifiedFixture = !s.optionPriceVerification && dq.optionChain === "LIVE";
    const greeksUsable = legacyVerifiedFixture || q.greeksProvenance === "INDEPENDENTLY_DERIVED" || q.greeksProvenance === "VERIFIED";
    const ivUsable = legacyVerifiedFixture || q.ivProvenance === "INDEPENDENTLY_DERIVED" || q.ivProvenance === "VERIFIED";
    const sp = calcSpreadPct(q.ltp, q.bid, q.ask);
    const rawDelta = typeof q.delta === "number" && Number.isFinite(q.delta) ? q.delta : null;

    const rej = (reason: string) => rejected.push({ strike: row.strike, optionType: type, reason });

    // The bounded candidate universe is deliberately stricter than full-chain analytics.
    // Deep-chain quote defects cannot poison PCR/OI, but no selected contract may bypass them.
    if (s.optionPriceVerification) {
      if (!q.instrumentKey) { rej("Missing canonical instrument identity"); continue; }
      if (q.contractPriceQuality === "CONTRACT_PRICE_MISMATCH") { rej("Independent V3 LTP mismatch"); continue; }
      if (q.contractPriceQuality === "CONTRACT_PRICE_STALE") { rej("Stale exchange last-trade timestamp"); continue; }
      if (
        q.contractPriceQuality !== "CONTRACT_PRICE_LIVE" ||
        q.ltpConsistent !== true ||
        !q.lastTradeTime
      ) {
        rej("Independent V3 contract price unavailable or unverified"); continue;
      }
    }

    if (q.ltp <= 0) { rej("Zero LTP"); continue; }
    if (q.oi < FILTERS.minOi) { rej(`Low OI (${q.oi})`); continue; }
    if (q.volume < FILTERS.minVolume) { rej(`Low volume (${q.volume})`); continue; }

    if (sp === null || q.bid === null || q.ask === null || q.ask < q.bid || q.bid <= 0 || q.ask <= 0) {
      rej("Invalid or missing bid/ask spread");
      continue;
    }
    if (sp > FILTERS.maxSpreadPct) {
      rej(`Wide spread (${sp.toFixed(1)}%)`);
      continue;
    }

    const execVal = validateExecutableQuote(q, "BUY", FILTERS.maxSpreadPct);
    if (!execVal.valid || execVal.entryPrice === null) {
      rej(execVal.rejectionReason ?? "Invalid or missing bid/ask spread");
      continue;
    }
    const executableEntry = execVal.entryPrice;

    // When Greeks are verified, delta is required and must fall strictly within [0.10, 0.80].
    // Reject candidates with missing delta or out-of-range delta before target/R:R calculations.
    if (greeksUsable) {
      if (rawDelta === null) {
        rej("Missing option delta");
        continue;
      }
      const d = Math.abs(rawDelta);
      if (d < FILTERS.minDeltaAbs || d > FILTERS.maxDeltaAbs) {
        rej(`Delta ${rawDelta.toFixed(2)} outside [${FILTERS.minDeltaAbs}, ${FILTERS.maxDeltaAbs}]`);
        continue;
      }

      // 0-DTE Expiry Rules & Afternoon Theta Guard
      if (is0Dte) {
        if (d < 0.35) {
          rej(`0-DTE Expiry Rule: Out-of-the-money strike (Delta ${rawDelta.toFixed(2)}) on expiry day has extreme theta decay and zero recovery probability`);
          continue;
        }
        if (istTime.isAfterTwoPm && d < 0.45) {
          rej(`0-DTE Afternoon Theta Guard: Post-14:00 IST on expiry day requires near-the-money / ITM (Delta >= 0.45); OTM lottery strikes (Delta ${rawDelta.toFixed(2)}) are blocked`);
          continue;
        }
      }
    }

    const vDelta = greeksUsable ? rawDelta : null;
    const d = Math.abs(vDelta ?? 0);

    const pts = calcTradePoints(type, row.strike, executableEntry, vDelta, s.spot, chain, atr, q.ltp);
    if (pts.rr < FILTERS.minRr) { rej(`R:R ${pts.rr} below ${FILTERS.minRr}`); continue; }

    const singlePayoff = calculateSingleLegPayoff({
      strategy: (type === "CE" ? "LONG_CALL" : "LONG_PUT"),
      strike: row.strike,
      spot: s.spot,
      quote: {
        ltp: q.ltp,
        bid: q.bid,
        ask: q.ask,
        instrumentKey: q.instrumentKey,
        iv: q.iv,
        gamma: q.gamma,
        theta: q.theta,
        vega: q.vega,
      },
      delta: vDelta,
      srRoom: srInfo.room,
      atr,
      lotSize: s.lotSize ?? (s.index === "banknifty" ? 30 : 75),
      expiryYears,
    });

    // ── Score breakdown ──────────────────────────────────────────────────────
    const dirBase = clamp(Math.round((m.total / 100) * WEIGHTS.underlying_direction), 0, WEIGHTS.underlying_direction);

    let liq = 0;
    if (q.oi > 50000) liq += 8; else if (q.oi > 10000) liq += 6; else if (q.oi > 1000) liq += 4; else if (q.oi > 50) liq += 1;
    if (q.volume > 5000) liq += 5; else if (q.volume > 500) liq += 3; else if (q.volume > 50) liq += 1;
    if (sp !== null) {
      if (sp < 2) liq += 2; else if (sp < 5) liq += 1; else if (sp > 8) liq -= 1;
    }
    liq = clamp(liq, 0, WEIGHTS.liquidity);

    const deltaScore = !greeksUsable ? 0 : d >= 0.35 && d <= 0.55 ? WEIGHTS.delta
      : d >= 0.28 && d <= 0.65 ? Math.round(WEIGHTS.delta * 0.7)
      : d >= 0.18 && d <= 0.75 ? Math.round(WEIGHTS.delta * 0.4) : 0;

    const ivScore = !ivUsable ? 0 : ivp > 80 ? Math.round(WEIGHTS.iv_attractiveness * 0.2)
      : ivp > 65 ? Math.round(WEIGHTS.iv_attractiveness * 0.5)
      : ivp > 50 ? Math.round(WEIGHTS.iv_attractiveness * 0.7)
      : ivp > 30 ? Math.round(WEIGHTS.iv_attractiveness * 0.9)
      : WEIGHTS.iv_attractiveness;

    const rrScore = pts.rr >= 2.5 ? WEIGHTS.rr_quality
      : pts.rr >= 2.0 ? Math.round(WEIGHTS.rr_quality * 0.85)
      : pts.rr >= 1.5 ? Math.round(WEIGHTS.rr_quality * 0.65)
      : Math.round(WEIGHTS.rr_quality * 0.35);

    // Expected move fit: target1 within 1σ move is achievable
    // Expected move is derived from chain ATM IV, so it is only used when that IV is verified.
    let emFit = ivUsable ? Math.round(WEIGHTS.expected_move_fit * 0.5) : 0;
    if (ivUsable && chain.expectedMove !== null) {
      const tgtUnderlying = pts.target1 > pts.stop ? (pts.target1 - q.ltp) / Math.max(Math.abs(vDelta ?? 0.35), 0.1) : 0;
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

    // Fail closed: chain prices/IV/Greeks are unverified unless the chain itself is LIVE (options-audit-1a pending).
    const liveSourcesCount = Object.values(dq).filter((v) => v === "LIVE").length;
    const rawGrade = gradeOpportunity(oppScore, pts.rr, confidence, liveSourcesCount);
    // Production Upstox snapshots explicitly carry CHAIN_ANALYTICS_UNVERIFIED.
    // A fresh contract quote can verify only that contract's price, never the chain IV/Greeks/OI surface.
    // Complete REST field coverage is not proof that the option-chain snapshot is fresh.
    // A fresh contract quote verifies only that contract. Actionability also requires the
    // authoritative chain source to have passed its own freshness classification.
    const isChainAnalyticsUsable = chainAnalyticsVerified && dq.optionChain === "LIVE";
    // Contract freshness must be strictly evaluated independently.
    // A contract without its own valid exchange trade timestamp must NEVER inherit freshness from:
    // another strike, another option type, the underlying index, the chain's maximum timestamp, or local quote receipt time.
    const contractFreshness = q.lastTradeTime ? tradeFreshnessOf(q.lastTradeTime, now).freshness : null;
    const hasIndependentVerification = Boolean(s.optionPriceVerification);
    const isContractLive = hasIndependentVerification
      ? q.contractPriceQuality === "CONTRACT_PRICE_LIVE" && q.ltpConsistent === true && contractFreshness === "LIVE"
      : Boolean(q.lastTradeTime && contractFreshness === "LIVE");
    let finalGrade = (!isChainAnalyticsUsable || !isContractLive || !greeksUsable || !ivUsable) ? "REJECT" : rawGrade;
    const gradeReasons: string[] = [];
    if (!isChainAnalyticsUsable) {
      gradeReasons.push(dq.optionChain !== "LIVE"
        ? `Option-chain source is ${dq.optionChain}, not LIVE; fresh contract quotes cannot promote stale chain analytics`
        : "Full-chain OI/volume analytics are incomplete; bounded REST analytics cannot be used for actionability");
    }
    if (!isContractLive) {
      gradeReasons.push(q.contractPriceQuality === "CONTRACT_PRICE_MISMATCH"
        ? "Contract quote rejected: independently retrieved LTP does not match chain LTP within tolerance"
        : "Contract quote unverified: no trustworthy fresh, matching exchange quote");
    }
    if ((!greeksUsable || !ivUsable) && isChainAnalyticsUsable && isContractLive) {
      gradeReasons.push("Option IV/Greeks unavailable or vendor-reported only: cannot produce actionable grade");
    }
    if (liveSourcesCount < 3) {
      gradeReasons.push(`Insufficient live data sources (${liveSourcesCount}/3 live: ${Object.entries(dq).filter(([_, v]) => v === "LIVE").map(([k]) => k).join(", ") || "none"})`);
    }
    if (oppScore < 40) {
      gradeReasons.push(`Opportunity score ${oppScore}/100 below minimum threshold (40)`);
    }
    if (pts.rr < 1.0) {
      gradeReasons.push(`Risk/reward ratio ${pts.rr}x below minimum threshold (1.0x)`);
    }
    if (!singlePayoff.success) {
      finalGrade = "REJECT";
      gradeReasons.push(singlePayoff.rejectionReason ?? "Option payoff calculation failed");
    } else if (singlePayoff.payoff && singlePayoff.payoff.grossRewardToRisk < 1.0) {
      finalGrade = "REJECT";
      gradeReasons.push(`Payoff risk/reward ratio ${singlePayoff.payoff.grossRewardToRisk}x below minimum threshold (1.0x)`);
    } else if (
      singlePayoff.payoff?.estimatedValues.horizonStatus === "EXPIRES_BEFORE_HORIZON" ||
      singlePayoff.payoff?.estimatedValues.underlyingMoveCalibrated === false ||
      singlePayoff.payoff?.estimatedValues.isHypotheticalDiagnostic === true
    ) {
      finalGrade = "REJECT";
      gradeReasons.push("Expiry occurs before holding horizon (underlying movement uncalibrated for shortened horizon); capped at watch-only / NO_TRADE");
    }
    // Actionable spread gate: candidates with spread > 5.0% (up to 12.0%) remain watch-only
    if (finalGrade !== "REJECT" && sp !== null && sp > 5.0) {
      finalGrade = "C";
      gradeReasons.push(`Wide spread (${sp.toFixed(1)}% > 5.0% actionable limit): capped at watch-only grade C`);
    }
    if (finalGrade !== "REJECT" && sp === null) {
      finalGrade = "C";
      gradeReasons.push("Missing bid/ask quote: spread cannot be determined, capped at watch-only grade C");
    }
    if (finalGrade === "REJECT" && gradeReasons.length === 0) {
      gradeReasons.push("Did not meet quality thresholds for tradable grade");
    }

    evaluated.push({
      rank: 0,
      underlying: underlyingLabel,
      expiry: s.expiry,
      strike: row.strike,
      optionType: type,
      instrumentKey: q.instrumentKey ?? null,
      strategyType: (type === "CE" ? "LONG_CALL" : "LONG_PUT"),
      ltp: q.ltp, bid: q.bid, ask: q.ask, spreadPct: sp,
      oi: q.oi, volume: q.volume, iv: q.iv, delta: q.delta,
      theta: q.theta ?? null, gamma: q.gamma ?? null, vega: q.vega ?? null,
      entry: executableEntry,
      entryLow: r2(executableEntry * 0.97) ?? executableEntry,
      entryHigh: r2(executableEntry * 1.03) ?? executableEntry,
      stop: pts.stop,
      target1: pts.target1,
      target2: pts.target2,
      rr: pts.rr,
      maxLoss: executableEntry,
      maxProfit: type === "CE" ? null : (row.strike > executableEntry ? r2(row.strike - executableEntry) : 0),
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
      resistance: chain.resistance,
      support: chain.support,
      expectedMove: chain.expectedMove,
      grade: finalGrade,
      gradeReasons,
      lastTradeTime: q.lastTradeTime ?? null,
      independentQuoteLtp: q.independentQuoteLtp ?? null,
      ltpDiscrepancy: q.ltpDiscrepancy ?? null,
      ltpConsistent: q.ltpConsistent ?? null,
      contractPriceQuality: q.contractPriceQuality,
      analyticsProvenance: q.analyticsProvenance,
      ivProvenance: q.ivProvenance,
      greeksProvenance: q.greeksProvenance,
      payoff: singlePayoff.payoff ?? undefined,
      observedValues: singlePayoff.payoff?.observedValues,
      calculatedValues: singlePayoff.payoff?.calculatedValues,
      estimatedValues: singlePayoff.payoff?.estimatedValues,
      executablePricing: {
        entryPrice: executableEntry,
        exitPrice: execVal.exitPrice ?? q.bid ?? 0,
        spread: execVal.spread ?? 0,
        spreadPct: sp ?? 0,
        source: "BID_ASK",
      },
      legs: singlePayoff.payoff?.observedValues.legs,
      isMultiLeg: false,
      netDebit: null,
      isZeroDte: is0Dte,
      afternoonThetaGuard,
    });
  }

  // Multi-leg Debit Spread Evaluation (Phase 2):
  // When directional conviction exists and candidates are available, evaluate a defined-risk spread
  // (Bull Call Spread for bullish, Bear Put Spread for bearish).
  if (!sideways && candidates.length >= 2) {
    const spreadType: StrategyType = type === "CE" ? "BULL_CALL_SPREAD" : "BEAR_PUT_SPREAD";
    const longCandidateRow = sortedByAtm.find((r) => window.strikeSet.has(r.strike));
    if (longCandidateRow) {
      const step = s.strikeStep ?? (s.index === "banknifty" ? 100 : 50);
      const shortCandidateRow = type === "CE"
        ? candidates.find((r) => r.strike > longCandidateRow.strike && r.strike <= longCandidateRow.strike + step * 3)
        : candidates.find((r) => r.strike < longCandidateRow.strike && r.strike >= longCandidateRow.strike - step * 3);

      if (shortCandidateRow) {
        const longQuote = type === "CE" ? longCandidateRow.call : longCandidateRow.put;
        const shortQuote = type === "CE" ? shortCandidateRow.call : shortCandidateRow.put;

        const spreadRes = calculateDebitSpreadPayoff({
          strategy: spreadType as "BULL_CALL_SPREAD" | "BEAR_PUT_SPREAD",
          spot: s.spot,
          lotSize: s.lotSize ?? (s.index === "banknifty" ? 30 : 75),
          expiryYears,
          expiry: s.expiry,
          longLeg: { strike: longCandidateRow.strike, expiry: s.expiry, expiryYears, quote: longQuote },
          shortLeg: { strike: shortCandidateRow.strike, expiry: s.expiry, expiryYears, quote: shortQuote },
          holdingHours: 2.0,
          srRoom: srInfo.room,
          atr,
        });

        if (spreadRes.success && spreadRes.payoff) {
          const spPayoff = spreadRes.payoff;
          if (spPayoff.grossRewardToRisk >= FILTERS.minRr) {
            const legacyVerified = !s.optionPriceVerification && dq.optionChain === "LIVE";
            const longGreeksUsable = legacyVerified || longQuote.greeksProvenance === "INDEPENDENTLY_DERIVED" || longQuote.greeksProvenance === "VERIFIED";
            const shortGreeksUsable = legacyVerified || shortQuote.greeksProvenance === "INDEPENDENTLY_DERIVED" || shortQuote.greeksProvenance === "VERIFIED";
            const spreadGreeksUsable = longGreeksUsable && shortGreeksUsable;
            const longIvUsable = legacyVerified || longQuote.ivProvenance === "INDEPENDENTLY_DERIVED" || longQuote.ivProvenance === "VERIFIED";
            const shortIvUsable = legacyVerified || shortQuote.ivProvenance === "INDEPENDENTLY_DERIVED" || shortQuote.ivProvenance === "VERIFIED";
            const spreadIvUsable = longIvUsable && shortIvUsable;

            const dirBase = clamp(Math.round((m.total / 100) * WEIGHTS.underlying_direction), 0, WEIGHTS.underlying_direction);
            const spreadLiq = clamp(
              (longQuote.oi > 10000 ? 5 : 2) + (shortQuote.oi > 10000 ? 5 : 2),
              0,
              WEIGHTS.liquidity,
            );
            const spreadDeltaScore = spreadGreeksUsable ? Math.round(WEIGHTS.delta * 0.8) : 0;
            const spreadIvScore = spreadIvUsable
              ? (ivp > 60 ? WEIGHTS.iv_attractiveness : Math.round(WEIGHTS.iv_attractiveness * 0.7))
              : 0;
            const spreadRrScore = spPayoff.grossRewardToRisk >= 2.0 ? WEIGHTS.rr_quality : Math.round(WEIGHTS.rr_quality * 0.7);

            const spreadBreakdown: Record<string, number> = {
              underlying_direction: dirBase,
              oi_intelligence: oiSig.score,
              sr_room: srInfo.score,
              liquidity: spreadLiq,
              delta: spreadDeltaScore,
              iv_attractiveness: spreadIvScore,
              rr_quality: spreadRrScore,
              expected_move_fit: Math.round(WEIGHTS.expected_move_fit * 0.6),
              event_penalty: -ev.penalty,
            };
            const spreadRaw = Object.values(spreadBreakdown).reduce((a, b) => a + b, 0);
            const spreadOppScore = clamp(spreadRaw, 0, 100);

            const isChainUsable = chainAnalyticsVerified && dq.optionChain === "LIVE";
            const longF = longQuote.lastTradeTime ? tradeFreshnessOf(longQuote.lastTradeTime, now).freshness : null;
            const shortF = shortQuote.lastTradeTime ? tradeFreshnessOf(shortQuote.lastTradeTime, now).freshness : null;
            const longLive = longF === "LIVE";
            const shortLive = shortF === "LIVE";
            const isSpreadHorizonInvalid =
              spPayoff.estimatedValues.horizonStatus === "EXPIRES_BEFORE_HORIZON" ||
              spPayoff.estimatedValues.underlyingMoveCalibrated === false ||
              spPayoff.estimatedValues.isHypotheticalDiagnostic === true;
            const liveSourcesCount = Object.values(dq).filter((v) => v === "LIVE").length;
            const rawSpreadGrade = gradeOpportunity(spreadOppScore, spPayoff.grossRewardToRisk, confidence, liveSourcesCount);
            const finalSpreadGrade = (!isChainUsable || !longLive || !shortLive || !spreadGreeksUsable || !spreadIvUsable || isSpreadHorizonInvalid)
              ? "REJECT"
              : rawSpreadGrade;

            const spreadGradeReasons: string[] = [];
            if (isSpreadHorizonInvalid) {
              spreadGradeReasons.push("Spread expiry occurs before holding horizon (underlying movement uncalibrated for shortened horizon); capped at watch-only / NO_TRADE");
            }
            if (!isChainUsable) {
              spreadGradeReasons.push(dq.optionChain !== "LIVE"
                ? `Option-chain source is ${dq.optionChain}, not LIVE; fresh contract quotes cannot promote stale chain analytics`
                : "Full-chain OI/volume analytics are incomplete; bounded REST analytics cannot be used for actionability");
            }
            if (!longLive || !shortLive) {
              spreadGradeReasons.push("Spread component quotes unverified: one or more legs lack fresh, matching exchange quotes");
            }
            if ((!spreadGreeksUsable || !spreadIvUsable) && isChainUsable && longLive && shortLive) {
              spreadGradeReasons.push("Option IV/Greeks unavailable or vendor-reported only: cannot produce actionable grade");
            }
            if (liveSourcesCount < 3) {
              spreadGradeReasons.push(`Insufficient live data sources (${liveSourcesCount}/3 live: ${Object.entries(dq).filter(([_, v]) => v === "LIVE").map(([k]) => k).join(", ") || "none"})`);
            }
            if (spreadOppScore < 40) {
              spreadGradeReasons.push(`Opportunity score ${spreadOppScore}/100 below minimum threshold (40)`);
            }
            if (spPayoff.grossRewardToRisk < 1.0) {
              spreadGradeReasons.push(`Risk/reward ratio ${spPayoff.grossRewardToRisk}x below minimum threshold (1.0x)`);
            }

            const spreadReasons = [
              ...(ivp > 60
                ? [`⚡ High IV (${Math.round(ivp)}% percentile) Volatility Switcher: Defined-risk debit spread prioritized over naked option to eliminate IV crush and reduce theta decay`]
                : []),
              ...whyReasons,
              `✓ Defined-risk spread: Buy ${longCandidateRow.strike} ${type} at ₹${spPayoff.observedValues.legs[0]?.executablePrice}, Sell ${shortCandidateRow.strike} ${type} at ₹${spPayoff.observedValues.legs[1]?.executablePrice}`,
              `✓ Maximum risk capped at net debit: ₹${spPayoff.maxTheoreticalLoss} per unit`,
              `✓ Maximum profit capped at: ₹${spPayoff.maxTheoreticalProfit} per unit`,
            ];

            evaluated.push({
              rank: 0,
              underlying: underlyingLabel,
              expiry: s.expiry,
              strike: longCandidateRow.strike,
              optionType: type,
              instrumentKey: longQuote.instrumentKey ?? null,
              strategyType: spreadType,
              isMultiLeg: true,
              netDebit: spPayoff.netEntryPrice,
              ltp: longQuote.ltp,
              bid: longQuote.bid,
              ask: longQuote.ask,
              spreadPct: spPayoff.observedValues.legs[0]?.spreadPct ?? null,
              oi: longQuote.oi,
              volume: longQuote.volume,
              iv: longQuote.iv,
              delta: longQuote.delta,
              entry: spPayoff.netEntryPrice,
              entryLow: spPayoff.entryZone[0],
              entryHigh: spPayoff.entryZone[1],
              stop: spPayoff.stopLossPrice,
              target1: spPayoff.target1Price,
              target2: spPayoff.target2Price,
              rr: spPayoff.grossRewardToRisk,
              maxLoss: spPayoff.maxTheoreticalLoss,
              maxProfit: spPayoff.maxTheoreticalProfit,
              breakeven: spPayoff.breakevens[0] ?? spPayoff.netEntryPrice,
              opportunityScore: spreadOppScore,
              scoreBreakdown: spreadBreakdown,
              confidence,
              signalAgreement,
              signalAgreementOf: signals.length,
              signals,
              reasons: spreadReasons,
              invalidation: type === "CE"
                ? `Spot breaks below ${r2(chain.support)} (OI support)`
                : `Spot breaks above ${r2(chain.resistance)} (OI resistance)`,
              srRoom: srInfo.room,
              resistance: chain.resistance,
              support: chain.support,
              expectedMove: chain.expectedMove,
              grade: finalSpreadGrade,
              gradeReasons: finalSpreadGrade === "REJECT" ? spreadGradeReasons : [],
              lastTradeTime: longQuote.lastTradeTime ?? null,
              independentQuoteLtp: longQuote.independentQuoteLtp ?? null,
              ltpDiscrepancy: longQuote.ltpDiscrepancy ?? null,
              ltpConsistent: longQuote.ltpConsistent ?? null,
              contractPriceQuality: longQuote.contractPriceQuality,
              analyticsProvenance: longQuote.analyticsProvenance,
              ivProvenance: longQuote.ivProvenance,
              greeksProvenance: longQuote.greeksProvenance,
              payoff: spPayoff,
              observedValues: spPayoff.observedValues,
              calculatedValues: spPayoff.calculatedValues,
              estimatedValues: spPayoff.estimatedValues,
              executablePricing: {
                entryPrice: spPayoff.netEntryPrice,
                exitPrice: spPayoff.stopLossPrice,
                spread: r2Strict(spPayoff.observedValues.legs[0]?.executablePrice - spPayoff.observedValues.legs[1]?.executablePrice),
                spreadPct: spPayoff.observedValues.legs[0]?.spreadPct ?? 0,
                source: "BID_ASK",
              },
              legs: spPayoff.observedValues.legs,
              isZeroDte: is0Dte,
              afternoonThetaGuard,
            });
          }
        }
      }
    }
  }

  evaluated.sort((a, b) => {
    // High IV Switcher (>60): prioritize defined-risk spreads over naked options when scores are competitive (within 5 pts)
    if (ivp > 60) {
      const aIsSpread = a.isMultiLeg || a.strategyType === "BULL_CALL_SPREAD" || a.strategyType === "BEAR_PUT_SPREAD";
      const bIsSpread = b.isMultiLeg || b.strategyType === "BULL_CALL_SPREAD" || b.strategyType === "BEAR_PUT_SPREAD";
      if (aIsSpread && !bIsSpread && a.opportunityScore >= b.opportunityScore - 5) return -1;
      if (bIsSpread && !aIsSpread && b.opportunityScore >= a.opportunityScore - 5) return 1;
    }
    return b.opportunityScore - a.opportunityScore;
  });
  const top3 = evaluated.slice(0, 3).map((c, i) => ({ ...c, rank: i + 1 }));
  const actionable = top3.filter((contract) => contract.grade !== "REJECT" && contract.grade !== "C");

  // Direction always reflects underlying analysis. Regime (e.g. EVENT RISK) is separate — it
  // affects scoring via penalty but must not obscure which way the market is moving.
  const dirLabel =
    dir > 0.40 ? "STRONG BULLISH"
    : dir > 0.15 ? "BULLISH"
    : dir < -0.40 ? "STRONG BEARISH"
    : dir < -0.15 ? "BEARISH"
    : "RANGE";

  const noOpportunityReason = top3.length === 0
    ? (sideways
        ? "Market is sideways — buying options here usually loses to time decay. Wait for a clear directional move or trade a range strategy."
        : `No contract passed quality filters (${rejected.length} rejected). Regime: ${regime}.${ev.penalty > 0 ? ` Event risk active: ${ev.reason}.` : ""}`)
    : actionable.length === 0
    ? "No contract passed mandatory actionability checks; displayed contracts are rejected or watch-only."
    : null;

  return {
    timestamp,
    engineVersion: OPPORTUNITY_ENGINE_VERSION,
    underlying: underlyingLabel,
    source: aggregateRequiredSource(Object.values(s.sources)),
    dataQuality: dq,
    marketRegime: regime,
    marketDirection: dirLabel,
    directionScore: m.total,
    spot: s.spot,
    atmStrike: atm,
    support: chain.support,
    resistance: chain.resistance,
    expectedMove: chain.expectedMove,
    pcrOi: s.optionPriceVerification?.oiAnalytics === "OI_ANALYTICS_VERIFIED_BOUNDED" || !s.optionPriceVerification ? chain.pcrOi : null,
    pcrVolume: s.optionPriceVerification?.volumeAnalytics === "VOLUME_ANALYTICS_VERIFIED_BOUNDED" || !s.optionPriceVerification ? chain.pcrVolume : null,
    contractsEvaluated: evaluated.filter((c) => !c.strategyType || c.strategyType === "LONG_CALL" || c.strategyType === "LONG_PUT").length,
    contractsRejected: rejected.length,
    topOpportunities: top3,
    rejectedContracts: rejected,
    eventRiskPenalty: ev.penalty,
    eventRiskReason: ev.reason,
    recommendedStrategy: actionable.length > 0 ? (actionable[0]?.strategyType ?? strategyType) : "NO_TRADE",
    noOpportunityReason,
    isZeroDte: is0Dte,
    afternoonThetaGuard,
    optionPriceQuality: s.optionPriceVerification?.state ?? "CONTRACT_PRICE_UNAVAILABLE",
    chainAnalyticsQuality: s.optionPriceVerification?.chainAnalytics ?? "CHAIN_ANALYTICS_UNVERIFIED",
    oiAnalyticsQuality: s.optionPriceVerification?.oiAnalytics ?? "OI_ANALYTICS_UNAVAILABLE",
    volumeAnalyticsQuality: s.optionPriceVerification?.volumeAnalytics ?? "VOLUME_ANALYTICS_UNAVAILABLE",
    candidateEligibility: actionable.length > 0 ? "ACTIONABLE_CANDIDATE_PRESENT" : candidates.length > 0 ? "ALL_CANDIDATES_REJECTED" : "NO_CANDIDATES",
    lotSize: s.lotSize ?? null,
    contractPriceDiagnostics: contractPriceDiagnostics(s.optionPriceVerification),
    newsDiagnostic: buildNewsDiagnostic(s, m, ev),
  };
}

function buildNewsDiagnostic(
  s: Snapshot,
  m: ReturnType<typeof analyzeMarket>,
  ev: { penalty: number; reason: string | null; level: string },
): NonNullable<OptionsOpportunityResult["newsDiagnostic"]> {
  const newsFactor = m.factors.find((f) => f.key === "news");
  const factorAvailable = newsFactor?.available ?? false;
  const factorScore = newsFactor?.score ?? 0;
  const nd = s.news;
  const detail = nd.detail;
  // Sentiment conflicts with market direction when the news factor is available but its direction
  // opposes the dominant market direction enough to push score below neutral.
  const newsConflictsWithMarket = factorAvailable && (newsFactor?.direction ?? 0) * m.direction < -0.05;
  const doubleCountingNote = ev.penalty > 0 && factorAvailable && Math.abs(nd.score) > 0.1
    ? `Same article pool drives both: news sentiment (−${(factorScore < 5 ? (5 - factorScore).toFixed(1) : "0")} pts vs neutral) and event risk penalty (−${ev.penalty} pts). These are complementary effects, not independent data.`
    : null;
  return {
    providerStatus: s.sources.news.source,
    freshness: nd.status ?? "UNAVAILABLE",
    newestArticleAt: detail?.newestAt ?? null,
    overall: detail?.overall ?? (nd.score > 0.15 ? "BULLISH" : nd.score < -0.15 ? "BEARISH" : "NEUTRAL"),
    score: nd.score,
    confidence: nd.confidence ?? 0,
    articleCount: detail?.articleCount ?? 0,
    bullishCount: detail?.bullishCount ?? 0,
    bearishCount: detail?.bearishCount ?? 0,
    fetchedCount: detail?.fetchedCount ?? 0,
    uniqueCount: detail?.uniqueCount ?? 0,
    factorAvailable,
    factorScore,
    newsConflictsWithMarket,
    unavailableReason: detail?.reason ?? null,
    eventRiskLevel: ev.level,
    eventRiskPenalty: ev.penalty,
    eventRiskReason: ev.reason,
    doubleCountingNote,
  };
}
