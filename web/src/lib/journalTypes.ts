// Phase 11.3 / 11.4 — Recommendation Journal types.
// The journal entry wraps the immutable RecommendationResponse snapshot plus lifecycle state.
import type { RecommendationResponse } from "./recommendationEnricher.ts";

export type JournalStatus =
  | "MONITORING"
  | "TARGET_1_HIT"
  | "TARGET_2_HIT"
  | "STOPPED_OUT"
  | "EXPIRED"
  | "INVALIDATED"
  | "CANCELLED"
  | "NOT_EXECUTABLE";

export type ExitReason =
  | "STOP_LOSS"
  | "TARGET_1"
  | "TARGET_2"
  | "EXPIRY"
  | "INVALIDATED"
  | "MANUAL_PAPER_EXIT";

export interface RecommendationOutcome {
  status: JournalStatus;
  exitPrice: number | null;
  exitTimestamp: string | null;
  exitReason: ExitReason | null;
  /** Highest option price observed after entry */
  highestPrice: number | null;
  /** Lowest option price observed after entry */
  lowestPrice: number | null;
  /** Maximum Favorable Excursion (absolute, premium terms) */
  mfe: number | null;
  /** Maximum Adverse Excursion (absolute, premium terms) */
  mae: number | null;
  /** Net P&L in INR */
  pnl: number | null;
  pnlPercent: number | null;
  /** R-multiple: pnl / plannedRisk */
  rMultiple: number | null;
  durationMinutes: number | null;
  target1HitAt: string | null;
  target2HitAt: string | null;
  lastRefreshedAt: string | null;
}

/** Phase 11.4 — frozen strategy/risk version identifiers stored in every journal entry. */
export interface StrategyVersionInfo {
  /** e.g. "11.4-frozen" — bumped only on intentional strategy changes */
  strategyVersion: string;
  /** e.g. "production-default" — identifies the risk config profile */
  riskVersion: string;
  /** e.g. "paper-v1" — execution simulation model */
  executionModelVersion: string;
  /** e.g. "live-v1" — data pipeline version */
  dataModelVersion: string;
}

export interface RecommendationJournalEntry {
  /** Same as RecommendationResponse.recommendationId — the canonical ID */
  id: string;
  createdAt: string;
  /** Immutable snapshot — never modified after creation */
  snapshot: RecommendationResponse;
  /** Current lifecycle status */
  status: JournalStatus;
  /** Set when the user clicks Paper Trade for a TRADE recommendation */
  paperTradeId: string | null;
  /** Outcome — appended after creation, snapshot fields never changed */
  outcome: RecommendationOutcome | null;
  /** Phase 11.4 — version identifiers at time of generation; optional for backward compat with older records */
  versionInfo?: StrategyVersionInfo;
}

/** Canonical frozen version string for the current strategy. Increment only on intentional changes. */
export const STRATEGY_VERSION: StrategyVersionInfo = {
  strategyVersion: "11.4-frozen",
  riskVersion: "production-default",
  executionModelVersion: "paper-v1",
  dataModelVersion: "live-v1",
};
