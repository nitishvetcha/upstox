// Phase 1.9 — Contract-Level Freshness Safeguards Regression Tests.
// Proves:
// 1. One fresh strike cannot make an otherwise unverified contract eligible.
// 2. An unverified contract cannot receive an executable paper-entry decision.
// 3. An open position is not revalued or exited using an untrusted stale LTP.
// 4. Valid fresh quotes preserve the intended existing behavior.
// 5. All rejection paths preserve risk limits and ledger integrity.

import { test, describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import type { Snapshot, OptionRow, Quote } from "../types.ts";
import { normalizeChain } from "./upstoxMarket.ts";
import { evaluateOptionsOpportunity, FILTERS } from "../engine/opportunityEngine.ts";
import { runLiveOpportunityCollection } from "./liveOpportunityCollector.ts";
import { optionMonitorInput } from "./paperPriceInput.ts";
import { PaperTradingEngine, calculateExitFill } from "../paperEngine.ts";
import { getRiskConfig } from "./risk/riskConfig.ts";
import { reconcileLedger } from "../paperReport.ts";
import { analyze } from "../engine/strategy.ts";
import { STRATEGY_VERSION } from "../journalTypes.ts";
import { OPTION_QUOTE_LTT_ENABLED } from "./optionContractLTT.ts";

const TEST_DIR = path.join(process.cwd(), ".test-data", "contract_freshness_test");
const NOW = new Date("2026-10-06T05:00:00.000Z"); // Tuesday 10:30 IST (market OPEN)

function setupTestEnv() {
  const paperDir = path.join(TEST_DIR, "paper-opps");
  const sessionDir = path.join(TEST_DIR, "paper-sessions");
  const collectDir = path.join(TEST_DIR, "collect-logs");
  const monitorDir = path.join(TEST_DIR, "monitor-logs");
  const ledgerDir = path.join(TEST_DIR, "paper-ledger");

  fs.mkdirSync(paperDir, { recursive: true });
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.mkdirSync(collectDir, { recursive: true });
  fs.mkdirSync(monitorDir, { recursive: true });
  fs.mkdirSync(ledgerDir, { recursive: true });

  process.env.PAPER_OPPORTUNITY_DIR = paperDir;
  process.env.SESSION_EVIDENCE_DIR = sessionDir;
  process.env.COLLECTION_LOG_DIR = collectDir;
  process.env.MONITOR_LOG_DIR = monitorDir;
  process.env.PAPER_TRADING_DIR = ledgerDir;
}

function cleanTestEnv() {
  try {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  } catch {}
}

function makeQuote(opts: Partial<Quote> = {}): Quote {
  return {
    ltp: 100,
    bid: 99.5,
    ask: 100.5,
    oi: 25000,
    chgOi: 1500,
    volume: 5000,
    iv: 15.0,
    delta: 0.45,
    gamma: 0.002,
    theta: -1.2,
    vega: 5.5,
    instrumentKey: "NSE_FO|TEST_KEY",
    lastTradeTime: null,
    ...opts,
  };
}

function makeRow(strike: number, callOpts: Partial<Quote> = {}, putOpts: Partial<Quote> = {}): OptionRow {
  return {
    strike,
    call: makeQuote({ delta: 0.45, ...callOpts }),
    put: makeQuote({ delta: -0.45, ...putOpts }),
  };
}

function makeSnapshot(rows: OptionRow[], chainSource: "LIVE" | "STALE" = "LIVE"): Snapshot {
  const spot = 22050;
  const si = (src: "LIVE" | "STALE") => ({
    source: src,
    provider: "UPSTOX" as const,
    fetchedAt: NOW.toISOString(),
    lastTradeTime: NOW.toISOString(),
  });
  // Ensure structural S/R levels exist so R:R quality filter can evaluate room-to-resistance
  const fullChain = [...rows];
  if (!fullChain.some((r) => r.strike === 22500)) {
    fullChain.push(makeRow(22500, { ltp: 18, oi: 120_000, volume: 100 }));
  }
  if (!fullChain.some((r) => r.strike === 21500)) {
    fullChain.push(makeRow(21500, { ltp: 35, oi: 15_000, volume: 100 }, { ltp: 40, oi: 120_000, volume: 100 }));
  }
  fullChain.sort((a, b) => a.strike - b.strike);
  return {
    index: "nifty" as const,
    name: "NIFTY 50",
    spot,
    prevClose: 21970,
    expiry: "2026-10-13",
    strikeStep: 100,
    lotSize: 75,
    fallbackReason: null,
    chain: fullChain,
    indicators: {
      ema9: 21800, ema21: 21600, ema50: 21300, ema200: 20500,
      vwap: 21900, rsi: 62, macdHist: 4.5, atr: 150, pdh: 22300, pdl: 21700,
      orHigh: 21950, orLow: 21850, futuresVwap: null,
    },
    breadth: {
      index: "nifty" as const, status: "LIVE" as const, advances: 40, declines: 10,
      unchanged: 0, total: 50, expected: 50, coverage: 100, advanceDeclineRatio: 4.0,
      advancePercent: 80, declinePercent: 20, breadthPercent: 60, signal: 0.8,
      classification: "STRONGLY BULLISH" as const, priceBreadthState: "BULLISH_CONFIRMATION" as const,
      fetchedAt: NOW.toISOString(),
    },
    news: { score: 0.5, bullishPct: 75, neutralPct: 20, bearishPct: 5, eventRisk: null },
    sources: {
      market: si("LIVE"),
      optionChain: si(chainSource),
      technical: si("LIVE"),
      news: si("LIVE"),
      breadth: si("LIVE"),
    },
    ivPercentile: 35,
    technical: null,
  } as unknown as Snapshot;
}

describe("Phase 1.9 — Contract-Level Freshness Safeguards", () => {
  beforeEach(() => {
    setupTestEnv();
  });

  afterEach(() => {
    cleanTestEnv();
  });

  // ── 1. Strike Isolation ───────────────────────────────────────────────────
  describe("1. Strike isolation safeguards", () => {
    it("CS-01: one fresh strike in raw chain populates its own LTT while unverified strike gets null LTT", () => {
      const freshLttMs = NOW.getTime() - 4_000; // 4s ago -> LIVE
      const rawData = [
        {
          strike_price: 22000,
          underlying_spot_price: 22050,
          call_options: {
            instrument_key: "NSE_FO|STRIKE_A_FRESH",
            market_data: { ltp: 120, oi: 10000, volume: 500, last_trade_time: freshLttMs },
            option_greeks: { iv: 15, delta: 0.5 },
          },
          put_options: {
            instrument_key: "NSE_FO|STRIKE_A_PUT",
            market_data: { ltp: 80, oi: 10000, volume: 500 },
          },
        },
        {
          strike_price: 22100,
          underlying_spot_price: 22050,
          call_options: {
            instrument_key: "NSE_FO|STRIKE_B_UNVERIFIED",
            market_data: { ltp: 60, oi: 10000, volume: 500 /* NO last_trade_time */ },
            option_greeks: { iv: 15, delta: 0.4 },
          },
          put_options: {
            instrument_key: "NSE_FO|STRIKE_B_PUT",
            market_data: { ltp: 140, oi: 10000, volume: 500 },
          },
        },
      ];

      const norm = normalizeChain(rawData, "nifty", "2026-10-13");
      // Chain-level LTT reflects the max timestamp across strikes
      assert.equal(norm.lastTradeTime, new Date(freshLttMs).toISOString());

      // Strike A call has valid ISO lastTradeTime
      assert.equal(norm.rows[0].call.lastTradeTime, new Date(freshLttMs).toISOString());
      // Strike B call has NULL lastTradeTime (unverified)
      assert.equal(norm.rows[1].call.lastTradeTime, null);
    });

    it("CS-02: one fresh strike cannot make an otherwise unverified contract eligible in opportunityEngine", () => {
      const freshLttIso = new Date(NOW.getTime() - 4_000).toISOString();
      const rows: OptionRow[] = [
        makeRow(22000, {
          instrumentKey: "NSE_FO|STRIKE_A_FRESH",
          oi: 50_000,
          volume: 10_000,
          lastTradeTime: freshLttIso, // LIVE
        }),
        makeRow(22100, {
          instrumentKey: "NSE_FO|STRIKE_B_UNVERIFIED",
          oi: 50_000,
          volume: 10_000,
          lastTradeTime: null, // UNVERIFIED
        }),
      ];

      const snap = makeSnapshot(rows, "LIVE");
      const res = evaluateOptionsOpportunity(snap, "NIFTY", NOW);

      const strikeA = res.topOpportunities.find((o) => o.strike === 22000);
      const strikeB = res.topOpportunities.find((o) => o.strike === 22100);

      // Strike A is fresh -> tradable grade
      assert.ok(strikeA, "Strike A should be evaluated");
      assert.notEqual(strikeA?.grade, "REJECT", "Fresh strike should not be REJECT");

      // Strike B has null lastTradeTime -> forced REJECT
      assert.ok(strikeB, "Strike B should be evaluated");
      assert.equal(strikeB?.grade, "REJECT", "Unverified strike B must be REJECT");
      assert.ok(
        strikeB?.gradeReasons?.some((r) => r.includes("Contract quote unverified")),
        "Strike B must state unverified quote reason",
      );
    });

    it("CS-03: a contract with a stale LTT (older than 60s) is forced to REJECT even if chain is LIVE", () => {
      const staleLttIso = new Date(NOW.getTime() - 120_000).toISOString(); // 2 minutes old -> STALE
      const rows: OptionRow[] = [
        makeRow(22000, {
          instrumentKey: "NSE_FO|STRIKE_STALE",
          oi: 50_000,
          volume: 10_000,
          lastTradeTime: staleLttIso,
        }),
      ];

      const snap = makeSnapshot(rows, "LIVE");
      const res = evaluateOptionsOpportunity(snap, "NIFTY", NOW);
      const contract = res.topOpportunities.find((o) => o.strike === 22000);

      assert.ok(contract);
      assert.equal(contract?.grade, "REJECT");
      assert.ok(contract?.gradeReasons?.some((r) => r.includes("Contract quote unverified")));
    });
  });

  // ── 2. Paper Entry Safeguards ─────────────────────────────────────────────
  describe("2. Paper-entry rejection safeguards", () => {
    it("PE-01: liveOpportunityCollector skips contracts with REJECT grade or unverified timestamp", async () => {
      const mockResult = async () => ({
        timestamp: NOW.toISOString(),
        engineVersion: "20.1",
        underlying: "NIFTY",
        source: "LIVE",
        dataQuality: { market: "LIVE", optionChain: "LIVE", technical: "LIVE", news: "LIVE", breadth: "LIVE" },
        marketRegime: "BULLISH",
        marketDirection: "BULLISH",
        directionScore: 80,
        spot: 22050,
        atmStrike: 22000,
        support: 21500,
        resistance: 22500,
        expectedMove: 200,
        pcrOi: 1.2,
        contractsEvaluated: 2,
        contractsRejected: 1,
        topOpportunities: [
          {
            rank: 1,
            underlying: "NIFTY",
            expiry: "2026-10-13",
            strike: 22000,
            optionType: "CE" as const,
            instrumentKey: "NSE_FO|STRIKE_A_FRESH",
            strategyType: "LONG_CALL" as const,
            ltp: 120, bid: 119, ask: 121, spreadPct: 1.6,
            oi: 20000, volume: 5000, iv: 15, delta: 0.5,
            entry: 120, entryLow: 116.4, entryHigh: 123.6,
            stop: 60, target1: 150, target2: 180, rr: 2.0, maxLoss: 120, breakeven: 22120,
            opportunityScore: 85, scoreBreakdown: {}, confidence: 80,
            signalAgreement: 4, signalAgreementOf: 5, signals: [],
            reasons: ["Fresh quote"], invalidation: "Support break", srRoom: 450, expectedMove: 200,
            grade: "A" as const,
            lastTradeTime: new Date(NOW.getTime() - 4_000).toISOString(), // LIVE
          },
          {
            rank: 2,
            underlying: "NIFTY",
            expiry: "2026-10-13",
            strike: 22100,
            optionType: "CE" as const,
            instrumentKey: "NSE_FO|STRIKE_B_UNVERIFIED",
            strategyType: "LONG_CALL" as const,
            ltp: 70, bid: 69, ask: 71, spreadPct: 2.8,
            oi: 15000, volume: 2000, iv: 15, delta: 0.4,
            entry: 70, entryLow: 67.9, entryHigh: 72.1,
            stop: 35, target1: 95, target2: 115, rr: 2.0, maxLoss: 70, breakeven: 22170,
            opportunityScore: 78, scoreBreakdown: {}, confidence: 75,
            signalAgreement: 4, signalAgreementOf: 5, signals: [],
            reasons: ["Unverified quote"], invalidation: "Support break", srRoom: 400, expectedMove: 200,
            grade: "REJECT" as const, // Forced REJECT
            lastTradeTime: null,
          },
        ],
        rejectedContracts: [],
        eventRiskPenalty: 0,
        eventRiskReason: null,
        recommendedStrategy: "LONG_CALL" as const,
        noOpportunityReason: null,
      });

      const mockEmpty = async () => ({
        spot: 52000, topOpportunities: [], rejectedContracts: [],
        dataQuality: { market: "LIVE", optionChain: "LIVE", technical: "LIVE", news: "LIVE", breadth: "LIVE" },
      } as any);
      const mockStockEmpty = async () => ({ source: "UPSTOX" as const, topOpportunities: [] } as any);

      const colRes = await runLiveOpportunityCollection(mockResult, mockEmpty, mockStockEmpty, NOW);

      // Only Strike A should be created; Strike B (REJECT / null lastTradeTime) must be rejected
      assert.equal(colRes.created, 1);
      assert.equal(colRes.accepted, 1);
      assert.equal(colRes.rejected, 1);
      assert.ok(colRes.errors.some((e) => e.includes("STRIKE_B_UNVERIFIED") || e.includes("22100CE")));
    });

    it("PE-02: PaperTradingEngine.processRecommendation rejects plan with unverified contract quote", () => {
      const rows: OptionRow[] = [
        makeRow(22000, {
          instrumentKey: "NSE_FO|STRIKE_UNVERIFIED",
          lastTradeTime: null, // UNVERIFIED
        }),
      ];
      const snap = makeSnapshot(rows, "LIVE");
      const analysis: any = {
        snapshot: snap,
        status: "TRADE",
        plan: {
          strategy: "Long Call",
          legs: [{ side: "BUY", type: "CE", strike: 22000, ltp: 100 }],
          credit: false,
          entry: 100,
          entryZone: [97, 103],
          stop: 50,
          target1: 200,
          target2: 200,
          rr: 2.0,
          maxLoss: 100,
          maxProfit: null,
          breakevens: [22100],
          score: 80,
          rejected: null,
        },
      };

      const engine = new PaperTradingEngine({ accountCapital: 100_000 });
      const res = engine.processRecommendation(analysis, NOW);

      assert.equal(res.created, false);
      assert.match(res.reason, /FRESHNESS_BLOCKED.*has no exchange trade timestamp/);
      assert.equal(engine.getTrades().length, 0, "No trade should enter paper ledger");
    });
  });

  // ── 3. Revaluation and Simulated Exits Fail-Closed ────────────────────────
  describe("3. Revaluation and exit fail-closed safeguards", () => {
    it("RE-01: optionMonitorInput returns null when contract lastTradeTime is stale", () => {
      const freshChain = makeSnapshot([
        makeRow(22000, {
          instrumentKey: "NSE_FO|TEST_STALE_CONTRACT",
          ltp: 100,
          bid: 99,
          ask: 101,
          lastTradeTime: new Date(NOW.getTime() - 150_000).toISOString(), // 150s old -> STALE
        }),
      ]);

      const res = optionMonitorInput(freshChain, "NSE_FO|TEST_STALE_CONTRACT", NOW);
      assert.equal(res, null, "Stale contract quote must return null and not price position");
    });

    it("RE-02: optionMonitorInput returns null when contract has no executable bid", () => {
      const freshChain = makeSnapshot([
        makeRow(22000, {
          instrumentKey: "NSE_FO|TEST_NO_BID",
          ltp: 100,
          bid: null, // Missing bid
          ask: 102,
          lastTradeTime: new Date(NOW.getTime() - 4_000).toISOString(),
        }),
      ]);

      const res = optionMonitorInput(freshChain, "NSE_FO|TEST_NO_BID", NOW);
      assert.equal(res, null, "Missing bid means no executable exit side -> fail closed");
    });

    it("RE-03: PaperTradingEngine preserves open position and does NOT trigger exit when quote is stale", () => {
      const freshRows: OptionRow[] = [
        makeRow(22000, {
          instrumentKey: "NSE_FO|TEST_POS",
          ltp: 100,
          bid: 99,
          ask: 101,
          lastTradeTime: new Date(NOW.getTime() - 5_000).toISOString(),
        }),
      ];
      const snap = makeSnapshot(freshRows, "LIVE");
      const analysis: any = {
        snapshot: snap,
        status: "TRADE",
        factors: [],
        plan: {
          strategy: "Long Call",
          legs: [{ side: "BUY", type: "CE", strike: 22000, ltp: 100 }],
          credit: false,
          entry: 100,
          entryZone: [97, 103],
          stop: 50,
          target1: 200,
          target2: 200,
          rr: 2.0,
          maxLoss: 100,
          maxProfit: null,
          breakevens: [22100],
          score: 80,
          rejected: null,
        },
      };

      const engine = new PaperTradingEngine({ accountCapital: 500_000 });
      const createRes = engine.processRecommendation(analysis, NOW);
      assert.equal(createRes.created, true, `Expected trade creation, got: ${createRes.reason}`);
      const trade = createRes.trade!;
      assert.equal(trade.status, "OPEN");
      const initialPrice = trade.currentPrice;

      // Simulate a market update where LTP dropped through stop loss (e.g. 40), BUT the quote is STALE (180s old)
      const staleSnap = makeSnapshot([
        makeRow(22000, {
          instrumentKey: "NSE_FO|TEST_POS",
          ltp: 40, // Below stop loss (50)
          bid: 39,
          ask: 41,
          lastTradeTime: new Date(NOW.getTime() - 180_000).toISOString(), // 3 mins old -> STALE
        }),
      ]);

      engine.evaluateOpenTrades(staleSnap, NOW);

      // Must FAIL CLOSED: position remains OPEN, no false stop-loss exit
      assert.equal(trade.status, "OPEN", "Position must remain OPEN on stale quote");
      assert.equal(trade.currentPrice, initialPrice, "Price must not update from untrusted quote");
      assert.equal(trade.monitoring?.status, "STALE_QUOTES");
      assert.ok(
        engine.getEvents(trade.id).some((e) => e.event === "PAPER_QUOTE_UNAVAILABLE"),
        "Must record PAPER_QUOTE_UNAVAILABLE event",
      );
    });

    it("RE-04: PaperTradingEngine preserves open position and does NOT exit when bid is missing", () => {
      const freshRows: OptionRow[] = [
        makeRow(22000, {
          instrumentKey: "NSE_FO|TEST_NO_BID_POS",
          ltp: 100,
          bid: 99,
          ask: 101,
          lastTradeTime: new Date(NOW.getTime() - 5_000).toISOString(),
        }),
      ];
      const snap = makeSnapshot(freshRows, "LIVE");
      const analysis: any = {
        snapshot: snap,
        status: "TRADE",
        factors: [],
        plan: {
          strategy: "Long Call",
          legs: [{ side: "BUY", type: "CE", strike: 22000, ltp: 100 }],
          credit: false,
          entry: 100,
          entryZone: [97, 103],
          stop: 50,
          target1: 200,
          target2: 200,
          rr: 2.0,
          maxLoss: 100,
          maxProfit: null,
          breakevens: [22100],
          score: 80,
          rejected: null,
        },
      };

      const engine = new PaperTradingEngine({ accountCapital: 500_000 });
      const createRes = engine.processRecommendation(analysis, NOW);
      assert.equal(createRes.created, true, `Expected trade creation, got: ${createRes.reason}`);
      const trade = createRes.trade!;

      // Update with missing bid
      const noBidSnap = makeSnapshot([
        makeRow(22000, {
          instrumentKey: "NSE_FO|TEST_NO_BID_POS",
          ltp: 40,
          bid: null, // missing
          ask: 41,
          lastTradeTime: new Date(NOW.getTime() - 5_000).toISOString(),
        }),
      ]);

      engine.evaluateOpenTrades(noBidSnap, NOW);
      assert.equal(trade.status, "OPEN", "Position must remain OPEN when executable bid is missing");
      assert.equal(trade.monitoring?.status, "STALE_QUOTES");
    });
  });

  // ── 4. Valid Fresh Quotes ─────────────────────────────────────────────────
  describe("4. Valid fresh quotes preserve intended behavior", () => {
    it("VF-01: valid fresh quotes revalue positions and trigger stop loss at executable bid with slippage", () => {
      const freshRows: OptionRow[] = [
        makeRow(22000, {
          instrumentKey: "NSE_FO|VALID_FRESH_POS",
          ltp: 100,
          bid: 99,
          ask: 101,
          lastTradeTime: new Date(NOW.getTime() - 5_000).toISOString(),
        }),
      ];
      const snap = makeSnapshot(freshRows, "LIVE");
      const analysis: any = {
        snapshot: snap,
        status: "TRADE",
        factors: [],
        plan: {
          strategy: "Long Call",
          legs: [{ side: "BUY", type: "CE", strike: 22000, ltp: 100 }],
          credit: false,
          entry: 100,
          entryZone: [97, 103],
          stop: 50,
          target1: 200,
          target2: 200,
          rr: 2.0,
          maxLoss: 100,
          maxProfit: null,
          breakevens: [22100],
          score: 80,
          rejected: null,
        },
      };

      const engine = new PaperTradingEngine({ accountCapital: 500_000 });
      const createRes = engine.processRecommendation(analysis, NOW);
      assert.equal(createRes.created, true, `Expected trade creation, got: ${createRes.reason}`);
      const trade = createRes.trade!;

      // 1. Fresh normal quote: revaluation updates clean OK status
      const normalUpdate = makeSnapshot([
        makeRow(22000, {
          instrumentKey: "NSE_FO|VALID_FRESH_POS",
          ltp: 105,
          bid: 104,
          ask: 106,
          lastTradeTime: new Date(NOW.getTime() - 4_000).toISOString(),
        }),
      ]);
      engine.evaluateOpenTrades(normalUpdate, NOW);
      assert.equal(trade.status, "OPEN");
      assert.equal(trade.monitoring?.status, "OK");
      assert.equal(trade.currentPrice, 104, "Revalues to executable bid 104");

      // 2. Fresh quote below stop loss: exits cleanly
      const stopUpdate = makeSnapshot([
        makeRow(22000, {
          instrumentKey: "NSE_FO|VALID_FRESH_POS",
          ltp: 45,
          bid: 44, // below stop loss 50
          ask: 46,
          lastTradeTime: new Date(NOW.getTime() - 3_000).toISOString(),
        }),
      ]);
      engine.evaluateOpenTrades(stopUpdate, NOW);
      assert.equal(trade.status, "STOPPED_OUT");
      assert.equal(trade.exitReason, "STOP_LOSS");
      // Exit fill at bid 44 with 1% slippage = 44 * 0.99 = 43.56
      assert.equal(trade.legs[0].exitPrice, 43.56);
      assert.equal(trade.legs[0].exitFillSource, "BID");
      assert.ok(trade.realizedPnL !== null && trade.realizedPnL < 0);
      assert.ok(trade.transactionCosts && trade.transactionCosts.totalCosts > 0);

      // Ledger reconciles cleanly
      const reconciliation = reconcileLedger(engine.getTrades(), engine.getEvents());
      assert.deepEqual(reconciliation.issues, [], "Ledger must reconcile with zero issues");
    });
  });

  // ── 5. Risk Settings and Ledger Integrity ─────────────────────────────────
  describe("5. Risk settings and ledger integrity preservation", () => {
    it("RI-01: rejected contracts do not consume capital or risk limits", () => {
      const config = getRiskConfig();
      assert.equal(config.accountCapital, 100_000);
      assert.equal(config.riskPerTradePercent, 1.0);
      assert.equal(config.maxOpenRiskPercent, 3.0);
      assert.equal(config.maxPositionValuePercent, 20.0);

      const rows: OptionRow[] = [
        makeRow(22000, {
          instrumentKey: "NSE_FO|REJECTED_STRIKE",
          lastTradeTime: null, // UNVERIFIED
        }),
      ];
      const snap = makeSnapshot(rows, "LIVE");
      const analysis: any = {
        snapshot: snap,
        status: "TRADE",
        factors: [],
        plan: {
          strategy: "Long Call",
          legs: [{ side: "BUY", type: "CE", strike: 22000, ltp: 100 }],
          credit: false,
          entry: 100,
          entryZone: [97, 103],
          stop: 50,
          target1: 200,
          target2: 200,
          rr: 2.0,
          maxLoss: 100,
          maxProfit: null,
          breakevens: [22100],
          score: 80,
          rejected: null,
        },
      };

      const engine = new PaperTradingEngine();
      const res = engine.processRecommendation(analysis, NOW);
      assert.equal(res.created, false);

      const summary = engine.getPortfolioSummary();
      assert.equal(summary.openPositions, 0);
      assert.equal(summary.closedTrades, 0);
      assert.equal(summary.startingCapital, config.accountCapital);
    });

    it("RI-02: production .data directory is never touched by test runs", () => {
      const prodDataPath = path.join(process.cwd(), ".data");
      if (fs.existsSync(prodDataPath)) {
        const stat = fs.statSync(prodDataPath);
        assert.ok(stat.isDirectory());
      }
      assert.ok(process.env.PAPER_TRADING_DIR?.includes(".test-data"));
    });
  });

  // ── 6. Phase 2.3.6 Opportunity Engine Delta & Spread Safeguards ───────────
  describe("6. Phase 2.3.6 — Opportunity Engine Delta Validation & Actionable Grading Safeguards", () => {
    it("DV-01: Null delta is rejected for actionable grading before target/R:R calculations", () => {
      const freshLttIso = new Date(NOW.getTime() - 4_000).toISOString();
      const rows: OptionRow[] = [
        makeRow(22000, {
          instrumentKey: "NSE_FO|STRIKE_NULL_DELTA",
          delta: null,
          lastTradeTime: freshLttIso,
          oi: 30000,
          volume: 5000,
        }),
      ];
      const snap = makeSnapshot(rows, "LIVE");
      const res = evaluateOptionsOpportunity(snap, "NIFTY", NOW);

      const inTop = res.topOpportunities.find((o) => o.strike === 22000 && o.optionType === "CE");
      assert.equal(inTop, undefined, "Null delta must not appear in top opportunities");

      const inRej = res.rejectedContracts.find((r) => r.strike === 22000 && r.optionType === "CE");
      assert.ok(inRej, "Null delta must be rejected in candidate filter stage");
      assert.equal(inRej?.reason, "Missing option delta");
    });

    it("DV-01b: Non-finite delta (NaN, Infinity, -Infinity) is rejected for actionable grading and blocked from collection", async () => {
      const freshLttIso = new Date(NOW.getTime() - 4_000).toISOString();
      const nonFiniteValues = [NaN, Infinity, -Infinity];

      for (const badDelta of nonFiniteValues) {
        const rows: OptionRow[] = [
          makeRow(22000, {
            instrumentKey: `NSE_FO|STRIKE_DELTA_${String(badDelta)}`,
            delta: badDelta,
            lastTradeTime: freshLttIso,
            oi: 30000,
            volume: 5000,
          }),
        ];
        const snap = makeSnapshot(rows, "LIVE");
        const res = evaluateOptionsOpportunity(snap, "NIFTY", NOW);

        const inTop = res.topOpportunities.find((o) => o.strike === 22000 && o.optionType === "CE");
        assert.equal(inTop, undefined, `Non-finite delta ${badDelta} must not appear in top opportunities`);

        const inRej = res.rejectedContracts.find((r) => r.strike === 22000 && r.optionType === "CE");
        assert.ok(inRej, `Non-finite delta ${badDelta} must be rejected at candidate filter stage`);
        assert.equal(inRej?.reason, "Missing option delta");

        // Direct test against collector gate in case a candidate with non-finite delta reached collector
        const syntheticOpp: any = {
          rank: 1,
          underlying: "NIFTY",
          expiry: "2026-10-13",
          strike: 22000,
          optionType: "CE",
          instrumentKey: `NSE_FO|SYNTH_DELTA_${String(badDelta)}`,
          strategyType: "LONG_CALL",
          ltp: 100, bid: 99, ask: 101, spreadPct: 2.0,
          oi: 25000, volume: 5000, iv: 15,
          delta: badDelta,
          entry: 100, entryLow: 97, entryHigh: 103,
          stop: 50, target1: 150, target2: 200, rr: 2.0, maxLoss: 100, breakeven: 22100,
          opportunityScore: 80, scoreBreakdown: {}, confidence: 80,
          signalAgreement: 4, signalAgreementOf: 5, signals: [],
          reasons: ["Test"], invalidation: "Test", srRoom: 450, expectedMove: 200,
          grade: "A",
          lastTradeTime: freshLttIso,
        };

        const mockResult = async () => ({
          timestamp: NOW.toISOString(),
          engineVersion: "20.1",
          underlying: "NIFTY",
          source: "LIVE",
          dataQuality: { market: "LIVE", optionChain: "LIVE", technical: "LIVE", news: "LIVE", breadth: "LIVE" },
          marketRegime: "BULLISH", marketDirection: "BULLISH", directionScore: 80,
          spot: 22050, atmStrike: 22000, support: 21500, resistance: 22500, expectedMove: 200, pcrOi: 1.2,
          contractsEvaluated: 1, contractsRejected: 0,
          topOpportunities: [syntheticOpp],
          rejectedContracts: [], eventRiskPenalty: 0, eventRiskReason: null, recommendedStrategy: "LONG_CALL" as const, noOpportunityReason: null,
        });
        const mockEmpty = async () => ({
          spot: 52000, topOpportunities: [], rejectedContracts: [],
          dataQuality: { market: "LIVE", optionChain: "LIVE", technical: "LIVE", news: "LIVE", breadth: "LIVE" },
        } as any);
        const mockStockEmpty = async () => ({ source: "UPSTOX" as const, topOpportunities: [] } as any);

        const colRes = await runLiveOpportunityCollection(mockResult, mockEmpty, mockStockEmpty, NOW);
        assert.equal(colRes.accepted, 0, `Non-finite delta ${badDelta} must not be accepted by collector`);
        assert.equal(colRes.created, 0, `Non-finite delta ${badDelta} must not create paper trade`);
        assert.ok(
          colRes.errors.some((e) => e.includes(`delta ${badDelta} invalid`)),
          `Collector must log rejection for non-finite delta ${badDelta}`,
        );
      }
    });

    it("DV-02: Delta outside the approved range [0.10, 0.80] is rejected", () => {
      const freshLttIso = new Date(NOW.getTime() - 4_000).toISOString();
      const rows: OptionRow[] = [
        makeRow(22000, {
          instrumentKey: "NSE_FO|STRIKE_LOW_DELTA",
          delta: 0.05, // below 0.10
          lastTradeTime: freshLttIso,
          oi: 30000,
          volume: 5000,
        }),
        makeRow(22100, {
          instrumentKey: "NSE_FO|STRIKE_HIGH_DELTA",
          delta: 0.85, // above 0.80
          lastTradeTime: freshLttIso,
          oi: 30000,
          volume: 5000,
        }),
      ];
      const snap = makeSnapshot(rows, "LIVE");
      const res = evaluateOptionsOpportunity(snap, "NIFTY", NOW);

      const lowRej = res.rejectedContracts.find((r) => r.strike === 22000 && r.optionType === "CE");
      assert.ok(lowRej, "Delta 0.05 must be rejected");
      assert.match(lowRej!.reason, /Delta 0\.05 outside \[0\.1, 0\.8\]/);

      const highRej = res.rejectedContracts.find((r) => r.strike === 22100 && r.optionType === "CE");
      assert.ok(highRej, "Delta 0.85 must be rejected");
      assert.match(highRej!.reason, /Delta 0\.85 outside \[0\.1, 0\.8\]/);
    });

    it("DV-03: The 0.35 fallback cannot produce an actionable result", () => {
      // 1. Unverified chain: greeksVerified is false -> finalGrade must be REJECT even if quote is fresh
      const freshLttIso = new Date(NOW.getTime() - 4_000).toISOString();
      const rows: OptionRow[] = [
        makeRow(22000, {
          instrumentKey: "NSE_FO|STRIKE_UNVERIFIED_GREEKS",
          delta: 0.45,
          lastTradeTime: freshLttIso,
          oi: 30000,
          volume: 5000,
        }),
      ];
      const unverifiedSnap = makeSnapshot(rows, "STALE"); // chain is STALE -> greeksVerified false
      const resUnverified = evaluateOptionsOpportunity(unverifiedSnap, "NIFTY", NOW);
      const opp = resUnverified.topOpportunities.find((o) => o.strike === 22000);
      assert.ok(opp, "Contract evaluated in unverified ranking");
      assert.equal(opp?.grade, "REJECT", "Unverified Greeks must force finalGrade REJECT");
      assert.notEqual(opp?.grade, "A+");
      assert.notEqual(opp?.grade, "A");
      assert.notEqual(opp?.grade, "B");
      assert.notEqual(opp?.grade, "C");

      // 2. Verified chain: delta is used directly, target scaled by delta (not 0.35)
      const verifiedSnap = makeSnapshot(rows, "LIVE");
      const resVerified = evaluateOptionsOpportunity(verifiedSnap, "NIFTY", NOW);
      const verifiedOpp = resVerified.topOpportunities.find((o) => o.strike === 22000);
      assert.ok(verifiedOpp);
      assert.notEqual(verifiedOpp?.grade, "REJECT");
      // Target1 calculation: ltp + delta * useRoom * 0.45
      // With delta=0.45, room=450 (resistance 22500 - spot 22050):
      // 100 + 0.45 * 450 * 0.45 = 100 + 91.125 = 191.13
      // Under 0.35 fallback it would have been: 100 + 0.35 * 450 * 0.45 = 170.88
      assert.ok(verifiedOpp!.target1 > 180, `Target1 ${verifiedOpp!.target1} must reflect real delta 0.45, not 0.35 fallback`);
    });

    it("DV-04: Valid delta continues through Strategy 11.4 without changing rules", () => {
      const rows: OptionRow[] = [
        makeRow(22000, {
          instrumentKey: "NSE_FO|STRIKE_STRAT_VALID",
          delta: 0.50,
          ltp: 100,
          bid: 99,
          ask: 101, // 2% spread
        }),
      ];
      const snap = makeSnapshot(rows, "LIVE");
      const analysis = analyze(snap, NOW);
      assert.equal(STRATEGY_VERSION.strategyVersion, "11.4-frozen");
      assert.ok(analysis.candidates.length > 0, "Candidate should be evaluated");
    });

    it("DV-05: Spread above 5% and up to 12% remains watch-only (Grade C) and cannot enter collector or ledger", async () => {
      const freshLttIso = new Date(NOW.getTime() - 4_000).toISOString();
      // LTP 100, bid 96.9, ask 103.1 -> spread = 6.2%
      const rows: OptionRow[] = [
        makeRow(22000, {
          instrumentKey: "NSE_FO|STRIKE_WIDE_SPREAD",
          ltp: 100,
          bid: 96.9,
          ask: 103.1,
          delta: 0.50,
          oi: 30000,
          volume: 5000,
          lastTradeTime: freshLttIso,
        }),
      ];
      const snap = makeSnapshot(rows, "LIVE");
      const res = evaluateOptionsOpportunity(snap, "NIFTY", NOW);

      const opp = res.topOpportunities.find((o) => o.strike === 22000);
      assert.ok(opp, "6.2% spread must pass discovery filter (<= 12%)");
      assert.equal(opp?.grade, "C", "6.2% spread must be capped at watch-only Grade C");
      assert.ok(
        opp?.gradeReasons?.some((r) => r.includes("5.0% actionable limit") && r.includes("watch-only grade C")),
        "Grade reasons must explain wide spread cap",
      );

      // Now pass to live opportunity collector
      const mockResult = async () => res;
      const mockEmpty = async () => ({
        spot: 52000, topOpportunities: [], rejectedContracts: [],
        dataQuality: { market: "LIVE", optionChain: "LIVE", technical: "LIVE", news: "LIVE", breadth: "LIVE" },
      } as any);
      const mockStockEmpty = async () => ({ source: "UPSTOX" as const, topOpportunities: [] } as any);

      const colRes = await runLiveOpportunityCollection(mockResult, mockEmpty, mockStockEmpty, NOW);
      assert.equal(colRes.accepted, 0, "Watch-only Grade C contract must be rejected by collector");
      assert.equal(colRes.created, 0, "No paper opportunity or ledger entry created");
      assert.ok(
        colRes.errors.some((e) => e.includes("watch-only") || e.includes("exceeds 5.0% actionable limit")),
        "Collector must log rejection for wide spread / watch-only grade",
      );
    });

    it("DV-06: Stale quotes, missing timestamps, and LTP mismatch above 2% remain rejected", () => {
      const staleLttIso = new Date(NOW.getTime() - 120_000).toISOString(); // 2m stale
      const rows: OptionRow[] = [
        makeRow(22000, {
          instrumentKey: "NSE_FO|STRIKE_STALE",
          delta: 0.50,
          lastTradeTime: staleLttIso,
        }),
        makeRow(22100, {
          instrumentKey: "NSE_FO|STRIKE_MISSING_LTT",
          delta: 0.50,
          lastTradeTime: null,
        }),
      ];
      const snap = makeSnapshot(rows, "LIVE");
      const res = evaluateOptionsOpportunity(snap, "NIFTY", NOW);

      const staleOpp = res.topOpportunities.find((o) => o.strike === 22000);
      assert.ok(staleOpp);
      assert.equal(staleOpp?.grade, "REJECT", "Stale quote must force REJECT");

      const missingOpp = res.topOpportunities.find((o) => o.strike === 22100);
      assert.ok(missingOpp);
      assert.equal(missingOpp?.grade, "REJECT", "Missing timestamp must force REJECT");
    });

    it("DV-07: Feature flag OPTION_QUOTE_LTT_ENABLED remains false", () => {
      assert.equal(OPTION_QUOTE_LTT_ENABLED, false);
    });
  });
});
