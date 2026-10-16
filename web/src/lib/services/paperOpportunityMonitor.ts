// Phase 23 — Paper opportunity monitor.
// Pure evaluation logic: takes an open opportunity + current market prices,
// returns whether a transition should occur.
// Idempotent: calling twice with the same inputs produces no duplicate events.
import type {
  PaperOpportunity,
  PaperOpportunityEvent,
  PaperStatus,
  DataSourceState,
} from "./paperOpportunityStore.ts";
import {
  TERMINAL_STATES,
  getPaperOpportunity,
  listPaperOpportunities,
  savePaperOpportunity,
} from "./paperOpportunityStore.ts";

const r2 = (n: number) => Math.round(n * 100) / 100;

// ── Fill convention ───────────────────────────────────────────────────────────
// Entry: use LTP (last traded price) as a proxy for conservative fill.
// Exit: same convention. Documented here so it's consistent across all trades.
export const FILL_CONVENTION = "LTP";

// ── Direction helpers ─────────────────────────────────────────────────────────

export interface EvalInput {
  currentPrice: number;          // option premium or stock price
  currentUnderlying?: number;    // spot price (optional, for thesis tracking)
  source?: DataSourceState;
  timestamp?: string;
}

export interface EvalResult {
  transitioned: boolean;
  toStatus: PaperStatus | null;
  reason: string;
  mfe: number;
  mae: number;
}

function isTargetHit(opp: PaperOpportunity, price: number): "T1" | "T2" | null {
  if (opp.instrumentType === "OPTION") {
    // Both CE and PE: premium rises when trade is profitable
    if (price >= opp.target2) return "T2";
    if (price >= opp.target1) return "T1";
  } else {
    // Stock
    if (opp.direction === "BULLISH") {
      if (price >= opp.target2) return "T2";
      if (price >= opp.target1) return "T1";
    } else {
      // BEARISH stock
      if (price <= opp.target2) return "T2";
      if (price <= opp.target1) return "T1";
    }
  }
  return null;
}

function isStopHit(opp: PaperOpportunity, price: number): boolean {
  if (opp.instrumentType === "OPTION") {
    return price <= opp.stop;
  }
  if (opp.direction === "BULLISH") return price <= opp.stop;
  return price >= opp.stop;
}

function isExpired(opp: PaperOpportunity): boolean {
  if (!opp.expiry) return false;
  return new Date() >= new Date(opp.expiry);
}

function calcMfe(opp: PaperOpportunity, price: number): number {
  // favorable excursion = how much in our direction from entry
  if (opp.instrumentType === "OPTION") {
    return Math.max(0, price - opp.entry);
  }
  if (opp.direction === "BULLISH") return Math.max(0, price - opp.entry);
  return Math.max(0, opp.entry - price);
}

function calcMae(opp: PaperOpportunity, price: number): number {
  // adverse excursion = how far against us from entry (positive = against us)
  if (opp.instrumentType === "OPTION") {
    return Math.max(0, opp.entry - price);
  }
  if (opp.direction === "BULLISH") return Math.max(0, opp.entry - price);
  return Math.max(0, price - opp.entry);
}

// Short stock profits when price falls. Options are always long premium (CE or PE), so they are not short.
function isShortStock(opp: Pick<PaperOpportunity, "instrumentType" | "direction">): boolean {
  return opp.instrumentType === "STOCK" && opp.direction === "BEARISH";
}

function pnlPerUnit(opp: PaperOpportunity, exitPrice: number): number {
  return isShortStock(opp) ? opp.entry - exitPrice : exitPrice - opp.entry;
}

// ── End-of-day lifecycle (intraday stocks) ─────────────────────────────────────────────
// Policy: an intraday stock position never carries overnight. After the close of the session in
// which it was opened it becomes:
//   EOD_EXIT     — simulated exit at the last exchange-verified LIVE price captured during that
//                  session (FILL_CONVENTION). Not a real fill.
//   EOD_UNPRICED — no verified LIVE price was captured that session. Closed with NO price; never
//                  priced from END_OF_DAY/after-hours quotes. Excluded from win/loss statistics.
const IST_MS = 5.5 * 3_600_000;

export function sessionCloseFor(openedAtIso: string): Date {
  const opened = new Date(openedAtIso);
  const istDate = new Date(opened.getTime() + IST_MS).toISOString().slice(0, 10);
  let close = new Date(`${istDate}T15:30:00+05:30`);
  if (opened >= close) close = new Date(close.getTime() + 86_400_000); // opened after hours → next close
  return close;
}

export function applyEndOfDay(opp: PaperOpportunity, now = new Date()): EvalResult | null {
  if (opp.status !== "OPEN" || opp.instrumentType !== "STOCK") return null;
  const closeAt = sessionCloseFor(opp.openedAt);
  if (now < closeAt) return null;

  const pricedAt = opp.lastLivePriceAt ?? null;
  const price = opp.lastLivePrice ?? null;
  const priced =
    price !== null && Number.isFinite(price) && price > 0 && pricedAt !== null &&
    pricedAt >= opp.openedAt && pricedAt <= closeAt.toISOString();

  const timestamp = now.toISOString();
  const toStatus: PaperStatus = priced ? "EOD_EXIT" : "EOD_UNPRICED";
  const reason = priced
    ? `session closed ${closeAt.toISOString()}: simulated exit at last verified LIVE price ${price} (${pricedAt})`
    : `session closed ${closeAt.toISOString()}: no verified LIVE price captured during the session — closed unpriced`;
  const realizedPnl = priced ? r2(pnlPerUnit(opp, price!)) : null;
  const realizedR = priced && opp.riskPerUnit > 0 ? r2(realizedPnl! / opp.riskPerUnit) : null;

  const event: PaperOpportunityEvent = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    opportunityId: opp.id,
    timestamp,
    fromStatus: "OPEN",
    toStatus,
    price: priced ? price : null,
    underlyingPrice: null,
    reason,
    source: priced ? "LIVE" : "UNAVAILABLE",
    metadata: { simulated: true, convention: FILL_CONVENTION, pricedAt, sessionClose: closeAt.toISOString() },
  };
  savePaperOpportunity({
    ...opp,
    updatedAt: timestamp,
    status: toStatus,
    closedAt: timestamp,
    exitPrice: priced ? price : null,
    exitReason: reason,
    realizedPnl,
    realizedR,
    durationSeconds: r2((now.getTime() - new Date(opp.openedAt).getTime()) / 1000),
    events: [...opp.events, event],
  });
  return { transitioned: true, toStatus, reason, mfe: opp.mfe ?? 0, mae: opp.mae ?? 0 };
}

// ── Main evaluate ─────────────────────────────────────────────────────────────

export function evaluatePaperOpportunity(
  opp: PaperOpportunity,
  input: EvalInput,
): EvalResult {
  if (TERMINAL_STATES.includes(opp.status)) {
    return { transitioned: false, toStatus: null, reason: "already terminal", mfe: opp.mfe ?? 0, mae: opp.mae ?? 0 };
  }

  const { currentPrice, source = "LIVE", timestamp = new Date().toISOString() } = input;
  const currentUnderlying = input.currentUnderlying ?? null;

  const newMfe = r2(Math.max(opp.mfe ?? 0, calcMfe(opp, currentPrice)));
  const newMae = r2(Math.max(opp.mae ?? 0, calcMae(opp, currentPrice)));

  // Update underlying MFE/MAE
  let newUnderlyingMfe = opp.underlyingMfe;
  let newUnderlyingMae = opp.underlyingMae;
  if (currentUnderlying !== null && opp.underlyingEntry !== null) {
    const uMove = opp.direction === "BEARISH"
      ? opp.underlyingEntry - currentUnderlying
      : currentUnderlying - opp.underlyingEntry;
    const uAdverse = -uMove;
    newUnderlyingMfe = r2(Math.max(opp.underlyingMfe ?? 0, Math.max(0, uMove)));
    newUnderlyingMae = r2(Math.max(opp.underlyingMae ?? 0, Math.max(0, uAdverse)));
  }

  // Check terminal conditions in priority order: expiry, target, stop
  let toStatus: PaperStatus | null = null;
  let reason = "";

  if (isExpired(opp)) {
    toStatus = "EXPIRED";
    reason = `expired at ${opp.expiry}`;
  } else {
    const targetHit = isTargetHit(opp, currentPrice);
    if (targetHit === "T2") {
      toStatus = "TARGET2_HIT";
      reason = `target2 reached: price ${currentPrice} >= target2 ${opp.target2}`;
    } else if (targetHit === "T1") {
      toStatus = "TARGET1_HIT";
      reason = `target1 reached: price ${currentPrice} >= target1 ${opp.target1}`;
    } else if (isStopHit(opp, currentPrice)) {
      toStatus = "STOP_HIT";
      reason = `stop reached: price ${currentPrice} <= stop ${opp.stop}`;
    }
  }

  // Always update MFE/MAE/underlying tracking (idempotent on same input)
  const mfeR = opp.riskPerUnit > 0 ? r2(newMfe / opp.riskPerUnit) : null;
  const maeR = opp.riskPerUnit > 0 ? r2(newMae / opp.riskPerUnit) : null;

  if (toStatus !== null) {
    const exitPrice = toStatus === "EXPIRED" ? currentPrice : currentPrice;
    const realizedPnl = r2(pnlPerUnit(opp, exitPrice));
    const realizedR = opp.riskPerUnit > 0 ? r2(realizedPnl / opp.riskPerUnit) : 0;
    const closedAt = timestamp;
    const durationSeconds = r2(
      (new Date(closedAt).getTime() - new Date(opp.openedAt).getTime()) / 1000,
    );

    const event: PaperOpportunityEvent = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      opportunityId: opp.id,
      timestamp,
      fromStatus: "OPEN",
      toStatus,
      price: currentPrice,
      underlyingPrice: currentUnderlying,
      reason,
      source,
      metadata: { mfe: newMfe, mae: newMae },
    };

    const updated: PaperOpportunity = {
      ...opp,
      updatedAt: timestamp,
      status: toStatus,
      closedAt,
      exitPrice,
      exitReason: reason,
      realizedPnl,
      realizedR,
      mfe: newMfe,
      mae: newMae,
      mfeR,
      maeR,
      underlyingExit: currentUnderlying,
      underlyingMfe: newUnderlyingMfe,
      underlyingMae: newUnderlyingMae,
      durationSeconds,
      ...(source === "LIVE" ? { lastLivePrice: currentPrice, lastLivePriceAt: timestamp } : {}),
      events: [...opp.events, event],
    };
    savePaperOpportunity(updated);
    return { transitioned: true, toStatus, reason, mfe: newMfe, mae: newMae };
  }

  // No transition — just update excursions
  const noTransition: PaperOpportunity = {
    ...opp,
    updatedAt: timestamp,
    mfe: newMfe,
    mae: newMae,
    mfeR,
    maeR,
    underlyingMfe: newUnderlyingMfe,
    underlyingMae: newUnderlyingMae,
    ...(source === "LIVE" ? { lastLivePrice: currentPrice, lastLivePriceAt: timestamp } : {}),
  };
  savePaperOpportunity(noTransition);
  return { transitioned: false, toStatus: null, reason: "no condition met", mfe: newMfe, mae: newMae };
}

// ── Batch monitor ─────────────────────────────────────────────────────────────

export function evaluateAllOpen(
  getPrice: (opp: PaperOpportunity) => EvalInput | null,
): { evaluated: number; transitioned: number } {
  const opps = listPaperOpportunities().filter((o) => o.status === "OPEN");
  let transitioned = 0;
  for (const opp of opps) {
    const input = getPrice(opp);
    if (!input) continue;
    const result = evaluatePaperOpportunity(opp, input);
    if (result.transitioned) transitioned++;
  }
  return { evaluated: opps.length, transitioned };
}

// ── Factory: create paper opportunity from engine output ──────────────────────

interface CreatePaperOpportunityInput {
  instrumentType: "OPTION" | "STOCK";
  underlying: string;
  symbol?: string | null;
  instrumentKey?: string | null;
  optionType?: "CE" | "PE" | null;
  strike?: number | null;
  expiry?: string | null;
  strategyType: string;
  direction: "BULLISH" | "BEARISH" | "NEUTRAL";
  entry: number;
  stop: number;
  target1: number;
  target2: number;
  spotAtEntry?: number | null;
  iv?: number | null;
  delta?: number | null;
  oi?: number | null;
  volume?: number | null;
  spread?: number | null;
  atr?: number | null;
  score: number;
  confidence: number;
  grade: import("../engine/opportunityEngine.ts").OpportunityGrade;
  signalAgreement?: number;
  regime: string;
  eventRisk?: string | null;
  reasons: string[];
  reasonCodes?: string[];
  strategyVersion: string;
  source: DataSourceState;
  provenance?: "LIVE_COLLECTOR" | "FIXTURE";
}

export function createPaperOpportunity(
  input: CreatePaperOpportunityInput,
): PaperOpportunity {
  const now = new Date().toISOString();
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  // Risk/reward are measured in the trade's favourable direction (short stock: stop above entry).
  const short = isShortStock(input);
  const riskPerUnit = r2(Math.max(short ? input.stop - input.entry : input.entry - input.stop, 0.01));
  const rewardToTarget1 = r2(short ? input.entry - input.target1 : input.target1 - input.entry);
  const rewardToTarget2 = r2(short ? input.entry - input.target2 : input.target2 - input.entry);
  const rrTarget1 = r2(rewardToTarget1 / riskPerUnit);
  const rrTarget2 = r2(rewardToTarget2 / riskPerUnit);

  return {
    id,
    createdAt: now,
    updatedAt: now,
    source: input.source,
    instrumentType: input.instrumentType,
    underlying: input.underlying,
    symbol: input.symbol ?? null,
    instrumentKey: input.instrumentKey ?? null,
    optionType: input.optionType ?? null,
    strike: input.strike ?? null,
    expiry: input.expiry ?? null,
    strategyType: input.strategyType,
    direction: input.direction,
    entry: input.entry,
    stop: input.stop,
    target1: input.target1,
    target2: input.target2,
    riskPerUnit,
    rewardToTarget1,
    rewardToTarget2,
    rrTarget1,
    rrTarget2,
    spotAtEntry: input.spotAtEntry ?? null,
    iv: input.iv ?? null,
    delta: input.delta ?? null,
    oi: input.oi ?? null,
    volume: input.volume ?? null,
    spread: input.spread ?? null,
    atr: input.atr ?? null,
    score: input.score,
    confidence: input.confidence,
    grade: input.grade,
    signalAgreement: input.signalAgreement ?? 0,
    regime: input.regime,
    eventRisk: input.eventRisk ?? null,
    reasons: input.reasons,
    reasonCodes: input.reasonCodes ?? [],
    strategyVersion: input.strategyVersion,
    status: "OPEN",
    openedAt: now,
    closedAt: null,
    exitPrice: null,
    exitReason: null,
    realizedPnl: null,
    realizedR: null,
    mfe: 0,
    mae: 0,
    mfeR: null,
    maeR: null,
    underlyingEntry: input.spotAtEntry ?? null,
    underlyingExit: null,
    underlyingMfe: 0,
    underlyingMae: 0,
    durationSeconds: null,
    ...(input.provenance ? { provenance: input.provenance } : {}),
    events: [],
  };
}
