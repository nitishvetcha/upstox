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

const ACTIONABLE = new Set<OpportunityGrade>(["A+", "A", "B"]);
const GRADE_RANK: Record<OpportunityGrade, number> = { "A+": 4, A: 3, B: 2, C: 1, REJECT: 0 };

/** One authoritative cross-engine policy. C and REJECT are diagnostics/watch-only, never recommendations. */
export function selectBestRecommendation<T>(candidates: RecommendationCandidate<T>[]): BestRecommendation<T> {
  const actionable = candidates.filter((candidate) => ACTIONABLE.has(candidate.grade));
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
        : "No Grade A+, A, or B candidate passed the recommendation gates; Grade C and REJECT remain watch-only.",
    };
  }
  return { status: "RECOMMENDATION", candidate: actionable[0], watchOnlyCount };
}
