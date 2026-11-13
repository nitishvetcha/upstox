// Server-side provenance for paper opportunities. Labels come ONLY from the server's own snapshot sources.
// Client-supplied labels are never read. Anything that is not verified LIVE is refused, and the reasons are returned.
export interface SourceLike { source?: string | null; provider?: string | null; fetchedAt?: string | null }
export interface SnapshotSourcesLike {
  market?: SourceLike | null;
  optionChain?: SourceLike | null;
  technical?: SourceLike | null;
  breadth?: { status?: string | null; source?: SourceLike | null } | null;
}

export interface ServerProvenance {
  ok: boolean;
  labels: Record<string, string>;
  reasons: string[];
  capturedAt: string | null;
}

const REQUIRED = ["market", "optionChain", "technical"] as const;

export function serverProvenance(sources: SnapshotSourcesLike | null | undefined): ServerProvenance {
  const reasons: string[] = [];
  const labels: Record<string, string> = {};
  const s = sources ?? {};
  for (const key of REQUIRED) {
    const src = s[key] as SourceLike | null | undefined;
    const label = src?.source ?? "UNAVAILABLE";
    labels[key] = src?.provider === "MOCK" ? "MOCK" : label;
    if (labels[key] !== "LIVE" || src?.provider === "MOCK") {
      reasons.push(`${key} is ${labels[key]} (must be verified LIVE)`);
    }
  }
  const breadthStatus = s.breadth?.status ?? "UNAVAILABLE";
  const breadthSrc = s.breadth?.source ?? null;
  labels.breadth = breadthSrc?.provider === "MOCK" ? "MOCK" : breadthStatus;
  if (labels.breadth !== "LIVE") reasons.push(`breadth is ${labels.breadth} (must be verified LIVE)`);
  const capturedAt = s.market?.fetchedAt ?? null;
  return { ok: reasons.length === 0, labels, reasons, capturedAt };
}
