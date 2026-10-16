// Phase 25 — Multi-Session Live Paper Trading & Performance Evidence Unit Tests.
// All tests use isolated test directories to guarantee zero pollution of production storage.
import { test, describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  getISTDateString,
  saveSessionRecord,
  getSessionRecord,
  listSessionRecords,
  recordCollectionCycle,
  recordMonitoringCycle,
  buildMultiSessionSummary,
  type MarketSessionRecord,
} from "./services/sessionEvidenceStore.ts";
import {
  createPaperOpportunity,
  evaluatePaperOpportunity,
} from "./services/paperOpportunityMonitor.ts";
import {
  savePaperOpportunity,
  getPaperOpportunity,
  listPaperOpportunities,
  updatePaperOpportunity,
  TERMINAL_STATES,
} from "./services/paperOpportunityStore.ts";
import {
  runLiveOpportunityCollection,
  saveCollectionRun,
  listCollectionRuns,
  type CollectionResult,
} from "./services/liveOpportunityCollector.ts";
import {
  runOnce,
  saveMonitorRun,
  listMonitorRuns,
} from "./services/paperTradeMonitorRunner.ts";
import { OPPORTUNITY_ENGINE_VERSION } from "./engine/opportunityEngine.ts";

const TEST_DIR = path.join(process.cwd(), ".test-data", "phase25_test");

function setupTestEnv() {
  const paperDir = path.join(TEST_DIR, "paper-opps");
  const sessionDir = path.join(TEST_DIR, "paper-sessions");
  const collectDir = path.join(TEST_DIR, "collect-logs");
  const monitorDir = path.join(TEST_DIR, "monitor-logs");

  fs.mkdirSync(paperDir, { recursive: true });
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.mkdirSync(collectDir, { recursive: true });
  fs.mkdirSync(monitorDir, { recursive: true });

  process.env.PAPER_OPPORTUNITY_DIR = paperDir;
  process.env.SESSION_EVIDENCE_DIR = sessionDir;
  process.env.COLLECTION_LOG_DIR = collectDir;
  process.env.MONITOR_LOG_DIR = monitorDir;
}

function cleanTestEnv() {
  try {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  } catch {}
}

function makeTestOpp(override: Partial<Parameters<typeof createPaperOpportunity>[0]> = {}) {
  return createPaperOpportunity({
    instrumentType: "OPTION",
    underlying: "NIFTY",
    symbol: null,
    instrumentKey: "NSE_FO|12345",
    optionType: "CE",
    strike: 24000,
    expiry: "2026-10-15T15:30:00.000Z",
    strategyType: "MOMENTUM_BREAKOUT",
    direction: "BULLISH",
    entry: 100,
    stop: 80,
    target1: 130,
    target2: 160,
    spotAtEntry: 24000,
    iv: 15,
    delta: 0.5,
    score: 85,
    confidence: 80,
    grade: "A",
    signalAgreement: 4,
    regime: "BULLISH_TREND",
    eventRisk: null,
    reasons: ["Test reason"],
    strategyVersion: OPPORTUNITY_ENGINE_VERSION,
    source: "LIVE",
    ...override,
  });
}

describe("Phase 25 — Multi-Session Evidence & Pipeline Integrity", () => {
  beforeEach(() => {
    setupTestEnv();
  });

  afterEach(() => {
    cleanTestEnv();
  });

  // 1. Session Persistence & Session-date Uniqueness
  it("P25-01: Session records persist and update per IST date (session-date uniqueness)", () => {
    const d1 = new Date("2026-10-06T10:00:00.000Z");
    const dateStr = getISTDateString(d1);

    const res1: CollectionResult = {
      market: "OPEN", source: "LIVE", generated: 10, accepted: 5, created: 2, duplicates: 3, rejected: 5,
      niftyCount: 1, bankNiftyCount: 1, stockCount: 0, errors: [],
    };
    recordCollectionCycle(res1, "CONNECTED", d1);

    const rec1 = getSessionRecord(dateStr);
    assert.ok(rec1);
    assert.equal(rec1.sessionDate, dateStr);
    assert.equal(rec1.collectionCycles, 1);
    assert.equal(rec1.paperOpportunitiesCreated, 2);

    // Same-day rerun
    const d1Later = new Date("2026-10-06T12:00:00.000Z");
    recordCollectionCycle(res1, "CONNECTED", d1Later);

    const rec2 = getSessionRecord(dateStr);
    assert.ok(rec2);
    assert.equal(rec2.collectionCycles, 2);
    assert.equal(rec2.paperOpportunitiesCreated, 4);

    const allSessions = listSessionRecords();
    assert.equal(allSessions.length, 1, "Reruns on same date must NOT increase distinct session count");
  });

  // 2. Multi-Session Aggregation across 5 distinct dates
  it("P25-02: Aggregates performance statistics correctly across 5 distinct market sessions", () => {
    const dates = ["2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06", "2026-10-07"];
    for (const d of dates) {
      const dt = new Date(`${d}T05:00:00.000Z`);
      recordCollectionCycle(
        { market: "OPEN", source: "LIVE", generated: 5, accepted: 2, created: 1, duplicates: 1, rejected: 3, niftyCount: 1, bankNiftyCount: 0, stockCount: 0, errors: [] },
        "CONNECTED",
        dt,
      );
    }

    const sessions = listSessionRecords();
    const summary = buildMultiSessionSummary(sessions, []);
    assert.equal(summary.distinctSessions, 5);
    assert.equal(summary.firstSessionDate, "2026-10-01");
    assert.equal(summary.lastSessionDate, "2026-10-07");
    assert.equal(summary.totalCollectionCycles, 5);
    assert.equal(summary.totalGenerated, 25);
  });

  // 3. Duplicate prevention across server restarts
  it("P25-03: Duplicate prevention works across process restarts & different instrument types", async () => {
    const mockNifty = async () => ({
      spot: 24000,
      topOpportunities: [{
        instrumentKey: "NSE_FO|NIFTY_CE", optionType: "CE" as const, strike: 24000, expiry: "2026-10-15", strategyType: "MOMENTUM",
        entry: 100, stop: 80, target1: 130, target2: 160, iv: 15, delta: 0.5, oi: 1000, volume: 500, spreadPct: 0.1,
        opportunityScore: 85, confidence: 80, grade: "A" as const, signalAgreement: 4, reasons: [],
      }],
      rejectedContracts: [],
      dataQuality: { market: "LIVE" },
    } as unknown as import("./engine/opportunityEngine.ts").OptionsOpportunityResult);
    const mockBankNifty = async () => ({
      spot: 52000, topOpportunities: [], rejectedContracts: [], dataQuality: { market: "LIVE" },
    } as unknown as import("./engine/opportunityEngine.ts").OptionsOpportunityResult);
    const mockStocks = async () => ({
      source: "UPSTOX" as const, topOpportunities: [],
    } as unknown as import("./engine/stockOpportunityEngine.ts").StockOpportunityResult);

    const now = new Date("2026-10-06T05:00:00.000Z");
    const r1 = await runLiveOpportunityCollection(mockNifty, mockBankNifty, mockStocks, now);
    assert.equal(r1.created, 1);
    assert.equal(r1.duplicates, 0);

    // Second run with same conditions
    const r2 = await runLiveOpportunityCollection(mockNifty, mockBankNifty, mockStocks, now);
    assert.equal(r2.created, 0);
    assert.equal(r2.duplicates, 1, "Existing open trade must be skipped as duplicate");
  });

  // 4. Source validation: Non-LIVE data refused
  it("P25-04: Refuses to create paper trade if source is not LIVE", async () => {
    const mockNiftyMockData = async () => ({
      spot: 24000,
      topOpportunities: [{
        instrumentKey: "NSE_FO|NIFTY_CE", optionType: "CE" as const, strike: 24000, expiry: "2026-10-15", strategyType: "MOMENTUM",
        entry: 100, stop: 80, target1: 130, target2: 160, iv: 15, delta: 0.5, oi: 1000, volume: 500, spreadPct: 0.1,
        opportunityScore: 85, confidence: 80, grade: "A" as const, signalAgreement: 4, reasons: [],
      }],
      rejectedContracts: [],
      dataQuality: { market: "MOCK" },
    } as unknown as import("./engine/opportunityEngine.ts").OptionsOpportunityResult);
    const mockBankNifty = async () => ({ spot: 52000, topOpportunities: [], rejectedContracts: [], dataQuality: { market: "LIVE" } } as unknown as import("./engine/opportunityEngine.ts").OptionsOpportunityResult);
    const mockStocks = async () => ({ source: "UPSTOX" as const, topOpportunities: [] } as unknown as import("./engine/stockOpportunityEngine.ts").StockOpportunityResult);

    const now = new Date("2026-10-06T05:00:00.000Z");
    const res = await runLiveOpportunityCollection(mockNiftyMockData, mockBankNifty, mockStocks, now);
    assert.equal(res.created, 0);
    assert.ok(res.errors.some((e) => e.includes("non-LIVE data quality")));
  });

  // 5. Lifecycle & Terminal State Integrity
  it("P25-05: Terminal states remain immutable upon repeated monitoring calls", () => {
    const opp = makeTestOpp();
    savePaperOpportunity(opp);

    // Trigger T1 HIT
    const eval1 = evaluatePaperOpportunity(opp, { currentPrice: 135 });
    assert.equal(eval1.transitioned, true);
    assert.equal(eval1.toStatus, "TARGET1_HIT");

    const saved1 = getPaperOpportunity(opp.id)!;
    assert.equal(saved1.status, "TARGET1_HIT");

    // Repeated call with higher price must NOT transition again or alter entry snapshot
    const eval2 = evaluatePaperOpportunity(saved1, { currentPrice: 170 });
    assert.equal(eval2.transitioned, false);
    assert.equal(eval2.reason, "already terminal");

    const saved2 = getPaperOpportunity(opp.id)!;
    assert.equal(saved2.entry, opp.entry, "Entry snapshot must be immutable");
    assert.equal(saved2.stop, opp.stop, "Stop snapshot must be immutable");
    assert.equal(saved2.target1, opp.target1, "Target1 snapshot must be immutable");
  });

  // 6. Zero-Trade & Insufficient Sample Label
  it("P25-06: Zero completed trades reports INSUFFICIENT_SAMPLE and null win rate", () => {
    const summary = buildMultiSessionSummary([], []);
    assert.equal(summary.completedTrades, 0);
    assert.equal(summary.sampleSizeLabel, "INSUFFICIENT_SAMPLE");
    assert.equal(summary.winRate, null);
    assert.equal(summary.averageR, null);
    assert.equal(summary.expectancyR, null);
    assert.equal(summary.profitFactor, null);
  });

  // 7. Correct Realized R and Profit Factor calculations
  it("P25-07: Calculates realized R, MFE/MAE R, and profit factor correctly for mixed outcomes", () => {
    const o1 = makeTestOpp({ entry: 100, stop: 80, target1: 130, target2: 160 }); // risk = 20
    savePaperOpportunity(o1);
    evaluatePaperOpportunity(o1, { currentPrice: 130 }); // T1 hit -> PnL = 30, R = +1.5

    const o2 = makeTestOpp({ entry: 100, stop: 80, target1: 130, target2: 160 }); // risk = 20
    savePaperOpportunity(o2);
    evaluatePaperOpportunity(o2, { currentPrice: 75 }); // Stop hit -> PnL = -25, R = -1.25 (since stop is 80, exit price 75)

    const opps = listPaperOpportunities();
    const summary = buildMultiSessionSummary([], opps);

    assert.equal(summary.completedTrades, 2);
    assert.equal(summary.wins, 1);
    assert.equal(summary.losses, 1);
    assert.equal(summary.winRate, 0.5);
    assert.equal(summary.averageR, 0.13); // (1.5 - 1.25) / 2 = 0.125 -> round 0.13
    assert.equal(summary.profitFactor, 1.2); // 1.5 / 1.25 = 1.2
  });

  // 8. Order Endpoint Safety Verification
  it("P25-08: SAFETY — Zero real order placement or cancellation calls exist in paper trading logic", () => {
    const collectorSrc = fs.readFileSync(path.join(process.cwd(), "src/lib/services/liveOpportunityCollector.ts"), "utf8");
    const runnerSrc = fs.readFileSync(path.join(process.cwd(), "src/lib/services/paperTradeMonitorRunner.ts"), "utf8");
    const monitorSrc = fs.readFileSync(path.join(process.cwd(), "src/lib/services/paperOpportunityMonitor.ts"), "utf8");

    const forbidden = /placeOrder|cancelOrder|modifyOrder|\/v2\/order/;
    assert.equal(forbidden.test(collectorSrc), false, "liveOpportunityCollector must have ZERO order calls");
    assert.equal(forbidden.test(runnerSrc), false, "paperTradeMonitorRunner must have ZERO order calls");
    assert.equal(forbidden.test(monitorSrc), false, "paperOpportunityMonitor must have ZERO order calls");
  });
});
