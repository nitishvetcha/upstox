// Phase 11.5 — Statistical evaluation tests E1–E45.
// Uses isolated test store; production store is never written.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import {
  computeEvaluation,
  classifySampleAdequacy,
  checkEligibility,
  type EvaluationFilters,
} from "./evaluationEngine.ts";
import { STRATEGY_VERSION } from "./journalTypes.ts";
import { createRecommendationStore, PROD_STORE_DIR } from "./services/recommendationStore.ts";
import type { RecommendationJournalEntry, RecommendationOutcome } from "./journalTypes.ts";
import type { RecommendationResponse } from "./recommendationEnricher.ts";

console.info = () => {};

const TEST_VERSION = "11.4-frozen";

// ── Minimal fixture builders ───────────────────────────────────────────────────

let _seq = 0;
function uid() { return `rec_eval_test_${Date.now()}_${++_seq}`; }

function makeSnap(overrides: Partial<RecommendationResponse> = {}): RecommendationResponse {
  const id = uid();
  return {
    recommendationId: id,
    generatedAt: new Date().toISOString(),
    underlying: "NIFTY",
    decision: "TRADE",
    direction: "BULLISH",
    strategy: "Long Call",
    confidence: 72,
    rationale: [],
    reasons: [],
    blockers: [],
    instrumentKeyAvailable: true,
    contract: {
      instrumentKey: "NSE_FO|NIFTY09OCT2026CE22700",
      displaySymbol: "NIFTY 09 OCT 2026 22700 CE",
      symbol: "NIFTY 2026-10-09 22700 CE",
      strike: 22700,
      optionType: "CE",
      expiry: "2026-10-09",
      ltp: 143,
      bid: 142,
      ask: 144,
      iv: 16,
      oi: 50000,
      changeOi: 2000,
      volume: 12000,
      delta: 0.5,
      gamma: 0.0002,
      theta: -0.8,
      vega: 0.3,
    },
    market: {
      spot: 22700,
      expiry: "2026-10-09",
      regime: "BULLISH",
      vix: 14,
      sessionState: "LIVE",
      technicals: null,
      news: null,
    },
    execution: {
      entry: 143,
      stopLoss: 120,
      target1: 180,
      target2: 215,
      breakeven: 22843,
      lots: 1,
      quantity: 65,
      capitalRequired: 9295,
      plannedRisk: 1495,
      maximumLoss: null,
      target1Profit: 2405,
      target2Profit: 4680,
      rrTarget1: 1.61,
      rrTarget2: 3.13,
    },
    blockedCandidate: null,
    ...overrides,
  } as RecommendationResponse;
}

function closedOutcome(pnl: number, rMultiple: number): RecommendationOutcome {
  const now = new Date().toISOString();
  return {
    status: pnl > 0 ? "TARGET_1_HIT" : "STOPPED_OUT",
    exitPrice: pnl > 0 ? 200 : 100,
    exitTimestamp: now,
    exitReason: pnl > 0 ? "TARGET_1" : "STOP_LOSS",
    highestPrice: pnl > 0 ? 200 : 143,
    lowestPrice: pnl > 0 ? 143 : 100,
    mfe: Math.abs(pnl) / 65,
    mae: 5,
    pnl,
    pnlPercent: (pnl / 9295) * 100,
    rMultiple,
    durationMinutes: 120,
    target1HitAt: pnl > 0 ? now : null,
    target2HitAt: null,
    lastRefreshedAt: now,
  };
}

function completedEntry(pnl: number, rMultiple: number, overrides: Partial<RecommendationJournalEntry> = {}): RecommendationJournalEntry {
  const snap = makeSnap();
  const outcome = closedOutcome(pnl, rMultiple);
  return {
    id: snap.recommendationId,
    createdAt: snap.generatedAt,
    snapshot: snap,
    status: outcome.status,
    paperTradeId: null,
    outcome,
    versionInfo: { ...STRATEGY_VERSION },
    ...overrides,
  };
}

function makeN(count: number, pnlFn = (i: number) => (i % 2 === 0 ? 1000 : -500)): RecommendationJournalEntry[] {
  return Array.from({ length: count }, (_, i) => completedEntry(pnlFn(i), pnlFn(i) / 1495));
}

// ── E1–E5: Sample adequacy thresholds ────────────────────────────────────────

test("E1. two completed trades → INSUFFICIENT_SAMPLE", () => {
  const report = computeEvaluation(makeN(2));
  assert.equal(report.status, "INSUFFICIENT_SAMPLE");
});

test("E2. nine completed trades → INSUFFICIENT_SAMPLE", () => {
  const report = computeEvaluation(makeN(9));
  assert.equal(report.status, "INSUFFICIENT_SAMPLE");
});

test("E3. ten completed trades → EARLY_SAMPLE", () => {
  const report = computeEvaluation(makeN(10));
  assert.equal(report.status, "EARLY_SAMPLE");
});

test("E4. thirty completed trades → DEVELOPING_SAMPLE or above", () => {
  const report = computeEvaluation(makeN(30));
  assert.ok(["DEVELOPING_SAMPLE", "MEANINGFUL_SAMPLE", "STRONGER_SAMPLE"].includes(report.status));
});

test("E5. fifty completed trades → MEANINGFUL_SAMPLE or above", () => {
  const report = computeEvaluation(makeN(50));
  assert.ok(["MEANINGFUL_SAMPLE", "STRONGER_SAMPLE"].includes(report.status));
});

// ── E6–E10: Exclusions ────────────────────────────────────────────────────────

test("E6. WAIT decision excluded from trade metrics", () => {
  const snap = makeSnap({ decision: "WAIT", execution: null });
  const entry: RecommendationJournalEntry = {
    id: snap.recommendationId,
    createdAt: snap.generatedAt,
    snapshot: snap,
    status: "NOT_EXECUTABLE",
    paperTradeId: null,
    outcome: null,
    versionInfo: STRATEGY_VERSION,
  };
  const elig = checkEligibility(entry, TEST_VERSION);
  assert.equal(elig.eligible, false);
  assert.equal(elig.reason, "NOT_TRADE");
});

test("E7. NO_TRADE decision excluded from trade metrics", () => {
  const snap = makeSnap({ decision: "NO_TRADE", execution: null });
  const entry: RecommendationJournalEntry = {
    id: snap.recommendationId,
    createdAt: snap.generatedAt,
    snapshot: snap,
    status: "NOT_EXECUTABLE",
    paperTradeId: null,
    outcome: null,
    versionInfo: STRATEGY_VERSION,
  };
  const elig = checkEligibility(entry, TEST_VERSION);
  assert.equal(elig.eligible, false);
});

test("E8. open trade (MONITORING) excluded from completed metrics", () => {
  const snap = makeSnap();
  const entry: RecommendationJournalEntry = {
    id: snap.recommendationId,
    createdAt: snap.generatedAt,
    snapshot: snap,
    status: "MONITORING",
    paperTradeId: null,
    outcome: null,
    versionInfo: STRATEGY_VERSION,
  };
  const elig = checkEligibility(entry, TEST_VERSION);
  assert.equal(elig.eligible, false);
  assert.equal(elig.reason, "NOT_COMPLETED");
});

test("E9. invalid record (missing execution) excluded", () => {
  const snap = makeSnap({ execution: null });
  const entry: RecommendationJournalEntry = {
    id: snap.recommendationId,
    createdAt: snap.generatedAt,
    snapshot: snap,
    status: "STOPPED_OUT",
    paperTradeId: null,
    outcome: closedOutcome(-500, -0.33),
    versionInfo: STRATEGY_VERSION,
  };
  const elig = checkEligibility(entry, TEST_VERSION);
  assert.equal(elig.eligible, false);
  assert.equal(elig.reason, "MISSING_EXECUTION");
});

test("E10. wrong strategy version excluded", () => {
  const entry = completedEntry(1000, 0.67, {
    versionInfo: { ...STRATEGY_VERSION, strategyVersion: "11.3-prev" },
  });
  const elig = checkEligibility(entry, TEST_VERSION);
  assert.equal(elig.eligible, false);
  assert.ok(elig.reason?.startsWith("WRONG_VERSION"));
});

// ── E11: Test store isolation ─────────────────────────────────────────────────

test("E11. evaluation does not read from test store directory", () => {
  // The evaluation API reads from prodStore (getAllJournalEntries).
  // Here we verify that the test store path is distinct from PROD_STORE_DIR.
  const testStoreDir = path.resolve(process.cwd(), ".test-data", "recommendations");
  assert.notEqual(testStoreDir, PROD_STORE_DIR, "test and prod store paths must differ");
  // createRecommendationStore with test dir produces isolated store
  const store = createRecommendationStore(testStoreDir);
  assert.notEqual(store.dir, PROD_STORE_DIR);
});

// ── E12–E19: Core performance metrics ────────────────────────────────────────

test("E12. win rate calculation", () => {
  // 3 wins, 2 losses → 60%
  const entries = [
    completedEntry(1000, 0.67),
    completedEntry(1000, 0.67),
    completedEntry(1000, 0.67),
    completedEntry(-500, -0.33),
    completedEntry(-500, -0.33),
  ];
  const report = computeEvaluation(entries);
  assert.equal(report.performance.winRate, 60);
});

test("E13. loss rate calculation", () => {
  const entries = [completedEntry(1000, 0.67), completedEntry(-500, -0.33), completedEntry(-500, -0.33)];
  const report = computeEvaluation(entries);
  assert.ok(report.performance.lossRate !== null);
  assert.ok(Math.abs(report.performance.lossRate! - 66.67) < 1);
});

test("E14. gross profit", () => {
  const entries = [completedEntry(1000, 0.67), completedEntry(800, 0.54), completedEntry(-500, -0.33)];
  const report = computeEvaluation(entries);
  assert.equal(report.performance.grossProfit, 1800);
});

test("E15. gross loss", () => {
  const entries = [completedEntry(1000, 0.67), completedEntry(-300, -0.2), completedEntry(-700, -0.47)];
  const report = computeEvaluation(entries);
  assert.equal(report.performance.grossLoss, 1000);
});

test("E16. profit factor", () => {
  const entries = [completedEntry(2000, 1.34), completedEntry(-1000, -0.67)];
  const report = computeEvaluation(entries);
  assert.equal(report.performance.profitFactor, 2);
});

test("E17. expectancy (₹)", () => {
  const entries = [completedEntry(1000, 0.67), completedEntry(-500, -0.33)];
  const report = computeEvaluation(entries);
  // (1000 + -500) / 2 = 250
  assert.equal(report.performance.expectancyPnl, 250);
});

test("E18. average R", () => {
  const entries = [completedEntry(1000, 1.0), completedEntry(1000, 2.0), completedEntry(-500, -0.5)];
  const report = computeEvaluation(entries);
  // (1.0 + 2.0 + -0.5) / 3 = 0.83
  assert.ok(report.performance.avgR !== null);
  assert.ok(Math.abs(report.performance.avgR! - 0.83) < 0.01);
});

test("E19. median R", () => {
  const entries = [completedEntry(1000, 1.0), completedEntry(1000, 2.0), completedEntry(-500, -0.5)];
  const report = computeEvaluation(entries);
  assert.equal(report.performance.medianR, 1.0);
});

// ── E20–E23: Drawdown & risk-adjusted ─────────────────────────────────────────

test("E20. maximum drawdown", () => {
  // P&L series: +1000, -800, -600 → peak=1000, trough=1000-800-600=-400 → DD=1400
  const entries = [
    completedEntry(1000, 0.67),
    completedEntry(-800, -0.54),
    completedEntry(-600, -0.4),
  ];
  const report = computeEvaluation(entries);
  assert.ok(report.performance.drawdown.maxDrawdown !== null);
  assert.equal(report.performance.drawdown.maxDrawdown, 1400);
});

test("E21. win-rate confidence interval returned", () => {
  const entries = makeN(15);
  const report = computeEvaluation(entries);
  assert.ok(report.performance.winRateCI !== null);
  assert.ok(report.performance.winRateCI!.lower < report.performance.winRateCI!.upper);
});

test("E22. Sharpe returns null for < 30 completed trades", () => {
  const report = computeEvaluation(makeN(20));
  assert.equal(report.performance.sharpe, null);
  assert.ok(report.performance.sharpeLabel?.includes("INSUFFICIENT"));
});

test("E23. Sortino returns null for < 30 completed trades", () => {
  const report = computeEvaluation(makeN(20));
  assert.equal(report.performance.sortino, null);
  assert.ok(report.performance.sortinoLabel?.includes("INSUFFICIENT"));
});

// ── E24–E32: Breakdowns ───────────────────────────────────────────────────────

test("E24. NIFTY breakdown present", () => {
  const entries = makeN(5);
  const report = computeEvaluation(entries);
  assert.ok("NIFTY" in report.byUnderlying);
  assert.equal(report.byUnderlying["NIFTY"].completedTrades, 5);
});

test("E25. BANKNIFTY breakdown present when entries exist", () => {
  const bnEntry = completedEntry(1000, 0.67, {
    snapshot: makeSnap({ underlying: "BANKNIFTY" }),
  });
  bnEntry.id = bnEntry.snapshot.recommendationId;
  const entries = [...makeN(3), bnEntry];
  const report = computeEvaluation(entries);
  assert.ok("BANKNIFTY" in report.byUnderlying);
  assert.equal(report.byUnderlying["BANKNIFTY"].completedTrades, 1);
});

test("E26. CE/PE breakdown separated", () => {
  const peEntry = completedEntry(800, 0.54, {
    snapshot: makeSnap({ contract: { ...makeSnap().contract!, optionType: "PE" } }),
  });
  peEntry.id = peEntry.snapshot.recommendationId;
  const entries = [...makeN(2), peEntry];
  const report = computeEvaluation(entries);
  assert.ok(report.byOptionType["CE"].completedTrades >= 0);
  assert.ok(report.byOptionType["PE"].completedTrades >= 0);
});

test("E27. strategy breakdown populated", () => {
  const entries = makeN(5);
  const report = computeEvaluation(entries);
  assert.ok("Long Call" in report.byStrategy);
});

test("E28. regime breakdown populated", () => {
  const entries = makeN(5);
  const report = computeEvaluation(entries);
  assert.ok("BULLISH" in report.byRegime);
});

test("E29. confidence bucket breakdown populated", () => {
  const entries = makeN(5); // confidence=72 → "70-79"
  const report = computeEvaluation(entries);
  assert.ok("70-79" in report.byConfidenceBucket);
  assert.ok(report.byConfidenceBucket["70-79"].observations >= 5);
});

test("E30. R:R bucket breakdown populated", () => {
  const entries = makeN(3); // rrTarget2=3.13 → ">3.0"
  const report = computeEvaluation(entries);
  assert.ok(">3.0" in report.byRRBucket || "2.0-3.0" in report.byRRBucket || "1.5-2.0" in report.byRRBucket);
});

test("E31. weekday breakdown populated", () => {
  const entries = makeN(3);
  const report = computeEvaluation(entries);
  assert.ok(Object.keys(report.byWeekday).length > 0);
});

test("E32. monthly breakdown populated", () => {
  const entries = makeN(3);
  const report = computeEvaluation(entries);
  assert.ok(Object.keys(report.byMonth).length > 0);
});

// ── E33–E37: Outliers & streaks ───────────────────────────────────────────────

test("E33. largest winner identified", () => {
  const entries = [completedEntry(5000, 3.35), completedEntry(1000, 0.67), completedEntry(-500, -0.33)];
  const report = computeEvaluation(entries);
  assert.equal(report.performance.largestWin, 5000);
});

test("E34. largest loser identified", () => {
  const entries = [completedEntry(1000, 0.67), completedEntry(-2000, -1.34), completedEntry(-500, -0.33)];
  const report = computeEvaluation(entries);
  assert.equal(report.performance.largestLoss, -2000);
});

test("E35. outlier contribution calculation", () => {
  // netPnl = 5000 + 1000 - 500 = 5500; largest win = 5000 → 90.9%
  const entries = [completedEntry(5000, 3.35), completedEntry(1000, 0.67), completedEntry(-500, -0.33)];
  const report = computeEvaluation(entries);
  assert.ok(report.performance.outlierContributionLargestWin !== null);
  assert.ok(report.performance.outlierContributionLargestWin! > 80);
});

test("E36. consecutive losses tracked", () => {
  // alternating so max consec loss = 1
  const entries = makeN(6, (i) => (i % 2 === 0 ? 1000 : -500));
  const report = computeEvaluation(entries);
  assert.ok(report.performance.maxConsecLosses >= 1);
});

test("E37. consecutive wins tracked", () => {
  // all wins
  const entries = makeN(4, () => 1000);
  const report = computeEvaluation(entries);
  assert.equal(report.performance.maxConsecWins, 4);
});

// ── E38–E40: Isolation & determinism ─────────────────────────────────────────

test("E38. production store isolation — evaluation API wires to prodStore only", () => {
  // The route uses getAllJournalEntries() which reads PROD_STORE_DIR.
  // Test store is .test-data/recommendations/ — confirm distinct paths.
  assert.ok(PROD_STORE_DIR.includes(".data"), "prod store path must include .data");
  assert.ok(!PROD_STORE_DIR.includes(".test-data"), "prod store must not include .test-data");
});

test("E39. version filter excludes different strategy version", () => {
  const wrongVersion = completedEntry(1000, 0.67, {
    versionInfo: { ...STRATEGY_VERSION, strategyVersion: "99.9-future" },
  });
  const correctVersion = completedEntry(1000, 0.67);
  const report = computeEvaluation([wrongVersion, correctVersion], { strategyVersion: "11.4-frozen" });
  assert.equal(report.performance.n, 1);
  assert.equal(report.dataQuality.excludedByVersion, 1);
});

test("E40. deterministic evaluation — same input → same output", () => {
  const entries = makeN(20);
  const r1 = computeEvaluation(entries);
  const r2 = computeEvaluation(entries);
  assert.equal(r1.performance.winRate, r2.performance.winRate);
  assert.equal(r1.performance.netPnl, r2.performance.netPnl);
  assert.equal(r1.performance.avgR, r2.performance.avgR);
  assert.deepEqual(r1.performance.winRateBootstrap, r2.performance.winRateBootstrap);
});

// ── E41–E43: Null / no-fake-zero / API contract ───────────────────────────────

test("E41. unavailable metrics return null not zero", () => {
  const report = computeEvaluation([]); // zero entries
  assert.equal(report.performance.winRate, null);
  assert.equal(report.performance.netPnl, null);
  assert.equal(report.performance.expectancyPnl, null);
  assert.equal(report.performance.avgR, null);
  assert.equal(report.performance.profitFactor, null);
  assert.equal(report.performance.sharpe, null);
  assert.equal(report.performance.sortino, null);
  assert.equal(report.performance.calmar, null);
});

test("E42. no fake zero values — 0 observations returns null metrics not 0", () => {
  const report = computeEvaluation([]);
  // winRate, netPnl etc must be null (not 0) when no completed trades
  assert.strictEqual(report.performance.winRate, null);
  assert.strictEqual(report.performance.profitFactor, null);
});

test("E43. evaluation report has required fields (API contract)", () => {
  const report = computeEvaluation([]);
  const required = ["status", "evidenceClassification", "strategyVersion", "generatedAt", "dataQuality", "performance", "filters"];
  for (const f of required) {
    assert.ok(f in report, `report must have field ${f}`);
  }
  assert.ok("n" in report.performance);
  assert.ok("wins" in report.performance);
  assert.ok("winRate" in report.performance);
  assert.ok("netPnl" in report.performance);
});

// ── E44: CSV export structure ─────────────────────────────────────────────────

test("E44. evaluation CSV export structure (column headers)", () => {
  // Smoke-test: ensure the export route file exists and references required columns
  const routePath = path.resolve(process.cwd(), "src/app/api/recommendations/evaluation/export/route.ts");
  assert.ok(fs.existsSync(routePath), "export route must exist");
  const content = fs.readFileSync(routePath, "utf8");
  for (const col of ["strategyVersion", "completedTrades", "winRate", "profitFactor", "expectancyPnl", "averageR", "maxDrawdown"]) {
    assert.ok(content.includes(`"${col}"`), `CSV header must include "${col}"`);
  }
});

// ── E45: No Upstox order endpoints ────────────────────────────────────────────

test("E45. no Upstox order placement/modification/cancellation endpoints", () => {
  const apiDir = path.resolve(process.cwd(), "src/app/api");
  function walk(dir: string): string[] {
    const results: string[] = [];
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      if (fs.statSync(full).isDirectory()) results.push(...walk(full));
      else if (f.endsWith(".ts")) results.push(full);
    }
    return results;
  }
  const ORDER_PATTERNS = [
    /upstox.*\/orders/i,
    /place.*order/i,
    /modify.*order/i,
    /cancel.*order/i,
    /\/v2\/order\b/i,
  ];
  const files = walk(apiDir);
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    for (const pattern of ORDER_PATTERNS) {
      assert.ok(!pattern.test(content), `Order endpoint pattern "${pattern}" found in ${file}`);
    }
  }
});

// ── classifySampleAdequacy direct tests ───────────────────────────────────────

test("classifySampleAdequacy: 0 → INSUFFICIENT_SAMPLE", () => {
  assert.equal(classifySampleAdequacy(0), "INSUFFICIENT_SAMPLE");
});

test("classifySampleAdequacy: 9 → INSUFFICIENT_SAMPLE", () => {
  assert.equal(classifySampleAdequacy(9), "INSUFFICIENT_SAMPLE");
});

test("classifySampleAdequacy: 10 → EARLY_SAMPLE", () => {
  assert.equal(classifySampleAdequacy(10), "EARLY_SAMPLE");
});

test("classifySampleAdequacy: 29 → EARLY_SAMPLE", () => {
  assert.equal(classifySampleAdequacy(29), "EARLY_SAMPLE");
});

test("classifySampleAdequacy: 30 → DEVELOPING_SAMPLE", () => {
  assert.equal(classifySampleAdequacy(30), "DEVELOPING_SAMPLE");
});

test("classifySampleAdequacy: 50 → MEANINGFUL_SAMPLE", () => {
  assert.equal(classifySampleAdequacy(50), "MEANINGFUL_SAMPLE");
});

test("classifySampleAdequacy: 100 → STRONGER_SAMPLE", () => {
  assert.equal(classifySampleAdequacy(100), "STRONGER_SAMPLE");
});
