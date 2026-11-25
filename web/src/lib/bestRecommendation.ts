import type { OpportunityGrade } from "./engine/opportunityEngine.ts";

export type RecommendationEngine = "OPTIONS" | "STOCK_INTRADAY";

export interface RecommendationCandidate<T = unknown> {
  engine: RecommendationEngine;
  grade: OpportunityGrade;
  score: number;
  netRewardToRisk: number | null;
  item: T;
}

export type BestRecommendation<T = unknown> =
  | { status: "RECOMMENDATION"; candidate: RecommendationCandidate<T>; watchOnlyCount: number }
  | { status: "NO_TRADE"; candidate: null; watchOnlyCount: number; reason: string };

// Grade A+, A, and B are eligible only when net R:R >= 1.5x. Below 1.5x is strictly watch-only.
const ACTIONABLE_GRADES = new Set<OpportunityGrade>(["A+", "A", "B"]);
export const MIN_ACTIONABLE_NET_RR = 1.5;
const GRADE_RANK: Record<OpportunityGrade, number> = { "A+": 4, A: 3, B: 2, C: 1, REJECT: 0 };

/** One authoritative cross-engine policy. C, REJECT, and candidates with Net R:R < 1.5x are watch-only. */
export function selectBestRecommendation<T>(candidates: RecommendationCandidate<T>[]): BestRecommendation<T> {
  const actionable = candidates.filter(
    (candidate) =>
      ACTIONABLE_GRADES.has(candidate.grade) &&
      candidate.netRewardToRisk !== null &&
      Number.isFinite(candidate.netRewardToRisk) &&
      candidate.netRewardToRisk >= MIN_ACTIONABLE_NET_RR,
  );
  const watchOnlyCount = candidates.length - actionable.length;
  actionable.sort((a, b) =>
    GRADE_RANK[b.grade] - GRADE_RANK[a.grade]
    || b.score - a.score
    || (b.netRewardToRisk ?? -1) - (a.netRewardToRisk ?? -1)
    || a.engine.localeCompare(b.engine),
  );
  if (actionable.length === 0) {
    return {
      status: "NO_TRADE",
      candidate: null,
      watchOnlyCount,
      reason: candidates.length === 0
        ? "No candidates were produced by the active engines."
        : `No candidate met actionable criteria (Grade A+/A/B with post-tax Net R:R >= ${MIN_ACTIONABLE_NET_RR}x); remaining ${watchOnlyCount} candidates are watch-only.`,
    };
  }
  return { status: "RECOMMENDATION", candidate: actionable[0], watchOnlyCount };
}
