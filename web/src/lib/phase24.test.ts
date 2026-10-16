// Phase 24 — Live collection & monitoring tests
// node --test --experimental-strip-types src/lib/phase24.test.ts
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// ── Test isolation ────────────────────────────────────────────────────────────

let testDir: string;
let collectionLogDir: string;
let monitorLogDir: string;

before(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), "phase24-paper-"));
  collectionLogDir = fs.mkdtempSync(path.join(os.tmpdir(), "phase24-coll-"));
  monitorLogDir = fs.mkdtempSync(path.join(os.tmpdir(), "phase24-mon-"));
  process.env.PAPER_OPPORTUNITY_DIR = testDir;
  process.env.COLLECTION_LOG_DIR = collectionLogDir;
  process.env.MONITOR_LOG_DIR = monitorLogDir;
});
after(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
  fs.rmSync(collectionLogDir, { recursive: true, force: true });
  fs.rmSync(monitorLogDir, { recursive: true, force: true });
  delete process.env.PAPER_OPPORTUNITY_DIR;
  delete process.env.COLLECTION_LOG_DIR;
  delete process.env.MONITOR_LOG_DIR;
});

import {
  marketStatus,
  isMarketOpen,
  minutesRemainingInSession,
  nextSessionStart,
} from "./services/liveSessionController.ts";
import {
  runLiveOpportunityCollection,
  saveCollectionRun,
  listCollectionRuns,
  type LiveCollectionRun,
} from "./services/liveOpportunityCollector.ts";
import {
  runOnce,
  saveMonitorRun,
  listMonitorRuns,
} from "./services/paperTradeMonitorRunner.ts";
import {
  savePaperOpportunity,
  getPaperOpportunity,
  listPaperOpportunities,
  type PaperOpportunity,
  type PaperStatus,
} from "./services/paperOpportunityStore.ts";
import {
  createPaperOpportunity,
  evaluatePaperOpportunity,
} from "./services/paperOpportunityMonitor.ts";
import type { OptionsOpportunityResult, ContractOpportunity } from "./engine/opportunityEngine.ts";
import type { StockOpportunityResult, StockOpportunity } from "./engine/stockOpportunityEngine.ts";

// ── Session helpers ───────────────────────────────────────────────────────────

// IST = UTC+05:30; market open 09:15–15:30 IST
function makeIST(h: number, m: number, weekday: 1 | 2 | 3 | 4 | 5 = 3): Date {
  // Use 2026-10-07 (Wed) as a reference weekday
  const baseMs = Date.UTC(2026, 9, 7, h - 5, m - 30, 0); // subtract IST offset
  return new Date(baseMs);
}

// ── MS24 — Market session controller ─────────────────────────────────────────

describe("MS24 — Market session", () => {
  it("MS24-01: 09:00 IST on a weekday → PRE_MARKET", () => {
    assert.equal(marketStatus(makeIST(9, 0)), "PRE_MARKET");
  });

  it("MS24-02: 09:15 IST on a weekday → OPEN", () => {
    assert.equal(marketStatus(makeIST(9, 15)), "OPEN");
  });

  it("MS24-03: 12:00 IST on a weekday → OPEN", () => {
    assert.equal(marketStatus(makeIST(12, 0)), "OPEN");
  });

  it("MS24-04: 15:30 IST on a weekday → CLOSED", () => {
    assert.equal(marketStatus(makeIST(15, 30)), "CLOSED");
  });

  it("MS24-05: 18:00 IST on a weekday → CLOSED", () => {
    assert.equal(marketStatus(makeIST(18, 0)), "CLOSED");
  });

  it("MS24-06: Saturday → CLOSED", () => {
    // 2026-10-10 is Saturday
    const sat = new Date(Date.UTC(2026, 9, 10, 6, 0, 0)); // 11:30 IST
    assert.equal(marketStatus(sat), "CLOSED");
  });

  it("MS24-07: Sunday → CLOSED", () => {
    const sun = new Date(Date.UTC(2026, 9, 11, 6, 0, 0));
    assert.equal(marketStatus(sun), "CLOSED");
  });

  it("MS24-08: isMarketOpen true at 11:00 IST weekday", () => {
    assert.equal(isMarketOpen(makeIST(11, 0)), true);
  });

  it("MS24-09: isMarketOpen false at 16:00 IST", () => {
    assert.equal(isMarketOpen(makeIST(16, 0)), false);
  });

  it("MS24-10: minutesRemainingInSession > 0 when open", () => {
    assert.ok(minutesRemainingInSession(makeIST(10, 0)) > 0);
  });

  it("MS24-11: minutesRemainingInSession = 0 when closed", () => {
    assert.equal(minutesRemainingInSession(makeIST(16, 0)), 0);
  });

  it("MS24-12: nextSessionStart returns ISO string", () => {
    const next = nextSessionStart(makeIST(16, 0));
    assert.ok(next.includes("T"), "should be ISO format");
  });
});

// ── LC24 — Live collection ────────────────────────────────────────────────────

// Fixture factories
function makeContractOpportunity(overrides: Partial<ContractOpportunity> = {}): ContractOpportunity {
  return {
    rank: 1,
    underlying: "NIFTY",
    expiry: "2099-12-31",
    strike: 22100,
    optionType: "CE",
    instrumentKey: "NSE_FO|NIFTY_CE_22100",
    strategyType: "LONG_CALL",
    ltp: 100,
    bid: 98,
    ask: 102,
    spreadPct: 4,
    oi: 50000,
    volume: 10000,
    iv: 15,
    delta: 0.45,
    entry: 100,
    entryLow: 100,
    entryHigh: 100.3,
    stop: 60,
    target1: 160,
    target2: 200,
    rr: 1.5,
    maxLoss: 40,
    breakeven: 100,
    opportunityScore: 70,
    scoreBreakdown: {},
    confidence: 75,
    signalAgreement: 5,
    signalAgreementOf: 7,
    signals: [],
    reasons: ["Strong trend"],
    invalidation: "price < 22000",
    srRoom: 200,
    expectedMove: 180,
    grade: "A",
    ...overrides,
  };
}

function makeOptionsResult(overrides: Partial<OptionsOpportunityResult> = {}): OptionsOpportunityResult {
  return {
    timestamp: new Date().toISOString(),
    engineVersion: "20.1",
    underlying: "NIFTY",
    source: "LIVE",
    dataQuality: { market: "LIVE", optionChain: "LIVE", technical: "LIVE", news: "LIVE", breadth: "LIVE" },
    marketRegime: "NORMAL",
    marketDirection: "BULLISH",
    directionScore: 65,
    spot: 22050,
    atmStrike: 22050,
    support: 21800,
    resistance: 22300,
    expectedMove: 180,
    pcrOi: 1.2,
    contractsEvaluated: 10,
    contractsRejected: 7,
    topOpportunities: [makeContractOpportunity()],
    rejectedContracts: [{ strike: 22200, optionType: "CE", reason: "Low OI" }],
    eventRiskPenalty: 0,
    eventRiskReason: null,
    recommendedStrategy: "LONG_CALL",
    noOpportunityReason: null,
    ...overrides,
  };
}

function makeStockResult(overrides: Partial<StockOpportunityResult> = {}): StockOpportunityResult {
  return {
    timestamp: new Date().toISOString(),
    engineVersion: "20.1",
    kind: "intraday",
    source: "UPSTOX",
    freshness: "LIVE",
    universe: "NIFTY50",
    stocksScanned: 50,
    stocksAvailable: 48,
    stocksRejected: 46,
    niftyChange: 0.5,
    topOpportunities: [],
    noOpportunityReason: null,
    ...overrides,
  };
}

const openNow = makeIST(11, 0); // 11:00 IST weekday — market open
const closedNow = makeIST(16, 0); // 16:00 IST — market closed

describe("LC24 — Live collection", () => {
  it("LC24-01: returns MARKET_CLOSED when market not open", async () => {
    const result = await runLiveOpportunityCollection(
      async () => makeOptionsResult(),
      async () => makeOptionsResult(),
      async () => makeStockResult(),
      closedNow,
    );
    assert.equal(result.reason, "MARKET_CLOSED");
    assert.equal(result.created, 0);
  });

  it("LC24-02: LIVE accepted opportunity creates paper trade", async () => {
    const before = listPaperOpportunities().length;
    const result = await runLiveOpportunityCollection(
      async () => makeOptionsResult({ topOpportunities: [makeContractOpportunity({ instrumentKey: `IK_LC24_02_${Date.now()}` })] }),
      async () => makeOptionsResult({ underlying: "BANKNIFTY", topOpportunities: [] }),
      async () => makeStockResult(),
      openNow,
    );
    assert.equal(result.market, "OPEN");
    assert.ok(result.created >= 1, `expected created>=1 got ${result.created}: ${JSON.stringify(result.errors)}`);
    assert.ok(listPaperOpportunities().length > before);
  });

  it("LC24-03: duplicate identity → skipped", async () => {
    // Run twice with same opportunity
    const r1 = await runLiveOpportunityCollection(
      async () => makeOptionsResult(),
      async () => makeOptionsResult({ underlying: "BANKNIFTY", topOpportunities: [] }),
      async () => makeStockResult(),
      openNow,
    );
    const r2 = await runLiveOpportunityCollection(
      async () => makeOptionsResult(),
      async () => makeOptionsResult({ underlying: "BANKNIFTY", topOpportunities: [] }),
      async () => makeStockResult(),
      openNow,
    );
    assert.ok(r2.duplicates >= 1, "second run should find a duplicate");
    assert.equal(r2.created, 0, "second run should create 0 new trades");
  });

  it("LC24-04: non-LIVE data quality → rejected", async () => {
    const r = await runLiveOpportunityCollection(
      async () => makeOptionsResult({
        dataQuality: { market: "MOCK", optionChain: "MOCK", technical: "MOCK", news: "MOCK", breadth: "MOCK" },
      }),
      async () => makeOptionsResult({ topOpportunities: [] }),
      async () => makeStockResult(),
      openNow,
    );
    assert.ok(r.errors.length > 0, "should record error for non-LIVE data");
  });

  it("LC24-05: rejected contracts do not become paper trades", async () => {
    const countBefore = listPaperOpportunities().length;
    await runLiveOpportunityCollection(
      async () => makeOptionsResult({ topOpportunities: [] }), // no accepted
      async () => makeOptionsResult({ topOpportunities: [] }),
      async () => makeStockResult(),
      openNow,
    );
    assert.equal(listPaperOpportunities().length, countBefore);
  });

  it("LC24-06: stock opportunity from UPSTOX source creates paper trade", async () => {
    const stockOpp = {
      rank: 1, symbol: "RELIANCE", name: "Reliance Industries", instrumentKey: `NSE_EQ|RELIANCE_${Date.now()}`,
      ltp: 2500, open: 2480, high: 2520, low: 2475, previousClose: 2460, change: 40, changePercent: 1.6,
      volume: 500000, freshness: "LIVE", opportunityScore: 65, setup: "MOMENTUM_LONG" as const,
      direction: "BULLISH" as const, entry: 2500, entryLow: 2500, entryHigh: 2510,
      stop: 2470, target1: 2545, target2: 2580, rr: 1.5,
      relativeStrength: 1.8, rangePosition: 0.9, reasons: ["Breakout"], invalidation: "<2470", grade: "B" as const,
    } satisfies import("./engine/stockOpportunityEngine.ts").StockOpportunity;
    const r = await runLiveOpportunityCollection(
      async () => makeOptionsResult({ topOpportunities: [] }),
      async () => makeOptionsResult({ topOpportunities: [] }),
      async () => makeStockResult({ topOpportunities: [stockOpp] }),
      openNow,
    );
    assert.ok(r.stockCount >= 1, "should count stock opportunities");
  });

  it("LC24-07: non-UPSTOX stock source → rejected", async () => {
    const r = await runLiveOpportunityCollection(
      async () => makeOptionsResult({ topOpportunities: [] }),
      async () => makeOptionsResult({ topOpportunities: [] }),
      async () => makeStockResult({ source: "UNAVAILABLE" }),
      openNow,
    );
    assert.ok(r.errors.some((e) => e.includes("Stocks")));
  });

  it("LC24-08: API failure in one underlying does not stop the other", async () => {
    let called = false;
    const r = await runLiveOpportunityCollection(
      async () => { throw new Error("NIFTY_TIMEOUT"); },
      async () => { called = true; return makeOptionsResult({ underlying: "BANKNIFTY", topOpportunities: [] }); },
      async () => makeStockResult(),
      openNow,
    );
    assert.ok(called, "BANKNIFTY should still be called");
    assert.ok(r.errors.some((e) => e.includes("NIFTY_TIMEOUT")));
  });

  it("LC24-09: collection result has niftyCount/bankNiftyCount/stockCount fields", async () => {
    const r = await runLiveOpportunityCollection(
      async () => makeOptionsResult({ topOpportunities: [] }),
      async () => makeOptionsResult({ topOpportunities: [] }),
      async () => makeStockResult(),
      openNow,
    );
    assert.ok("niftyCount" in r);
    assert.ok("bankNiftyCount" in r);
    assert.ok("stockCount" in r);
  });
});

// ── AL24 — Audit log ──────────────────────────────────────────────────────────

describe("AL24 — Audit log", () => {
  it("AL24-01: saveCollectionRun persists run", () => {
    const run: LiveCollectionRun = {
      id: "test_run_1", timestamp: new Date().toISOString(),
      marketStatus: "OPEN", sourceStatus: "LIVE",
      generatedCount: 5, acceptedCount: 2, createdCount: 1,
      duplicateCount: 1, rejectedCount: 3,
      niftyCount: 1, bankNiftyCount: 0, stockCount: 0,
      durationMs: 250, errors: [],
    };
    saveCollectionRun(run);
    const runs = listCollectionRuns();
    assert.ok(runs.some((r) => r.id === "test_run_1"));
  });

  it("AL24-02: saveMonitorRun persists run", () => {
    saveMonitorRun({
      id: "mon_1", timestamp: new Date().toISOString(),
      openBefore: 2, evaluated: 2, updated: 1,
      target1Hits: 1, target2Hits: 0, stopHits: 0,
      invalidations: 0, expirations: 0,
      errors: [], durationMs: 100,
    });
    const runs = listMonitorRuns();
    assert.ok(runs.some((r) => r.id === "mon_1"));
  });
});

// ── MR24 — Monitor runner ─────────────────────────────────────────────────────

function makeTestOpp(overrides: Partial<Parameters<typeof createPaperOpportunity>[0]> = {}): PaperOpportunity {
  return createPaperOpportunity({
    instrumentType: "OPTION",
    underlying: "NIFTY",
    symbol: null,
    instrumentKey: "NSE_FO|TEST",
    optionType: "CE",
    strike: 22100,
    expiry: "2099-12-31T15:30:00.000Z",
    strategyType: "LONG_CALL",
    direction: "BULLISH",
    entry: 100,
    stop: 60,
    target1: 160,
    target2: 200,
    spotAtEntry: 22050,
    score: 70,
    confidence: 75,
    grade: "A",
    regime: "NORMAL",
    reasons: [],
    strategyVersion: "20.1",
    source: "LIVE",
    ...overrides,
  });
}

describe("MR24 — Monitor runner", () => {
  it("MR24-01: runOnce with T1 price → transitions to TARGET1_HIT", async () => {
    const opp = makeTestOpp();
    savePaperOpportunity(opp);
    const run = await runOnce(async (o) =>
      o.id === opp.id ? { currentPrice: 162, source: "LIVE" as const } : null,
    );
    assert.ok(run.target1Hits >= 1);
    assert.equal(getPaperOpportunity(opp.id)?.status, "TARGET1_HIT");
  });

  it("MR24-02: runOnce with stop price → transitions to STOP_HIT", async () => {
    const opp = makeTestOpp();
    savePaperOpportunity(opp);
    const run = await runOnce(async (o) =>
      o.id === opp.id ? { currentPrice: 55, source: "LIVE" as const } : null,
    );
    assert.ok(run.stopHits >= 1);
    assert.equal(getPaperOpportunity(opp.id)?.status, "STOP_HIT");
  });

  it("MR24-03: runOnce with null price → skips (no transition)", async () => {
    const opp = makeTestOpp();
    savePaperOpportunity(opp);
    const run = await runOnce(async () => null);
    assert.equal(run.updated, 0);
    assert.equal(getPaperOpportunity(opp.id)?.status, "OPEN");
  });

  it("MR24-04: runOnce with non-finite price → rejects, no transition", async () => {
    const opp = makeTestOpp();
    savePaperOpportunity(opp);
    const run = await runOnce(async (o) =>
      o.id === opp.id ? { currentPrice: NaN, source: "LIVE" as const } : null,
    );
    assert.ok(run.errors.length > 0);
    assert.equal(getPaperOpportunity(opp.id)?.status, "OPEN");
  });

  it("MR24-05: runOnce with zero price → rejects, no transition", async () => {
    const opp = makeTestOpp();
    savePaperOpportunity(opp);
    const run = await runOnce(async (o) =>
      o.id === opp.id ? { currentPrice: 0, source: "LIVE" as const } : null,
    );
    assert.ok(run.errors.length > 0);
    assert.equal(getPaperOpportunity(opp.id)?.status, "OPEN");
  });

  it("MR24-06: runOnce skips already-terminal opportunities", async () => {
    const opp = { ...makeTestOpp(), status: "STOP_HIT" as PaperStatus };
    savePaperOpportunity(opp);
    const run = await runOnce(async () => ({ currentPrice: 150, source: "LIVE" as const }));
    // Already terminal — should not be in evaluated count or add events
    const saved = getPaperOpportunity(opp.id)!;
    assert.equal(saved.status, "STOP_HIT");
  });

  it("MR24-07: runOnce returns audit fields", async () => {
    const run = await runOnce(async () => null);
    assert.ok("openBefore" in run);
    assert.ok("evaluated" in run);
    assert.ok("updated" in run);
    assert.ok("durationMs" in run);
  });

  it("MR24-08: MFE updated without transition", async () => {
    const opp = makeTestOpp();
    savePaperOpportunity(opp);
    await runOnce(async (o) =>
      o.id === opp.id ? { currentPrice: 120, source: "LIVE" as const } : null,
    );
    const saved = getPaperOpportunity(opp.id)!;
    assert.equal(saved.mfe, 20); // 120-100
    assert.equal(saved.status, "OPEN");
  });
});

// ── ID24 — Idempotency ────────────────────────────────────────────────────────

describe("ID24 — Idempotency", () => {
  it("ID24-01: two identical collections → second creates 0", async () => {
    const uniqueKey = `UNIQUE_KEY_ID24_${Date.now()}`;
    const r1 = await runLiveOpportunityCollection(
      async () => makeOptionsResult({ topOpportunities: [makeContractOpportunity({ instrumentKey: uniqueKey })] }),
      async () => makeOptionsResult({ topOpportunities: [] }),
      async () => makeStockResult(),
      openNow,
    );
    const r2 = await runLiveOpportunityCollection(
      async () => makeOptionsResult({ topOpportunities: [makeContractOpportunity({ instrumentKey: uniqueKey })] }),
      async () => makeOptionsResult({ topOpportunities: [] }),
      async () => makeStockResult(),
      openNow,
    );
    assert.equal(r1.created, 1);
    assert.equal(r2.created, 0);
    assert.equal(r2.duplicates, 1);
  });

  it("ID24-02: repeated monitor run on already-terminal trade → no event added", async () => {
    const opp = makeTestOpp();
    savePaperOpportunity(opp);
    await runOnce(async (o) => o.id === opp.id ? { currentPrice: 162, source: "LIVE" as const } : null);
    const afterFirst = getPaperOpportunity(opp.id)!;
    await runOnce(async (o) => o.id === opp.id ? { currentPrice: 162, source: "LIVE" as const } : null);
    const afterSecond = getPaperOpportunity(opp.id)!;
    assert.equal(afterFirst.events.length, afterSecond.events.length, "no duplicate events");
  });
});

// ── EX24 — Expiry in monitor ──────────────────────────────────────────────────

describe("EX24 — Expiry in monitor", () => {
  it("EX24-01: expired option → EXPIRED in runOnce", async () => {
    const opp = makeTestOpp({ expiry: "2000-01-01T15:30:00.000Z" });
    savePaperOpportunity(opp);
    const run = await runOnce(async (o) =>
      o.id === opp.id ? { currentPrice: 100, source: "LIVE" as const } : null,
    );
    assert.ok(run.expirations >= 1);
    assert.equal(getPaperOpportunity(opp.id)?.status, "EXPIRED");
  });
});

// ── PV24 — Price validation ───────────────────────────────────────────────────

describe("PV24 — Price validation", () => {
  it("PV24-01: negative price → rejected by monitor", async () => {
    const opp = makeTestOpp();
    savePaperOpportunity(opp);
    const run = await runOnce(async (o) =>
      o.id === opp.id ? { currentPrice: -5, source: "LIVE" as const } : null,
    );
    assert.ok(run.errors.length > 0);
    assert.equal(getPaperOpportunity(opp.id)?.status, "OPEN");
  });
});

// ── SA24 — Safety ─────────────────────────────────────────────────────────────

describe("SA24 — Safety Phase 24", () => {
  it("SA24-01: no real order endpoints in new Phase 24 service files", async () => {
    const { execSync } = await import("node:child_process");
    const result = execSync(
      `grep -r --include="*.ts" --exclude="*.test.ts" "placeOrder\\|/v2/order/place\\|/v2/order/modify\\|/v2/order/cancel" src/lib/services/liveOpportunityCollector.ts src/lib/services/paperTradeMonitorRunner.ts src/lib/services/liveSessionController.ts 2>/dev/null || echo NONE`,
      { cwd: process.cwd() },
    ).toString().trim();
    assert.equal(result, "NONE", `found order calls: ${result}`);
  });

  it("SA24-02: Phase 22 strategy version still 20.1", async () => {
    const { OPPORTUNITY_ENGINE_VERSION } = await import("./engine/opportunityEngine.ts");
    assert.equal(OPPORTUNITY_ENGINE_VERSION, "20.1");
  });

  it("SA24-03: MARKET_CLOSED collection creates 0 trades", async () => {
    const countBefore = listPaperOpportunities().length;
    const r = await runLiveOpportunityCollection(
      async () => makeOptionsResult(),
      async () => makeOptionsResult(),
      async () => makeStockResult(),
      closedNow,
    );
    assert.equal(r.created, 0);
    assert.equal(listPaperOpportunities().length, countBefore);
  });

  it("SA24-04: no collect route file contains order execution", async () => {
    const { execSync } = await import("node:child_process");
    const result = execSync(
      `grep -r --include="*.ts" --exclude="*.test.ts" "placeOrder\\|cancelOrder" src/app/api/paper-opportunities/ 2>/dev/null || echo NONE`,
      { cwd: process.cwd() },
    ).toString().trim();
    assert.equal(result, "NONE");
  });

  it("SA24-05: paper:collect script exists", () => {
    assert.ok(fs.existsSync(path.join(process.cwd(), "scripts/paper-collect.mjs")));
  });

  it("SA24-06: paper:evaluate script exists", () => {
    assert.ok(fs.existsSync(path.join(process.cwd(), "scripts/paper-evaluate.mjs")));
  });

  it("SA24-07: paper:cycle script exists", () => {
    assert.ok(fs.existsSync(path.join(process.cwd(), "scripts/paper-cycle.mjs")));
  });

  it("SA24-08: paper:live script exists", () => {
    assert.ok(fs.existsSync(path.join(process.cwd(), "scripts/paper-live.mjs")));
  });

  it("SA24-09: monitor route has direct stockQuote fallback for open stock opportunities", () => {
    const routeSrc = fs.readFileSync(path.join(process.cwd(), "src/app/api/paper-opportunities/monitor/route.ts"), "utf8");
    assert.ok(routeSrc.includes("stockQuote"), "monitor route must include stockQuote fallback");
  });

  it("SA24-10: monitor route only caches LIVE scanner quotes (no post-close EOD prices labelled LIVE)", () => {
    const routeSrc = fs.readFileSync(path.join(process.cwd(), "src/app/api/paper-opportunities/monitor/route.ts"), "utf8");
    assert.ok(routeSrc.includes(`if (s.freshness === "LIVE") premiums.set(`), "scanner cache must filter on LIVE freshness");
  });

  it("DEC1-01: applyEndOfDay transitions open stock to EOD_EXIT when verified LIVE price exists", async () => {
    const { applyEndOfDay } = await import("./services/paperOpportunityMonitor.ts");
    const opp = {
      ...makeTestOpp({ instrumentType: "STOCK" }),
      lastLivePrice: 155,
      lastLivePriceAt: "2026-10-15T09:45:00.000Z", // 15:15 IST
      openedAt: "2026-10-15T04:00:00.000Z", // 09:30 IST
      createdAt: "2026-10-15T04:00:00.000Z",
    };
    savePaperOpportunity(opp);
    const postClose = new Date("2026-10-15T10:15:00.000Z"); // 15:45 IST
    const res = applyEndOfDay(opp, postClose);
    assert.ok(res?.transitioned);
    assert.equal(res?.toStatus, "EOD_EXIT");
    const updated = getPaperOpportunity(opp.id)!;
    assert.equal(updated.status, "EOD_EXIT");
    assert.equal(updated.exitPrice, 155);
    assert.equal(updated.realizedPnl, 55); // 155 - 100
  });

  it("DEC1-02: applyEndOfDay transitions open stock to EOD_UNPRICED when no live price was captured", async () => {
    const { applyEndOfDay } = await import("./services/paperOpportunityMonitor.ts");
    const opp = {
      ...makeTestOpp({ instrumentType: "STOCK" }),
      lastLivePrice: null,
      lastLivePriceAt: null,
      openedAt: "2026-10-15T04:00:00.000Z", // 09:30 IST
      createdAt: "2026-10-15T04:00:00.000Z",
    };
    savePaperOpportunity(opp);
    const postClose = new Date("2026-10-15T10:15:00.000Z"); // 15:45 IST
    const res = applyEndOfDay(opp, postClose);
    assert.ok(res?.transitioned);
    assert.equal(res?.toStatus, "EOD_UNPRICED");
    const updated = getPaperOpportunity(opp.id)!;
    assert.equal(updated.status, "EOD_UNPRICED");
    assert.equal(updated.exitPrice, null);
    assert.equal(updated.realizedPnl, null);
  });

  it("DEC2-01: runOnce tracks skipped count and skippedReasons breakdown", async () => {
    const opp = makeTestOpp({
      provenance: "LIVE_COLLECTOR",
    });
    savePaperOpportunity(opp);
    const run = await runOnce(async () => null, makeIST(11, 0));
    assert.ok((run.skipped ?? 0) >= 1);
    assert.ok((run.skippedReasons?.["price_unavailable"] ?? 0) >= 1);
  });

  it("DEC3-01: runOnce skips legacy fixtures and reports fixturesSkipped", async () => {
    const fixtureOpp = {
      ...makeTestOpp(),
      createdAt: "2026-10-08T10:00:00.000Z", // pre-cutoff fixture
      openedAt: "2026-10-08T10:00:00.000Z",
    };
    savePaperOpportunity(fixtureOpp);
    const run = await runOnce(async (o) => ({ currentPrice: 155, source: "LIVE" as const }), makeIST(11, 0));
    assert.ok((run.fixturesSkipped ?? 0) >= 1);
    // Fixture remains untouched in OPEN status
    assert.equal(getPaperOpportunity(fixtureOpp.id)?.status, "OPEN");
  });

  it("DEC4-01: collector prevents opening concurrent positions for the same stock symbol", async () => {
    const stock1 = {
      rank: 1, symbol: "TATASTEEL", name: "Tata Steel", instrumentKey: "NSE_EQ|TATASTEEL_1",
      ltp: 150, open: 148, high: 152, low: 147, previousClose: 146, change: 4, changePercent: 2.7,
      volume: 1000000, freshness: "LIVE", opportunityScore: 70, setup: "MOMENTUM_LONG" as const,
      direction: "BULLISH" as const, entry: 150, entryLow: 150, entryHigh: 151,
      stop: 145, target1: 158, target2: 165, rr: 1.6,
      relativeStrength: 1.5, rangePosition: 0.8, reasons: ["Volume Breakout"], invalidation: "<145", grade: "B" as const,
    } satisfies import("./engine/stockOpportunityEngine.ts").StockOpportunity;

    const r1 = await runLiveOpportunityCollection(
      async () => makeOptionsResult({ topOpportunities: [] }),
      async () => makeOptionsResult({ topOpportunities: [] }),
      async () => makeStockResult({ topOpportunities: [stock1] }),
      openNow,
    );
    assert.equal(r1.created, 1);
    assert.equal(r1.duplicates, 0);

    // Second opportunity on same symbol with different entry/targets (different identityKey)
    const stock2 = {
      ...stock1,
      entry: 152,
      stop: 146,
      target1: 160,
      target2: 168,
      setup: "BREAKOUT" as const,
    } satisfies import("./engine/stockOpportunityEngine.ts").StockOpportunity;

    const r2 = await runLiveOpportunityCollection(
      async () => makeOptionsResult({ topOpportunities: [] }),
      async () => makeOptionsResult({ topOpportunities: [] }),
      async () => makeStockResult({ topOpportunities: [stock2] }),
      openNow,
    );
    assert.equal(r2.created, 0);
    assert.equal(r2.duplicates, 1, "should be rejected as duplicate concurrent position on TATASTEEL");
  });
});
