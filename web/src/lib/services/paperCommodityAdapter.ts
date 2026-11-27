import type { Analysis, Snapshot, TradePlan } from "../types.ts";
import type { ContractOpportunity } from "../engine/opportunityEngine.ts";
import type { PaperOpportunity } from "./paperOpportunityStore.ts";
import type { CommodityId } from "./instrumentRegistry.ts";

// Units per ₹1 move in the price quote (GOLDM quotes per 10g, SILVERM per 1kg), so paper quantity is in quoted units.
export const COMMODITY_PAPER_MULTIPLIER: Record<CommodityId, number> = {
  crudeoil: 100,
  naturalgas: 1250,
  goldm: 10,
  silverm: 5,
};

export function commodityFor(symbol: string): CommodityId | null {
  const id = symbol.trim().toLowerCase();
  return id in COMMODITY_PAPER_MULTIPLIER ? (id as CommodityId) : null;
}

// Wraps a commodity snapshot and one options-engine candidate as the TRADE analysis the paper engine accepts.
// Only single-leg long options are supported; spreads are not opened on the commodity path.
export function toPaperAnalysis(snapshot: Snapshot, c: ContractOpportunity, id: CommodityId): Analysis | null {
  if (c.strategyType !== "LONG_CALL" && c.strategyType !== "LONG_PUT") return null;
  const plan: TradePlan = {
    strategy: c.strategyType === "LONG_CALL" ? "Long Call" : "Long Put",
    legs: [{ side: "BUY", type: c.optionType, strike: c.strike, ltp: c.entry }],
    credit: false,
    entry: c.entry,
    entryZone: [c.entryLow, c.entryHigh],
    stop: c.stop,
    target1: c.target1,
    target2: c.target2,
    rr: c.rr,
    maxLoss: c.maxLoss,
    maxProfit: c.maxProfit ?? null,
    breakevens: [c.breakeven],
    score: c.opportunityScore,
    rejected: null,
  };
  const sized: Snapshot = { ...snapshot, lotSize: COMMODITY_PAPER_MULTIPLIER[id] };
  const confidence = { key: "options-engine-confidence", label: "Options engine confidence", available: true, score: c.confidence, weight: 100 };
  return { snapshot: sized, plan, status: "TRADE", candidates: [plan], factors: [confidence] } as unknown as Analysis;
}

export function matchCandidate(candidates: ContractOpportunity[], opp: PaperOpportunity): ContractOpportunity | null {
  return candidates.find((c) =>
    c.strike === opp.strike && c.optionType === opp.optionType && (c.expiry ?? null) === (opp.expiry ?? null),
  ) ?? null;
}
