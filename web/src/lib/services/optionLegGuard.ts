// Per-leg verification guard (Issue 2 / B3–B7).
// Every leg of a proposed options recommendation must (a) sit inside the verified ATM ±N candidate window, and
// (b) have its own contract quote LIVE and independently price-consistent. Otherwise the recommendation is blocked
// with a reason for each rejected leg. Pure: reads the snapshot, changes nothing.
//
// Applicability: the guard runs only when the snapshot carries the live chain's price verification. Snapshots without
// it (mock or fixture data) are reported as not applicable; they are never live recommendations.
import type { OptionRow, Snapshot } from "../types.ts";
import { candidateWindow, CANDIDATE_MAX_STRIKES_ATM } from "./optionCandidateWindow.ts";

export interface PlanLeg {
  side: "BUY" | "SELL";
  type: "CE" | "PE";
  strike: number;
}

export interface LegVerdict extends PlanLeg {
  instrumentKey: string | null;
  ok: boolean;
  reason: string | null;
}

export interface LegGuardResult {
  applicable: boolean;
  atmStrike: number | null;
  maxStrikesAtm: number;
  windowStrikes: number[];
  verdicts: LegVerdict[];
  blockers: string[];   // one NO_VALID_OPTION line per rejected leg; empty when every leg passes
}

export function checkPlanLegs(s: Snapshot, legs: PlanLeg[]): LegGuardResult {
  if (!s.optionPriceVerification || !s.chain.length) {
    return { applicable: false, atmStrike: null, maxStrikesAtm: CANDIDATE_MAX_STRIKES_ATM, windowStrikes: [], verdicts: [], blockers: [] };
  }
  const win = candidateWindow(s.chain, s.spot, CANDIDATE_MAX_STRIKES_ATM);
  const verdicts: LegVerdict[] = legs.map((leg) => {
    const row: OptionRow | undefined = s.chain.find((r) => r.strike === leg.strike);
    const q = row ? (leg.type === "CE" ? row.call : row.put) : null;
    let reason: string | null = null;
    if (!row) reason = `strike ${leg.strike} is not in the option chain`;
    else if (!win.strikeSet.has(leg.strike)) reason = `strike ${leg.strike} is outside the verified ATM ±${CANDIDATE_MAX_STRIKES_ATM} window (ATM ${win.atmStrike})`;
    else if (!q?.instrumentKey) reason = "canonical instrument key is missing";
    else if (q.contractPriceQuality !== "CONTRACT_PRICE_LIVE") reason = `contract quote is ${q.contractPriceQuality ?? "UNVERIFIED"}`;
    else if (q.ltpConsistent !== true) reason = "independent LTP check did not confirm the chain price";
    else if (!q.lastTradeTime) reason = "no exchange last-trade time";
    return { ...leg, instrumentKey: q?.instrumentKey ?? null, ok: reason === null, reason };
  });
  const blockers = verdicts
    .filter((v) => !v.ok)
    .map((v) => `NO_VALID_OPTION: ${v.side} ${v.type} ${v.strike} leg rejected — ${v.reason}`);
  return { applicable: true, atmStrike: win.atmStrike, maxStrikesAtm: CANDIDATE_MAX_STRIKES_ATM, windowStrikes: win.strikes, verdicts, blockers };
}
