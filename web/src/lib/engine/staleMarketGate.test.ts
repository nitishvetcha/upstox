// F1 regression: a market quote labelled STALE must never produce a TRADE, even when its fetchedAt is current.
// The strategy engine (strategy.ts) is frozen as Strategy 11.4 and is not modified; the gate is applied where the
// recommendation decision is made (recommendationEnricher) and in the risk gate (riskService). Fixtures only.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mockSnapshot } from "../services/mock.ts";
import { analyze } from "./strategy.ts";
import { evaluateTradeRisk } from "../services/risk/riskService.ts";
import { DEFAULT_RISK_CONFIG } from "../services/risk/riskConfig.ts";
import { hasMockInput } from "../services/mockInputs.ts";
import { buildRecommendationResponse } from "../recommendationEnricher.ts";
import type { Snapshot, TradePlan } from "../types.ts";

const NOW = new Date("2026-10-05T07:00:00Z");
const KEYS = ["market", "optionChain", "technical", "news", "breadth"] as const;
const CFG = { ...DEFAULT_RISK_CONFIG, accountCapital: 500_000 };
const STALE_MARKET = /STALE_MARKET/;

function labelled(over: (s: Snapshot) => void = () => {}): Snapshot {
  const s = structuredClone(mockSnapshot("nifty", NOW));
  for (const k of KEYS) s.sources[k] = { ...s.sources[k], source: "LIVE", provider: "UPSTOX", fetchedAt: NOW.toISOString() };
  s.fallbackReason = null;
  s.lotSize = 75;
  over(s);
  return s;
}
// Market quote whose exchange last trade is old (label STALE) but whose fetchedAt is the current time.
const staleQuoteFreshFetch = (s: Snapshot) => { s.sources.market = { ...s.sources.market, source: "STALE", fetchedAt: NOW.toISOString() }; };

function decide(s: Snapshot) {
  return buildRecommendationResponse(analyze(s, NOW, { accountCapital: 500_000 }, undefined), NOW);
}

function plan(over: Partial<TradePlan> = {}): TradePlan {
  return {
    strategy: "Long Call", legs: [], credit: false, entry: 10, entryZone: [9.9, 10.1], stop: 8, target1: 15, target2: 20,
    rr: 2.5, maxLoss: 10, maxProfit: null, breakevens: [], score: 70, rejected: null, ...over,
  } as TradePlan;
}

describe("recommendation decision: STALE market quote", () => {
  test("SM-1 STALE market label with current fetchedAt → decision is not TRADE, with an explicit STALE_MARKET blocker", () => {
    const rec = decide(labelled(staleQuoteFreshFetch));
    assert.notEqual(rec.decision, "TRADE");
    assert.equal(rec.decision, "NO_TRADE");
    assert.ok(rec.blockers.some((b) => STALE_MARKET.test(b)), `blockers: ${rec.blockers.join(" | ")}`);
  });

  test("SM-2 LIVE market label with current fetchedAt → no STALE_MARKET blocker (existing behaviour kept)", () => {
    const rec = decide(labelled());
    assert.ok(!rec.blockers.some((b) => STALE_MARKET.test(b)));
  });

  test("SM-3 UNAVAILABLE market → still NO_TRADE through the existing rejection, and not via the STALE blocker", () => {
    const rec = decide(labelled((s) => { s.sources.market = { ...s.sources.market, source: "UNAVAILABLE", fetchedAt: null }; }));
    assert.equal(rec.decision, "NO_TRADE");
    assert.ok(!rec.blockers.some((b) => STALE_MARKET.test(b)));
  });

  test("SM-4 MOCK market → mock safeguards intact: mock input is still caught and the recommendation is never executable", () => {
    const mock = mockSnapshot("nifty", NOW);
    assert.equal(hasMockInput(mock), true);
    const rec = decide(mock);
    assert.equal(rec.decision, "NO_TRADE");
    assert.ok(!rec.blockers.some((b) => STALE_MARKET.test(b)), "MOCK is not relabelled as STALE");
  });

  test("SM-5 a fresh option chain does not override a STALE market quote", () => {
    const rec = decide(labelled((s) => { staleQuoteFreshFetch(s); s.sources.optionChain = { ...s.sources.optionChain, source: "LIVE", fetchedAt: NOW.toISOString() }; }));
    assert.notEqual(rec.decision, "TRADE");
    assert.ok(rec.blockers.some((b) => STALE_MARKET.test(b)));
  });
});

describe("risk gate: STALE market quote", () => {
  test("RG-1 risk independently rejects a STALE market quote (STALE_PRICE) even with a current fetchedAt", () => {
    const r = evaluateTradeRisk(plan(), labelled(staleQuoteFreshFetch), undefined, CFG, NOW);
    assert.ok(r.reasons.includes("STALE_PRICE"), `reasons: ${r.reasons.join(",")}`);
    assert.equal(r.allowed, false);
  });

  test("RG-2 LIVE market with current fetchedAt is not rejected for staleness", () => {
    const r = evaluateTradeRisk(plan(), labelled(), undefined, CFG, NOW);
    assert.ok(!r.reasons.includes("STALE_PRICE"));
  });

  test("RG-3 UNAVAILABLE market is still rejected as STALE_PRICE (existing behaviour)", () => {
    const r = evaluateTradeRisk(plan(), labelled((s) => { s.sources.market = { ...s.sources.market, source: "UNAVAILABLE", fetchedAt: null }; }), undefined, CFG, NOW);
    assert.ok(r.reasons.includes("STALE_PRICE"));
  });

  test("RG-4 a fresh option chain does not override a STALE market quote in the risk gate", () => {
    const r = evaluateTradeRisk(plan(), labelled((s) => { staleQuoteFreshFetch(s); s.sources.optionChain = { ...s.sources.optionChain, source: "LIVE", fetchedAt: NOW.toISOString() }; }), undefined, CFG, NOW);
    assert.ok(r.reasons.includes("STALE_PRICE"));
    assert.equal(r.allowed, false);
  });
});
