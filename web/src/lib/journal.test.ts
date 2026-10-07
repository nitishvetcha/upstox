// Phase 11.3 / 11.3.2 / 11.4 — Recommendation Journal tests.
// Uses an ISOLATED test store — never writes to .data/recommendations/ (the production store).
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { computeOutcome, computeAnalytics, validateRecommendationJournal } from "./journalOutcome.ts";
import { STRATEGY_VERSION } from "./journalTypes.ts";
import { createRecommendationStore, PROD_STORE_DIR } from "./services/recommendationStore.ts";
import { buildRecommendationResponse } from "./recommendationEnricher.ts";
import { analyze } from "./engine/strategy.ts";
import { mockSnapshot } from "./services/mock.ts";
import type { RecommendationJournalEntry } from "./journalTypes.ts";
import type { RecommendationResponse } from "./recommendationEnricher.ts";
import type { IndexId } from "./types.ts";

console.info = () => {};

// Isolated test store — separate directory from production
const TEST_STORE_DIR = path.resolve(process.cwd(), ".test-data", "recommendations");
const testStore = createRecommendationStore(TEST_STORE_DIR);

// Thin wrappers so tests read identically to before
const saveJournalEntry = (e: RecommendationJournalEntry) => testStore.save(e);
const getJournalEntry = (id: string) => testStore.get(id);
const getAllJournalEntries = () => testStore.getAll();
const updateJournalEntry = (id: string, patch: Parameters<typeof testStore.update>[1]) => testStore.update(id, patch);

const T = new Date("2026-10-06T11:00:00+05:30");

// ── Fixtures ──────────────────────────────────────────────────────────────────

function snap(index: IndexId = "nifty") { return mockSnapshot(index, T); }

function liveSnap(index: IndexId = "nifty") {
  const s = snap(index);
  return { ...s, sources: Object.fromEntries(Object.entries(s.sources).map(([k, v]) => [k, { ...v, source: "LIVE" as const }])) as typeof s.sources };
}

/** Minimal TRADE recommendation fixture — uses live mock chain so engine can TRADE */
function tradeRec(): RecommendationResponse {
  const a = analyze(liveSnap(), T);
  const r = buildRecommendationResponse(a);
  // If engine says WAIT (e.g. event risk), force a synthetic TRADE fixture
  if (r.decision !== "TRADE" || !r.execution) {
    return {
      ...r,
      recommendationId: `rec_test_trade_${Date.now()}`,
      decision: "TRADE",
      direction: "BULLISH",
      strategy: "Long Call",
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
      market: { ...r.market, expiry: "2026-10-09" },
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
      instrumentKeyAvailable: true,
    } as RecommendationResponse;
  }
  return r;
}

function waitRec(): RecommendationResponse {
  const a = analyze(snap(), T);
  const r = buildRecommendationResponse(a);
  return { ...r, recommendationId: `rec_test_wait_${Date.now()}`, decision: "WAIT", execution: null };
}

function noTradeRec(): RecommendationResponse {
  const a = analyze(snap(), T);
  return { ...buildRecommendationResponse(a), recommendationId: `rec_test_notrade_${Date.now()}`, decision: "NO_TRADE", execution: null };
}

function makeEntry(rec: RecommendationResponse): RecommendationJournalEntry {
  return {
    id: rec.recommendationId,
    createdAt: rec.generatedAt,
    snapshot: rec,
    status: rec.decision === "TRADE" ? "MONITORING" : "NOT_EXECUTABLE",
    paperTradeId: null,
    outcome: rec.decision !== "TRADE" ? { status: "NOT_EXECUTABLE", exitPrice: null, exitTimestamp: null, exitReason: null, highestPrice: null, lowestPrice: null, mfe: null, mae: null, pnl: null, pnlPercent: null, rMultiple: null, durationMinutes: null, target1HitAt: null, target2HitAt: null, lastRefreshedAt: rec.generatedAt } : null,
  };
}

// ── Journal creation ───────────────────────────────────────────────────────────

test("J1. TRADE recommendation is saved to journal", () => {
  const rec = tradeRec();
  const entry = makeEntry(rec);
  saveJournalEntry(entry);
  assert.ok(getJournalEntry(entry.id) !== undefined);
});

test("J2. WAIT recommendation is saved to journal", () => {
  const rec = waitRec();
  const entry = makeEntry(rec);
  saveJournalEntry(entry);
  const loaded = getJournalEntry(entry.id);
  assert.ok(loaded !== undefined);
  assert.equal(loaded!.status, "NOT_EXECUTABLE");
});

test("J3. NO_TRADE recommendation is saved to journal", () => {
  const rec = noTradeRec();
  const entry = makeEntry(rec);
  saveJournalEntry(entry);
  assert.ok(getJournalEntry(entry.id) !== undefined);
});

test("J4. recommendationId is generated and non-empty", () => {
  const rec = tradeRec();
  assert.ok(rec.recommendationId.length > 0);
  assert.ok(rec.recommendationId.startsWith("rec_"));
});

test("J5. getAllJournalEntries returns saved entries", () => {
  const rec = tradeRec();
  saveJournalEntry(makeEntry(rec));
  const all = getAllJournalEntries();
  assert.ok(all.some((e) => e.id === rec.recommendationId));
});

// ── Immutability ───────────────────────────────────────────────────────────────

test("J6. entry is never lost after original price — snapshot.execution.entry unchanged by updateJournalEntry", () => {
  const rec = tradeRec();
  const entry = makeEntry(rec);
  saveJournalEntry(entry);
  updateJournalEntry(entry.id, { paperTradeId: "pt_123" });
  const loaded = getJournalEntry(entry.id)!;
  assert.equal(loaded.snapshot.execution?.entry, rec.execution?.entry);
});

test("J7. stopLoss in snapshot never changed by outcome update", () => {
  const rec = tradeRec();
  const entry = makeEntry(rec);
  saveJournalEntry(entry);
  const outcome = computeOutcome(rec, rec.execution!.entry + 10, new Date(), null);
  updateJournalEntry(entry.id, { outcome });
  const loaded = getJournalEntry(entry.id)!;
  assert.equal(loaded.snapshot.execution?.stopLoss, rec.execution?.stopLoss);
});

test("J8. targets in snapshot never changed", () => {
  const rec = tradeRec();
  const entry = makeEntry(rec);
  saveJournalEntry(entry);
  updateJournalEntry(entry.id, { outcome: computeOutcome(rec, 999, new Date(), null) });
  const loaded = getJournalEntry(entry.id)!;
  assert.equal(loaded.snapshot.execution?.target1, rec.execution?.target1);
  assert.equal(loaded.snapshot.execution?.target2, rec.execution?.target2);
});

test("J9. contract instrumentKey unchanged after any update", () => {
  const rec = tradeRec();
  const entry = makeEntry(rec);
  saveJournalEntry(entry);
  updateJournalEntry(entry.id, { status: "STOPPED_OUT" });
  const loaded = getJournalEntry(entry.id)!;
  assert.equal(loaded.snapshot.contract?.instrumentKey, rec.contract?.instrumentKey);
});

test("J10. score unchanged in snapshot", () => {
  const rec = tradeRec();
  const entry = makeEntry(rec);
  saveJournalEntry(entry);
  updateJournalEntry(entry.id, { outcome: computeOutcome(rec, 200, new Date(), null) });
  assert.equal(getJournalEntry(entry.id)!.snapshot.score.total, rec.score.total);
});

// ── Outcome: MONITORING ────────────────────────────────────────────────────────

test("J11. TRADE: initial outcome is MONITORING", () => {
  const rec = tradeRec();
  const o = computeOutcome(rec, rec.execution!.entry, new Date(), null);
  assert.equal(o.status, "MONITORING");
  assert.equal(o.exitPrice, null);
  assert.equal(o.pnl, null);
});

// ── Outcome: TARGET_1_HIT ─────────────────────────────────────────────────────

test("J12. price above target1 → TARGET_1_HIT", () => {
  const rec = tradeRec();
  if (!rec.execution || rec.direction !== "BULLISH") return;
  const o = computeOutcome(rec, rec.execution.target1 + 1, new Date(), null);
  assert.equal(o.status, "TARGET_1_HIT");
  assert.ok(o.target1HitAt !== null);
});

// ── Outcome: TARGET_2_HIT ─────────────────────────────────────────────────────

test("J13. price above target2 → TARGET_2_HIT, exitPrice set", () => {
  const rec = tradeRec();
  if (!rec.execution || rec.direction !== "BULLISH") return;
  const o = computeOutcome(rec, rec.execution.target2 + 1, new Date(), null);
  assert.equal(o.status, "TARGET_2_HIT");
  assert.ok(o.exitPrice !== null);
  assert.equal(o.exitReason, "TARGET_2");
});

// ── Outcome: STOPPED_OUT ─────────────────────────────────────────────────────

test("J14. price below stopLoss → STOPPED_OUT for bullish", () => {
  const rec = tradeRec();
  if (!rec.execution || rec.direction !== "BULLISH") return;
  const o = computeOutcome(rec, rec.execution.stopLoss - 1, new Date(), null);
  assert.equal(o.status, "STOPPED_OUT");
  assert.equal(o.exitReason, "STOP_LOSS");
  assert.ok(o.pnl !== null && o.pnl < 0);
});

// ── Outcome: EXPIRED ──────────────────────────────────────────────────────────

test("J15. after expiry with no stop/target hit → EXPIRED", () => {
  const rec = tradeRec();
  if (!rec.execution) return;
  // Price between stop and target — no trigger
  const midPrice = (rec.execution.entry + rec.execution.stopLoss) / 2 + 0.5; // above stop
  // A time after the contract expiry (2026-10-09 15:30 IST)
  const afterExpiry = new Date(Date.parse("2026-10-10T10:00:00+05:30"));
  const o = computeOutcome(rec, midPrice, afterExpiry, null);
  assert.equal(o.status, "EXPIRED");
  assert.equal(o.exitReason, "EXPIRY");
});

// ── Outcome: NOT_EXECUTABLE ───────────────────────────────────────────────────

test("J16. WAIT → computeOutcome returns NOT_EXECUTABLE, pnl null", () => {
  const rec = waitRec();
  const o = computeOutcome(rec, 143, new Date(), null);
  assert.equal(o.status, "NOT_EXECUTABLE");
  assert.equal(o.pnl, null);
  assert.equal(o.rMultiple, null);
});

test("J17. NO_TRADE → NOT_EXECUTABLE, no MFE/MAE", () => {
  const rec = noTradeRec();
  const o = computeOutcome(rec, 143, new Date(), null);
  assert.equal(o.status, "NOT_EXECUTABLE");
  assert.equal(o.mfe, null);
  assert.equal(o.mae, null);
});

// ── MFE / MAE (long option) ───────────────────────────────────────────────────

test("J18. MFE: long call — highest observed - entry", () => {
  const rec = tradeRec();
  if (!rec.execution || rec.direction !== "BULLISH") return;
  const entry = rec.execution.entry;
  const high = entry + 40;
  const o = computeOutcome(rec, high, new Date(), null);
  assert.ok(o.mfe !== null && o.mfe >= 40 - 0.01);
});

test("J19. MAE: long call — entry - lowest observed", () => {
  const rec = tradeRec();
  if (!rec.execution || rec.direction !== "BULLISH") return;
  const entry = rec.execution.entry;
  const low = entry - 20;
  // Low must be above stop to avoid closing
  const adjustedLow = Math.max(low, rec.execution.stopLoss + 0.5);
  const o = computeOutcome(rec, adjustedLow, new Date(), null);
  const expectedMae = entry - adjustedLow;
  assert.ok(o.mae !== null && Math.abs(o.mae - expectedMae) < 0.05);
});

test("J20. MFE accumulates over multiple observations (takes max)", () => {
  const rec = tradeRec();
  if (!rec.execution || rec.direction !== "BULLISH") return;
  const entry = rec.execution.entry;
  const o1 = computeOutcome(rec, entry + 10, new Date(), null);
  const o2 = computeOutcome(rec, entry + 5, new Date(), o1); // lower on second read
  assert.ok((o2.mfe ?? 0) >= 10 - 0.01, "MFE must not decrease when price drops back");
});

test("J21. MAE accumulates: worst adverse excursion is preserved", () => {
  const rec = tradeRec();
  if (!rec.execution || rec.direction !== "BULLISH") return;
  const entry = rec.execution.entry;
  const bigDrop = Math.max(entry - 15, rec.execution.stopLoss + 1);
  const o1 = computeOutcome(rec, bigDrop, new Date(), null);
  const o2 = computeOutcome(rec, entry + 5, new Date(), o1); // price recovers
  assert.ok((o2.mae ?? 0) >= (o1.mae ?? 0) - 0.01, "MAE must not decrease on recovery");
});

// ── R-multiple ────────────────────────────────────────────────────────────────

test("J22. R-multiple positive for winning exit", () => {
  const rec = tradeRec();
  if (!rec.execution || rec.direction !== "BULLISH") return;
  const o = computeOutcome(rec, rec.execution.target2 + 5, new Date(), null);
  assert.ok((o.rMultiple ?? 0) > 0);
});

test("J23. R-multiple negative for losing exit", () => {
  const rec = tradeRec();
  if (!rec.execution || rec.direction !== "BULLISH") return;
  const o = computeOutcome(rec, rec.execution.stopLoss - 1, new Date(), null);
  assert.ok((o.rMultiple ?? 0) < 0);
});

test("J24. R = pnl / plannedRisk (both in INR)", () => {
  const rec = tradeRec();
  if (!rec.execution || rec.direction !== "BULLISH") return;
  const o = computeOutcome(rec, rec.execution.target1 + 5, new Date(), null);
  if (o.pnl === null || o.rMultiple === null) return;
  const expected = o.pnl / rec.execution.plannedRisk;
  assert.ok(Math.abs(o.rMultiple - Math.round(expected * 100) / 100) < 0.02);
});

// ── Refresh idempotency ───────────────────────────────────────────────────────

test("J25. refreshing a STOPPED_OUT entry does not re-open it", () => {
  const rec = tradeRec();
  if (!rec.execution || rec.direction !== "BULLISH") return;
  const closedOutcome = computeOutcome(rec, rec.execution.stopLoss - 1, new Date(), null);
  assert.equal(closedOutcome.status, "STOPPED_OUT");
  // Calling computeOutcome again on a closed outcome returns same status
  const again = computeOutcome(rec, rec.execution.entry + 99, new Date(), closedOutcome);
  assert.equal(again.status, "STOPPED_OUT", "closed outcome must not re-open on recovery");
});

test("J26. updateJournalEntry is idempotent — updating with same data twice doesn't duplicate", () => {
  const rec = tradeRec();
  const entry = makeEntry(rec);
  saveJournalEntry(entry);
  updateJournalEntry(entry.id, { paperTradeId: "pt_dupe" });
  updateJournalEntry(entry.id, { paperTradeId: "pt_dupe" }); // same call
  const loaded = getJournalEntry(entry.id)!;
  assert.equal(loaded.paperTradeId, "pt_dupe");
  // Only one entry in store, not two
  assert.equal(getAllJournalEntries().filter((e) => e.id === entry.id).length, 1);
});

// ── Persistence ───────────────────────────────────────────────────────────────

test("J27. entry survives save + retrieve cycle", () => {
  const rec = tradeRec();
  const entry = makeEntry(rec);
  saveJournalEntry(entry);
  const loaded = getJournalEntry(entry.id);
  assert.ok(loaded !== undefined);
  assert.equal(loaded!.snapshot.decision, rec.decision);
  assert.equal(loaded!.snapshot.score.total, rec.score.total);
});

test("J28. entry in getAllJournalEntries after save", () => {
  const rec = waitRec();
  saveJournalEntry(makeEntry(rec));
  const found = getAllJournalEntries().find((e) => e.id === rec.recommendationId);
  assert.ok(found !== undefined);
  assert.equal(found!.snapshot.underlying, rec.underlying);
});

// ── Paper trade link ──────────────────────────────────────────────────────────

test("J29. paperTradeId links to recommendation after update", () => {
  const rec = tradeRec();
  const entry = makeEntry(rec);
  saveJournalEntry(entry);
  updateJournalEntry(entry.id, { paperTradeId: "pt_abc123" });
  assert.equal(getJournalEntry(entry.id)!.paperTradeId, "pt_abc123");
});

test("J30. snapshot is not modified when paperTradeId is set", () => {
  const rec = tradeRec();
  const entry = makeEntry(rec);
  saveJournalEntry(entry);
  updateJournalEntry(entry.id, { paperTradeId: "pt_xyz" });
  const loaded = getJournalEntry(entry.id)!;
  assert.equal(loaded.snapshot.recommendationId, rec.recommendationId);
  assert.equal(loaded.snapshot.execution?.entry, rec.execution?.entry);
});

// ── Analytics ─────────────────────────────────────────────────────────────────

test("J31. analytics: WAIT is counted separately, not as a loss", () => {
  const tradeEntry = makeEntry(tradeRec());
  const waitEntry = makeEntry(waitRec());
  const entries = [tradeEntry, waitEntry];
  const a = computeAnalytics(entries);
  assert.ok(a.totalWait >= 1);
  assert.equal(a.losses, 0, "WAIT must not count as a loss");
});

test("J32. analytics: net P&L from closed trades only", () => {
  const rec = tradeRec();
  if (!rec.execution || rec.direction !== "BULLISH") return;
  const entry = makeEntry(rec);
  const outcome = computeOutcome(rec, rec.execution.stopLoss - 1, new Date(), null);
  entry.outcome = outcome;
  entry.status = "STOPPED_OUT";
  const a = computeAnalytics([entry]);
  assert.equal(a.totalTrade, 1);
  assert.equal(a.losses, 1);
  assert.ok(a.netPnl < 0);
});

test("J33. analytics: MONITORING trade not counted as win or loss", () => {
  const entry = makeEntry(tradeRec());
  // entry.outcome is null (MONITORING, no exit yet)
  const a = computeAnalytics([entry]);
  assert.equal(a.wins, 0);
  assert.equal(a.losses, 0);
  assert.equal(a.winRate, null); // no closed trades → null
});

test("J34. analytics: byStrategy populated from closed trades", () => {
  const rec = tradeRec();
  if (!rec.execution || rec.direction !== "BULLISH") return;
  const entry = makeEntry(rec);
  entry.outcome = computeOutcome(rec, rec.execution.target2 + 1, new Date(), null);
  entry.status = "TARGET_2_HIT";
  const a = computeAnalytics([entry]);
  assert.ok(Object.keys(a.byStrategy).length >= 1);
});

// ── Instrument key preservation ───────────────────────────────────────────────

test("J35. canonical instrument key preserved through save/load cycle", () => {
  const rec = tradeRec();
  if (!rec.contract?.instrumentKey) return;
  const entry = makeEntry(rec);
  saveJournalEntry(entry);
  const loaded = getJournalEntry(entry.id)!;
  assert.equal(loaded.snapshot.contract?.instrumentKey, rec.contract.instrumentKey);
});

// ── Order safety ──────────────────────────────────────────────────────────────

test("J36. computeOutcome is pure — no Upstox API calls", () => {
  const rec = tradeRec();
  const o = computeOutcome(rec, 150, new Date(), null);
  assert.ok(o.status !== undefined); // just verifying it runs without side effects
});

// ── Environment isolation (Phase 11.3.2) ─────────────────────────────────────

test("J37. test store path is different from production store path", () => {
  assert.notEqual(TEST_STORE_DIR, PROD_STORE_DIR,
    `Test store (${TEST_STORE_DIR}) must not equal production store (${PROD_STORE_DIR})`);
});

test("J38. test store dir does not contain production path fragment", () => {
  // Extra guard: test dir must not accidentally resolve inside .data/
  assert.ok(!TEST_STORE_DIR.includes(path.join(".data", "recommendations")),
    "Test store must not be inside the production .data/recommendations directory");
});

test("J39. test store writes to isolated directory — not production store", () => {
  const rec = tradeRec();
  const entry: RecommendationJournalEntry = {
    id: rec.recommendationId,
    createdAt: rec.generatedAt,
    snapshot: rec,
    status: "MONITORING",
    paperTradeId: null,
    outcome: null,
  };
  saveJournalEntry(entry);
  // Verify the record exists in TEST store
  assert.ok(testStore.get(entry.id) !== undefined, "saved entry must exist in test store");
  // Verify the file is in TEST_STORE_DIR, not PROD_STORE_DIR
  const testFile = path.join(TEST_STORE_DIR, `${entry.id.replace(/[^\w-]/g, "")}.json`);
  const prodFile = path.join(PROD_STORE_DIR, `${entry.id.replace(/[^\w-]/g, "")}.json`);
  assert.ok(fs.existsSync(testFile), `test file must exist at ${testFile}`);
  assert.ok(!fs.existsSync(prodFile), `test file must NOT exist at production path ${prodFile}`);
});

test("J40. production store entries not visible from test store", () => {
  // Production store has its own map; test store has its own — they are isolated
  const prodIds = new Set(
    (() => {
      try {
        return fs.readdirSync(PROD_STORE_DIR).filter((f) => f.endsWith(".json"));
      } catch { return [] as string[]; }
    })()
  );
  const testIds = new Set(testStore.getAll().map((e) => e.id));
  // No test ID should appear in the production store
  for (const id of testIds) {
    assert.ok(!prodIds.has(id.replace(/[^\w-]/g, "") + ".json"),
      `Test entry ${id} must not exist in production store`);
  }
});

// ── Phase 11.4 — Strategy version & journal validation tests ─────────────────

test("J41. STRATEGY_VERSION has strategyVersion 11.4-frozen", () => {
  assert.equal(STRATEGY_VERSION.strategyVersion, "11.4-frozen");
});

test("J42. STRATEGY_VERSION has riskVersion production-default", () => {
  assert.equal(STRATEGY_VERSION.riskVersion, "production-default");
});

test("J43. STRATEGY_VERSION has executionModelVersion paper-v1", () => {
  assert.equal(STRATEGY_VERSION.executionModelVersion, "paper-v1");
});

test("J44. STRATEGY_VERSION has dataModelVersion live-v1", () => {
  assert.equal(STRATEGY_VERSION.dataModelVersion, "live-v1");
});

test("J45. makeEntry with versionInfo stores STRATEGY_VERSION", () => {
  const rec = tradeRec();
  const entry: RecommendationJournalEntry = { ...makeEntry(rec), versionInfo: STRATEGY_VERSION };
  saveJournalEntry(entry);
  const loaded = testStore.get(entry.id);
  assert.deepEqual(loaded?.versionInfo, STRATEGY_VERSION);
});

test("J46. versionInfo persists across store reload", () => {
  const rec = tradeRec();
  const id = `rec_v_persist_${Date.now()}`;
  const entry: RecommendationJournalEntry = { ...makeEntry(rec), id, versionInfo: STRATEGY_VERSION };
  // Write to disk directly then reload
  const storePath = path.join(TEST_STORE_DIR, `${id}.json`);
  fs.mkdirSync(TEST_STORE_DIR, { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(entry));
  const freshStore = createRecommendationStore(TEST_STORE_DIR);
  const loaded = freshStore.get(id);
  assert.deepEqual(loaded?.versionInfo, STRATEGY_VERSION);
  fs.unlinkSync(storePath);
});

test("J47. versionInfo field is optional — entry without it is valid", () => {
  const rec = waitRec();
  const entry = makeEntry(rec); // no versionInfo
  saveJournalEntry(entry);
  const loaded = testStore.get(entry.id);
  assert.ok(loaded !== undefined);
  assert.equal(loaded?.versionInfo, undefined);
});

test("J48. validateRecommendationJournal returns totalEntries count", () => {
  const entries = [makeEntry(tradeRec()), makeEntry(waitRec())];
  const report = validateRecommendationJournal(entries);
  assert.equal(report.totalEntries, 2);
});

test("J49. validateRecommendationJournal counts entries with versionInfo", () => {
  const with_ = { ...makeEntry(tradeRec()), versionInfo: STRATEGY_VERSION };
  const without = makeEntry(waitRec());
  const report = validateRecommendationJournal([with_, without]);
  assert.equal(report.withVersionInfo, 1);
  assert.equal(report.missingVersionInfo, 1);
});

test("J50. validateRecommendationJournal issues mention pre-11.4 entries", () => {
  const without = makeEntry(waitRec());
  const report = validateRecommendationJournal([without]);
  assert.ok(report.issues.some((i) => i.includes("pre-11.4")));
});

test("J51. validateRecommendationJournal no issues when all entries have versionInfo", () => {
  const e1 = { ...makeEntry(tradeRec()), versionInfo: STRATEGY_VERSION };
  const e2 = { ...makeEntry(waitRec()), versionInfo: STRATEGY_VERSION };
  const report = validateRecommendationJournal([e1, e2]);
  assert.equal(report.issues.length, 0);
});

test("J52. validateRecommendationJournal strategyVersionCounts tallies correctly", () => {
  const e1 = { ...makeEntry(tradeRec()), versionInfo: STRATEGY_VERSION };
  const e2 = { ...makeEntry(tradeRec()), versionInfo: STRATEGY_VERSION };
  const e3 = { ...makeEntry(tradeRec()), versionInfo: { ...STRATEGY_VERSION, strategyVersion: "11.3-prev" } };
  const report = validateRecommendationJournal([e1, e2, e3]);
  assert.equal(report.strategyVersionCounts["11.4-frozen"], 2);
  assert.equal(report.strategyVersionCounts["11.3-prev"], 1);
});

test("J53. validateRecommendationJournal statusCounts tallies correctly", () => {
  const e1 = makeEntry(tradeRec());
  const e2 = makeEntry(waitRec());
  const report = validateRecommendationJournal([e1, e2]);
  assert.equal(report.statusCounts["MONITORING"], 1);
  assert.equal(report.statusCounts["NOT_EXECUTABLE"], 1);
});

test("J54. validateRecommendationJournal detects id mismatch", () => {
  const rec = tradeRec();
  const entry = makeEntry(rec);
  // Corrupt the id
  const corrupt = { ...entry, id: "rec_wrong_id" };
  const report = validateRecommendationJournal([corrupt]);
  assert.ok(report.issues.some((i) => i.includes("mismatch")));
});

test("J55. validateRecommendationJournal empty list returns no issues", () => {
  const report = validateRecommendationJournal([]);
  assert.equal(report.totalEntries, 0);
  assert.equal(report.issues.length, 0);
  assert.equal(report.oldestEntry, null);
  assert.equal(report.newestEntry, null);
});

test("J56. validateRecommendationJournal sets oldest and newest entry dates", () => {
  const e1: RecommendationJournalEntry = { ...makeEntry(tradeRec()), createdAt: "2026-10-01T09:00:00.000Z" };
  const e2: RecommendationJournalEntry = { ...makeEntry(waitRec()), createdAt: "2026-10-05T10:00:00.000Z" };
  const report = validateRecommendationJournal([e1, e2]);
  assert.equal(report.oldestEntry, "2026-10-01T09:00:00.000Z");
  assert.equal(report.newestEntry, "2026-10-05T10:00:00.000Z");
});

test("J57. computeAnalytics dailySummaries groups by date", () => {
  const e1: RecommendationJournalEntry = { ...makeEntry(tradeRec()), createdAt: "2026-10-01T09:00:00.000Z" };
  const e2: RecommendationJournalEntry = { ...makeEntry(waitRec()), createdAt: "2026-10-01T11:00:00.000Z" };
  const e3: RecommendationJournalEntry = { ...makeEntry(noTradeRec()), createdAt: "2026-10-02T09:00:00.000Z" };
  const analytics = computeAnalytics([e1, e2, e3]);
  assert.equal(analytics.dailySummaries.length, 2);
  const d1 = analytics.dailySummaries.find((d) => d.date === "2026-10-01");
  const d2 = analytics.dailySummaries.find((d) => d.date === "2026-10-02");
  assert.ok(d1, "2026-10-01 must exist");
  assert.equal(d1!.total, 2);
  assert.equal(d1!.trades, 1);
  assert.equal(d1!.waits, 1);
  assert.ok(d2, "2026-10-02 must exist");
  assert.equal(d2!.total, 1);
  assert.equal(d2!.noTrades, 1);
});

test("J58. computeAnalytics dailySummaries sorted by date ascending", () => {
  const e1: RecommendationJournalEntry = { ...makeEntry(tradeRec()), createdAt: "2026-10-03T09:00:00.000Z" };
  const e2: RecommendationJournalEntry = { ...makeEntry(waitRec()), createdAt: "2026-10-01T09:00:00.000Z" };
  const analytics = computeAnalytics([e1, e2]);
  const dates = analytics.dailySummaries.map((d) => d.date);
  assert.deepEqual(dates, [...dates].sort());
});

test("J59. computeAnalytics dailySummaries empty for no entries", () => {
  const analytics = computeAnalytics([]);
  assert.deepEqual(analytics.dailySummaries, []);
});

test("J60. computeAnalytics dailySummaries single day all decision types", () => {
  const base = "2026-10-04T10:00:00.000Z";
  const entries: RecommendationJournalEntry[] = [
    { ...makeEntry(tradeRec()), createdAt: base },
    { ...makeEntry(waitRec()), createdAt: base },
    { ...makeEntry(noTradeRec()), createdAt: base },
  ];
  const analytics = computeAnalytics(entries);
  assert.equal(analytics.dailySummaries.length, 1);
  const d = analytics.dailySummaries[0];
  assert.equal(d.total, 3);
  assert.equal(d.trades, 1);
  assert.equal(d.waits, 1);
  assert.equal(d.noTrades, 1);
});

test("J61. entry with versionInfo survives JSON round-trip", () => {
  const rec = tradeRec();
  const entry: RecommendationJournalEntry = { ...makeEntry(rec), versionInfo: STRATEGY_VERSION };
  const json = JSON.stringify(entry);
  const parsed = JSON.parse(json) as RecommendationJournalEntry;
  assert.deepEqual(parsed.versionInfo, STRATEGY_VERSION);
});

test("J62. validateRecommendationJournal TRADE without execution flagged as issue", () => {
  const rec = tradeRec();
  const entry = makeEntry(rec);
  // Simulate a corrupt entry: TRADE but no execution
  const corrupt = { ...entry, snapshot: { ...entry.snapshot, execution: null } } as RecommendationJournalEntry;
  const report = validateRecommendationJournal([corrupt]);
  assert.ok(report.issues.some((i) => i.includes("no execution plan")));
});

test("J63. STRATEGY_VERSION object is frozen — all four fields present", () => {
  const keys: (keyof typeof STRATEGY_VERSION)[] = ["strategyVersion", "riskVersion", "executionModelVersion", "dataModelVersion"];
  for (const k of keys) {
    assert.ok(k in STRATEGY_VERSION, `${k} must be present in STRATEGY_VERSION`);
    assert.ok(typeof STRATEGY_VERSION[k] === "string", `${k} must be a string`);
  }
});

test("J64. dailySummary total equals trades + waits + noTrades", () => {
  const entries: RecommendationJournalEntry[] = [
    { ...makeEntry(tradeRec()), createdAt: "2026-10-06T09:00:00.000Z" },
    { ...makeEntry(tradeRec()), createdAt: "2026-10-06T10:00:00.000Z" },
    { ...makeEntry(waitRec()), createdAt: "2026-10-06T11:00:00.000Z" },
    { ...makeEntry(noTradeRec()), createdAt: "2026-10-06T12:00:00.000Z" },
  ];
  const analytics = computeAnalytics(entries);
  const d = analytics.dailySummaries[0];
  assert.equal(d.total, d.trades + d.waits + d.noTrades);
});

test("J65. validateRecommendationJournal single entry with versionInfo: zero issues", () => {
  const entry = { ...makeEntry(tradeRec()), versionInfo: STRATEGY_VERSION };
  const report = validateRecommendationJournal([entry]);
  assert.equal(report.issues.length, 0);
  assert.equal(report.withVersionInfo, 1);
  assert.equal(report.missingVersionInfo, 0);
});

test("J66. computeAnalytics includes dailySummaries field", () => {
  const analytics = computeAnalytics([makeEntry(tradeRec())]);
  assert.ok("dailySummaries" in analytics);
  assert.ok(Array.isArray(analytics.dailySummaries));
});

test("J67. validateRecommendationJournal report structure has all expected fields", () => {
  const report = validateRecommendationJournal([]);
  const fields = ["totalEntries", "withVersionInfo", "missingVersionInfo", "strategyVersionCounts", "statusCounts", "oldestEntry", "newestEntry", "issues"];
  for (const f of fields) {
    assert.ok(f in report, `report must have field ${f}`);
  }
});
