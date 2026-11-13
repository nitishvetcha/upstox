// Display-only provenance labels. Pure functions. They never feed the engine: the engine's breadth status and
// evidence eligibility are unchanged (Option A, owner-approved 2026-11-13).
export type DisplayLabel = "MOCK" | "BACKTEST" | "HISTORICAL" | "LIVE" | "DELAYED" | "STALE" | "UNAVAILABLE";

export interface SourceLike { source?: string | null; provider?: string | null }

// Breadth label for display. Synthetic (MOCK) source always shows MOCK, whatever the engine's internal status says.
// A backtest source shows BACKTEST. LIVE is only shown for a LIVE source from a live provider.
export function breadthDisplayLabel(engineStatus: string | null | undefined, src: SourceLike | null | undefined): DisplayLabel {
  const s = src?.source ?? null;
  const p = src?.provider ?? null;
  if (s === "MOCK" || p === "MOCK") return "MOCK";
  if (s === "END_OF_DAY") return "HISTORICAL";
  if (s === "BACKTEST" || s === "HISTORICAL") return "BACKTEST";
  if (s === "UNAVAILABLE" || engineStatus === "UNAVAILABLE") return "UNAVAILABLE";
  if (s === "STALE" || engineStatus === "STALE") return "STALE";
  if (s === "DELAYED") return "DELAYED";
  if (s === "LIVE" && p === "UPSTOX") return "LIVE";
  return "UNAVAILABLE";
}

// Map a backtest DataQualityLabel string to a display label. Only verified real-time data may read LIVE; a
// backtest input can never read LIVE.
export function dataQualityDisplayLabel(label: string | null | undefined): DisplayLabel {
  const l = (label ?? "").toUpperCase();
  if (l.includes("MOCK") || l.includes("SYNTHETIC") || l.includes("MODEL")) return "MOCK";
  if (l.includes("HISTORICAL") || l.includes("BACKTEST") || l.includes("RECONSTRUCTED") || l.includes("MEASURED")) return "BACKTEST";
  if (l.includes("LIVE")) return "LIVE";
  return "UNAVAILABLE";
}

// Labels for every input of a backtest result, from fields the result already contains. Read-only.
export function backtestDisplayProvenance(dq: Record<string, unknown> | null | undefined): Record<string, DisplayLabel> {
  const keys = ["spot", "technicals", "breadth", "optionData", "bidAsk", "oi", "iv", "greeks", "news", "eventRisk", "execution"] as const;
  const out: Record<string, DisplayLabel> = {};
  for (const k of keys) out[k] = dataQualityDisplayLabel(typeof dq?.[k] === "string" ? (dq[k] as string) : null);
  return out;
}
