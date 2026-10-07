// Breadth universe + thresholds.
// Constituents live in breadthConstituents.generated.ts, produced by scripts/sync-constituents.mjs:
//   membership from the NSE Indices constituent CSVs, instrument keys validated against the current
//   Upstox NSE instrument master. Re-run the script after any index rebalance or corporate action.
import type { IndexId } from "../types.ts";
import { BANK_NIFTY, NIFTY_50 } from "./breadthConstituents.generated.ts";

export { GENERATED_AT as CONSTITUENTS_GENERATED_AT } from "./breadthConstituents.generated.ts";

export interface ConstituentMeta {
  symbol: string;
  name: string;
  instrumentKey: string;
}

// A constituent moving less than this (in %) vs its previous close counts as UNCHANGED, so tiny
// prints around the close don't flip the count.
export const BREADTH_NEUTRAL_TOLERANCE_PCT = 0.05;
// Valid quotes / expected constituents (%) needed before breadth is used as a score input.
// Below it breadth is UNAVAILABLE; between this and 100% it is PARTIAL.
export const BREADTH_MIN_COVERAGE_PERCENT = 80;

export const NIFTY_50_CONSTITUENTS: ConstituentMeta[] = NIFTY_50.map(({ symbol, name, instrumentKey }) => ({ symbol, name, instrumentKey }));
export const BANK_NIFTY_CONSTITUENTS: ConstituentMeta[] = BANK_NIFTY.map(({ symbol, name, instrumentKey }) => ({ symbol, name, instrumentKey }));

export const INDEX_CONSTITUENTS: Record<IndexId, ConstituentMeta[]> = {
  nifty: NIFTY_50_CONSTITUENTS,
  banknifty: BANK_NIFTY_CONSTITUENTS,
};
