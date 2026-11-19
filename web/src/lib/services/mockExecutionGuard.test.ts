// Simulated inputs are never executable: the enricher downgrades them and the helper defines them. Offline.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mockSnapshotTradeInputs as mockSnapshot } from "../testFixtures/mockSnapshotTradeInputs.ts";
import { hasMockInput } from "./mockInputs.ts";
import { analyze } from "../engine/strategy.ts";
import { buildRecommendationResponse } from "../recommendationEnricher.ts";
import type { Snapshot } from "../types.ts";

const NOW = new Date("2026-10-05T07:00:00Z");
const KEYS = ["market", "optionChain", "technical", "news", "breadth"] as const;

function labelled(): Snapshot {
  const s = structuredClone(mockSnapshot("nifty", NOW));
  for (const k of KEYS) s.sources[k] = { ...s.sources[k], source: "LIVE", provider: "UPSTOX", fetchedAt: NOW.toISOString() };
  s.fallbackReason = null;
  s.lotSize = 75;
  return s;
}

test("MX-1. helper: a fallback, or any MOCK subsystem, is mock input; an all-LIVE snapshot is not", () => {
  assert.equal(hasMockInput(labelled()), false);
  assert.equal(hasMockInput(mockSnapshot("nifty", NOW)), true);
  const oneMock = labelled();
  oneMock.sources.optionChain = { ...oneMock.sources.optionChain, source: "MOCK", provider: "MOCK" };
  assert.equal(hasMockInput(oneMock), true);
  const fallback = labelled();
  fallback.fallbackReason = "UPSTOX_NOT_CONNECTED";
  assert.equal(hasMockInput(fallback), true);
});

test("MX-2. a mock snapshot can reach TRADE in the engine, but the recommendation is NO_TRADE with a MOCK blocker", () => {
  const a = analyze(mockSnapshot("nifty", NOW), NOW, { accountCapital: 500_000 }, undefined);
  const rec = buildRecommendationResponse(a, NOW);
  assert.equal(rec.decision, "NO_TRADE", "simulated data is never executable");
  assert.ok(rec.blockers.some((b) => /^MOCK_DATA/.test(b)), `blockers: ${rec.blockers.join(" | ")}`);
  assert.equal(rec.execution, null, "no execution block for a simulated run");
});

test("MX-3. live path unchanged: an all-LIVE snapshot keeps the engine's decision and carries no MOCK blocker", () => {
  const a = analyze(labelled(), NOW, { accountCapital: 500_000 }, undefined);
  const rec = buildRecommendationResponse(a, NOW);
  assert.equal(a.status, "TRADE", "the labelled-LIVE snapshot reaches TRADE in the engine");
  assert.equal(rec.decision, "TRADE", "the enricher does not override a live TRADE");
  assert.ok(!rec.blockers.some((b) => /^MOCK_DATA/.test(b)));
});
