// API response boundary for analysis results (F-R2 fix, outside the frozen strategy).
// The internal Analysis keeps every field for diagnostics. The PUBLIC response may carry actionable price levels
// (entry, stop, targets, quantity, risk/reward) only when status is TRADE. For WAIT and NO TRADE the plan is removed and
// every candidate is reduced to its name, score, rejection reason and risk gate outcome, so a client cannot mistake a
// WAIT plan for an opportunity.
import type { Analysis, TradePlan } from "./types.ts";

export interface RedactedCandidate {
  strategy: TradePlan["strategy"];
  score: number;
  rejected: string | null;
  actionable: false;
  risk: { status: string; allowed: boolean; reasons: string[]; humanReasons: string[] } | null;
}

export function redactCandidate(c: TradePlan): RedactedCandidate {
  return {
    strategy: c.strategy,
    score: c.score,
    rejected: c.rejected,
    actionable: false,
    risk: c.risk ? { status: c.risk.status, allowed: c.risk.allowed, reasons: c.risk.reasons, humanReasons: c.risk.humanReasons } : null,
  };
}

export function toApiAnalysis(a: Analysis): Record<string, unknown> {
  const actionable = a.status === "TRADE" && a.plan !== null;
  const { plan, candidates, ...rest } = a;
  return {
    ...rest,
    actionable,
    plan: actionable ? plan : null,
    candidates: candidates.map(redactCandidate),
  };
}
