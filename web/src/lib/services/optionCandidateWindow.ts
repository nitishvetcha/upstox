// The single definition of the options candidate window (Issue 2 / B3–B7).
// The options engine's candidate selection, the chain verifier's window summary and the per-leg guard all call this,
// so they cannot disagree about which strikes are selectable.
import type { OptionRow } from "../types.ts";
import { atmStrike } from "./optionChainAnalytics.ts";

// Engine candidate width: contracts within this many listed strikes of ATM (either side).
export const CANDIDATE_MAX_STRIKES_ATM = 7;

export interface CandidateWindow {
  atmStrike: number;
  maxStrikesAtm: number;
  strikes: number[];        // ascending
  strikeSet: Set<number>;
}

export function candidateWindow(rows: OptionRow[], spot: number, maxStrikesAtm = CANDIDATE_MAX_STRIKES_ATM): CandidateWindow {
  if (!rows.length) return { atmStrike: spot, maxStrikesAtm, strikes: [], strikeSet: new Set() };
  const strikeList = [...new Set(rows.map((r) => r.strike))].sort((a, b) => a - b);
  const atm = atmStrike(rows, spot);
  const atmIdx = strikeList.indexOf(atm);
  const strikes = strikeList.filter((_, i) => Math.abs(i - atmIdx) <= maxStrikesAtm);
  return { atmStrike: atm, maxStrikesAtm, strikes, strikeSet: new Set(strikes) };
}
