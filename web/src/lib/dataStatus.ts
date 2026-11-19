import type { Snapshot } from "./types";

export type DataLabel = "LIVE DATA" | "END OF DAY" | "PARTIAL LIVE DATA" | "MOCK DATA" | "MOCK FALLBACK";

// One honest global label: LIVE only when every subsystem of every index is live.
export function dataLabel(snaps: Snapshot[]): DataLabel {
  if (snaps.some((s) => s.fallbackReason)) return "MOCK FALLBACK";
  const all = snaps.flatMap((s) => Object.values(s.sources).map((x) => x.source));
  if (all.every((x) => x === "MOCK")) return "MOCK DATA";
  // Market closed: all price sources are END_OF_DAY (news stays LIVE — expected and correct).
  const priceSources = snaps.flatMap((s) => [s.sources.market.source, s.sources.optionChain.source]);
  if (priceSources.length > 0 && priceSources.every((x) => x === "END_OF_DAY")) return "END OF DAY";
  // LIVE only if every input is live AND real news is current (STALE news is real but not usable).
  const newsCurrent = snaps.every((s) => !s.news.status || s.news.status === "LIVE" || s.news.status === "AGING");
  // Breadth is a required score input too. Only fully LIVE breadth keeps the label LIVE: PARTIAL coverage, STALE,
  // END_OF_DAY and UNAVAILABLE all show as partial. Presentation only; the engine still accepts PARTIAL breadth.
  const breadthOk = snaps.every((s) => s.breadth !== null && s.breadth.status === "LIVE");
  if (all.every((x) => x === "LIVE") && newsCurrent && breadthOk) return "LIVE DATA";
  return "PARTIAL LIVE DATA";
}
