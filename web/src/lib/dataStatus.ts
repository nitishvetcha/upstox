import type { Snapshot } from "./types";

export type DataLabel = "LIVE DATA" | "END OF DAY" | "PARTIAL LIVE DATA" | "MOCK DATA" | "MOCK FALLBACK";

const COMMODITIES = new Set(["crudeoil", "naturalgas", "goldm", "silverm"]);

// One honest global label: LIVE only when every required subsystem of every active underlying is live.
export function dataLabel(snaps: Snapshot[]): DataLabel {
  if (snaps.some((s) => s.fallbackReason)) return "MOCK FALLBACK";
  const all = snaps.flatMap((s) => Object.values(s.sources).map((x) => x.source));
  if (all.every((x) => x === "MOCK")) return "MOCK DATA";
  // Market closed: all price sources are END_OF_DAY (news stays LIVE — expected and correct).
  const priceSources = snaps.flatMap((s) => [s.sources.market.source, s.sources.optionChain.source]);
  if (priceSources.length > 0 && priceSources.every((x) => x === "END_OF_DAY")) return "END OF DAY";

  const newsCurrent = snaps.every((s) => !s.news.status || s.news.status === "LIVE" || s.news.status === "AGING");

  const allSatisfied = snaps.every((s) => {
    const isComm = COMMODITIES.has(s.index);
    const isBankex = s.index === "bankex";
    // Commodities and BANKEX naturally lack equity constituent breadth; goldm/silverm lack standard option chains.
    if (isComm || isBankex) {
      const marketLive = s.sources.market.source === "LIVE";
      const chainRequired = s.index !== "goldm" && s.index !== "silverm";
      const chainOk = !chainRequired || s.sources.optionChain.source === "LIVE";
      return marketLive && chainOk;
    }
    const subSources = Object.values(s.sources).map((x) => x.source);
    const breadthOk = s.breadth !== null && s.breadth.status === "LIVE";
    return subSources.every((x) => x === "LIVE") && breadthOk;
  });

  if (allSatisfied && newsCurrent) return "LIVE DATA";
  return "PARTIAL LIVE DATA";
}
