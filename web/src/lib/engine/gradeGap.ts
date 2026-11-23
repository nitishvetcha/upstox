import type { OpportunityGrade } from "./opportunityEngine";

interface GradeThreshold {
  grade: OpportunityGrade;
  score: number;
  rr: number;
  confidence: number; // 0-100
}

const THRESHOLDS: GradeThreshold[] = [
  { grade: "A+", score: 75, rr: 2.0, confidence: 70 },
  { grade: "A",  score: 65, rr: 1.5, confidence: 60 },
  { grade: "B",  score: 50, rr: 1.2, confidence: 50 },
  { grade: "C",  score: 40, rr: 1.0, confidence: 0  },
];

export interface GradeGap {
  nextGrade: OpportunityGrade;
  scoreDelta: number;    // positive = need this many more points
  rrDelta: number;       // positive = need this much more R:R
  confDelta: number;     // positive = need this many more confidence points
  scoreOk: boolean;
  rrOk: boolean;
  confOk: boolean;
}

/** Returns what it would take to reach the next grade up, or null if already A+. */
export function gradeGap(
  grade: OpportunityGrade,
  score: number,
  rr: number,
  confidence: number, // 0-100
): GradeGap | null {
  const idx = THRESHOLDS.findIndex((t) => t.grade === grade);
  if (idx <= 0) return null; // already A+ or unknown
  const next = THRESHOLDS[idx - 1];
  return {
    nextGrade: next.grade,
    scoreDelta: Math.max(0, next.score - score),
    rrDelta: Math.max(0, next.rr - rr),
    confDelta: Math.max(0, next.confidence - confidence),
    scoreOk: score >= next.score,
    rrOk: rr >= next.rr,
    confOk: confidence >= next.confidence,
  };
}

const WEIGHT_LABELS: Record<string, { label: string; max: number }> = {
  underlying_direction: { label: "Trend / direction",    max: 30 },
  oi_intelligence:      { label: "OI intelligence",      max: 12 },
  sr_room:              { label: "S/R room",             max: 10 },
  liquidity:            { label: "Liquidity",            max: 15 },
  delta:                { label: "Delta fit",            max: 10 },
  iv_attractiveness:    { label: "IV attractiveness",    max: 10 },
  rr_quality:           { label: "R:R quality",          max: 8  },
  expected_move_fit:    { label: "Expected move fit",    max: 5  },
  event_penalty:        { label: "Event penalty",        max: 0  }, // negative component
};

export interface BreakdownRow {
  key: string;
  label: string;
  earned: number;
  max: number;
  pct: number; // 0-100, capped
}

export function scoreBreakdownRows(breakdown: Record<string, number>): BreakdownRow[] {
  return Object.entries(breakdown).map(([key, earned]) => {
    const meta = WEIGHT_LABELS[key] ?? { label: key, max: 10 };
    const max = meta.max;
    return {
      key,
      label: meta.label,
      earned,
      max,
      pct: max > 0 ? Math.max(0, Math.min(100, (earned / max) * 100)) : 0,
    };
  }).sort((a, b) => b.max - a.max); // biggest-weight components first
}
