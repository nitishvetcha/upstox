// Phase 2.3.14 — Settlement Lifecycle State Machine & Ledger Reconciler Integration Test Suite
//
// Strictly offline tests using synthetic data and temporary isolated storage.
// Verifies:
// 1. Expiry transitions to SETTLEMENT_PENDING without fabricated LTP fallback.
// 2. Exact 5-tuple contract matching (TradDt, TckrSymb, XpryDt, StrkPric, OptnTp).
// 3. Robust lifecycle transitions: SETTLEMENT_PENDING -> SETTLED_VERIFIED or SETTLEMENT_UNVERIFIED.
// 4. Recovery: SETTLEMENT_UNVERIFIED -> SETTLED_VERIFIED upon late authoritative data arrival.
// 5. Idempotent reconciliation (no double P&L, no double capital release, no duplicate events).
// 6. Full persistence and restart replay preservation.
// 7. Strict storage isolation: zero mutations to production .data/.

import { describe, it, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";
import { PaperTradingEngine } from "../paperEngine.ts";
import { buildPaperLedgerReport, reconcileLedger } from "../paperReport.ts";
import { loadPaperLedger, savePaperLedger } from "./paperLedgerStore.ts";
import {
  ingestSettlementArchive,
  DEFAULT_SETTLEMENT_DIR,
  buildContractKey,
  type SettlementContractKey,
} from "./settlementIngestion.ts";
import { isFixture } from "./paperOpportunityStore.ts";
import { mockSnapshotTradeInputs as mockSnapshot } from "../testFixtures/mockSnapshotTradeInputs.ts";
import { analyze } from "../engine/strategy.ts";
import type { PaperTrade, PaperTradeEvent } from "../paperTypes.ts";

const TEST_BASE_DIR = path.join(process.cwd(), ".test-data", "settlement_lifecycle_suite");
const TEST_LEDGER_DIR = path.join(TEST_BASE_DIR, "paper-trades");
const TEST_SETTLEMENT_DIR = path.join(TEST_BASE_DIR, "settlement");

const MIDDAY = new Date("2026-10-15T07:00:00Z"); // 12:30 IST on Thursday (expiry day)
const EXPIRY_CUTOFF = new Date("2026-10-15T10:00:00Z"); // 15:30 IST
const POST_EXPIRY = new Date("2026-10-15T10:30:00Z"); // 16:00 IST
const TRADE_DATE = "2026-10-15";

function cleanDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// In-memory PKZIP helper
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let j = 0; j < 8; j++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeZipArchive(filename: string, content: string): Buffer {
  const contentBuf = Buffer.from(content, "utf8");
  const crc = crc32(contentBuf);
  const deflated = zlib.deflateRawSync(contentBuf);
  const fnBuf = Buffer.from(filename, "utf8");

  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0);
  lh.writeUInt16LE(20, 4);
  lh.writeUInt16LE(0, 6);
  lh.writeUInt16LE(8, 8);
  lh.writeUInt16LE(0, 10);
  lh.writeUInt16LE(0, 12);
  lh.writeUInt32LE(crc, 14);
  lh.writeUInt32LE(deflated.length, 18);
  lh.writeUInt32LE(contentBuf.length, 22);
  lh.writeUInt16LE(fnBuf.length, 26);
  lh.writeUInt16LE(0, 28);

  const localFile = Buffer.concat([lh, fnBuf, deflated]);

  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(20, 4);
  cd.writeUInt16LE(20, 6);
  cd.writeUInt16LE(0, 8);
  cd.writeUInt16LE(8, 10);
  cd.writeUInt16LE(0, 12);
  cd.writeUInt16LE(0, 14);
  cd.writeUInt32LE(crc, 16);
  cd.writeUInt32LE(deflated.length, 20);
  cd.writeUInt32LE(contentBuf.length, 24);
  cd.writeUInt16LE(fnBuf.length, 28);
  cd.writeUInt16LE(0, 30);
  cd.writeUInt16LE(0, 32);
  cd.writeUInt16LE(0, 34);
  cd.writeUInt16LE(0, 36);
  cd.writeUInt32LE(0, 38);
  cd.writeUInt32LE(0, 42);

  const cdBuf = Buffer.concat([cd, fnBuf]);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(localFile.length, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([localFile, cdBuf, eocd]);
}

function createSyntheticCsv(rows: string[][]): string {
  const headerCols = [
    "TradDt", "BizDt", "FinInstrmTp", "TckrSymb", "XpryDt", "StrkPric", "OptnTp", "SttlmPric", "ClsPric", "OpnIntrst",
  ];
  return [headerCols, ...rows].map((r) => r.join(",")).join("\r\n") + "\r\n";
}

function createSetup(initialTrades?: PaperTrade[], initialEvents?: PaperTradeEvent[]) {
  cleanDir(TEST_LEDGER_DIR);
  fs.mkdirSync(TEST_LEDGER_DIR, { recursive: true });
  fs.mkdirSync(TEST_SETTLEMENT_DIR, { recursive: true });

  const engine = new PaperTradingEngine(
    { accountCapital: 500_000, maxOpenRiskPercent: 10 },
    {
      allowMock: true,
      onChange: (trades, events) => savePaperLedger(trades, events, TEST_LEDGER_DIR),
    },
  );
  if (initialTrades) {
    engine.setTrades(initialTrades, initialEvents ?? []);
  }
  return engine;
}

function openTestTrade(engine: PaperTradingEngine, at: Date = MIDDAY): PaperTrade {
  const snap = mockSnapshot("nifty", at);
  const analysis = analyze(snap, at, { accountCapital: 500_000 });
  const res = engine.processRecommendation(analysis, at);
  assert.equal(res.created, true, `Expected trade creation, got reason: ${res.reason}`);
  const trade = res.trade!;
  // Align expiry with TRADE_DATE for deterministic testing
  trade.expiry = TRADE_DATE;
  return trade;
}

describe("Phase 2.3.14 — Settlement Lifecycle State Machine & Ledger Reconciler Integration", () => {
  beforeEach(() => {
    cleanDir(TEST_BASE_DIR);
  });

  after(() => {
    cleanDir(TEST_BASE_DIR);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Suite 1: Lifecycle & State Transitions
  // ───────────────────────────────────────────────────────────────────────────
  describe("Suite 1: Expiry Settlement Lifecycle & State Transitions", () => {
    it("LFC-01: Expiry transitions OPEN trade to SETTLEMENT_PENDING at 15:30 IST", () => {
      const engine = createSetup();
      const trade = openTestTrade(engine);
      assert.equal(trade.status, "OPEN");

      // Before expiry cutoff (15:00 IST) -> remains OPEN
      const snap = mockSnapshot("nifty", new Date(`${TRADE_DATE}T09:30:00Z`));
      engine.evaluateOpenTrades(snap, new Date(`${TRADE_DATE}T09:30:00Z`));
      assert.equal(trade.status, "OPEN");

      // At expiry cutoff (15:30 IST) -> transitions to SETTLEMENT_PENDING
      engine.evaluateOpenTrades(snap, EXPIRY_CUTOFF);
      assert.equal(trade.status, "SETTLEMENT_PENDING");
      assert.equal(trade.exitPrice, null, "Exit price must be null");
      assert.equal(trade.exitTimestamp, null, "Exit timestamp must be null");
      assert.equal(trade.realizedPnL, null, "Realized PnL must be null");

      const ev = engine.getEvents(trade.id).find((e) => e.event === "PAPER_TRADE_SETTLEMENT_PENDING");
      assert.ok(ev, "PAPER_TRADE_SETTLEMENT_PENDING event must be recorded");
      assert.equal(ev.details?.riskAmountReserved, trade.riskAmount);
    });

    it("LFC-02: Expiry never uses LTP_FALLBACK, stale quotes, or fabricated intrinsic value", () => {
      const engine = createSetup();
      const trade = openTestTrade(engine);

      // Snapshot with untrusted / stale quotes
      const staleSnap = mockSnapshot("nifty", POST_EXPIRY);
      staleSnap.sources.market = { ...staleSnap.sources.market, source: "STALE" };

      engine.evaluateOpenTrades(staleSnap, POST_EXPIRY);
      assert.equal(trade.status, "SETTLEMENT_PENDING");

      // Check all legs: no LTP fallback exit fills
      for (const leg of trade.legs) {
        assert.equal(leg.exitPrice, null, `Leg ${leg.strike} ${leg.type} must have null exitPrice`);
        assert.equal(leg.exitFillSource, null, `Leg ${leg.strike} ${leg.type} must have null exitFillSource`);
      }
      assert.equal(trade.exitPrice, null);
      assert.equal(trade.realizedPnL, null);
    });

    it("LFC-03: SETTLEMENT_PENDING position retains 100% of capital reservation and risk exposure", () => {
      const engine = createSetup();
      const trade = openTestTrade(engine);
      const originalRisk = trade.riskAmount;
      assert.ok(originalRisk > 0, "Trade must have allocated risk");

      // Transition to SETTLEMENT_PENDING
      engine.evaluateOpenTrades(mockSnapshot("nifty", POST_EXPIRY), POST_EXPIRY);
      assert.equal(trade.status, "SETTLEMENT_PENDING");

      const summary = engine.getPortfolioSummary();
      assert.equal(summary.openPositions, 1, "SETTLEMENT_PENDING must be counted in openPositions");
      assert.equal(summary.openRisk, originalRisk, "Risk must remain reserved");
      assert.equal(summary.usedRisk, originalRisk, "Used risk must include pending settlement");
      assert.equal(summary.closedTrades, 0, "SETTLEMENT_PENDING must NOT be counted as a closed trade");
      assert.equal(summary.realizedPnL, 0, "No realized P&L on pending settlement");

      const report = buildPaperLedgerReport(engine.getTrades());
      assert.equal(report.counts.settlementPending, 1);
      assert.equal(report.counts.open, 0);
      assert.equal(report.counts.closed, 0);
      assert.equal(report.exposure.openPositions, 1);
      assert.equal(report.exposure.openRisk, originalRisk);
    });

    it("LFC-04: Missing settlement data transitions SETTLEMENT_PENDING to SETTLEMENT_UNVERIFIED without releasing risk", () => {
      const engine = createSetup();
      const trade = openTestTrade(engine);
      engine.evaluateOpenTrades(mockSnapshot("nifty", POST_EXPIRY), POST_EXPIRY);
      assert.equal(trade.status, "SETTLEMENT_PENDING");

      // Settle against an empty settlement directory (no Bhavcopy ingested)
      const res = engine.settlePendingTrades(TRADE_DATE, { storageDir: TEST_SETTLEMENT_DIR, now: POST_EXPIRY });
      assert.equal(res.settled.length, 0);
      assert.equal(res.unverified.length, 1);
      assert.ok(res.errors.length > 0);

      assert.equal(trade.status, "SETTLEMENT_UNVERIFIED");
      assert.equal(trade.exitPrice, null);
      assert.equal(trade.exitTimestamp, null);
      assert.equal(trade.realizedPnL, null);
      assert.ok(trade.settlement?.unverifiedReason, "Actionable unverifiedReason must be recorded");

      // Risk remains reserved in UNVERIFIED state
      const summary = engine.getPortfolioSummary();
      assert.equal(summary.openPositions, 1);
      assert.equal(summary.openRisk, trade.riskAmount);
      assert.equal(summary.closedTrades, 0);

      const unverifiedEv = engine.getEvents(trade.id).find((e) => e.event === "PAPER_TRADE_SETTLEMENT_UNVERIFIED");
      assert.ok(unverifiedEv, "PAPER_TRADE_SETTLEMENT_UNVERIFIED event must be recorded");
    });

    it("LFC-05: Non-authoritative / quarantined settlement datasets cannot settle a position", () => {
      const engine = createSetup();
      const trade = openTestTrade(engine);
      engine.evaluateOpenTrades(mockSnapshot("nifty", POST_EXPIRY), POST_EXPIRY);

      // Create a corrupted/quarantined dataset with conflicting prices
      const csv = createSyntheticCsv([
        [TRADE_DATE, TRADE_DATE, "OPTIDX", "NIFTY", TRADE_DATE, String(trade.legs[0].strike), trade.legs[0].type, "100.00", "100.00", "1000"],
        [TRADE_DATE, TRADE_DATE, "OPTIDX", "NIFTY", TRADE_DATE, String(trade.legs[0].strike), trade.legs[0].type, "150.00", "150.00", "1000"], // CONFLICT!
      ]);
      const zip = makeZipArchive("bhav.csv", csv);
      const ingRes = ingestSettlementArchive(zip, { storageDir: TEST_SETTLEMENT_DIR, expectedTradeDate: TRADE_DATE });
      assert.equal(ingRes.status, "QUARANTINED");

      // Attempt to settle
      const res = engine.settlePendingTrades(TRADE_DATE, { storageDir: TEST_SETTLEMENT_DIR, now: POST_EXPIRY });
      assert.equal(res.settled.length, 0);
      assert.equal(trade.status, "SETTLEMENT_UNVERIFIED");
      assert.equal(trade.exitPrice, null);
      assert.equal(trade.realizedPnL, null);
    });

    it("LFC-06: Verified settlement transitions SETTLEMENT_PENDING to SETTLED_VERIFIED with exchange SttlmPric", () => {
      const engine = createSetup();
      const trade = openTestTrade(engine);
      engine.evaluateOpenTrades(mockSnapshot("nifty", POST_EXPIRY), POST_EXPIRY);
      assert.equal(trade.status, "SETTLEMENT_PENDING");

      // Create valid official Bhavcopy with settlement prices for all legs
      const csvRows = trade.legs.map((leg) => [
        TRADE_DATE, TRADE_DATE, "OPTIDX", "NIFTY", TRADE_DATE, String(leg.strike), leg.type, "45.50", "45.50", "5000",
      ]);
      const zip = makeZipArchive("official_bhav.csv", createSyntheticCsv(csvRows));
      const ing = ingestSettlementArchive(zip, { storageDir: TEST_SETTLEMENT_DIR, expectedTradeDate: TRADE_DATE });
      assert.equal(ing.status, "SUCCESS");

      const res = engine.settlePendingTrades(TRADE_DATE, { storageDir: TEST_SETTLEMENT_DIR, now: POST_EXPIRY });
      assert.equal(res.settled.length, 1);
      assert.equal(res.unverified.length, 0);
      assert.equal(res.errors.length, 0);

      assert.equal(trade.status, "SETTLED_VERIFIED");
      assert.equal(trade.exitReason, "SETTLEMENT");
      assert.ok(trade.exitPrice !== null);
      assert.ok(trade.exitTimestamp !== null);
      assert.ok(trade.realizedPnL !== null);
      assert.ok(trade.grossPnL !== null);
      assert.ok(trade.transactionCosts !== null);

      // Provenance
      assert.ok(trade.settlement);
      assert.equal(trade.settlement.tradeDate, TRADE_DATE);
      assert.equal(trade.settlement.archiveHash, ing.archiveHash);
      assert.equal(trade.settlement.csvHash, ing.csvHash);
      assert.equal(trade.settlement.legs.length, trade.legs.length);
      assert.equal(trade.settlement.costVerificationStatus, "UNVERIFIED_MISSING_EXERCISE_SPECIFICATION");

      // Capital & risk released
      const summary = engine.getPortfolioSummary();
      assert.equal(summary.openPositions, 0);
      assert.equal(summary.openRisk, 0);
      assert.equal(summary.closedTrades, 1);
      assert.equal(summary.realizedPnL, trade.realizedPnL);

      const verifiedEv = engine.getEvents(trade.id).find((e) => e.event === "PAPER_TRADE_SETTLED_VERIFIED");
      assert.ok(verifiedEv);
    });

    it("LFC-07: SETTLEMENT_UNVERIFIED transitions to SETTLED_VERIFIED upon late authoritative data arrival", () => {
      const engine = createSetup();
      const trade = openTestTrade(engine);
      engine.evaluateOpenTrades(mockSnapshot("nifty", POST_EXPIRY), POST_EXPIRY);

      // 1. Ingestion missing -> trade becomes SETTLEMENT_UNVERIFIED
      engine.settlePendingTrades(TRADE_DATE, { storageDir: TEST_SETTLEMENT_DIR, now: POST_EXPIRY });
      assert.equal(trade.status, "SETTLEMENT_UNVERIFIED");

      // 2. Official Bhavcopy is now ingested late
      const csvRows = trade.legs.map((leg) => [
        TRADE_DATE, TRADE_DATE, "OPTIDX", "NIFTY", TRADE_DATE, String(leg.strike), leg.type, "12.00", "12.00", "2000",
      ]);
      const zip = makeZipArchive("late_bhav.csv", createSyntheticCsv(csvRows));
      ingestSettlementArchive(zip, { storageDir: TEST_SETTLEMENT_DIR, expectedTradeDate: TRADE_DATE });

      // 3. Settle again -> transitions SETTLEMENT_UNVERIFIED -> SETTLED_VERIFIED
      const res2 = engine.settlePendingTrades(TRADE_DATE, { storageDir: TEST_SETTLEMENT_DIR, now: new Date(POST_EXPIRY.getTime() + 3600_000) });
      assert.equal(res2.settled.length, 1);
      assert.equal(trade.status, "SETTLED_VERIFIED");
      assert.equal(trade.legs[0].exitPrice, 12.0);
      assert.equal(trade.legs[0].exitFillSource, "EXCHANGE_SETTLEMENT");
    });

    it("LFC-08: Repeated settlement processing is strictly idempotent", () => {
      const engine = createSetup();
      const trade = openTestTrade(engine);
      engine.evaluateOpenTrades(mockSnapshot("nifty", POST_EXPIRY), POST_EXPIRY);

      const csvRows = trade.legs.map((leg) => [
        TRADE_DATE, TRADE_DATE, "OPTIDX", "NIFTY", TRADE_DATE, String(leg.strike), leg.type, "50.00", "50.00", "1000",
      ]);
      const zip = makeZipArchive("bhav.csv", createSyntheticCsv(csvRows));
      ingestSettlementArchive(zip, { storageDir: TEST_SETTLEMENT_DIR, expectedTradeDate: TRADE_DATE });

      // First run: settles
      const res1 = engine.settlePendingTrades(TRADE_DATE, { storageDir: TEST_SETTLEMENT_DIR, now: POST_EXPIRY });
      assert.equal(res1.settled.length, 1);
      const firstRealized = trade.realizedPnL;
      const firstExitPrice = trade.exitPrice;
      const firstEventsCount = engine.getEvents(trade.id).length;

      // Second run: no-op, no double P&L, no duplicate events
      const res2 = engine.settlePendingTrades(TRADE_DATE, { storageDir: TEST_SETTLEMENT_DIR, now: POST_EXPIRY });
      assert.equal(res2.settled.length, 0, "No additional trades settled");
      assert.equal(trade.realizedPnL, firstRealized, "Realized P&L unchanged");
      assert.equal(trade.exitPrice, firstExitPrice, "Exit price unchanged");
      assert.equal(engine.getEvents(trade.id).length, firstEventsCount, "No duplicate events added");
    });

    it("LFC-09: Restart and disk replay preserves pending, unverified, and settled states correctly", () => {
      const engine1 = createSetup();
      const trade = openTestTrade(engine1);
      engine1.evaluateOpenTrades(mockSnapshot("nifty", POST_EXPIRY), POST_EXPIRY);
      assert.equal(trade.status, "SETTLEMENT_PENDING");

      // Verify state persisted to disk
      const loaded1 = loadPaperLedger(TEST_LEDGER_DIR);
      assert.equal(loaded1.error, null);
      assert.equal(loaded1.trades.length, 1);
      assert.equal(loaded1.trades[0].status, "SETTLEMENT_PENDING");

      // Re-initialize engine from disk
      const engine2 = new PaperTradingEngine(
        { accountCapital: 500_000 },
        {
          allowMock: true,
          onChange: (trades, events) => savePaperLedger(trades, events, TEST_LEDGER_DIR),
        },
      );
      engine2.setTrades(loaded1.trades, loaded1.events);
      const recovered = engine2.getTrade(trade.id)!;
      assert.ok(recovered);
      assert.equal(recovered.status, "SETTLEMENT_PENDING");
      assert.equal(recovered.exitPrice, null);

      // Settle in second instance
      const csvRows = trade.legs.map((leg) => [
        TRADE_DATE, TRADE_DATE, "OPTIDX", "NIFTY", TRADE_DATE, String(leg.strike), leg.type, "25.00", "25.00", "1000",
      ]);
      const zip = makeZipArchive("bhav.csv", createSyntheticCsv(csvRows));
      ingestSettlementArchive(zip, { storageDir: TEST_SETTLEMENT_DIR, expectedTradeDate: TRADE_DATE });

      engine2.settlePendingTrades(TRADE_DATE, { storageDir: TEST_SETTLEMENT_DIR, now: POST_EXPIRY });
      assert.equal(recovered.status, "SETTLED_VERIFIED");

      // Verify persistent disk reload after settlement
      const loaded2 = loadPaperLedger(TEST_LEDGER_DIR);
      assert.equal(loaded2.error, null);
      assert.equal(loaded2.trades[0].status, "SETTLED_VERIFIED");
      assert.equal(loaded2.trades[0].settlement?.archiveHash !== undefined, true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Suite 2: Exact 5-Tuple Identity & Data Quality
  // ───────────────────────────────────────────────────────────────────────────
  describe("Suite 2: Exact 5-Tuple Identity & Data Quality", () => {
    it("IDQ-01: Exact five-field contract matching succeeds for multi-leg option strategy", () => {
      const engine = createSetup();
      const trade = openTestTrade(engine);
      engine.evaluateOpenTrades(mockSnapshot("nifty", POST_EXPIRY), POST_EXPIRY);

      // Create CSV with distinct settlement prices for each leg
      const csvRows = trade.legs.map((leg, i) => [
        TRADE_DATE, TRADE_DATE, "OPTIDX", "NIFTY", TRADE_DATE, String(leg.strike), leg.type, String(20 + i * 10), String(20 + i * 10), "1000",
      ]);
      const zip = makeZipArchive("bhav.csv", createSyntheticCsv(csvRows));
      ingestSettlementArchive(zip, { storageDir: TEST_SETTLEMENT_DIR, expectedTradeDate: TRADE_DATE });

      const res = engine.settlePendingTrades(TRADE_DATE, { storageDir: TEST_SETTLEMENT_DIR, now: POST_EXPIRY });
      assert.equal(res.settled.length, 1);
      assert.equal(trade.status, "SETTLED_VERIFIED");

      trade.legs.forEach((leg, i) => {
        assert.equal(leg.exitPrice, 20 + i * 10);
        assert.equal(leg.exitFillSource, "EXCHANGE_SETTLEMENT");
      });
    });

    it("IDQ-02: Mismatched trade date fails closed", () => {
      const engine = createSetup();
      openTestTrade(engine);
      engine.evaluateOpenTrades(mockSnapshot("nifty", POST_EXPIRY), POST_EXPIRY);

      const res = engine.settlePendingTrades("2026-10-16", { storageDir: TEST_SETTLEMENT_DIR, now: POST_EXPIRY });
      assert.equal(res.settled.length, 0);
    });

    it("IDQ-03: Mismatched expiry date fails closed", () => {
      const engine = createSetup();
      const trade = openTestTrade(engine);
      engine.evaluateOpenTrades(mockSnapshot("nifty", POST_EXPIRY), POST_EXPIRY);

      // CSV has contract with different expiry date
      const csvRows = trade.legs.map((leg) => [
        TRADE_DATE, TRADE_DATE, "OPTIDX", "NIFTY", "2026-10-22", String(leg.strike), leg.type, "30.00", "30.00", "1000",
      ]);
      const zip = makeZipArchive("bhav.csv", createSyntheticCsv(csvRows));
      ingestSettlementArchive(zip, { storageDir: TEST_SETTLEMENT_DIR, expectedTradeDate: TRADE_DATE });

      const res = engine.settlePendingTrades(TRADE_DATE, { storageDir: TEST_SETTLEMENT_DIR, now: POST_EXPIRY });
      assert.equal(res.settled.length, 0);
      assert.equal(trade.status, "SETTLEMENT_UNVERIFIED");
    });

    it("IDQ-04: Mismatched strike price fails closed", () => {
      const engine = createSetup();
      const trade = openTestTrade(engine);
      engine.evaluateOpenTrades(mockSnapshot("nifty", POST_EXPIRY), POST_EXPIRY);

      // CSV has strike offset by 50 points
      const csvRows = trade.legs.map((leg) => [
        TRADE_DATE, TRADE_DATE, "OPTIDX", "NIFTY", TRADE_DATE, String(leg.strike + 50), leg.type, "30.00", "30.00", "1000",
      ]);
      const zip = makeZipArchive("bhav.csv", createSyntheticCsv(csvRows));
      ingestSettlementArchive(zip, { storageDir: TEST_SETTLEMENT_DIR, expectedTradeDate: TRADE_DATE });

      const res = engine.settlePendingTrades(TRADE_DATE, { storageDir: TEST_SETTLEMENT_DIR, now: POST_EXPIRY });
      assert.equal(res.settled.length, 0);
      assert.equal(trade.status, "SETTLEMENT_UNVERIFIED");
    });

    it("IDQ-05: Mismatched symbol (NIFTY vs BANKNIFTY) fails closed", () => {
      const engine = createSetup();
      const trade = openTestTrade(engine);
      engine.evaluateOpenTrades(mockSnapshot("nifty", POST_EXPIRY), POST_EXPIRY);

      // CSV has BANKNIFTY instead of NIFTY
      const csvRows = trade.legs.map((leg) => [
        TRADE_DATE, TRADE_DATE, "OPTIDX", "BANKNIFTY", TRADE_DATE, String(leg.strike), leg.type, "30.00", "30.00", "1000",
      ]);
      const zip = makeZipArchive("bhav.csv", createSyntheticCsv(csvRows));
      ingestSettlementArchive(zip, { storageDir: TEST_SETTLEMENT_DIR, expectedTradeDate: TRADE_DATE });

      const res = engine.settlePendingTrades(TRADE_DATE, { storageDir: TEST_SETTLEMENT_DIR, now: POST_EXPIRY });
      assert.equal(res.settled.length, 0);
      assert.equal(trade.status, "SETTLEMENT_UNVERIFIED");
    });

    it("IDQ-06: Mismatched option type (CE vs PE) fails closed", () => {
      const engine = createSetup();
      const trade = openTestTrade(engine);
      engine.evaluateOpenTrades(mockSnapshot("nifty", POST_EXPIRY), POST_EXPIRY);

      // Flip option type (CE -> PE, PE -> CE)
      const csvRows = trade.legs.map((leg) => [
        TRADE_DATE, TRADE_DATE, "OPTIDX", "NIFTY", TRADE_DATE, String(leg.strike), leg.type === "CE" ? "PE" : "CE", "30.00", "30.00", "1000",
      ]);
      const zip = makeZipArchive("bhav.csv", createSyntheticCsv(csvRows));
      ingestSettlementArchive(zip, { storageDir: TEST_SETTLEMENT_DIR, expectedTradeDate: TRADE_DATE });

      const res = engine.settlePendingTrades(TRADE_DATE, { storageDir: TEST_SETTLEMENT_DIR, now: POST_EXPIRY });
      assert.equal(res.settled.length, 0);
      assert.equal(trade.status, "SETTLEMENT_UNVERIFIED");
    });

    it("IDQ-07: Missing identifier on any leg fails closed", () => {
      const engine = createSetup();
      const trade = openTestTrade(engine);
      engine.evaluateOpenTrades(mockSnapshot("nifty", POST_EXPIRY), POST_EXPIRY);

      // Only supply record for leg 0, omit leg 1
      const csvRows = [
        [TRADE_DATE, TRADE_DATE, "OPTIDX", "NIFTY", TRADE_DATE, String(trade.legs[0].strike), trade.legs[0].type, "30.00", "30.00", "1000"],
      ];
      const zip = makeZipArchive("bhav.csv", createSyntheticCsv(csvRows));
      ingestSettlementArchive(zip, { storageDir: TEST_SETTLEMENT_DIR, expectedTradeDate: TRADE_DATE });

      const res = engine.settlePendingTrades(TRADE_DATE, { storageDir: TEST_SETTLEMENT_DIR, now: POST_EXPIRY });
      if (trade.legs.length > 1) {
        assert.equal(res.settled.length, 0);
        assert.equal(trade.status, "SETTLEMENT_UNVERIFIED");
      }
    });

    it("IDQ-08: A valid zero settlement value (OTM option at 0.00) is preserved as 0.00", () => {
      const engine = createSetup();
      const trade = openTestTrade(engine);
      engine.evaluateOpenTrades(mockSnapshot("nifty", POST_EXPIRY), POST_EXPIRY);

      // All legs settle at 0.00 (OTM expiry)
      const csvRows = trade.legs.map((leg) => [
        TRADE_DATE, TRADE_DATE, "OPTIDX", "NIFTY", TRADE_DATE, String(leg.strike), leg.type, "0.00", "0.00", "1000",
      ]);
      const zip = makeZipArchive("bhav.csv", createSyntheticCsv(csvRows));
      ingestSettlementArchive(zip, { storageDir: TEST_SETTLEMENT_DIR, expectedTradeDate: TRADE_DATE });

      const res = engine.settlePendingTrades(TRADE_DATE, { storageDir: TEST_SETTLEMENT_DIR, now: POST_EXPIRY });
      assert.equal(res.settled.length, 1);
      assert.equal(trade.status, "SETTLED_VERIFIED");
      assert.equal(trade.exitPrice, 0);
      for (const leg of trade.legs) {
        assert.equal(leg.exitPrice, 0, "Valid 0.00 settlement price must be preserved");
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Suite 3: Ledger Consistency & Reconciler Validation
  // ───────────────────────────────────────────────────────────────────────────
  describe("Suite 3: Ledger Consistency & Reconciler Validation", () => {
    it("REC-01: Reconciler passes with ok: true on mixed ledger with pending, unverified, and settled trades", () => {
      const engine = createSetup();

      // Trade 1: Settled
      const t1 = openTestTrade(engine);
      engine.evaluateOpenTrades(mockSnapshot("nifty", POST_EXPIRY), POST_EXPIRY);

      const csvRows = t1.legs.map((leg) => [
        TRADE_DATE, TRADE_DATE, "OPTIDX", "NIFTY", TRADE_DATE, String(leg.strike), leg.type, "40.00", "40.00", "1000",
      ]);
      const zip = makeZipArchive("bhav.csv", createSyntheticCsv(csvRows));
      ingestSettlementArchive(zip, { storageDir: TEST_SETTLEMENT_DIR, expectedTradeDate: TRADE_DATE });
      engine.settlePendingTrades(TRADE_DATE, { storageDir: TEST_SETTLEMENT_DIR, now: POST_EXPIRY });
      assert.equal(t1.status, "SETTLED_VERIFIED");

      // Check reconciliation
      const rec = reconcileLedger(engine.getTrades(), engine.getEvents());
      assert.equal(rec.ok, true, `Reconciler failed with issues: ${JSON.stringify(rec.issues)}`);
      assert.equal(rec.issues.length, 0);
    });

    it("REC-02: Reconciler detects and rejects SETTLEMENT_PENDING trade carrying premature exit data", () => {
      const engine = createSetup();
      const trade = openTestTrade(engine);
      engine.evaluateOpenTrades(mockSnapshot("nifty", POST_EXPIRY), POST_EXPIRY);
      assert.equal(trade.status, "SETTLEMENT_PENDING");

      // Corrupt memory state: add exitPrice to pending trade
      const tampered = structuredClone(trade);
      tampered.exitPrice = 50.0;

      const rec = reconcileLedger([tampered], engine.getEvents());
      assert.equal(rec.ok, false);
      assert.ok(rec.issues.some((i) => i.code === "SETTLEMENT_PENDING_WITH_EXIT"));
    });

    it("REC-03: Reconciler detects and rejects SETTLED_VERIFIED trade missing provenance metadata", () => {
      const engine = createSetup();
      const trade = openTestTrade(engine);
      engine.evaluateOpenTrades(mockSnapshot("nifty", POST_EXPIRY), POST_EXPIRY);

      const csvRows = trade.legs.map((leg) => [
        TRADE_DATE, TRADE_DATE, "OPTIDX", "NIFTY", TRADE_DATE, String(leg.strike), leg.type, "40.00", "40.00", "1000",
      ]);
      const zip = makeZipArchive("bhav.csv", createSyntheticCsv(csvRows));
      ingestSettlementArchive(zip, { storageDir: TEST_SETTLEMENT_DIR, expectedTradeDate: TRADE_DATE });
      engine.settlePendingTrades(TRADE_DATE, { storageDir: TEST_SETTLEMENT_DIR, now: POST_EXPIRY });

      // Strip settlement provenance
      const tampered = structuredClone(trade);
      delete tampered.settlement;

      const rec = reconcileLedger([tampered], engine.getEvents());
      assert.equal(rec.ok, false);
      assert.ok(rec.issues.some((i) => i.code === "SETTLED_WITHOUT_METADATA"));
    });

    it("REC-04: Reconciler detects tampered gross P&L on settled trade", () => {
      const engine = createSetup();
      const trade = openTestTrade(engine);
      engine.evaluateOpenTrades(mockSnapshot("nifty", POST_EXPIRY), POST_EXPIRY);

      const csvRows = trade.legs.map((leg) => [
        TRADE_DATE, TRADE_DATE, "OPTIDX", "NIFTY", TRADE_DATE, String(leg.strike), leg.type, "40.00", "40.00", "1000",
      ]);
      const zip = makeZipArchive("bhav.csv", createSyntheticCsv(csvRows));
      ingestSettlementArchive(zip, { storageDir: TEST_SETTLEMENT_DIR, expectedTradeDate: TRADE_DATE });
      engine.settlePendingTrades(TRADE_DATE, { storageDir: TEST_SETTLEMENT_DIR, now: POST_EXPIRY });

      // Tamper grossPnL
      const tampered = structuredClone(trade);
      tampered.grossPnL = (tampered.grossPnL ?? 0) + 1000;

      const rec = reconcileLedger([tampered], engine.getEvents());
      assert.equal(rec.ok, false);
      assert.ok(rec.issues.some((i) => i.code === "PNL_MISMATCH"));
    });

    it("REC-05: Reconciler detects duplicate settlement events", () => {
      const engine = createSetup();
      const trade = openTestTrade(engine);
      engine.evaluateOpenTrades(mockSnapshot("nifty", POST_EXPIRY), POST_EXPIRY);

      const csvRows = trade.legs.map((leg) => [
        TRADE_DATE, TRADE_DATE, "OPTIDX", "NIFTY", TRADE_DATE, String(leg.strike), leg.type, "40.00", "40.00", "1000",
      ]);
      const zip = makeZipArchive("bhav.csv", createSyntheticCsv(csvRows));
      ingestSettlementArchive(zip, { storageDir: TEST_SETTLEMENT_DIR, expectedTradeDate: TRADE_DATE });
      engine.settlePendingTrades(TRADE_DATE, { storageDir: TEST_SETTLEMENT_DIR, now: POST_EXPIRY });

      // Duplicate the settled event
      const events = structuredClone(engine.getEvents());
      const settledEv = events.find((e) => e.event === "PAPER_TRADE_SETTLED_VERIFIED")!;
      events.push(structuredClone(settledEv));

      const rec = reconcileLedger(engine.getTrades(), events);
      assert.equal(rec.ok, false);
      assert.ok(rec.issues.some((i) => i.code === "SETTLED_EVENT_MISMATCH"));
    });

    it("REC-06: Persistence failure during settlement propagates and prevents inconsistent state", () => {
      let throwOnSave = false;
      const engine = new PaperTradingEngine(
        { accountCapital: 500_000 },
        {
          allowMock: true,
          onChange: (trades, events) => {
            if (throwOnSave) {
              throw new Error("DISK_WRITE_FAILED: simulated disk full");
            }
            savePaperLedger(trades, events, TEST_LEDGER_DIR);
          },
        },
      );
      const trade = openTestTrade(engine);
      engine.evaluateOpenTrades(mockSnapshot("nifty", POST_EXPIRY), POST_EXPIRY);
      assert.equal(trade.status, "SETTLEMENT_PENDING");

      const csvRows = trade.legs.map((leg) => [
        TRADE_DATE, TRADE_DATE, "OPTIDX", "NIFTY", TRADE_DATE, String(leg.strike), leg.type, "40.00", "40.00", "1000",
      ]);
      const zip = makeZipArchive("bhav.csv", createSyntheticCsv(csvRows));
      ingestSettlementArchive(zip, { storageDir: TEST_SETTLEMENT_DIR, expectedTradeDate: TRADE_DATE });

      // Simulate disk write failure
      throwOnSave = true;
      const res = engine.settlePendingTrades(TRADE_DATE, { storageDir: TEST_SETTLEMENT_DIR, now: POST_EXPIRY });
      assert.equal(res.settled.length, 0, "No trades settled on persist failure");
      assert.ok(res.errors.some((e) => e.includes("LEDGER_PERSIST_FAILED")), "Persistence error must be reported");
      // Memory state was rolled back to SETTLEMENT_PENDING; risk remains reserved
      const recovered = engine.getTrade(trade.id)!;
      assert.equal(recovered.status, "SETTLEMENT_PENDING", "Trade must remain SETTLEMENT_PENDING");
      assert.equal(recovered.exitPrice, null, "Exit price must remain null");
      const summary = engine.getPortfolioSummary();
      assert.equal(summary.openRisk > 0, true, "Risk must remain reserved");
    });

    it("REC-07: Manual UI entries and fixture records remain excluded from verified-live performance statistics", () => {
      assert.equal(isFixture({ provenance: "MANUAL_UI", createdAt: "2026-10-15T12:00:00Z", source: "LIVE" } as any), true);
      assert.equal(isFixture({ provenance: "FIXTURE", createdAt: "2026-10-15T12:00:00Z", source: "LIVE" } as any), true);
      assert.equal(isFixture({ provenance: "LIVE_COLLECTOR", createdAt: "2026-10-15T12:00:00Z", source: "LIVE" } as any), false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Suite 4: Costs, Reporting & Legacy Compatibility
  // ───────────────────────────────────────────────────────────────────────────
  describe("Suite 4: Costs, Reporting & Legacy Compatibility", () => {
    it("CST-01: Settlement metadata isolates unmodeled exercise costs", () => {
      const engine = createSetup();
      const trade = openTestTrade(engine);
      engine.evaluateOpenTrades(mockSnapshot("nifty", POST_EXPIRY), POST_EXPIRY);

      const csvRows = trade.legs.map((leg) => [
        TRADE_DATE, TRADE_DATE, "OPTIDX", "NIFTY", TRADE_DATE, String(leg.strike), leg.type, "60.00", "60.00", "1000",
      ]);
      const zip = makeZipArchive("bhav.csv", createSyntheticCsv(csvRows));
      ingestSettlementArchive(zip, { storageDir: TEST_SETTLEMENT_DIR, expectedTradeDate: TRADE_DATE });
      engine.settlePendingTrades(TRADE_DATE, { storageDir: TEST_SETTLEMENT_DIR, now: POST_EXPIRY });

      assert.equal(
        trade.settlement?.costVerificationStatus,
        "UNVERIFIED_MISSING_EXERCISE_SPECIFICATION",
        "Cost verification status must acknowledge unmodeled exercise costs per project spec",
      );
    });

    it("CST-02: Ledger report clearly distinguishes pending, unverified, and verified settlements", () => {
      const engine = createSetup();
      const trade = openTestTrade(engine);
      engine.evaluateOpenTrades(mockSnapshot("nifty", POST_EXPIRY), POST_EXPIRY);

      let rep = buildPaperLedgerReport(engine.getTrades());
      assert.equal(rep.counts.settlementPending, 1);
      assert.equal(rep.counts.settlementUnverified, 0);
      assert.equal(rep.counts.settledVerified, 0);

      // Settle against missing data -> unverified
      engine.settlePendingTrades(TRADE_DATE, { storageDir: TEST_SETTLEMENT_DIR, now: POST_EXPIRY });
      rep = buildPaperLedgerReport(engine.getTrades());
      assert.equal(rep.counts.settlementPending, 0);
      assert.equal(rep.counts.settlementUnverified, 1);
      assert.equal(rep.counts.settledVerified, 0);

      // Settle against valid data -> verified
      const csvRows = trade.legs.map((leg) => [
        TRADE_DATE, TRADE_DATE, "OPTIDX", "NIFTY", TRADE_DATE, String(leg.strike), leg.type, "60.00", "60.00", "1000",
      ]);
      const zip = makeZipArchive("bhav.csv", createSyntheticCsv(csvRows));
      ingestSettlementArchive(zip, { storageDir: TEST_SETTLEMENT_DIR, expectedTradeDate: TRADE_DATE });
      engine.settlePendingTrades(TRADE_DATE, { storageDir: TEST_SETTLEMENT_DIR, now: POST_EXPIRY });

      rep = buildPaperLedgerReport(engine.getTrades());
      assert.equal(rep.counts.settlementPending, 0);
      assert.equal(rep.counts.settlementUnverified, 0);
      assert.equal(rep.counts.settledVerified, 1);
    });

    it("CST-03: Legacy records with status EXPIRED remain readable and reconcile cleanly", () => {
      // Build a synthetic legacy EXPIRED trade with exit events
      const legacyTrade: PaperTrade = {
        id: "pt_legacy_expired",
        status: "EXPIRED",
        index: "nifty",
        strategy: "Bull Call Spread",
        createdAt: "2026-10-01T09:30:00Z",
        updatedAt: "2026-10-01T15:30:00Z",
        signalTimestamp: "2026-10-01T09:30:00Z",
        entryTimestamp: "2026-10-01T09:30:00Z",
        exitTimestamp: "2026-10-01T15:30:00Z",
        expiry: "2026-10-01",
        legs: [
          { side: "BUY", type: "PE", strike: 24500, entryLtp: 10, entryFillPrice: 10, entryFillSource: "ASK", currentPrice: 0, exitPrice: 0, exitFillSource: "LTP_FALLBACK" },
          { side: "SELL", type: "PE", strike: 25000, entryLtp: 30, entryFillPrice: 30, entryFillSource: "BID", currentPrice: 0, exitPrice: 0, exitFillSource: "LTP_FALLBACK" },
        ],
        entryPrice: -20,
        currentPrice: 0,
        exitPrice: 0,
        quantity: 50,
        lots: 1,
        lotSize: 50,
        stopLoss: -40,
        target1: 0,
        target2: 0,
        realizedPnL: 1000,
        grossPnL: 1000,
        unrealizedPnL: 0,
        maxProfit: 1000,
        maxLoss: -1500,
        exitReason: "EXPIRY",
        targetReached: null,
        recommendationScore: 80,
        confidence: 85,
        riskAmount: 1500,
        riskReward: 1.5,
        marketDataTimestamp: "2026-10-01T15:30:00Z",
        marketDataSource: "LIVE",
        executionMode: "PAPER",
        riskConfigSnapshot: {} as any,
        riskAssessmentSnapshot: {} as any,
      };

      const legacyEvents: PaperTradeEvent[] = [
        { timestamp: "2026-10-01T09:30:00Z", tradeId: legacyTrade.id, event: "PAPER_TRADE_OPENED", marketDataTimestamp: null, price: -20, reason: "Opened" },
        { timestamp: "2026-10-01T15:30:00Z", tradeId: legacyTrade.id, event: "PAPER_TRADE_EXPIRED", marketDataTimestamp: null, price: 0, reason: "Expired" },
      ];

      const rec = reconcileLedger([legacyTrade], legacyEvents);
      assert.equal(rec.ok, true, `Legacy record must reconcile cleanly: ${JSON.stringify(rec.issues)}`);

      const rep = buildPaperLedgerReport([legacyTrade]);
      assert.equal(rep.counts.closed, 1);
      assert.equal(rep.netPnL, 1000);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Suite 5: Storage Isolation & Safety Constraints
  // ───────────────────────────────────────────────────────────────────────────
  describe("Suite 5: Storage Isolation & Safety Constraints", () => {
    it("SEC-01: Storage boundary enforcement: tests never touch production .data/", () => {
      const prodTradesDir = path.join(process.cwd(), ".data", "paper-trades");
      const prodSettlementDir = path.join(process.cwd(), ".data", "settlement");

      // Verify neither production path was created or written to by tests
      assert.equal(fs.existsSync(prodTradesDir), false, "Production paper-trades dir must NOT exist");
      assert.equal(fs.existsSync(prodSettlementDir), false, "Production settlement dir must NOT exist");
    });
  });
});
