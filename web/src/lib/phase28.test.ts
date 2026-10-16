// Phase 28 — Genuine Live Market Observation & Operational Verification Tests.
import { test, describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { marketStatus, isMarketOpen } from "./services/liveSessionController.ts";
import { runLiveOpportunityCollection } from "./services/liveOpportunityCollector.ts";
import { evaluatePaperOpportunity, createPaperOpportunity } from "./services/paperOpportunityMonitor.ts";
import { savePaperOpportunity, getPaperOpportunity, listPaperOpportunities } from "./services/paperOpportunityStore.ts";
import { runOnce } from "./services/paperTradeMonitorRunner.ts";
import { recordCollectionCycle, getSessionRecord, buildMultiSessionSummary } from "./services/sessionEvidenceStore.ts";
import type { OptionsOpportunityResult } from "./engine/opportunityEngine.ts";
import type { StockOpportunityResult } from "./engine/stockOpportunityEngine.ts";
import { OPPORTUNITY_ENGINE_VERSION } from "./engine/opportunityEngine.ts";

const TEST_DIR = path.join(process.cwd(), ".test-data", "phase28_test");

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

describe("Phase 28 — Live Market Readiness & Operational Integrity", () => {
  beforeEach(() => {
    setupTestEnv();
  });

  afterEach(() => {
    cleanTestEnv();
  });

  // 1. Market Closed Boundary Check
  it("P28-01: Correctly identifies CLOSED market session during evening or weekend hours", async () => {
    const eveningTime = new Date("2026-10-09T11:52:51.000Z"); // 17:22 IST -> CLOSED
    assert.equal(marketStatus(eveningTime), "CLOSED");
    assert.equal(isMarketOpen(eveningTime), false);

    const mockFn = async () => ({ spot: 24000, topOpportunities: [], rejectedContracts: [], dataQuality: { market: "LIVE" } } as unknown as OptionsOpportunityResult);
    const mockStock = async () => ({ source: "UPSTOX" as const, topOpportunities: [] } as unknown as StockOpportunityResult);

    const res = await runLiveOpportunityCollection(mockFn, mockFn, mockStock, eveningTime);
    assert.equal(res.market, "CLOSED");
    assert.equal(res.reason, "MARKET_CLOSED");
    assert.equal(res.created, 0);
  });

  // 2. Data Quality & Source Authenticity Rules
  it("P28-02: Strictly enforces LIVE data source rules and refuses MOCK/STALE data for paper trade creation", async () => {
    const marketOpenTime = new Date("2026-10-06T05:00:00.000Z"); // 10:30 IST -> OPEN
    assert.equal(marketStatus(marketOpenTime), "OPEN");

    const mockNonLive = async () => ({
      spot: 24000,
      topOpportunities: [{
        instrumentKey: "NSE_FO|1234", optionType: "CE" as const, strike: 24000, expiry: "2026-10-15", strategyType: "BREAKOUT",
        entry: 100, stop: 80, target1: 130, target2: 160, iv: 15, delta: 0.5, oi: 1000, volume: 500, spreadPct: 0.1,
        opportunityScore: 85, confidence: 80, grade: "A" as const, signalAgreement: 4, reasons: [],
      }],
      rejectedContracts: [],
      dataQuality: { market: "MOCK" },
    } as unknown as OptionsOpportunityResult);
    const mockEmpty = async () => ({ spot: 52000, topOpportunities: [], rejectedContracts: [], dataQuality: { market: "LIVE" } } as unknown as OptionsOpportunityResult);
    const mockStockEmpty = async () => ({ source: "UPSTOX" as const, topOpportunities: [] } as unknown as StockOpportunityResult);

    const res = await runLiveOpportunityCollection(mockNonLive, mockEmpty, mockStockEmpty, marketOpenTime);
    assert.equal(res.created, 0);
    assert.ok(res.errors.some((e) => e.includes("non-LIVE data quality")));
  });

  // 3. Zero Candidate Opportunity Handling
  it("P28-03: Completes collection cycle cleanly with created=0 when zero opportunities pass criteria", async () => {
    const marketOpenTime = new Date("2026-10-06T05:00:00.000Z");
    const mockEmpty = async () => ({ spot: 24000, topOpportunities: [], rejectedContracts: [], dataQuality: { market: "LIVE" } } as unknown as OptionsOpportunityResult);
    const mockStockEmpty = async () => ({ source: "UPSTOX" as const, topOpportunities: [] } as unknown as StockOpportunityResult);

    const res = await runLiveOpportunityCollection(mockEmpty, mockEmpty, mockStockEmpty, marketOpenTime);
    assert.equal(res.created, 0);
    assert.equal(res.accepted, 0);
    assert.equal(res.errors.length, 0);
  });

  // 4. Duplicate Prevention & Restart Isolation
  it("P28-04: Prevents creation of duplicate paper trades across restarts and cycles", async () => {
    const marketOpenTime = new Date("2026-10-06T05:00:00.000Z");
    const mockLive = async () => ({
      spot: 24000,
      topOpportunities: [{
        instrumentKey: "NSE_FO|NIFTY_CE_100", optionType: "CE" as const, strike: 24000, expiry: "2026-10-15", strategyType: "MOMENTUM",
        entry: 100, stop: 80, target1: 130, target2: 160, iv: 15, delta: 0.5, oi: 1000, volume: 500, spreadPct: 0.1,
        opportunityScore: 88, confidence: 85, grade: "A" as const, signalAgreement: 4, reasons: [],
      }],
      rejectedContracts: [],
      dataQuality: { market: "LIVE" },
    } as unknown as OptionsOpportunityResult);
    const mockEmpty = async () => ({ spot: 52000, topOpportunities: [], rejectedContracts: [], dataQuality: { market: "LIVE" } } as unknown as OptionsOpportunityResult);
    const mockStockEmpty = async () => ({ source: "UPSTOX" as const, topOpportunities: [] } as unknown as StockOpportunityResult);

    const run1 = await runLiveOpportunityCollection(mockLive, mockEmpty, mockStockEmpty, marketOpenTime);
    assert.equal(run1.created, 1);

    const run2 = await runLiveOpportunityCollection(mockLive, mockEmpty, mockStockEmpty, marketOpenTime);
    assert.equal(run2.created, 0);
    assert.equal(run2.duplicates, 1, "Duplicate setup must be skipped");
  });

  // 5. Quote Unavailability Resilience in Monitor
  it("P28-05: Missing or unavailable quote in monitoring pass leaves trade OPEN without throwing error", async () => {
    const opp = createPaperOpportunity({
      instrumentType: "OPTION", underlying: "NIFTY", symbol: null, instrumentKey: "NSE_FO|999", optionType: "CE",
      strike: 24000, expiry: "2026-10-15T15:30:00.000Z", strategyType: "BREAKOUT", direction: "BULLISH",
      entry: 100, stop: 80, target1: 130, target2: 160, spotAtEntry: 24000, score: 80, confidence: 75, grade: "A",
      reasons: [], regime: "BULLISH_TREND", strategyVersion: OPPORTUNITY_ENGINE_VERSION, source: "LIVE",
    });
    savePaperOpportunity(opp);

    const run = await runOnce(async () => null);
    assert.equal(run.openBefore, 1);
    assert.equal(run.evaluated, 0);
    assert.equal(run.updated, 0);

    const fresh = getPaperOpportunity(opp.id)!;
    assert.equal(fresh.status, "OPEN");
  });

  // 6. Monitoring Idempotency
  it("P28-06: State transitions are strictly idempotent and prevent duplicate audit events", () => {
    const opp = createPaperOpportunity({
      instrumentType: "OPTION", underlying: "NIFTY", symbol: null, instrumentKey: "NSE_FO|999", optionType: "CE",
      strike: 24000, expiry: "2026-10-15T15:30:00.000Z", strategyType: "BREAKOUT", direction: "BULLISH",
      entry: 100, stop: 80, target1: 130, target2: 160, spotAtEntry: 24000, score: 80, confidence: 75, grade: "A",
      reasons: [], regime: "BULLISH_TREND", strategyVersion: OPPORTUNITY_ENGINE_VERSION, source: "LIVE",
    });
    savePaperOpportunity(opp);

    const res1 = evaluatePaperOpportunity(opp, { currentPrice: 135 });
    assert.equal(res1.transitioned, true);
    assert.equal(res1.toStatus, "TARGET1_HIT");

    const saved1 = getPaperOpportunity(opp.id)!;
    assert.equal(saved1.events.length, 1);

    const res2 = evaluatePaperOpportunity(saved1, { currentPrice: 135 });
    assert.equal(res2.transitioned, false);
    const saved2 = getPaperOpportunity(opp.id)!;
    assert.equal(saved2.events.length, 1);
  });

  // 7. Session Evidence Store Isolation
  it("P28-07: Records per-IST date session evidence accurately without polluting production store", () => {
    const d1 = new Date("2026-10-09T05:00:00.000Z");
    recordCollectionCycle({
      market: "OPEN", source: "LIVE", generated: 8, accepted: 3, created: 1, duplicates: 2, rejected: 5,
      niftyCount: 1, bankNiftyCount: 0, stockCount: 0, errors: [],
    }, "CONNECTED", d1);

    const rec = getSessionRecord("2026-10-09");
    assert.ok(rec);
    assert.equal(rec.sessionDate, "2026-10-09");
    assert.equal(rec.collectionCycles, 1);
    assert.equal(rec.paperOpportunitiesCreated, 1);
  });

  // 8. Zero Real Order Invariant
  it("P28-08: SAFETY — Verifies zero order placement, modification, or cancellation functions exist", () => {
    const filesToAudit = [
      "src/lib/services/liveOpportunityCollector.ts",
      "src/lib/services/paperTradeMonitorRunner.ts",
      "src/lib/services/paperOpportunityMonitor.ts",
      "src/lib/services/sessionEvidenceStore.ts",
      "src/lib/services/upstoxAuth.ts",
    ];

    const forbiddenPattern = /placeOrder|cancelOrder|modifyOrder|\/v2\/order/;
    for (const fileRel of filesToAudit) {
      const content = fs.readFileSync(path.join(process.cwd(), fileRel), "utf8");
      assert.equal(forbiddenPattern.test(content), false, `Safety violation found in ${fileRel}`);
    }
  });
});
