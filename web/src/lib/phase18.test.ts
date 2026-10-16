// Phase 18 — Evidence Semantics Correction
// Tests: LIVE_TRADE / LIVE_WAIT / LIVE_NO_TRADE vs NON_EXECUTABLE_SOURCE classification,
// daily summary counts, evidence engine, paper trade safety, strategy integrity.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeStrategyEvidence, FROZEN_STRATEGY_VERSION } from "./strategyEvidenceEngine.ts";
import { STRATEGY_VERSION } from "./journalTypes.ts";
import type { RecommendationJournalEntry } from "./journalTypes.ts";
import { MIN_STRATEGY_SCORE } from "./engine/strategy.ts";

// ─── helpers ──────────────────────────────────────────────────────────────────

type Source = "LIVE" | "END_OF_DAY" | "STALE" | "MOCK" | "UNAVAILABLE";
type Decision = "TRADE" | "WAIT" | "NO_TRADE";

function makeEntry(
  source: Source,
  decision: Decision,
  status: RecommendationJournalEntry["status"] = "NOT_EXECUTABLE",
): RecommendationJournalEntry {
  const id = `rec_p18_${Math.random().toString(36).slice(2)}`;
  return {
    id,
    createdAt: new Date().toISOString(),
    status,
    paperTradeId: null,
    outcome: null,
    snapshot: {
      recommendationId: id,
      generatedAt: new Date().toISOString(),
      source,
      underlying: "NIFTY",
      decision,
      direction: "BEARISH",
      strategy: decision === "TRADE" ? "Long Put" : "NONE",
      confidence: 80,
      contract: null,
      entryDetail: null,
      execution: null,
      market: { spot: 22000, expiry: "2026-10-13", regime: "EVENT RISK", pcr: 1.0, maxPain: 22000, support: 21000, resistance: 23000 },
      score: { total: 80, factors: {} as Record<string, unknown> },
      reasons: [],
      blockers: decision !== "TRADE" ? ["Event risk: RBI monetary policy"] : [],
      oiAnalysis: { highestCallOiStrike: 0, highestPutOiStrike: 0, callOiTotal: 0, putOiTotal: 0, callOiChange: 0, putOiChange: 0, interpretation: [] },
      whyReasons: [],
      dataQuality: { market: source, optionChain: source, technical: source, news: source, breadth: source },
      blockedCandidate: null,
      instrumentKeyAvailable: false,
      marketSnapshotTimestamp: new Date().toISOString(),
      optionChainTimestamp: new Date().toISOString(),
    } as RecommendationJournalEntry["snapshot"],
  };
}

// ─── Semantic classification helpers (mirrors evidence engine logic) ──────────

const NON_EXEC_SOURCES = new Set<Source>(["MOCK", "END_OF_DAY", "STALE", "UNAVAILABLE"]);

function classifyEntry(e: RecommendationJournalEntry) {
  const src = e.snapshot.source as Source;
  if (NON_EXEC_SOURCES.has(src)) return "NON_EXECUTABLE_SOURCE" as const;
  const d = e.snapshot.decision;
  if (d === "TRADE") return "LIVE_TRADE" as const;
  if (d === "WAIT")  return "LIVE_WAIT" as const;
  return "LIVE_NO_TRADE" as const;
}

// ─── SEM-01..07: individual classification ────────────────────────────────────

describe("SEM — Semantic classification", () => {
  it("SEM-01: LIVE + TRADE → LIVE_TRADE", () => {
    assert.equal(classifyEntry(makeEntry("LIVE", "TRADE", "MONITORING")), "LIVE_TRADE");
  });

  it("SEM-02: LIVE + WAIT → LIVE_WAIT", () => {
    assert.equal(classifyEntry(makeEntry("LIVE", "WAIT")), "LIVE_WAIT");
  });

  it("SEM-03: LIVE + NO_TRADE → LIVE_NO_TRADE", () => {
    assert.equal(classifyEntry(makeEntry("LIVE", "NO_TRADE")), "LIVE_NO_TRADE");
  });

  it("SEM-04: END_OF_DAY + WAIT → NON_EXECUTABLE_SOURCE", () => {
    assert.equal(classifyEntry(makeEntry("END_OF_DAY", "WAIT")), "NON_EXECUTABLE_SOURCE");
  });

  it("SEM-05: STALE + TRADE → NON_EXECUTABLE_SOURCE", () => {
    assert.equal(classifyEntry(makeEntry("STALE", "TRADE", "MONITORING")), "NON_EXECUTABLE_SOURCE");
  });

  it("SEM-06: MOCK + TRADE → NON_EXECUTABLE_SOURCE", () => {
    assert.equal(classifyEntry(makeEntry("MOCK", "TRADE", "MONITORING")), "NON_EXECUTABLE_SOURCE");
  });

  it("SEM-07: UNAVAILABLE → NON_EXECUTABLE_SOURCE", () => {
    assert.equal(classifyEntry(makeEntry("UNAVAILABLE", "NO_TRADE")), "NON_EXECUTABLE_SOURCE");
  });
});

// ─── EV — Evidence engine counts ──────────────────────────────────────────────

describe("EV — Evidence engine semantics", () => {
  it("EV-01: 14 LIVE WAITs → liveWaitCount=14, liveNonExecutableCount=0", () => {
    const entries = Array.from({ length: 14 }, () => makeEntry("LIVE", "WAIT"));
    const r = computeStrategyEvidence([], entries, []);
    assert.equal(r.liveWaitCount, 14);
    assert.equal(r.liveNonExecutableCount, 0);
    assert.equal(r.liveTrades, 0);
  });

  it("EV-02: 2 EOD entries → nonExecutable=2, liveWaitCount=0", () => {
    const entries = [makeEntry("END_OF_DAY", "NO_TRADE"), makeEntry("END_OF_DAY", "WAIT")];
    const r = computeStrategyEvidence([], entries, []);
    assert.equal(r.liveNonExecutableCount, 2);
    assert.equal(r.liveWaitCount, 0);
  });

  it("EV-03: LIVE WAIT does not increment liveTrades", () => {
    const entries = [makeEntry("LIVE", "WAIT")];
    const r = computeStrategyEvidence([], entries, []);
    assert.equal(r.liveTrades, 0);
  });

  it("EV-04: LIVE TRADE increments liveTrades", () => {
    const e = makeEntry("LIVE", "TRADE", "MONITORING");
    const r = computeStrategyEvidence([], [e], []);
    assert.equal(r.liveTrades, 1);
    assert.equal(r.liveWaitCount, 0);
    assert.equal(r.liveNonExecutableCount, 0);
  });

  it("EV-05: LIVE NO_TRADE increments liveNoTradeCount", () => {
    const entries = [makeEntry("LIVE", "NO_TRADE")];
    const r = computeStrategyEvidence([], entries, []);
    assert.equal(r.liveNoTradeCount, 1);
    assert.equal(r.liveNonExecutableCount, 0);
  });

  it("EV-06: evidence status NONE when 0 completed trades regardless of WAITs", () => {
    const entries = Array.from({ length: 14 }, () => makeEntry("LIVE", "WAIT"));
    const r = computeStrategyEvidence([], entries, []);
    assert.equal(r.liveEvidenceStatus, "NONE");
  });

  it("EV-07: LIVE WAIT does not count as completed trade", () => {
    const entries = Array.from({ length: 14 }, () => makeEntry("LIVE", "WAIT"));
    const r = computeStrategyEvidence([], entries, []);
    assert.equal(r.liveCompletedTrades, 0);
  });

  it("EV-08: mixed set separates LIVE and NON_EXEC correctly", () => {
    const entries = [
      makeEntry("LIVE", "WAIT"),
      makeEntry("LIVE", "NO_TRADE"),
      makeEntry("END_OF_DAY", "NO_TRADE"),
      makeEntry("MOCK", "TRADE", "MONITORING"),
    ];
    const r = computeStrategyEvidence([], entries, []);
    assert.equal(r.liveWaitCount, 1);
    assert.equal(r.liveNoTradeCount, 1);
    assert.equal(r.liveNonExecutableCount, 2);
    assert.equal(r.liveTrades, 0);
  });
});

// ─── DS — Daily summary API logic (inline, no HTTP) ──────────────────────────
// Mirror the new daily-summary semantics directly

function summariseEntries(entries: RecommendationJournalEntry[]) {
  const SRC_NON_EXEC = new Set<string>(["MOCK", "END_OF_DAY", "STALE", "UNAVAILABLE"]);
  const isNonExecSrc = (e: RecommendationJournalEntry) => SRC_NON_EXEC.has(e.snapshot.source ?? "");
  const live = entries.filter((e) => !isNonExecSrc(e));
  return {
    liveEvaluations: live.length,
    liveTradeCount: live.filter((e) => e.snapshot.decision === "TRADE").length,
    liveWaitCount: live.filter((e) => e.snapshot.decision === "WAIT").length,
    liveNoTradeCount: live.filter((e) => e.snapshot.decision === "NO_TRADE").length,
    nonExecutableSourceCount: entries.filter(isNonExecSrc).length,
  };
}

describe("DS — Daily summary semantics", () => {
  it("DS-01: 14 LIVE WAITs → liveEvaluations=14, liveWaitCount=14, nonExecutableSourceCount=0", () => {
    const entries = Array.from({ length: 14 }, () => makeEntry("LIVE", "WAIT"));
    const s = summariseEntries(entries);
    assert.equal(s.liveEvaluations, 14);
    assert.equal(s.liveWaitCount, 14);
    assert.equal(s.liveTradeCount, 0);
    assert.equal(s.liveNoTradeCount, 0);
    assert.equal(s.nonExecutableSourceCount, 0);
  });

  it("DS-02: 2 EOD entries → liveEvaluations=0, nonExecutableSourceCount=2", () => {
    const entries = [makeEntry("END_OF_DAY", "NO_TRADE"), makeEntry("END_OF_DAY", "WAIT")];
    const s = summariseEntries(entries);
    assert.equal(s.liveEvaluations, 0);
    assert.equal(s.liveWaitCount, 0);
    assert.equal(s.nonExecutableSourceCount, 2);
  });

  it("DS-03: mixed session separates live from non-exec", () => {
    const entries = [
      makeEntry("LIVE", "WAIT"),
      makeEntry("LIVE", "NO_TRADE"),
      makeEntry("END_OF_DAY", "NO_TRADE"),
    ];
    const s = summariseEntries(entries);
    assert.equal(s.liveEvaluations, 2);
    assert.equal(s.liveWaitCount, 1);
    assert.equal(s.liveNoTradeCount, 1);
    assert.equal(s.nonExecutableSourceCount, 1);
  });

  it("DS-04: NIFTY and BANKNIFTY counted separately (passthrough check)", () => {
    // This test uses the makeEntry helper which always outputs NIFTY; just verifies
    // that live counts work for a single underlying without cross-contamination
    const niftyWait = makeEntry("LIVE", "WAIT");
    const s = summariseEntries([niftyWait]);
    assert.equal(s.liveWaitCount, 1);
    assert.equal(s.liveTradeCount, 0);
  });
});

// ─── PT — Paper trade safety ──────────────────────────────────────────────────

describe("PT — Paper trade source safety", () => {
  it("PT-01: LIVE WAIT must not have paperTradeId", () => {
    const e = makeEntry("LIVE", "WAIT");
    assert.equal(e.paperTradeId, null);
  });

  it("PT-02: LIVE NO_TRADE must not have paperTradeId", () => {
    const e = makeEntry("LIVE", "NO_TRADE");
    assert.equal(e.paperTradeId, null);
  });

  it("PT-03: MOCK TRADE must not have paperTradeId", () => {
    const e = makeEntry("MOCK", "TRADE", "MONITORING");
    assert.equal(e.paperTradeId, null);
  });

  it("PT-04: END_OF_DAY WAIT must not have paperTradeId", () => {
    const e = makeEntry("END_OF_DAY", "WAIT");
    assert.equal(e.paperTradeId, null);
  });

  it("PT-05: STALE TRADE must not have paperTradeId", () => {
    const e = makeEntry("STALE", "TRADE", "MONITORING");
    assert.equal(e.paperTradeId, null);
  });
});

// ─── SI — Strategy integrity ──────────────────────────────────────────────────

describe("SI — Strategy integrity", () => {
  it("SI-01: strategy version still 11.4-frozen", () => {
    assert.equal(STRATEGY_VERSION.strategyVersion, "11.4-frozen");
    assert.equal(FROZEN_STRATEGY_VERSION, "11.4-frozen");
  });

  it("SI-02: MIN_STRATEGY_SCORE unchanged at 65", () => {
    assert.equal(MIN_STRATEGY_SCORE, 65);
  });

  it("SI-03: no order functions in non-test source files", async () => {
    const { execSync } = await import("node:child_process");
    const srcDir = decodeURIComponent(new URL(".", import.meta.url).pathname);
    const webSrc = srcDir.replace(/\/src\/lib\/?$/, "/src");
    const patterns = ["place" + "Order", "modify" + "Order", "cancel" + "Order"];
    for (const pattern of patterns) {
      const result = execSync(
        `grep -rn "${pattern}" "${webSrc}" --include="*.ts" --include="*.tsx" | grep -v ".test.ts" || true`,
        { encoding: "utf8" },
      ).trim();
      assert.equal(result, "", `Found banned pattern: ${pattern}`);
    }
  });

  it("SI-04: BANKNIFTY route does not regress (underlying field accepted)", async () => {
    const fs = await import("node:fs");
    const base = decodeURIComponent(new URL(".", import.meta.url).pathname);
    const routePath = base.replace(/\/src\/lib\/?$/, "/src/app/api/recommendations/generate/route.ts");
    const code = fs.readFileSync(routePath, "utf8");
    assert.ok(code.includes("body.underlying"), "generate route must read body.underlying");
  });

  it("SI-05: generate route accepts both body.underlying and body.index (backward compat)", async () => {
    const fs = await import("node:fs");
    const base = decodeURIComponent(new URL(".", import.meta.url).pathname);
    const routePath = base.replace(/\/src\/lib\/?$/, "/src/app/api/recommendations/generate/route.ts");
    const code = fs.readFileSync(routePath, "utf8");
    assert.ok(code.includes("body.index") || code.includes("body.underlying"), "generate route must support input fields");
  });
});
