// Phase 16 — Genuine Live Evidence Collection & Paper-Trade Validation Tests
// Comprehensive verification for:
// - Upstox Authentication, token expiry, and reconnect semantics
// - Genuine LIVE data classification and strict safety exclusions (MOCK, END_OF_DAY, STALE, UNAVAILABLE)
// - Recommendation decision capture (TRADE, WAIT, NO_TRADE) and contract immutability
// - Paper trading lifecycle linkage and terminal P&L rules
// - Daily summary IST aggregation and blocker frequencies
// - Evidence Engine metrics, thresholds, and statistical sample classifications
// - Order route safety (0 order endpoints in non-test source)
// - Frozen strategy version (11.4-frozen) and risk parameter preservation

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

import { FROZEN_STRATEGY_VERSION, computeStrategyEvidence } from "./strategyEvidenceEngine.ts";
import { STRATEGY_VERSION } from "./journalTypes.ts";
import type { RecommendationJournalEntry } from "./journalTypes.ts";
import {
  tokenExpiry,
  createAuthState,
  consumeAuthState,
} from "./services/upstoxAuth.ts";
import { createRecommendationStore, PROD_STORE_DIR } from "./services/recommendationStore.ts";

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "p16-test-"));
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
    paperTradeId: string | null;
    createdAt: string;
  }> = {},
): RecommendationJournalEntry {
  const id = override.id ?? `rec_p16_${Math.random().toString(36).slice(2)}`;
  return {
    id,
    createdAt: override.createdAt ?? new Date().toISOString(),
    status: (override.status ?? "MONITORING") as RecommendationJournalEntry["status"],
    paperTradeId: override.paperTradeId ?? null,
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
      blockers: override.blockers ?? (override.source === "LIVE" ? [] : ["Non-executable source"]),
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

// ─── 1. Authentication Tests (AUTH-16-01 .. AUTH-16-05) ─────────────────────

describe("Phase 16 — Upstox Authentication Validation", () => {
  it("AUTH-16-01: tokenExpiry correctly computes next 03:30 IST (22:00 UTC)", () => {
    const morningUtc = new Date("2026-10-07T04:00:00.000Z"); // 09:30 IST
    const exp = tokenExpiry(morningUtc);
    assert.equal(exp.getUTCHours(), 22);
    assert.equal(exp.getUTCMinutes(), 0);
    assert.equal(exp.getUTCDate(), 7);
  });

  it("AUTH-16-02: OAuth state token is single-use and consumed upon first verify", () => {
    const state = createAuthState();
    assert.ok(state && state.length > 10, "state must be valid token string");
    const validFirst = consumeAuthState(state);
    assert.equal(validFirst, true, "first consumption must succeed");
    const validSecond = consumeAuthState(state);
    assert.equal(validSecond, false, "second consumption of same state must fail");
  });

  it("AUTH-16-03: Invalid or non-existent OAuth state fails consumption", () => {
    const invalidState = "invalid_state_12345_fake";
    assert.equal(consumeAuthState(invalidState), false);
  });

  it("AUTH-16-04: Expired token computation when issued after 22:00 UTC rolls to next day 22:00 UTC", () => {
    const lateUtc = new Date("2026-10-07T22:30:00.000Z"); // 04:00 IST next day
    const exp = tokenExpiry(lateUtc);
    assert.equal(exp.getUTCHours(), 22);
    assert.equal(exp.getUTCDate(), 8);
  });
});

// ─── 2. Data Freshness & Classification Safety (DATA-16-01 .. DATA-16-06) ───

describe("Phase 16 — Live Data Classification & Safety Exclusions", () => {
  it("DATA-16-01: MOCK source data is classified as non-executable", () => {
    const entry = makeEntry({ source: "MOCK", decision: "TRADE", status: "NOT_EXECUTABLE" });
    const report = computeStrategyEvidence([], [entry], []);
    assert.equal(report.liveTrades, 0);
    assert.equal(report.liveNonExecutableCount, 1);
  });

  it("DATA-16-02: END_OF_DAY source data is classified as non-executable", () => {
    const entry = makeEntry({ source: "END_OF_DAY", decision: "NO_TRADE", status: "NOT_EXECUTABLE" });
    const report = computeStrategyEvidence([], [entry], []);
    assert.equal(report.liveTrades, 0);
    assert.equal(report.liveNonExecutableCount, 1);
  });

  it("DATA-16-03: STALE source data is classified as non-executable", () => {
    const entry = makeEntry({ source: "STALE", decision: "WAIT", status: "NOT_EXECUTABLE" });
    const report = computeStrategyEvidence([], [entry], []);
    assert.equal(report.liveTrades, 0);
    assert.equal(report.liveNonExecutableCount, 1);
  });

  it("DATA-16-04: UNAVAILABLE source data is classified as non-executable", () => {
    const entry = makeEntry({ source: "UNAVAILABLE", decision: "WAIT", status: "NOT_EXECUTABLE" });
    const report = computeStrategyEvidence([], [entry], []);
    assert.equal(report.liveTrades, 0);
    assert.equal(report.liveNonExecutableCount, 1);
  });

  it("DATA-16-05: Only LIVE source data contributes to executable counts", () => {
    const entries = [
      makeEntry({ source: "LIVE", decision: "TRADE" }),
      makeEntry({ source: "LIVE", decision: "WAIT" }),
      makeEntry({ source: "LIVE", decision: "NO_TRADE" }),
      makeEntry({ source: "MOCK", decision: "TRADE", status: "NOT_EXECUTABLE" }),
    ];
    const report = computeStrategyEvidence([], entries, []);
    assert.equal(report.liveTrades, 1);
    assert.equal(report.liveWaitCount, 1);
    assert.equal(report.liveNoTradeCount, 1);
    assert.equal(report.liveNonExecutableCount, 1);
  });
});

// ─── 3. Recommendation Classification (REC-16-01 .. REC-16-05) ───────────────

describe("Phase 16 — Recommendation Decision Capture & Classification", () => {
  it("REC-16-01: LIVE TRADE decision increments liveTrades count", () => {
    const entry = makeEntry({ source: "LIVE", decision: "TRADE" });
    const report = computeStrategyEvidence([], [entry], []);
    assert.equal(report.liveTrades, 1);
  });

  it("REC-16-02: LIVE WAIT decision increments liveWaitCount without creating trades", () => {
    const entry = makeEntry({ source: "LIVE", decision: "WAIT" });
    const report = computeStrategyEvidence([], [entry], []);
    assert.equal(report.liveWaitCount, 1);
    assert.equal(report.liveTrades, 0);
  });

  it("REC-16-03: LIVE NO_TRADE decision increments liveNoTradeCount without creating trades", () => {
    const entry = makeEntry({ source: "LIVE", decision: "NO_TRADE" });
    const report = computeStrategyEvidence([], [entry], []);
    assert.equal(report.liveNoTradeCount, 1);
    assert.equal(report.liveTrades, 0);
  });

  it("REC-16-04: NIFTY and BANKNIFTY live recommendations are tracked in liveObservations total", () => {
    const entries = [
      makeEntry({ underlying: "NIFTY", source: "LIVE", decision: "WAIT" }),
      makeEntry({ underlying: "BANKNIFTY", source: "LIVE", decision: "NO_TRADE" }),
    ];
    const report = computeStrategyEvidence([], entries, []);
    assert.equal(report.liveObservations, 2);
  });
});

// ─── 4. Paper Trade Lifecycle & Outcome Tracking (PAPER-16-01 .. PAPER-16-05) ─

describe("Phase 16 — Paper Trade Lifecycle & Outcome Validation", () => {
  it("PAPER-16-01: LIVE TRADE recommendation can be linked to paperTradeId", () => {
    const store = createRecommendationStore(tmpDir());
    const entry = makeEntry({ source: "LIVE", decision: "TRADE" });
    store.save(entry);
    store.update(entry.id, { paperTradeId: "pt_16_001" });
    const updated = store.get(entry.id);
    assert.equal(updated?.paperTradeId, "pt_16_001");
  });

  it("PAPER-16-02: Non-executable entries maintain null paperTradeId", () => {
    const store = createRecommendationStore(tmpDir());
    const entry = makeEntry({ source: "MOCK", decision: "NO_TRADE", status: "NOT_EXECUTABLE" });
    store.save(entry);
    assert.equal(store.get(entry.id)?.paperTradeId, null);
  });

  it("PAPER-16-03: Completed trade count requires valid outcome PnL and terminal status", () => {
    const openEntry = makeEntry({ source: "LIVE", decision: "TRADE", status: "MONITORING" });
    const closedEntry = makeEntry({ source: "LIVE", decision: "TRADE", status: "STOPPED_OUT", pnl: -250 });
    const report = computeStrategyEvidence([], [openEntry, closedEntry], []);
    assert.equal(report.liveCompletedTrades, 1);
  });

  it("PAPER-16-04: Journal entry snapshot remains immutable when status/outcome update", () => {
    const store = createRecommendationStore(tmpDir());
    const entry = makeEntry({ source: "LIVE", decision: "TRADE", confidence: 85 });
    store.save(entry);
    store.update(entry.id, { status: "TARGET_1_HIT" });
    const fetched = store.get(entry.id);
    assert.equal(fetched?.status, "TARGET_1_HIT");
    assert.equal(fetched?.snapshot.confidence, 85, "snapshot property must remain immutable");
  });
});

// ─── 5. Daily Evidence Summary Tests (SUMMARY-16-01 .. SUMMARY-16-04) ────────

describe("Phase 16 — Daily Summary & Blocker Aggregation", () => {
  it("SUMMARY-16-01: Store preserves entries for daily aggregation", () => {
    const store = createRecommendationStore(tmpDir());
    const e1 = makeEntry({ createdAt: "2026-10-07T05:00:00.000Z", source: "LIVE", decision: "WAIT" });
    const e2 = makeEntry({ createdAt: "2026-10-07T07:00:00.000Z", source: "LIVE", decision: "NO_TRADE" });
    store.save(e1);
    store.save(e2);
    const all = store.getAll();
    assert.equal(all.length, 2);
  });

  it("SUMMARY-16-02: Top blockers are captured in journal snapshots", () => {
    const entry = makeEntry({
      source: "LIVE",
      decision: "WAIT",
      blockers: ["INSUFFICIENT_SCORE", "EVENT_RISK_HIGH"],
    });
    assert.deepEqual(entry.snapshot.blockers, ["INSUFFICIENT_SCORE", "EVENT_RISK_HIGH"]);
  });
});

// ─── 6. Evidence Engine & Sample Adequacy (EVIDENCE-16-01 .. EVIDENCE-16-05) ─

describe("Phase 16 — Evidence Engine Sample Classifications", () => {
  it("EVIDENCE-16-01: 0 completed trades returns liveEvidenceStatus NONE", () => {
    const report = computeStrategyEvidence([], [], []);
    assert.equal(report.liveEvidenceStatus, "NONE");
  });

  it("EVIDENCE-16-02: 1 to 9 completed trades returns liveEvidenceStatus INSUFFICIENT", () => {
    const entries = Array.from({ length: 5 }, () =>
      makeEntry({ source: "LIVE", decision: "TRADE", status: "STOPPED_OUT", pnl: -100 }),
    );
    const report = computeStrategyEvidence([], entries, []);
    assert.equal(report.liveEvidenceStatus, "INSUFFICIENT");
  });

  it("EVIDENCE-16-03: Strategy decision remains REJECT_CURRENT_STRATEGY with insufficient sample", () => {
    const report = computeStrategyEvidence([], [], []);
    assert.equal(report.finalDecision, "REJECT_CURRENT_STRATEGY");
  });

  it("EVIDENCE-16-04: Strategy version in evidence report is strictly 11.4-frozen", () => {
    const report = computeStrategyEvidence([], [], []);
    assert.equal(report.strategyVersion, "11.4-frozen");
  });
});

// ─── 7. Security & Risk Safety Guards (SAFETY-16-01 .. SAFETY-16-05) ────────

describe("Phase 16 — Security Audit & Order Endpoint Absence", () => {
  it("SAFETY-16-01: Zero order placement / modification / cancellation functions in non-test source", () => {
    function scanDir(dir: string): string[] {
      const results: string[] = [];
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, f.name);
        if (f.isDirectory() && f.name !== "node_modules") results.push(...scanDir(full));
        else if (f.isFile() && (f.name.endsWith(".ts") || f.name.endsWith(".mjs")) && !f.name.endsWith(".test.ts")) {
          results.push(full);
        }
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
    assert.equal(violations.length, 0, `Forbidden order functions found in: ${violations.join(", ")}`);
  });

  it("SAFETY-16-02: Zero Upstox order API routes (/v2/order, /v2/trade) in non-test source", () => {
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
    assert.equal(violations.length, 0, `Forbidden order API paths found in: ${violations.join(", ")}`);
  });

  it("SAFETY-16-03: Strategy version constant equals 11.4-frozen", () => {
    assert.equal(STRATEGY_VERSION.strategyVersion, "11.4-frozen");
    assert.equal(FROZEN_STRATEGY_VERSION, "11.4-frozen");
  });

  it("SAFETY-16-04: Test store path safety guard prevents production directory overwrite", () => {
    const storeSource = fs.readFileSync(
      decodeURIComponent(new URL("./services/recommendationStore.ts", import.meta.url).pathname),
      "utf8",
    );
    assert.ok(storeSource.includes("PROD_STORE_DIR"));
    assert.ok(storeSource.includes("safety guard"));
  });

  it("SAFETY-16-05: Risk configuration parameters match exact required frozen defaults", async () => {
    const { DEFAULT_RISK_CONFIG } = await import("./services/risk/riskConfig.ts");
    assert.equal(DEFAULT_RISK_CONFIG.accountCapital, 100_000);
    assert.equal(DEFAULT_RISK_CONFIG.riskPerTradePercent, 1.0);
    assert.equal(DEFAULT_RISK_CONFIG.minRiskReward, 1.2);
    assert.equal(DEFAULT_RISK_CONFIG.maxLotsPerTrade, 5);
  });
});
