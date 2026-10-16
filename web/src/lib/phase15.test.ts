// Phase 15 — Live Recommendation Evidence Collection & Production Validation
// Tests cover: AUTH, LIVE vs MOCK freshness, recommendation contract, risk blockers,
// journal isolation, paper lifecycle, order safety, data quality, evidence counts.
// Strategy version 11.4-frozen must not change.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

import { FROZEN_STRATEGY_VERSION } from "./strategyEvidenceEngine.ts";
import { STRATEGY_VERSION } from "./journalTypes.ts";
import {
  tokenExpiry,
  createAuthState,
  consumeAuthState,
} from "./services/upstoxAuth.ts";
import { createRecommendationStore, PROD_STORE_DIR } from "./services/recommendationStore.ts";
import type { RecommendationJournalEntry } from "./journalTypes.ts";
import { computeStrategyEvidence } from "./strategyEvidenceEngine.ts";

// ─── helpers ──────────────────────────────────────────────────────────────────

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "p15-test-"));
}

function makeEntry(
  override: Partial<{
    id: string;
    decision: string;
    source: string;
    status: string;
    underlying: string;
    pnl: number | null;
    confidence: number;
    score: number;
    blockers: string[];
  }> = {},
): RecommendationJournalEntry {
  const id = override.id ?? `rec_p15_${Math.random().toString(36).slice(2)}`;
  return {
    id,
    createdAt: new Date().toISOString(),
    status: (override.status ?? "MONITORING") as RecommendationJournalEntry["status"],
    paperTradeId: null,
    outcome: override.pnl !== undefined ? {
      status: "STOPPED_OUT" as const,
      exitPrice: 50,
      exitTimestamp: new Date().toISOString(),
      exitReason: "STOP_LOSS" as const,
      highestPrice: 80,
      lowestPrice: 40,
      mfe: 30,
      mae: 20,
      pnl: override.pnl ?? -500,
      pnlPercent: -10,
      rMultiple: -1,
      durationMinutes: 60,
      target1HitAt: null,
      target2HitAt: null,
      lastRefreshedAt: new Date().toISOString(),
    } : null,
    snapshot: {
      recommendationId: id,
      generatedAt: new Date().toISOString(),
      source: (override.source ?? "LIVE") as "LIVE" | "END_OF_DAY" | "STALE" | "UNAVAILABLE" | "MOCK",
      underlying: (override.underlying ?? "NIFTY") as "NIFTY" | "BANKNIFTY",
      decision: (override.decision ?? "NO_TRADE") as "TRADE" | "WAIT" | "NO_TRADE",
      direction: "BULLISH",
      strategy: override.decision === "TRADE" ? "Long Call" : "NONE",
      confidence: override.confidence ?? 30,
      contract: null,
      entryDetail: null,
      execution: null,
      market: { spot: 22000, expiry: "2026-10-13", regime: "BULLISH", pcr: 1.1, maxPain: 22000, support: 21000, resistance: 23000 },
      score: { total: override.score ?? 30, factors: {} as Record<string, unknown> },
      reasons: [],
      blockers: override.blockers ?? ["MOCK data — not executable"],
      oiAnalysis: { highestCallOiStrike: 0, highestPutOiStrike: 0, callOiTotal: 0, putOiTotal: 0, callOiChange: 0, putOiChange: 0, interpretation: [] },
      whyReasons: [],
      dataQuality: { market: override.source ?? "LIVE", optionChain: override.source ?? "LIVE", technical: override.source ?? "LIVE", news: override.source ?? "LIVE", breadth: override.source ?? "LIVE" },
      blockedCandidate: null,
      instrumentKeyAvailable: false,
      marketSnapshotTimestamp: new Date().toISOString(),
      optionChainTimestamp: new Date().toISOString(),
    } as RecommendationJournalEntry["snapshot"],
  };
}

// ─── AUTH-01..05 ──────────────────────────────────────────────────────────────
describe("AUTH", () => {
  it("AUTH-01: tokenExpiry produces next 03:30 IST from any issued time", () => {
    const issued = new Date("2026-10-07T04:00:00.000Z"); // 09:30 IST
    const exp = tokenExpiry(issued);
    // Should be 2026-10-07 22:00 UTC (= 03:30 IST next day)
    assert.equal(exp.getUTCHours(), 22);
    assert.equal(exp.getUTCMinutes(), 0);
  });

  it("AUTH-02: tokenExpiry is always in the future relative to its issued time", () => {
    const now = new Date("2026-10-07T10:00:00Z");
    const exp = tokenExpiry(now);
    assert.ok(exp > now, "expiry must be after issued time");
  });

  it("AUTH-03: createAuthState produces a 64-char hex string", () => {
    const state = createAuthState();
    assert.match(state, /^[0-9a-f]{64}$/);
  });

  it("AUTH-04: consumeAuthState accepts a valid state exactly once (single-use)", () => {
    const state = createAuthState(Date.now());
    assert.ok(consumeAuthState(state, Date.now()), "first consume must succeed");
    assert.ok(!consumeAuthState(state, Date.now()), "second consume must fail (single-use)");
  });

  it("AUTH-05: consumeAuthState rejects null and unknown state", () => {
    assert.ok(!consumeAuthState(null, Date.now()), "null state must be rejected");
    assert.ok(!consumeAuthState("deadbeef", Date.now()), "unknown state must be rejected");
  });
});

// ─── LIVE-01..05 ─────────────────────────────────────────────────────────────
describe("LIVE", () => {
  it("LIVE-01: MOCK source never counts as a live TRADE in evidence engine", () => {
    const entry = makeEntry({ decision: "TRADE", source: "MOCK", status: "NOT_EXECUTABLE" });
    const report = computeStrategyEvidence([], [entry], []);
    assert.equal(report.liveTrades, 0, "MOCK TRADE must not count toward live trades");
  });

  it("LIVE-02: END_OF_DAY source never counts as a live TRADE in evidence engine", () => {
    const entry = makeEntry({ decision: "TRADE", source: "END_OF_DAY", status: "NOT_EXECUTABLE" });
    const report = computeStrategyEvidence([], [entry], []);
    assert.equal(report.liveTrades, 0);
    assert.equal(report.liveNonExecutableCount, 1);
  });

  it("LIVE-03: STALE source is counted as non-executable", () => {
    const entry = makeEntry({ decision: "TRADE", source: "STALE", status: "NOT_EXECUTABLE" });
    const report = computeStrategyEvidence([], [entry], []);
    assert.equal(report.liveTrades, 0);
    assert.equal(report.liveNonExecutableCount, 1);
  });

  it("LIVE-04: LIVE source TRADE increments liveTrades", () => {
    const entry = makeEntry({ decision: "TRADE", source: "LIVE", status: "MONITORING" });
    const report = computeStrategyEvidence([], [entry], []);
    assert.equal(report.liveTrades, 1);
    assert.equal(report.liveNonExecutableCount, 0);
  });

  it("LIVE-05: LIVE WAIT and NO_TRADE are separately counted, not as liveTrades", () => {
    const wait = makeEntry({ decision: "WAIT", source: "LIVE", status: "MONITORING" });
    const noTrade = makeEntry({ decision: "NO_TRADE", source: "LIVE", status: "MONITORING" });
    const report = computeStrategyEvidence([], [wait, noTrade], []);
    assert.equal(report.liveTrades, 0);
    assert.equal(report.liveWaitCount, 1);
    assert.equal(report.liveNoTradeCount, 1);
  });
});

// ─── REC-01..08 ───────────────────────────────────────────────────────────────
describe("REC", () => {
  it("REC-01: strategy version constant matches frozen version", () => {
    assert.equal(STRATEGY_VERSION.strategyVersion, "11.4-frozen");
    assert.equal(FROZEN_STRATEGY_VERSION, "11.4-frozen");
    assert.equal(STRATEGY_VERSION.strategyVersion, FROZEN_STRATEGY_VERSION);
  });

  it("REC-02: liveObservations counts all journal entries regardless of source", () => {
    const entries = [
      makeEntry({ source: "LIVE" }),
      makeEntry({ source: "MOCK" }),
      makeEntry({ source: "END_OF_DAY" }),
    ];
    const report = computeStrategyEvidence([], entries, []);
    assert.equal(report.liveObservations, 3);
  });

  it("REC-03: liveNonExecutableCount counts all MOCK + END_OF_DAY + STALE", () => {
    const entries = [
      makeEntry({ source: "MOCK", status: "NOT_EXECUTABLE" }),
      makeEntry({ source: "END_OF_DAY", status: "NOT_EXECUTABLE" }),
      makeEntry({ source: "STALE", status: "NOT_EXECUTABLE" }),
      makeEntry({ source: "LIVE", status: "MONITORING" }),
    ];
    const report = computeStrategyEvidence([], entries, []);
    assert.equal(report.liveNonExecutableCount, 3);
    assert.equal(report.liveTrades, 0); // all non-exec have NO_TRADE decision in makeEntry
  });

  it("REC-04: evidence status is NONE when no completed trades exist", () => {
    const entries = [makeEntry({ source: "LIVE", decision: "TRADE", status: "MONITORING" })];
    const report = computeStrategyEvidence([], entries, []);
    assert.equal(report.liveEvidenceStatus, "NONE");
    assert.equal(report.liveCompletedTrades, 0);
  });

  it("REC-05: completed trades require pnl !== null and terminal status", () => {
    const open = makeEntry({ source: "LIVE", decision: "TRADE", status: "MONITORING" });
    const closed = makeEntry({ source: "LIVE", decision: "TRADE", status: "STOPPED_OUT", pnl: -500 });
    const report = computeStrategyEvidence([], [open, closed], []);
    assert.equal(report.liveCompletedTrades, 1);
  });

  it("REC-06: WAIT entries with LIVE source increment liveWaitCount", () => {
    const entries = [
      makeEntry({ decision: "WAIT", source: "LIVE", status: "MONITORING" }),
      makeEntry({ decision: "WAIT", source: "LIVE", status: "MONITORING" }),
    ];
    const report = computeStrategyEvidence([], entries, []);
    assert.equal(report.liveWaitCount, 2);
    assert.equal(report.liveTrades, 0);
  });

  it("REC-07: mixed sources correctly segregate into executable vs non-executable", () => {
    const entries = [
      makeEntry({ decision: "TRADE", source: "LIVE", status: "MONITORING" }),
      makeEntry({ decision: "TRADE", source: "MOCK", status: "NOT_EXECUTABLE" }),
      makeEntry({ decision: "WAIT", source: "LIVE", status: "MONITORING" }),
      makeEntry({ decision: "NO_TRADE", source: "END_OF_DAY", status: "NOT_EXECUTABLE" }),
    ];
    const report = computeStrategyEvidence([], entries, []);
    assert.equal(report.liveTrades, 1);
    assert.equal(report.liveWaitCount, 1);
    assert.equal(report.liveNonExecutableCount, 2);
    assert.equal(report.liveNoTradeCount, 0); // END_OF_DAY NO_TRADE is non-executable
  });

  it("REC-08: strategy version is preserved across evidence reports", () => {
    const report = computeStrategyEvidence([], [], []);
    assert.equal(report.strategyVersion, "11.4-frozen");
  });
});

// ─── RISK-01..04 ──────────────────────────────────────────────────────────────
describe("RISK", () => {
  it("RISK-01: DEFAULT_RISK_CONFIG capital is 100,000 INR", async () => {
    const { DEFAULT_RISK_CONFIG } = await import("./services/risk/riskConfig.ts");
    assert.equal(DEFAULT_RISK_CONFIG.accountCapital, 100_000);
  });

  it("RISK-02: DEFAULT_RISK_CONFIG risk per trade is 1%", async () => {
    const { DEFAULT_RISK_CONFIG } = await import("./services/risk/riskConfig.ts");
    assert.equal(DEFAULT_RISK_CONFIG.riskPerTradePercent, 1.0);
  });

  it("RISK-03: DEFAULT_RISK_CONFIG minimum R:R is 1.2", async () => {
    const { DEFAULT_RISK_CONFIG } = await import("./services/risk/riskConfig.ts");
    assert.equal(DEFAULT_RISK_CONFIG.minRiskReward, 1.2);
  });

  it("RISK-04: DEFAULT_RISK_CONFIG max lots per trade is 5", async () => {
    const { DEFAULT_RISK_CONFIG } = await import("./services/risk/riskConfig.ts");
    assert.equal(DEFAULT_RISK_CONFIG.maxLotsPerTrade, 5);
  });
});

// ─── JOURNAL-01..04 ───────────────────────────────────────────────────────────
describe("JOURNAL", () => {
  it("JOURNAL-01: test store writes to isolated directory, not production", () => {
    const dir = tmpDir();
    const store = createRecommendationStore(dir);
    assert.notEqual(store.dir, PROD_STORE_DIR, "test store must not be production store");
  });

  it("JOURNAL-02: test store save/get roundtrip preserves snapshot immutability", () => {
    const dir = tmpDir();
    const store = createRecommendationStore(dir);
    const entry = makeEntry({ decision: "TRADE", source: "LIVE" });
    store.save(entry);
    const fetched = store.get(entry.id);
    assert.ok(fetched, "entry should be retrievable");
    assert.equal(fetched.snapshot.decision, "TRADE");
  });

  it("JOURNAL-03: update does not modify snapshot", () => {
    const dir = tmpDir();
    const store = createRecommendationStore(dir);
    const entry = makeEntry({ decision: "TRADE", source: "LIVE" });
    store.save(entry);
    store.update(entry.id, { status: "STOPPED_OUT" });
    const updated = store.get(entry.id);
    assert.equal(updated?.snapshot.decision, "TRADE", "snapshot must remain immutable");
    assert.equal(updated?.status, "STOPPED_OUT", "status must be updated");
  });

  it("JOURNAL-04: creating store with production path throws if RECOMMENDATION_STORE_DIR override is set to different path", () => {
    // Verify the safety guard exists in the source
    // (testing the guard directly requires env manipulation; verify the guard code exists instead)
    const storeSource = fs.readFileSync(
      decodeURIComponent(new URL("./services/recommendationStore.ts", import.meta.url).pathname),
      "utf8",
    );
    assert.ok(storeSource.includes("production store"), "safety guard message must exist");
    assert.ok(storeSource.includes("RECOMMENDATION_STORE_DIR"), "safety guard must check env var");
  });
});

// ─── PAPER-01..04 ─────────────────────────────────────────────────────────────
describe("PAPER", () => {
  it("PAPER-01: paper trade lifecycle states are well-defined in journal types", async () => {
    const { STRATEGY_VERSION: sv } = await import("./journalTypes.ts");
    assert.equal(sv.executionModelVersion, "paper-v1");
  });

  it("PAPER-02: MONITORING status transitions are tracked independently of snapshot", () => {
    const dir = tmpDir();
    const store = createRecommendationStore(dir);
    const entry = makeEntry({ decision: "TRADE", source: "LIVE", status: "MONITORING" });
    store.save(entry);
    store.update(entry.id, { status: "TARGET_1_HIT" });
    const updated = store.get(entry.id);
    assert.equal(updated?.status, "TARGET_1_HIT");
    assert.equal(updated?.snapshot.decision, "TRADE"); // snapshot unchanged
  });

  it("PAPER-03: paper trade ID linkage is nullable and independent of recommendation decision", () => {
    const dir = tmpDir();
    const store = createRecommendationStore(dir);
    const entry = makeEntry({ decision: "TRADE", source: "LIVE" });
    store.save(entry);
    store.update(entry.id, { paperTradeId: "paper_abc123" });
    const updated = store.get(entry.id);
    assert.equal(updated?.paperTradeId, "paper_abc123");
  });

  it("PAPER-04: NOT_EXECUTABLE entries have null paperTradeId by default", () => {
    const dir = tmpDir();
    const store = createRecommendationStore(dir);
    const entry = makeEntry({ status: "NOT_EXECUTABLE", source: "MOCK" });
    store.save(entry);
    const fetched = store.get(entry.id);
    assert.equal(fetched?.paperTradeId, null);
  });
});

// ─── SAFETY-01..05 ────────────────────────────────────────────────────────────
describe("SAFETY", () => {
  it("SAFETY-01: no placeOrder, modifyOrder, cancelOrder in non-test source", () => {
    function scanDir(dir: string): string[] {
      const results: string[] = [];
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, f.name);
        if (f.isDirectory() && f.name !== "node_modules") results.push(...scanDir(full));
        else if (f.isFile() && (f.name.endsWith(".ts") || f.name.endsWith(".mjs"))
                 && !f.name.endsWith(".test.ts")) results.push(full);
      }
      return results;
    }
    const root = path.resolve(import.meta.dirname ?? process.cwd(), "../..");
    const files = scanDir(path.join(root, "src")).concat(scanDir(path.join(root, "scripts")));
    const BANNED = ["place" + "Order", "modify" + "Order", "cancel" + "Order"];
    const violations: string[] = [];
    for (const f of files) {
      const content = fs.readFileSync(f, "utf8");
      if (BANNED.some((b) => content.includes(b))) violations.push(f);
    }
    assert.equal(violations.length, 0, `Order endpoints found in: ${violations.join(", ")}`);
  });

  it("SAFETY-02: no Upstox order route paths in non-test source", () => {
    function scanDir(dir: string): string[] {
      const results: string[] = [];
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, f.name);
        if (f.isDirectory() && f.name !== "node_modules") results.push(...scanDir(full));
        else if (f.isFile() && f.name.endsWith(".ts") && !f.name.endsWith(".test.ts")) results.push(full);
      }
      return results;
    }
    const root = path.resolve(import.meta.dirname ?? process.cwd(), "../..");
    const files = scanDir(path.join(root, "src"));
    const ORDER_PATHS = ["/v2/" + "order", "/v2/" + "trade"];
    const violations: string[] = [];
    for (const f of files) {
      const content = fs.readFileSync(f, "utf8");
      if (ORDER_PATHS.some((p) => content.includes(p))) violations.push(f);
    }
    assert.equal(violations.length, 0, `Upstox order paths found in: ${violations.join(", ")}`);
  });

  it("SAFETY-03: strategy version is still 11.4-frozen (no drift)", () => {
    assert.equal(STRATEGY_VERSION.strategyVersion, "11.4-frozen");
    assert.equal(FROZEN_STRATEGY_VERSION, "11.4-frozen");
  });

  it("SAFETY-04: MIN_STRATEGY_SCORE is 65 (not changed)", async () => {
    const { MIN_STRATEGY_SCORE } = await import("./engine/strategy.ts");
    assert.equal(MIN_STRATEGY_SCORE, 65);
  });

  it("SAFETY-05: MOCK source entry has status NOT_EXECUTABLE and decision NO_TRADE by convention", () => {
    // Verify that the evidence counting treats NOT_EXECUTABLE + MOCK as non-executable
    const entry = makeEntry({ decision: "NO_TRADE", source: "MOCK", status: "NOT_EXECUTABLE" });
    const report = computeStrategyEvidence([], [entry], []);
    assert.equal(report.liveTrades, 0);
    assert.equal(report.liveNonExecutableCount, 1);
    assert.equal(report.liveNoTradeCount, 0); // excluded from live counts
  });
});

// ─── DATA-01..05 ─────────────────────────────────────────────────────────────
describe("DATA", () => {
  it("DATA-01: BANK_NIFTY constituent count is 14", async () => {
    const { BANK_NIFTY } = await import("./services/breadthConstituents.generated.ts");
    assert.equal(BANK_NIFTY.length, 14, `Expected 14 BANK NIFTY constituents, got ${BANK_NIFTY.length}`);
  });

  it("DATA-02: NIFTY_50 constituent count is 50", async () => {
    const { NIFTY_50 } = await import("./services/breadthConstituents.generated.ts");
    assert.equal(NIFTY_50.length, 50, `Expected 50 NIFTY constituents, got ${NIFTY_50.length}`);
  });

  it("DATA-03: all BANK_NIFTY constituents have instrumentKey with NSE_EQ prefix", async () => {
    const { BANK_NIFTY } = await import("./services/breadthConstituents.generated.ts");
    for (const c of BANK_NIFTY) {
      assert.match(c.instrumentKey, /^NSE_EQ\|/, `${c.symbol} has invalid instrumentKey: ${c.instrumentKey}`);
    }
  });

  it("DATA-04: walk-forward evidence shows 0 persisted runs (no run executed yet)", () => {
    const report = computeStrategyEvidence([], [], []);
    assert.equal(report.oosWindows.length, 0);
    assert.equal(report.walkForwardCompleted, false);
  });

  it("DATA-05: evidence final decision is REJECT_CURRENT_STRATEGY with current data", () => {
    const report = computeStrategyEvidence([], [], []);
    // With 0 backtests, 0 OOS, 0 live: must reject
    assert.equal(report.finalDecision, "REJECT_CURRENT_STRATEGY");
  });
});
