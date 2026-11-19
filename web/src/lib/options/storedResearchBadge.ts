// Badge for one stored research row on the Options Engine page (F5).
// A stored row is historical research, never a current recommendation. Its label must say so.
// Display only: the decision and status come from the frozen evaluator and are not changed here.
export type BadgeTone = "bull" | "bear" | "warn" | "neutral";

export function storedResearchRowBadge(status: string): { text: string; tone: BadgeTone } {
  if (status === "RECOMMENDATION") {
    // Warn tone (amber), not bull (green): a stored round must not look like a live, tradeable signal.
    return { text: "STORED RESEARCH: RECOMMENDATION · NOT LIVE", tone: "warn" };
  }
  return { text: "NO TRADE", tone: "bear" };
}
