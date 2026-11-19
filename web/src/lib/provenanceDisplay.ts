// Display rules for provenance labels (F7 G1-G5). Presentation only: none of these functions feeds a gate or a decision.
// Missing information is shown as UNKNOWN or UNAVAILABLE, never defaulted to UPSTOX or LIVE.
import { freshnessDisplayLabel } from "./freshnessLabel.ts";

export interface SourceLike { source: string; provider?: string | null }

// G1 + G4: the breadth badge. A MOCK or unavailable breadth source never shows LIVE.
export function breadthBadge(source: SourceLike | null | undefined, status: string | null | undefined): { text: string; tone: "neutral" | "warn" } {
  if (!source) return { text: "UNKNOWN", tone: "warn" };
  if (source.source === "MOCK") return { text: "MOCK", tone: "warn" };
  if (source.source === "UNAVAILABLE") return { text: "UNAVAILABLE", tone: "warn" };
  if (source.source !== "LIVE") return { text: freshnessDisplayLabel(source.source), tone: "warn" };
  const text = status ?? "UNAVAILABLE";
  return { text, tone: text === "LIVE" || text === "PARTIAL" ? "neutral" : "warn" };
}

// G4: the "Prices:" provider text. No default to UPSTOX or LIVE; a missing value is shown as UNKNOWN.
export function providerText(source: SourceLike | null | undefined): string {
  return source?.provider ?? "UNKNOWN";
}

// G3: one provider label across every subsystem of every snapshot. UPSTOX only when all known providers are UPSTOX;
// MOCK only when all are MOCK; MIXED when both appear; UNKNOWN when none is known.
export function sourceProviderLabel(providers: (string | null | undefined)[]): "UPSTOX" | "MOCK" | "MIXED" | "UNKNOWN" {
  const known = new Set(providers.filter((p): p is string => typeof p === "string" && p.length > 0));
  if (known.size === 0) return "UNKNOWN";
  if (known.size === 1) return known.has("UPSTOX") ? "UPSTOX" : known.has("MOCK") ? "MOCK" : "UNKNOWN";
  return "MIXED";
}

// G5: one data-source label for a set of results (e.g. the opportunity scans). Equal values give that value;
// different values give MIXED; no values give UNAVAILABLE.
export function summarizeSources(values: (string | null | undefined)[]): string {
  const known = [...new Set(values.filter((v): v is string => typeof v === "string" && v.length > 0))];
  if (known.length === 0) return "UNAVAILABLE";
  if (known.length === 1) return known[0];
  return "MIXED";
}
