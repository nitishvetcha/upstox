import type { PaperOpportunity } from "./services/paperOpportunityStore.ts";

export type PriceFreshness = "FRESH" | "AGING" | "STALE" | "UNAVAILABLE";

export interface OpportunityMonitoringView {
  currentPrice: number | null;
  currentPnlPerUnit: number | null;
  currentR: number | null;
  stopDistancePct: number | null;
  target1DistancePct: number | null;
  target2DistancePct: number | null;
  priceAgeSeconds: number | null;
  freshness: PriceFreshness;
}

const r2 = (value: number) => Math.round(value * 100) / 100;

export function monitoringView(opp: PaperOpportunity, now: Date): OpportunityMonitoringView {
  const currentPrice = Number.isFinite(opp.lastLivePrice) ? opp.lastLivePrice! : null;
  const parsedAt = opp.lastLivePriceAt ? Date.parse(opp.lastLivePriceAt) : NaN;
  const priceAgeSeconds = Number.isFinite(parsedAt) ? Math.max(0, Math.floor((now.getTime() - parsedAt) / 1000)) : null;
  const freshness: PriceFreshness = priceAgeSeconds === null ? "UNAVAILABLE"
    : priceAgeSeconds <= 60 ? "FRESH"
    : priceAgeSeconds <= 180 ? "AGING"
    : "STALE";
  const sign = opp.direction === "BEARISH" ? -1 : 1;
  const pnl = currentPrice === null ? null : sign * (currentPrice - opp.entry);
  const distance = (level: number) => currentPrice && currentPrice > 0 ? r2(Math.abs(level - currentPrice) / currentPrice * 100) : null;
  return {
    currentPrice,
    currentPnlPerUnit: pnl === null ? null : r2(pnl),
    currentR: pnl === null || !(opp.riskPerUnit > 0) ? null : r2(pnl / opp.riskPerUnit),
    stopDistancePct: distance(opp.stop),
    target1DistancePct: distance(opp.target1),
    target2DistancePct: distance(opp.target2),
    priceAgeSeconds,
    freshness,
  };
}
