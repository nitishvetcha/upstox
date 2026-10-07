import type { Snapshot } from "./types";

export type DataLabel = "LIVE DATA" | "PARTIAL LIVE DATA" | "MOCK DATA" | "MOCK FALLBACK";

// One honest global label: LIVE only when every subsystem of every index is live.
export function dataLabel(snaps: Snapshot[]): DataLabel {
  if (snaps.some((s) => s.fallbackReason)) return "MOCK FALLBACK";
  const all = snaps.flatMap((s) => Object.values(s.sources).map((x) => x.source));
  if (all.every((x) => x === "MOCK")) return "MOCK DATA";
  // LIVE only if every input is live AND real news is current (STALE news is real but not usable).
  const newsCurrent = snaps.every((s) => !s.news.status || s.news.status === "LIVE" || s.news.status === "AGING");
  // Breadth is a required score input too; until it exists a live score is partial.
  const breadthOk = snaps.every((s) => s.breadth !== null && s.breadth.status !== "UNAVAILABLE");
  if (all.every((x) => x === "LIVE") && newsCurrent && breadthOk) return "LIVE DATA";
  return "PARTIAL LIVE DATA";
}
