// MOCK versus LIVE safeguards. Offline and deterministic: mock snapshots, fixed clock, no network.
// A simulated price must never be presented as LIVE, and a MOCK input must never produce an executable decision.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mockSnapshot } from "./services/mock.ts";
import { dataLabel } from "./dataStatus.ts";
import { analyze } from "./engine/strategy.ts";
import { diagnose } from "./recommendationDiagnostic.ts";
import type { Snapshot } from "./types.ts";

const NOW = new Date("2026-10-05T07:00:00Z"); // Mon 12:30 IST, market open
const SOURCE_KEYS = ["market", "optionChain", "technical", "news", "breadth"] as const;

function liveSnapshot(): Snapshot {
  const s = structuredClone(mockSnapshot("nifty", NOW));
  for (const k of SOURCE_KEYS) s.sources[k] = { ...s.sources[k], source: "LIVE", provider: "UPSTOX", fetchedAt: NOW.toISOString() };
  s.fallbackReason = null;
  s.lotSize = 75;
  return s;
}

test("MS-1. the mock provider labels every subsystem MOCK, for every index", () => {
  for (const index of ["nifty", "banknifty"] as const) {
    const s = mockSnapshot(index, NOW);
    for (const k of SOURCE_KEYS) assert.equal(s.sources[k].source, "MOCK", `${index}.${k} must be MOCK, not ${s.sources[k].source}`);
  }
});

test("MS-2. the global data label is never LIVE DATA while any input is MOCK", () => {
  assert.equal(dataLabel([mockSnapshot("nifty", NOW), mockSnapshot("banknifty", NOW)]), "MOCK DATA");

  const fallback = liveSnapshot();
  fallback.fallbackReason = "UPSTOX_NOT_CONNECTED";
  assert.equal(dataLabel([fallback]), "MOCK FALLBACK");

  const partial = liveSnapshot();
  partial.sources.optionChain = { ...partial.sources.optionChain, source: "MOCK", provider: "MOCK" };
  assert.notEqual(dataLabel([partial]), "LIVE DATA", "one MOCK chain among LIVE inputs must not read as LIVE");
  assert.equal(dataLabel([partial]), "PARTIAL LIVE DATA");
});

test("MS-3. a LIVE market with a MOCK option chain never produces an executable decision or a LIVE overall status", () => {
  const s = liveSnapshot();
  s.sources.optionChain = { ...s.sources.optionChain, source: "MOCK", provider: "MOCK" };
  const a = analyze(s, NOW, { accountCapital: 500_000 }, undefined);
  const d = diagnose(a, NOW);
  assert.notEqual(d.finalDecision, "TRADE", "a simulated option chain must not yield an executable trade");
  assert.notEqual(d.freshness.overall, "LIVE", "the overall source must not report LIVE while the chain is simulated");
  assert.ok(d.blockers.length > 0, "the mock input is reported as a blocker");
});

test("MS-4. a LIVE market with a MOCK technical or breadth input is also not executable", () => {
  for (const k of ["technical", "breadth"] as const) {
    const s = liveSnapshot();
    if (k === "breadth" && s.breadth) s.breadth = { ...s.breadth, status: "LIVE" as const };
    s.sources[k] = { ...s.sources[k], source: "MOCK", provider: "MOCK" };
    const d = diagnose(analyze(s, NOW, { accountCapital: 500_000 }, undefined), NOW);
    assert.notEqual(d.finalDecision, "TRADE", `${k} MOCK must block execution`);
  }
});

test("MS-5. a fully mock snapshot is never an executable decision", () => {
  const d = diagnose(analyze(mockSnapshot("nifty", NOW), NOW, { accountCapital: 500_000 }, undefined), NOW);
  assert.equal(d.finalDecision, "NO_TRADE");
  assert.equal(d.freshness.overall, "MOCK");
});
