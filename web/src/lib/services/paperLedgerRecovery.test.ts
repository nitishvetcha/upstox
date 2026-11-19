import { describe, it, beforeEach, afterEach } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import type { PaperTrade, PaperTradeEvent } from "../paperTypes.ts";
import {
  evaluateSentinel,
  writeSentinel,
  quarantineCorruptLedger,
  applyLedgerEvent,
  validateEventSequenceContiguity,
  enrichDurableEvents,
  computeEventChecksum,
  computeSha256,
} from "./paperLedgerRecovery.ts";
import {
  loadPaperLedger,
  savePaperLedger,
} from "./paperLedgerStore.ts";

const TEST_DIR = path.join(process.cwd(), ".test-data", "paper-ledger-recovery-tests");

function makeTestTrade(id = "pt_test_01", status: PaperTrade["status"] = "OPEN"): PaperTrade {
  return {
    id,
    status,
    index: "nifty",
    strategy: "Long Call",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    signalTimestamp: new Date().toISOString(),
    entryTimestamp: new Date().toISOString(),
    exitTimestamp: null,
    expiry: "2026-11-26",
    legs: [
      {
        side: "SELL",
        type: "CE",
        strike: 24500,
        entryLtp: 150,
        entryFillPrice: 150,
        entryFillSource: "BID",
        currentPrice: 150,
        exitPrice: null,
      },
    ],
    entryPrice: 150,
    currentPrice: 150,
    exitPrice: null,
    quantity: 50,
    lots: 1,
    lotSize: 50,
    stopLoss: 200,
    target1: 75,
    target2: 50,
    realizedPnL: null,
    unrealizedPnL: 0,
    maxProfit: 7500,
    maxLoss: 2500,
    exitReason: null,
    targetReached: null,
    recommendationScore: 85,
    confidence: 80,
    riskAmount: 2500,
    riskReward: 3.0,
    marketDataTimestamp: new Date().toISOString(),
    marketDataSource: "TEST_MOCK",
    executionMode: "PAPER",
    riskConfigSnapshot: {} as any,
    riskAssessmentSnapshot: {} as any,
  };
}

function makeTestEvent(tradeId: string, event: PaperTradeEvent["event"], price = 150): PaperTradeEvent {
  return {
    timestamp: new Date().toISOString(),
    tradeId,
    event,
    marketDataTimestamp: new Date().toISOString(),
    price,
    reason: "TEST_EVENT",
    details: {},
  };
}

describe("Paper Ledger Crash Recovery Engine (Gate M1 WBS 2.3)", () => {
  beforeEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe("1. Sentinel State Machine", () => {
    it("permits clean first initialization when sentinel and files are absent", () => {
      const res = evaluateSentinel(TEST_DIR, false);
      assert.equal(res.ok, true);
      assert.equal(res.isFirstInit, true);
      assert.equal(res.error, null);
    });

    it("allows legacy upgrade when sentinel is absent but valid files exist", () => {
      const res = evaluateSentinel(TEST_DIR, true);
      assert.equal(res.ok, true);
      assert.equal(res.isFirstInit, false);
      assert.equal(res.error, null);
    });

    it("FAILS CLOSED on historical data loss when sentinel exists but files are absent", () => {
      writeSentinel(TEST_DIR);
      assert.equal(fs.existsSync(path.join(TEST_DIR, ".ledger-ever-initialized")), true);

      // Sentinel present, but no trades.json or events.jsonl
      const res = evaluateSentinel(TEST_DIR, false);
      assert.equal(res.ok, false);
      assert.match(res.error!, /DATA_LOSS_DISASTER: Sentinel .ledger-ever-initialized exists but trades.json and events.jsonl are missing/);
    });

    it("FAILS CLOSED when sentinel content is malformed JSON", () => {
      fs.writeFileSync(path.join(TEST_DIR, ".ledger-ever-initialized"), "{ corrupt sentinel", "utf8");
      const res = evaluateSentinel(TEST_DIR, true);
      assert.equal(res.ok, false);
      assert.match(res.error!, /CORRUPT_SENTINEL_UNREADABLE/);
    });

    it("FAILS CLOSED when sentinel checksum has been tampered with", () => {
      writeSentinel(TEST_DIR);
      const sentinelPath = path.join(TEST_DIR, ".ledger-ever-initialized");
      const raw = JSON.parse(fs.readFileSync(sentinelPath, "utf8"));
      raw.checksum = "tampered_bad_checksum";
      fs.writeFileSync(sentinelPath, JSON.stringify(raw), "utf8");

      const res = evaluateSentinel(TEST_DIR, true);
      assert.equal(res.ok, false);
      assert.match(res.error!, /CORRUPT_SENTINEL_CHECKSUM/);
    });
  });

  describe("2. Quarantine Engine & Anti-Silent-Discard Safety", () => {
    it("quarantines corrupt snapshot and fails closed when no valid backup exists", () => {
      fs.writeFileSync(path.join(TEST_DIR, "trades.json"), "{ torn write ...", "utf8");

      const loaded = loadPaperLedger(TEST_DIR);
      assert.ok(loaded.error?.includes("trades.json is unreadable"));

      // Verify that corrupt file was quarantined into .corrupt/<incident>
      const corruptBase = path.join(TEST_DIR, ".corrupt");
      assert.equal(fs.existsSync(corruptBase), true);
      const incidents = fs.readdirSync(corruptBase);
      assert.equal(incidents.length, 1);

      const incidentDir = path.join(corruptBase, incidents[0]!);
      assert.equal(fs.existsSync(path.join(incidentDir, "trades.json.corrupt")), true);
      assert.equal(fs.existsSync(path.join(incidentDir, "incident.json")), true);

      const incidentMeta = JSON.parse(fs.readFileSync(path.join(incidentDir, "incident.json"), "utf8"));
      assert.equal(incidentMeta.recoveryState, "LOCKED_ADMIN_ONLY");
      assert.equal(incidentMeta.reconciliationRequired, true);
      assert.ok(incidentMeta.fileHashes["trades.json"]);

      // Crucial: original file remains in place for human inspection
      assert.equal(fs.readFileSync(path.join(TEST_DIR, "trades.json"), "utf8"), "{ torn write ...");
    });

    it("quarantines corrupt event lines and refuses to silently drop them", () => {
      const trade = makeTestTrade("pt_01", "OPEN");
      const validEvent = makeTestEvent("pt_01", "PAPER_TRADE_OPENED");

      fs.writeFileSync(path.join(TEST_DIR, "trades.json"), JSON.stringify([trade], null, 2), "utf8");
      // One valid event line, followed by a corrupt partial line
      fs.writeFileSync(path.join(TEST_DIR, "events.jsonl"), JSON.stringify(validEvent) + "\n{ unparseable torn write\n", "utf8");

      const loaded = loadPaperLedger(TEST_DIR);
      assert.ok(loaded.error?.includes("events.jsonl contains 1 unreadable line(s)"));

      // Verify quarantine record
      const corruptBase = path.join(TEST_DIR, ".corrupt");
      assert.equal(fs.existsSync(corruptBase), true);
      const incidents = fs.readdirSync(corruptBase);
      assert.equal(incidents.length, 1);
    });

    it("quarantines event log when a sequence number gap is detected", () => {
      const trade = makeTestTrade("pt_01", "OPEN");
      const ev1: PaperTradeEvent = { ...makeTestEvent("pt_01", "PAPER_TRADE_OPENED"), sequenceNumber: 1 };
      // Gap: sequenceNumber jumps from 1 to 3 (missing 2)
      const ev3: PaperTradeEvent = { ...makeTestEvent("pt_01", "PAPER_TARGET_CHECK"), sequenceNumber: 3 };

      fs.writeFileSync(path.join(TEST_DIR, "trades.json"), JSON.stringify([trade], null, 2), "utf8");
      fs.writeFileSync(path.join(TEST_DIR, "events.jsonl"), `${JSON.stringify(ev1)}\n${JSON.stringify(ev3)}\n`, "utf8");

      const loaded = loadPaperLedger(TEST_DIR);
      assert.ok(loaded.error?.includes("Sequence gap detected: expected sequenceNumber 2, found 3"));

      // Verify quarantine
      const corruptBase = path.join(TEST_DIR, ".corrupt");
      assert.equal(fs.existsSync(corruptBase), true);
    });
  });

  describe("3. Durable Event Sourcing & Monotonic Sequence Numbering", () => {
    it("automatically enriches new events with UUID eventId, monotonic sequenceNumber, and SHA-256 checksum", () => {
      const trade = makeTestTrade("pt_01", "OPEN");
      const event = makeTestEvent("pt_01", "PAPER_TRADE_OPENED");

      savePaperLedger([trade], [event], TEST_DIR);

      const eventsFile = path.join(TEST_DIR, "events.jsonl");
      const rawLines = fs.readFileSync(eventsFile, "utf8").trim().split("\n");
      assert.equal(rawLines.length, 1);

      const savedEv = JSON.parse(rawLines[0]!) as PaperTradeEvent;
      assert.ok(savedEv.eventId && savedEv.eventId.length > 20, "UUID eventId must be assigned");
      assert.equal(savedEv.sequenceNumber, 1, "First event must have sequenceNumber 1");
      assert.equal(savedEv.ledgerVersion, 1, "ledgerVersion must be assigned");
      assert.ok(savedEv.checksum && savedEv.checksum.length === 64, "SHA-256 checksum must be assigned");
      assert.equal(savedEv.checksum, computeEventChecksum(savedEv));
    });

    it("maintains strict monotonic sequence numbers across multiple saves", () => {
      const trade = makeTestTrade("pt_01", "OPEN");
      const ev1 = makeTestEvent("pt_01", "PAPER_TRADE_OPENED");
      savePaperLedger([trade], [ev1], TEST_DIR);

      // Mutate trade to closed and append exit event
      const closedTrade: PaperTrade = { ...trade, status: "CLOSED", exitPrice: 100, exitTimestamp: new Date().toISOString() };
      const ev2 = makeTestEvent("pt_01", "PAPER_TRADE_EXITED", 100);
      savePaperLedger([closedTrade], [ev1, ev2], TEST_DIR);

      const rawLines = fs.readFileSync(path.join(TEST_DIR, "events.jsonl"), "utf8").trim().split("\n");
      assert.equal(rawLines.length, 2);

      const p1 = JSON.parse(rawLines[0]!) as PaperTradeEvent;
      const p2 = JSON.parse(rawLines[1]!) as PaperTradeEvent;

      assert.equal(p1.sequenceNumber, 1);
      assert.equal(p2.sequenceNumber, 2);
      assert.notEqual(p1.eventId, p2.eventId);
      assert.equal(p1.checksum, computeEventChecksum(p1));
      assert.equal(p2.checksum, computeEventChecksum(p2));
    });
  });

  describe("4. Idempotent Replay & Event Application", () => {
    it("re-applying an already committed eventId is a verified no-op", () => {
      const trade = makeTestTrade("pt_01", "OPEN");
      const appliedEventIds = new Set<string>();

      const ev: PaperTradeEvent = {
        ...makeTestEvent("pt_01", "PAPER_TRADE_EXITED", 100),
        eventId: "event-uuid-001",
        sequenceNumber: 2,
      };

      // First application: mutates trade to CLOSED
      const res1 = applyLedgerEvent([trade], ev, appliedEventIds);
      assert.equal(res1.applied, true);
      assert.equal(res1.skipped, false);
      assert.equal(res1.trades[0]!.status, "CLOSED");
      assert.equal(appliedEventIds.has("event-uuid-001"), true);

      // Second application of the exact same event: must be a no-op
      const res2 = applyLedgerEvent(res1.trades, ev, appliedEventIds);
      assert.equal(res2.applied, false);
      assert.equal(res2.skipped, true);
      assert.equal(res2.trades[0]!.status, "CLOSED");
      assert.deepEqual(res2.trades, res1.trades);
    });

    it("transitions settlement lifecycle states idempotently", () => {
      const trade = makeTestTrade("pt_01", "OPEN");
      const applied = new Set<string>();

      // Transition to SETTLEMENT_PENDING
      const evPending: PaperTradeEvent = {
        ...makeTestEvent("pt_01", "PAPER_TRADE_SETTLEMENT_PENDING"),
        eventId: "ev-pending-01",
      };
      const res1 = applyLedgerEvent([trade], evPending, applied);
      assert.equal(res1.trades[0]!.status, "SETTLEMENT_PENDING");

      // Transition to SETTLED_VERIFIED
      const evSettled: PaperTradeEvent = {
        ...makeTestEvent("pt_01", "PAPER_TRADE_SETTLED_VERIFIED", 0),
        eventId: "ev-settled-01",
        details: {
          realizedPnL: 7500,
          settlement: {
            settledAt: new Date().toISOString(),
            tradeDate: "2026-11-26",
            archiveHash: "hash-01",
            csvHash: "hash-02",
            sourceFile: "bhavcopy.csv",
            costVerificationStatus: "VERIFIED",
            legs: [],
          },
        },
      };
      const res2 = applyLedgerEvent(res1.trades, evSettled, applied);
      assert.equal(res2.trades[0]!.status, "SETTLED_VERIFIED");
      assert.equal(res2.trades[0]!.realizedPnL, 7500);
      assert.ok(res2.trades[0]!.settlement);
    });
  });

  describe("5. Crash Points & Backup Recovery", () => {
    it("recovers state from trades.json.bak when trades.json suffers torn write", () => {
      const trade = makeTestTrade("pt_01", "OPEN");
      const event = makeTestEvent("pt_01", "PAPER_TRADE_OPENED");

      // Save valid state first (creates trades.json)
      savePaperLedger([trade], [event], TEST_DIR);

      // Save again (rotates trades.json to trades.json.bak)
      savePaperLedger([trade], [event], TEST_DIR);
      assert.equal(fs.existsSync(path.join(TEST_DIR, "trades.json.bak")), true);

      // Simulate power failure / crash during snapshot write (torn write)
      fs.writeFileSync(path.join(TEST_DIR, "trades.json"), "{ torn write corrupted JSON ...", "utf8");

      // Load must safely recover from backup
      const loaded = loadPaperLedger(TEST_DIR);
      assert.equal(loaded.recoveredFromBackup, true);
      assert.equal(loaded.error, null);
      assert.equal(loaded.trades.length, 1);
      assert.equal(loaded.trades[0]!.id, "pt_01");
    });
  });
});
