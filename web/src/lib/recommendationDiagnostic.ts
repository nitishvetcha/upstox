// Phase 13 — structured "why no recommendation?" diagnostic.
// Pure function over the frozen engine's Analysis (strategy 11.4-frozen). It re-labels what analyze() and the
// enricher already decided; it never re-scores. The one gate it adds is eligibility-level: MOCK data is never
// eligible for a live recommendation. Historical option-data limits are WARNINGS only and can never block.
import type { Analysis, Factor, TradePlan } from "./types.ts";
import type { RiskRejectionReason } from "./services/risk/riskTypes.ts";
import { MIN_STRATEGY_SCORE } from "./engine/strategy.ts";
import { buildRecommendationResponse } from "./recommendationEnricher.ts";
import { marketStatus } from "./time.ts";
import { STRATEGY_VERSION } from "./journalTypes.ts";

export type BlockerCode =
  | "MARKET_CLOSED" | "END_OF_DAY" | "STALE_MARKET_DATA" | "UNAVAILABLE_MARKET_DATA" | "UPSTOX_NOT_CONNECTED"
  | "INSUFFICIENT_OPTION_CHAIN" | "OPTION_INSTRUMENT_ID_UNAVAILABLE" | "INSUFFICIENT_TECHNICAL_DATA"
  | "INSUFFICIENT_FRESHNESS" | "EVENT_RISK" | "HIGH_EVENT_RISK" | "RISK_LIMIT_BLOCKED" | "DAILY_LOSS_LIMIT"
  | "OPEN_RISK_LIMIT" | "MAX_CONCURRENT_POSITIONS" | "POSITION_SIZE_ZERO" | "LOT_SIZE_UNAVAILABLE"
  | "RISK_REWARD_TOO_LOW" | "LOW_CONFIDENCE" | "SIGNAL_CONFLICT" | "NO_VALID_STRATEGY" | "NO_VALID_OPTION"
  | "INSUFFICIENT_LIQUIDITY" | "WIDE_BID_ASK" | "INSUFFICIENT_SCORE" | "MARKET_REGIME_BLOCKED" | "OPENING_WINDOW"
  | "UNCLASSIFIED";

export interface RecommendationBlocker {
  code: BlockerCode;
  title: string;
  severity: "BLOCKING";
  message: string;
  source: string;
  resolved: false;
}

export interface RecommendationWarning {
  code: string;
  title: string;
  severity: "WARNING";
  message: string;
  source: string;
}

export type CheckStatus = "PASS" | "WARN" | "BLOCKED" | "NOT_EVALUATED";
export interface RecommendationCheck {
  stage: number;
  name: string;
  status: CheckStatus;
  reason: string | null;
}

export interface CandidatePreview {
  strategy: string;
  direction: "BULLISH" | "BEARISH" | "NEUTRAL";
  score: number;
  entry: number;
  stop: number;
  target1: number;
  target2: number;
  rr: number;
  legs: { side: string; type: string; strike: number; ltp: number; instrumentKey: string | null }[];
  executable: boolean;
  blockedBy: BlockerCode[];
  rejection: string | null;
}

export type FinalDecision = "TRADE" | "WAIT" | "NO_TRADE";

export interface RecommendationDiagnostic {
  underlying: "NIFTY" | "BANKNIFTY";
  evaluatedAt: string;
  strategyVersion: string;
  marketStatus: string;
  dataSource: string;
  fallbackReason: string | null;
  upstox: "CONNECTED" | "SESSION_EXPIRED" | "NOT_CONNECTED" | "API_ERROR" | "MOCK_MODE";
  freshness: Record<"spot" | "optionChain" | "technicals" | "news" | "breadth", string> & { overall: string };
  engineDecision: FinalDecision; // what the frozen engine + enricher returned
  finalDecision: FinalDecision; // after eligibility gates (only ever stricter than engineDecision)
  eligible: boolean;
  blockers: RecommendationBlocker[];
  warnings: RecommendationWarning[];
  checks: RecommendationCheck[];
  candidates: CandidatePreview[];
  candidateSummary: string;
  requiredScore: number;
  eventRisk: { level: string; reason: string | null; articles: number | null; blocking: boolean };
  historicalDataBlocksLive: false;
  summary: string;
}

const TITLES: Record<BlockerCode, string> = {
  MARKET_CLOSED: "Market closed",
  END_OF_DAY: "End-of-day data",
  STALE_MARKET_DATA: "Stale market data",
  UNAVAILABLE_MARKET_DATA: "Market data unavailable",
  UPSTOX_NOT_CONNECTED: "Upstox not connected (mock data)",
  INSUFFICIENT_OPTION_CHAIN: "Insufficient option chain",
  OPTION_INSTRUMENT_ID_UNAVAILABLE: "Option instrument key unavailable",
  INSUFFICIENT_TECHNICAL_DATA: "Insufficient technical data",
  INSUFFICIENT_FRESHNESS: "Insufficient freshness",
  EVENT_RISK: "Event risk",
  HIGH_EVENT_RISK: "High event risk",
  RISK_LIMIT_BLOCKED: "Risk limit",
  DAILY_LOSS_LIMIT: "Daily loss limit",
  OPEN_RISK_LIMIT: "Open risk limit",
  MAX_CONCURRENT_POSITIONS: "Max concurrent positions",
  POSITION_SIZE_ZERO: "Position size zero",
  LOT_SIZE_UNAVAILABLE: "Lot size unavailable",
  RISK_REWARD_TOO_LOW: "Risk/reward too low",
  LOW_CONFIDENCE: "Low confidence",
  SIGNAL_CONFLICT: "Signal conflict",
  NO_VALID_STRATEGY: "No valid strategy",
  NO_VALID_OPTION: "No valid option",
  INSUFFICIENT_LIQUIDITY: "Insufficient liquidity",
  WIDE_BID_ASK: "Wide bid/ask",
  INSUFFICIENT_SCORE: "Score below threshold",
  MARKET_REGIME_BLOCKED: "Market regime",
  OPENING_WINDOW: "Opening window",
  UNCLASSIFIED: "Other engine blocker",
};

const RISK_CODE: Record<RiskRejectionReason, BlockerCode> = {
  RISK_LIMIT_EXCEEDED: "RISK_LIMIT_BLOCKED",
  ZERO_LOTS: "POSITION_SIZE_ZERO",
  MAX_LOTS_EXCEEDED: "RISK_LIMIT_BLOCKED",
  DAILY_LOSS_LIMIT: "DAILY_LOSS_LIMIT",
  OPEN_RISK_LIMIT: "OPEN_RISK_LIMIT",
  MAX_CONCURRENT_POSITIONS: "MAX_CONCURRENT_POSITIONS",
  UNKNOWN_LOT_SIZE: "LOT_SIZE_UNAVAILABLE",
  INVALID_STOP: "RISK_LIMIT_BLOCKED",
  INVALID_ENTRY: "RISK_LIMIT_BLOCKED",
  INVALID_TARGET: "RISK_LIMIT_BLOCKED",
  INSUFFICIENT_RR: "RISK_REWARD_TOO_LOW",
  UNKNOWN_MAX_LOSS: "RISK_LIMIT_BLOCKED",
  INSUFFICIENT_CAPITAL: "RISK_LIMIT_BLOCKED",
  STALE_PRICE: "STALE_MARKET_DATA",
  WIDE_BID_ASK: "WIDE_BID_ASK",
  EXTREME_EVENT_RISK: "HIGH_EVENT_RISK",
  VOLATILITY_RESTRICTION: "MARKET_REGIME_BLOCKED",
};

// Codes for the engine's own free-text blockers (strategy.ts / enricher). Unknown text → UNCLASSIFIED, never dropped.
export function classifyEngineBlocker(text: string): BlockerCode {
  const t = text.toLowerCase();
  if (t.startsWith("option_instrument_id_unavailable")) return "OPTION_INSTRUMENT_ID_UNAVAILABLE";
  if (t.includes("end_of_day") || t.startsWith("market closed")) return "END_OF_DAY";
  if (t.includes("market data is stale") || t.includes("option chain is stale") || t.includes("futures vwap data is stale")) return "STALE_MARKET_DATA";
  if (t.includes("is stale")) return "INSUFFICIENT_FRESHNESS";
  if (t.includes("not enough comparable data") || t.includes("requires live news")) return "INSUFFICIENT_TECHNICAL_DATA";
  if (t.startsWith("opening 15 minutes")) return "OPENING_WINDOW";
  if (t.startsWith("event risk")) return "EVENT_RISK";
  if (t.includes("range-bound")) return "MARKET_REGIME_BLOCKED";
  if (t.includes("below the") && t.includes("threshold")) return "INSUFFICIENT_SCORE";
  if (t.includes("conflict")) return "SIGNAL_CONFLICT";
  if (t.includes("not in option chain")) return "NO_VALID_OPTION";
  if (t.includes("no two-sided quote")) return "INSUFFICIENT_LIQUIDITY";
  if (t.includes("bid-ask spread too wide")) return "WIDE_BID_ASK";
  if (t.includes("risk/reward")) return "RISK_REWARD_TOO_LOW";
  if (t.includes("lot size")) return "LOT_SIZE_UNAVAILABLE";
  if (t.includes("daily loss")) return "DAILY_LOSS_LIMIT";
  if (t.includes("open risk")) return "OPEN_RISK_LIMIT";
  if (t.includes("concurrent")) return "MAX_CONCURRENT_POSITIONS";
  if (t.includes("zero lots") || t.includes("position size")) return "POSITION_SIZE_ZERO";
  return "UNCLASSIFIED";
}

function candidateCodes(c: TradePlan): BlockerCode[] {
  const codes = new Set<BlockerCode>();
  if (c.rejected) codes.add(classifyEngineBlocker(c.rejected));
  for (const r of c.risk?.reasons ?? []) codes.add(RISK_CODE[r]);
  // Reported even when another rejection exists, so fixing one gate doesn't reveal a hidden second one later.
  if (c.score < MIN_STRATEGY_SCORE) codes.add("INSUFFICIENT_SCORE");
  return [...codes];
}

const HISTORICAL_WARNINGS: RecommendationWarning[] = [
  {
    code: "HISTORICAL_OPTIONS_UNAVAILABLE",
    title: "Historical option OHLC/OI/volume unavailable",
    severity: "WARNING",
    message: "Upstox UDAPI1149 — expired-contract history needs the Plus plan. Affects backtest fidelity only; NOT a live-recommendation blocker.",
    source: "historical-data",
  },
];

export function diagnose(a: Analysis, now = new Date()): RecommendationDiagnostic {
  const s = a.snapshot;
  const rec = buildRecommendationResponse(a, now);
  const engineDecision = rec.decision as FinalDecision;
  const mkt = marketStatus(now);
  const src = s.sources;
  const isMock = src.market.source === "MOCK" || s.fallbackReason !== null;
  const isEod = src.market.source === "END_OF_DAY" || s.breadth?.status === "END_OF_DAY";

  const blockers: RecommendationBlocker[] = [];
  const add = (code: BlockerCode, message: string, source: string) => {
    if (!blockers.some((b) => b.code === code && b.message === message))
      blockers.push({ code, title: TITLES[code], severity: "BLOCKING", message, source, resolved: false });
  };

  // Eligibility-level gates (data availability), evaluated before the engine's own blockers.
  const upstox: RecommendationDiagnostic["upstox"] = !isMock ? "CONNECTED"
    : s.fallbackReason === "UPSTOX_AUTH_EXPIRED" ? "SESSION_EXPIRED"
    : s.fallbackReason === "UPSTOX_NOT_CONNECTED" ? "NOT_CONNECTED"
    : s.fallbackReason ? "API_ERROR" : "MOCK_MODE";
  if (isMock) {
    const why = upstox === "SESSION_EXPIRED" ? "Upstox session expired" : upstox === "NOT_CONNECTED" ? "Upstox not connected"
      : upstox === "API_ERROR" ? `Upstox API error (${s.fallbackReason})` : "MARKET_DATA_PROVIDER is mock";
    add("UPSTOX_NOT_CONNECTED", `${why}: running on MOCK data, which is never executable. Connect Upstox at /api/auth/login.`, "provider");
  }
  if (mkt === "CLOSED") add("MARKET_CLOSED", "NSE session is closed. Last-session data is shown as END_OF_DAY and is not executable.", "market-clock");
  if (src.market.source === "UNAVAILABLE") add("UNAVAILABLE_MARKET_DATA", "Spot quote unavailable.", "market");
  if (src.optionChain.source === "UNAVAILABLE" || s.chain.length < 5) add("INSUFFICIENT_OPTION_CHAIN", `Option chain has ${s.chain.length} strikes.`, "optionChain");

  // Engine blockers (analysis.blockers + enricher fail-close), each with a code.
  for (const b of rec.blockers) {
    const cand = a.candidates.find((c) => b.startsWith(`${c.strategy}: `));
    add(classifyEngineBlocker(b), b, cand ? `candidate: ${cand.strategy}` : "engine");
  }
  for (const c of a.candidates) for (const code of candidateCodes(c)) {
    if (blockers.some((b) => b.code === code && b.source === `candidate: ${c.strategy}`)) continue;
    const msg = code === "INSUFFICIENT_SCORE"
      ? `${c.strategy}: score ${c.score} below the ${MIN_STRATEGY_SCORE} threshold`
      : `${c.strategy}: ${c.risk?.humanReasons.join("; ") || c.rejected || TITLES[code]}`;
    add(code, msg, `candidate: ${c.strategy}`);
  }
  if (!a.candidates.length && engineDecision !== "TRADE") add("NO_VALID_STRATEGY", `Regime ${a.regime} produced no strategy candidate.`, "strategy");

  // Only ever stricter than the engine: a closed market or mock data is never actionable.
  const finalDecision: FinalDecision = mkt === "CLOSED" || isMock ? "NO_TRADE" : engineDecision;
  // A TRADE from the engine carries no blockers of its own; keep only the eligibility gates that downgraded it.
  const finalBlockers = finalDecision === "TRADE" ? [] : blockers;

  const warnings: RecommendationWarning[] = [...HISTORICAL_WARNINGS];
  for (const r of a.risks) warnings.push({ code: "ENGINE_RISK_NOTE", title: "Risk note", severity: "WARNING", message: r, source: "engine" });

  const factor = (k: string): Factor | undefined => a.factors.find((f) => f.key === k);
  const fCheck = (stage: number, name: string, k: string): RecommendationCheck => {
    const f = factor(k);
    if (!f) return { stage, name, status: "NOT_EVALUATED", reason: null };
    return { stage, name, status: f.available ? "PASS" : "WARN", reason: f.available ? `${f.score}/${f.max}` : f.notes[0]?.text ?? "unavailable" };
  };
  const has = (...codes: BlockerCode[]) => finalBlockers.filter((b) => codes.includes(b.code));
  const gate = (stage: number, name: string, codes: BlockerCode[], passReason: string | null = null): RecommendationCheck => {
    const hit = has(...codes);
    return { stage, name, status: hit.length ? "BLOCKED" : "PASS", reason: hit.length ? hit.map((b) => b.message).join(" | ") : passReason };
  };

  const best = a.candidates[0];
  const ev = s.news.detail?.eventRisk;
  const eventBlocking = a.regime === "EVENT RISK" || has("EVENT_RISK", "HIGH_EVENT_RISK").length > 0;
  const candidatesEvaluated = a.candidates.length > 0;

  const checks: RecommendationCheck[] = [
    gate(1, "Market status", ["MARKET_CLOSED", "END_OF_DAY", "OPENING_WINDOW"], mkt),
    gate(2, "Live spot", ["UPSTOX_NOT_CONNECTED", "UNAVAILABLE_MARKET_DATA", "STALE_MARKET_DATA"], src.market.source),
    gate(3, "Live option chain", ["UPSTOX_NOT_CONNECTED", "INSUFFICIENT_OPTION_CHAIN"],`${src.optionChain.source} · ${s.chain.length} strikes`),
    gate(4, "Technical warmup", ["INSUFFICIENT_TECHNICAL_DATA", "INSUFFICIENT_FRESHNESS"], s.indicators ? "indicators ready" : null),
    fCheck(5, "Technical analysis", "technical"),
    fCheck(6, "Market structure", "trend"),
    fCheck(7, "Option chain / OI", "oi"),
    fCheck(8, "Volatility", "iv"),
    { stage: 9, name: "Support / resistance", status: "PASS", reason: `S ${a.chain.support} · R ${a.chain.resistance}` },
    { stage: 10, name: "News / event risk", status: eventBlocking ? "BLOCKED" : has("SIGNAL_CONFLICT").length ? "BLOCKED" : factor("news")?.available ? "PASS" : "WARN",
      reason: eventBlocking ? `Event risk: ${ev?.level ?? s.news.eventRisk ?? a.regime}` : has("SIGNAL_CONFLICT")[0]?.message ?? factor("news")?.notes[0]?.text ?? null },
    { stage: 11, name: "Strategy candidates", status: candidatesEvaluated ? (has("INSUFFICIENT_SCORE").length ? "BLOCKED" : "PASS") : has("NO_VALID_STRATEGY", "MARKET_REGIME_BLOCKED").length ? "BLOCKED" : "NOT_EVALUATED",
      reason: candidatesEvaluated ? `${a.candidates.length} candidate(s); best ${best.strategy} ${best.score}/100` : has("NO_VALID_STRATEGY", "MARKET_REGIME_BLOCKED")[0]?.message ?? null },
    candidatesEvaluated ? gate(12, "Risk validation", ["RISK_LIMIT_BLOCKED", "DAILY_LOSS_LIMIT", "OPEN_RISK_LIMIT", "MAX_CONCURRENT_POSITIONS", "POSITION_SIZE_ZERO", "LOT_SIZE_UNAVAILABLE", "WIDE_BID_ASK", "INSUFFICIENT_LIQUIDITY", "NO_VALID_OPTION"])
      : { stage: 12, name: "Risk validation", status: "NOT_EVALUATED", reason: "no candidate" },
    candidatesEvaluated ? gate(13, "Risk : reward", ["RISK_REWARD_TOO_LOW"], `1:${best.rr}`) : { stage: 13, name: "Risk : reward", status: "NOT_EVALUATED", reason: "no candidate" },
    rec.contract ? gate(14, "Instrument identity", ["OPTION_INSTRUMENT_ID_UNAVAILABLE"], rec.contract.instrumentKey) : { stage: 14, name: "Instrument identity", status: "NOT_EVALUATED", reason: "no executable plan" },
    { stage: 15, name: "Final recommendation", status: finalDecision === "TRADE" ? "PASS" : "BLOCKED", reason: finalDecision },
  ];

  const candidates: CandidatePreview[] = a.candidates.map((c) => {
    const codes = candidateCodes(c);
    const executable = finalDecision === "TRADE" && a.plan?.strategy === c.strategy;
    const globalCodes = finalBlockers.filter((b) => !b.source.startsWith("candidate:")).map((b) => b.code);
    return {
      strategy: c.strategy,
      direction: a.bias === "BULLISH" ? "BULLISH" : a.bias === "BEARISH" ? "BEARISH" : "NEUTRAL",
      score: c.score, entry: c.entry, stop: c.stop, target1: c.target1, target2: c.target2, rr: c.rr,
      legs: c.legs.map((l) => {
        const row = s.chain.find((r) => r.strike === l.strike);
        const q = row ? (l.type === "CE" ? row.call : row.put) : null;
        return { side: l.side, type: l.type, strike: l.strike, ltp: l.ltp, instrumentKey: q?.instrumentKey ?? null };
      }),
      executable,
      blockedBy: executable ? [] : [...new Set([...globalCodes, ...codes])],
      rejection: c.rejected,
    };
  });

  const blockingCodes = [...new Set(finalBlockers.map((b) => b.code))];
  const onlyEvent = blockingCodes.length > 0 && blockingCodes.every((c) => c === "EVENT_RISK" || c === "HIGH_EVENT_RISK");
  const candidateSummary = !a.candidates.length
    ? `No valid strategy candidate generated (regime ${a.regime}, score ${a.total}).`
    : onlyEvent ? "The strategy generated a candidate, but the event-risk safety gate prevented execution."
    : `${a.candidates.length} candidate(s) generated; ${candidates.filter((c) => c.executable).length} executable.`;

  const fresh = (k: keyof typeof src) => src[k].source;
  const overall = isMock ? "MOCK" : isEod ? "END_OF_DAY" : Object.values(src).some((x) => x.source === "STALE") ? "STALE" : src.market.source === "LIVE" ? "LIVE" : src.market.source;

  return {
    underlying: s.index === "nifty" ? "NIFTY" : "BANKNIFTY",
    evaluatedAt: now.toISOString(),
    strategyVersion: STRATEGY_VERSION.strategyVersion,
    marketStatus: mkt,
    dataSource: src.market.source,
    fallbackReason: s.fallbackReason,
    upstox,
    freshness: { spot: fresh("market"), optionChain: fresh("optionChain"), technicals: fresh("technical"), news: fresh("news"), breadth: fresh("breadth"), overall },
    engineDecision,
    finalDecision,
    eligible: isRecommendationEligible({ finalDecision, blockers: finalBlockers }),
    blockers: finalBlockers,
    warnings,
    checks,
    candidates,
    candidateSummary,
    requiredScore: MIN_STRATEGY_SCORE,
    eventRisk: { level: ev?.level ?? (s.news.eventRisk ? "HIGH" : "NONE"), reason: ev?.reason ?? s.news.eventRisk, articles: s.news.detail?.articleCount ?? null, blocking: eventBlocking },
    historicalDataBlocksLive: false,
    summary: finalDecision === "TRADE"
      ? `${a.plan?.strategy} is eligible (paper trade only).`
      : `${finalDecision}: ${blockingCodes.length} blocking condition(s) — ${blockingCodes.join(", ") || "none classified"}.`,
  };
}

// Live eligibility depends only on live gates. Historical-data warnings are deliberately not inputs.
export function isRecommendationEligible(d: Pick<RecommendationDiagnostic, "finalDecision" | "blockers">): boolean {
  return d.finalDecision === "TRADE" && d.blockers.length === 0;
}
