// Phase 14 — one live evaluation of NIFTY and BANK NIFTY right after login (no polling, nothing journaled).
// Uses the same snapshot → frozen engine → diagnostic path as every page; it only summarizes the result.
import type { IndexId, Snapshot } from "./types.ts";
import { getSnapshot } from "./services/market.ts";
import { analyze } from "./engine/strategy.ts";
import { diagnose, type FinalDecision } from "./recommendationDiagnostic.ts";

export interface IndexEvaluation {
  underlying: "NIFTY" | "BANKNIFTY";
  spot: number;
  spotSource: string;
  optionChainSource: string;
  strikes: number;
  lotSize: number | null;
  instrumentKeys: number; // chain sides carrying a provider instrument key
  analysis: "READY" | "ERROR";
  decision: FinalDecision | "ERROR";
  blockers: string[];
  error: string | null;
}

export async function evaluateIndex(index: IndexId, snap: (i: IndexId) => Promise<Snapshot> = getSnapshot, now = new Date()): Promise<IndexEvaluation> {
  const underlying = index === "nifty" ? "NIFTY" : "BANKNIFTY";
  try {
    const s = await snap(index);
    const d = diagnose(analyze(s, now), now);
    return {
      underlying,
      spot: s.spot,
      spotSource: s.fallbackReason ? `MOCK (${s.fallbackReason})` : s.sources.market.source,
      optionChainSource: s.fallbackReason ? "MOCK" : s.sources.optionChain.source,
      strikes: s.chain.length,
      lotSize: s.lotSize ?? null,
      instrumentKeys: s.chain.reduce((n, r) => n + (r.call.instrumentKey ? 1 : 0) + (r.put.instrumentKey ? 1 : 0), 0),
      analysis: "READY",
      decision: d.finalDecision,
      blockers: [...new Set(d.blockers.map((b) => b.code))],
      error: null,
    };
  } catch (e) {
    return { underlying, spot: 0, spotSource: "ERROR", optionChainSource: "ERROR", strikes: 0, lotSize: null, instrumentKeys: 0,
      analysis: "ERROR", decision: "ERROR", blockers: [], error: (e as Error).message };
  }
}

export async function evaluateBoth(snap?: (i: IndexId) => Promise<Snapshot>, now?: Date): Promise<IndexEvaluation[]> {
  return [await evaluateIndex("nifty", snap, now), await evaluateIndex("banknifty", snap, now)];
}

const dots = (label: string, w = 14) => `${label} ${".".repeat(Math.max(2, w - label.length))}`;

export function evaluationLines(evals: IndexEvaluation[]): string[] {
  const name = (e: IndexEvaluation) => (e.underlying === "NIFTY" ? "NIFTY" : "BANK NIFTY");
  return [
    ...evals.map((e) => `[MARKET] ${dots(name(e))} ${e.spotSource}`),
    ...evals.map((e) => `[OPTIONS] ${dots(name(e))} ${e.optionChainSource} · ${e.strikes} strikes · lot ${e.lotSize ?? "?"} · ${e.instrumentKeys} keys`),
    ...evals.map((e) => `[ANALYSIS] ${dots(name(e))} ${e.analysis}${e.error ? ` (${e.error})` : ""}`),
    ...evals.map((e) => `[RECOMMENDATION] ${dots(name(e))} ${e.decision}${e.blockers.length ? ` — ${e.blockers.join(", ")}` : ""}`),
  ];
}
