import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { Snapshot, IndexId } from "../types.ts";
import type { PaperTrade } from "../paperTypes.ts";
import {
  matchLegQuote,
  determineMarketDataSource,
  PaperTradingEngine,
} from "../paperEngine.ts";
import {
  filterVerifiedLiveTrades,
  isVerifiedLiveTrade,
} from "../paperReport.ts";
import {
  getDir as getSessionEvidenceDir,
  isTestExecution,
} from "./sessionEvidenceStore.ts";
import {
  ingestSettlementArchive,
  listQuarantineRecords,
  listCandidateRevisions,
  promoteCandidateRevision,
  loadMetadata,
} from "./settlementIngestion.ts";
import { mockSnapshot } from "./mock.ts";
import * as zlib from "node:zlib";

// ── Test Helpers ─────────────────────────────────────────────────────────────

function createTestZip(filename: string, content: string): Buffer {
  const fileHeader = Buffer.alloc(30);
  fileHeader.writeUInt32LE(0x04034b50, 0); // signature
  fileHeader.writeUInt16LE(20, 4);        // min version
  fileHeader.writeUInt16LE(0, 6);         // flags
  fileHeader.writeUInt16LE(0, 8);         // no compression
  fileHeader.writeUInt16LE(0, 10);        // mod time
  fileHeader.writeUInt16LE(0, 12);        // mod date

  const crc = zlib.crc32(Buffer.from(content));
  const uncompressedSize = Buffer.byteLength(content);
  fileHeader.writeUInt32LE(crc, 14);
  fileHeader.writeUInt32LE(uncompressedSize, 18);
  fileHeader.writeUInt32LE(uncompressedSize, 22);

  const nameBuf = Buffer.from(filename, "utf8");
  fileHeader.writeUInt16LE(nameBuf.length, 26);
  fileHeader.writeUInt16LE(0, 28); // extra field length

  const dataBuf = Buffer.from(content, "utf8");
  const localRecord = Buffer.concat([fileHeader, nameBuf, dataBuf]);

  const cdHeader = Buffer.alloc(46);
  cdHeader.writeUInt32LE(0x02014b50, 0);
  cdHeader.writeUInt16LE(20, 4);
  cdHeader.writeUInt16LE(20, 6);
  cdHeader.writeUInt16LE(0, 8);
  cdHeader.writeUInt16LE(0, 10);
  cdHeader.writeUInt16LE(0, 12);
  cdHeader.writeUInt16LE(0, 14);
  cdHeader.writeUInt32LE(crc, 16);
  cdHeader.writeUInt32LE(uncompressedSize, 20);
  cdHeader.writeUInt32LE(uncompressedSize, 24);
  cdHeader.writeUInt16LE(nameBuf.length, 28);
  cdHeader.writeUInt16LE(0, 30);
  cdHeader.writeUInt16LE(0, 32);
  cdHeader.writeUInt16LE(0, 34);
  cdHeader.writeUInt16LE(0, 36);
  cdHeader.writeUInt32LE(0, 38);
  cdHeader.writeUInt32LE(0, 42); // offset of local header

  const cdRecord = Buffer.concat([cdHeader, nameBuf]);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cdRecord.length, 12);
  eocd.writeUInt32LE(localRecord.length, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([localRecord, cdRecord, eocd]);
}

function makeTestSnapshot(now = new Date("2026-10-26T04:30:00.000Z")): Snapshot {
  const s = mockSnapshot("nifty", now);
  s.expiry = "2026-10-27";
  s.sources.market = { provider: "UPSTOX", source: "LIVE", fetchedAt: now.toISOString() };
  s.sources.optionChain = { provider: "UPSTOX", source: "LIVE", fetchedAt: now.toISOString() };
  for (const r of s.chain) {
    if (r.call) {
      r.call.lastTradeTime = now.toISOString();
      r.call.instrumentKey = `NSE_FO|NIFTY26OCT${r.strike}CE`;
    }
    if (r.put) {
      r.put.lastTradeTime = now.toISOString();
      r.put.instrumentKey = `NSE_FO|NIFTY26OCT${r.strike}PE`;
    }
  }
  return s;
}

describe("Phase 2.3.16 Hardening Verification Suite", () => {
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "p2316-hard-"));
    process.env.SESSION_EVIDENCE_DIR = path.join(tempDir, "sessions");
    process.env.PAPER_TRADES_DIR = path.join(tempDir, "paper-trades");
    process.env.UPSTOX_TOKEN_FILE = path.join(tempDir, "no-token.json");
    fs.mkdirSync(process.env.SESSION_EVIDENCE_DIR, { recursive: true });
    fs.mkdirSync(process.env.PAPER_TRADES_DIR, { recursive: true });
  });

  afterEach(() => {
    process.env = originalEnv;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // ── G1: Test Isolation & Production Storage Protection ─────────────────────
  describe("G1 — Test Isolation & Storage Boundary", () => {
    it("isTestExecution() detects test runner environment", () => {
      assert.equal(isTestExecution(), true);
    });

    it("getSessionEvidenceDir() throws when SESSION_EVIDENCE_DIR is unset in tests", () => {
      delete process.env.SESSION_EVIDENCE_DIR;
      assert.throws(
        () => getSessionEvidenceDir(),
        /SESSION_EVIDENCE_DIR must be explicitly set in test environments/,
      );
    });

    it("getSessionEvidenceDir() returns the configured isolated directory", () => {
      const dir = getSessionEvidenceDir();
      assert.equal(dir, path.join(tempDir, "sessions"));
      assert.ok(!dir.includes(".data/paper-sessions"));
    });
  });

  // ── G3: Contract Identity & Expiry Validation ──────────────────────────────
  describe("G3 — Contract Identity & Expiry Matching (matchLegQuote)", () => {
    const snap = makeTestSnapshot();
    const tradeRef = { index: "nifty" as IndexId, expiry: "2026-10-27" };
    const atmStrike = snap.chain[Math.floor(snap.chain.length / 2)].strike;

    it("matches leg quote successfully on exact 5-field match", () => {
      const res = matchLegQuote(snap, tradeRef, {
        strike: atmStrike,
        type: "CE",
        instrumentKey: `NSE_FO|NIFTY26OCT${atmStrike}CE`,
      });
      assert.ok(res.quote);
      assert.ok(res.quote.ltp > 0);
      assert.equal(res.reason, undefined);
    });

    it("rejects quote when underlying index does not match", () => {
      const res = matchLegQuote(snap, { index: "banknifty", expiry: "2026-10-27" }, {
        strike: atmStrike,
        type: "CE",
      });
      assert.equal(res.quote, undefined);
      assert.match(res.reason!, /Underlying mismatch/);
    });

    it("rejects quote when expiry date does not match (weekly/monthly rollover)", () => {
      const res = matchLegQuote(snap, { index: "nifty", expiry: "2026-11-03" }, {
        strike: atmStrike,
        type: "CE",
      });
      assert.equal(res.quote, undefined);
      assert.match(res.reason!, /Option chain expiry mismatch/);
    });

    it("rejects quote when strike does not exist in chain", () => {
      const res = matchLegQuote(snap, tradeRef, {
        strike: 99999,
        type: "CE",
      });
      assert.equal(res.quote, undefined);
      assert.match(res.reason!, /No strike row found/);
    });

    it("rejects quote when instrumentKey mismatches", () => {
      const res = matchLegQuote(snap, tradeRef, {
        strike: atmStrike,
        type: "CE",
        instrumentKey: "NSE_FO|DIFFERENT_KEY",
      });
      assert.equal(res.quote, undefined);
      assert.match(res.reason!, /Instrument key mismatch/);
    });

    it("evaluateOpenTrades: expiry transitions directly to SETTLEMENT_PENDING without quote re-mark", () => {
      const engine = new PaperTradingEngine(undefined, { allowMock: true });
      const now = new Date("2026-10-27T10:00:00.000Z"); // 15:30 IST on expiry day
      const trade: PaperTrade = {
        id: "pt_test_expiry",
        status: "OPEN",
        index: "nifty",
        strategy: "Long Call",
        createdAt: "2026-10-26T04:30:00.000Z",
        updatedAt: "2026-10-26T04:30:00.000Z",
        signalTimestamp: "2026-10-26T04:30:00.000Z",
        entryTimestamp: "2026-10-26T04:30:00.000Z",
        exitTimestamp: null,
        expiry: "2026-10-27",
        legs: [
          {
            side: "BUY",
            type: "CE",
            strike: atmStrike,
            entryLtp: 100,
            entryFillPrice: 100,
            entryFillSource: "ASK",
            currentPrice: 100,
            exitPrice: null,
          },
        ],
        entryPrice: 100,
        currentPrice: 100,
        exitPrice: null,
        quantity: 75,
        lots: 1,
        lotSize: 75,
        stopLoss: 50,
        target1: 200,
        target2: 300,
        realizedPnL: null,
        grossPnL: null,
        transactionCosts: null,
        unrealizedPnL: 0,
        maxProfit: null,
        maxLoss: null,
        exitReason: null,
        targetReached: null,
        recommendationScore: 80,
        confidence: 80,
        riskAmount: 3750,
        riskReward: 2.0,
        marketDataTimestamp: "2026-10-26T04:30:00.000Z",
        marketDataSource: "UPSTOX_LIVE",
        executionMode: "PAPER",
        riskConfigSnapshot: {} as unknown as PaperTrade["riskConfigSnapshot"],
        riskAssessmentSnapshot: {} as unknown as PaperTrade["riskAssessmentSnapshot"],
      };

      engine.setTrades([trade], [
        {
          timestamp: "2026-10-26T04:30:00.000Z",
          tradeId: trade.id,
          event: "PAPER_TRADE_OPENED",
          marketDataTimestamp: "2026-10-26T04:30:00.000Z",
          price: 100,
          reason: "Opened",
        },
      ]);

      // Snapshot with rolled over chain (next week)
      const rolledSnap = makeTestSnapshot(now);
      rolledSnap.expiry = "2026-11-03";
      const updated = engine.evaluateOpenTrades(rolledSnap, now);

      assert.equal(updated.length, 1);
      assert.equal(trade.status, "SETTLEMENT_PENDING");
      // Current mark preserved, not corrupted with rolled-over prices
      assert.equal(trade.currentPrice, 100);
      assert.equal(trade.exitPrice, null);
      assert.equal(trade.realizedPnL, null);
    });

    it("evaluateOpenTrades: expiry mismatch on open position flags STALE_QUOTES and preserves mark", () => {
      const engine = new PaperTradingEngine(undefined, { allowMock: true });
      const now = new Date("2026-10-26T06:00:00.000Z"); // 11:30 IST on Monday (not expired)
      const trade: PaperTrade = {
        id: "pt_test_mismatch",
        status: "OPEN",
        index: "nifty",
        strategy: "Long Call",
        createdAt: "2026-10-26T04:30:00.000Z",
        updatedAt: "2026-10-26T04:30:00.000Z",
        signalTimestamp: "2026-10-26T04:30:00.000Z",
        entryTimestamp: "2026-10-26T04:30:00.000Z",
        exitTimestamp: null,
        expiry: "2026-10-27",
        legs: [
          {
            side: "BUY",
            type: "CE",
            strike: atmStrike,
            entryLtp: 100,
            entryFillPrice: 100,
            entryFillSource: "ASK",
            currentPrice: 100,
            exitPrice: null,
          },
        ],
        entryPrice: 100,
        currentPrice: 100,
        exitPrice: null,
        quantity: 75,
        lots: 1,
        lotSize: 75,
        stopLoss: 50,
        target1: 200,
        target2: 300,
        realizedPnL: null,
        grossPnL: null,
        transactionCosts: null,
        unrealizedPnL: 0,
        maxProfit: null,
        maxLoss: null,
        exitReason: null,
        targetReached: null,
        recommendationScore: 80,
        confidence: 80,
        riskAmount: 3750,
        riskReward: 2.0,
        marketDataTimestamp: "2026-10-26T04:30:00.000Z",
        marketDataSource: "UPSTOX_LIVE",
        executionMode: "PAPER",
        riskConfigSnapshot: {} as unknown as PaperTrade["riskConfigSnapshot"],
        riskAssessmentSnapshot: {} as unknown as PaperTrade["riskAssessmentSnapshot"],
      };

      engine.setTrades([trade], [
        {
          timestamp: "2026-10-26T04:30:00.000Z",
          tradeId: trade.id,
          event: "PAPER_TRADE_OPENED",
          marketDataTimestamp: "2026-10-26T04:30:00.000Z",
          price: 100,
          reason: "Opened",
        },
      ]);

      // Snapshot with different expiry
      const wrongExpirySnap = makeTestSnapshot(now);
      wrongExpirySnap.expiry = "2026-11-03";
      // Set rolled-over chain prices very low (would breach stop if evaluated)
      for (const r of wrongExpirySnap.chain) {
        if (r.call) { r.call.bid = 10; r.call.ltp = 10; }
      }

      engine.evaluateOpenTrades(wrongExpirySnap, now);

      // Status must remain OPEN (not STOPPED_OUT on foreign quotes)
      assert.equal(trade.status, "OPEN");
      assert.equal(trade.currentPrice, 100);
      assert.equal(trade.monitoring?.status, "STALE_QUOTES");
      assert.equal(trade.monitoring?.reason, "Option chain expiry mismatch");
    });
  });

  // ── G9: Market Data Provenance ─────────────────────────────────────────────
  describe("G9 — Truthful Market Data Provenance", () => {
    it("assigns UPSTOX_LIVE only when provider is UPSTOX and source is LIVE", () => {
      const snap = makeTestSnapshot();
      snap.sources.market = { provider: "UPSTOX", source: "LIVE", fetchedAt: new Date().toISOString() };
      snap.sources.optionChain = { provider: "UPSTOX", source: "LIVE", fetchedAt: new Date().toISOString() };
      assert.equal(determineMarketDataSource(snap), "UPSTOX_LIVE");
    });

    it("assigns UPSTOX_EOD when provider is UPSTOX and source is END_OF_DAY", () => {
      const snap = makeTestSnapshot();
      snap.sources.market = { provider: "UPSTOX", source: "END_OF_DAY", fetchedAt: new Date().toISOString() };
      snap.sources.optionChain = { provider: "UPSTOX", source: "END_OF_DAY", fetchedAt: new Date().toISOString() };
      assert.equal(determineMarketDataSource(snap), "UPSTOX_EOD");
    });

    it("assigns MOCK_SIMULATION when provider or source is MOCK", () => {
      const snap = makeTestSnapshot();
      snap.sources.market = { provider: "MOCK", source: "MOCK", fetchedAt: new Date().toISOString() };
      snap.sources.optionChain = { provider: "MOCK", source: "MOCK", fetchedAt: new Date().toISOString() };
      assert.equal(determineMarketDataSource(snap), "MOCK_SIMULATION");
    });

    it("assigns SYNTHETIC_TEST when provider is null or missing", () => {
      const snap = makeTestSnapshot();
      snap.sources.market = { provider: null, source: "LIVE", fetchedAt: new Date().toISOString() };
      snap.sources.optionChain = { provider: null, source: "LIVE", fetchedAt: new Date().toISOString() };
      assert.equal(determineMarketDataSource(snap), "SYNTHETIC_TEST");
    });

    it("assigns MANUAL_UI when fallbackReason is MANUAL_UI", () => {
      const snap = makeTestSnapshot();
      (snap as any).fallbackReason = "MANUAL_UI";
      assert.equal(determineMarketDataSource(snap), "MANUAL_UI");
    });

    it("filterVerifiedLiveTrades excludes non-UPSTOX_LIVE trades", () => {
      const trades: Partial<PaperTrade>[] = [
        { id: "1", marketDataSource: "UPSTOX_LIVE" },
        { id: "2", marketDataSource: "SYNTHETIC_TEST" },
        { id: "3", marketDataSource: "MOCK_SIMULATION" },
        { id: "4", marketDataSource: "MANUAL_UI" },
      ];
      const verified = filterVerifiedLiveTrades(trades as PaperTrade[]);
      assert.equal(verified.length, 1);
      assert.equal(verified[0].id, "1");
      assert.equal(isVerifiedLiveTrade(trades[0] as PaperTrade), true);
      assert.equal(isVerifiedLiveTrade(trades[1] as PaperTrade), false);
    });
  });

  // ── G4: Bhavcopy Candidate Revision Promotion Workflow ─────────────────────
  describe("G4 — Candidate Revision Promotion Workflow", () => {
    it("ingestion of different archive hash creates candidate revision", () => {
      const csv1 = "TradDt,TckrSymb,XpryDt,StrkPric,OptnTp,SttlmPric\r\n2026-10-27,NIFTY,2026-10-27,24500,CE,120.00\r\n";
      const zip1 = createTestZip("bhav1.csv", csv1);
      const res1 = ingestSettlementArchive(zip1, { storageDir: tempDir });
      assert.equal(res1.status, "SUCCESS");

      // Present revised archive with different price
      const csv2 = "TradDt,TckrSymb,XpryDt,StrkPric,OptnTp,SttlmPric\r\n2026-10-27,NIFTY,2026-10-27,24500,CE,125.00\r\n";
      const zip2 = createTestZip("bhav2.csv", csv2);
      const res2 = ingestSettlementArchive(zip2, { storageDir: tempDir });
      assert.equal(res2.status, "CANDIDATE_REVISION");

      const candidates = listCandidateRevisions(tempDir, "2026-10-27");
      assert.equal(candidates.length, 1);
      assert.equal(candidates[0].archiveHash, res2.archiveHash);
    });

    it("promoteCandidateRevision requires explicit confirmed: true", () => {
      const csv = "TradDt,TckrSymb,XpryDt,StrkPric,OptnTp,SttlmPric\r\n2026-10-27,NIFTY,2026-10-27,24500,CE,120.00\r\n";
      const zip = createTestZip("bhav.csv", csv);
      const res = ingestSettlementArchive(zip, { storageDir: tempDir });

      const promoteRes = promoteCandidateRevision(tempDir, {
        tradeDate: "2026-10-27",
        candidateArchiveHash: res.archiveHash,
        confirmed: false,
        operatorId: "OP_01",
        reason: "Test",
      });
      assert.equal(promoteRes.success, false);
      assert.match(promoteRes.error!, /PROMOTION_NOT_CONFIRMED/);
    });

    it("promoteCandidateRevision successfully promotes candidate and writes audit entry", () => {
      const csv1 = "TradDt,TckrSymb,XpryDt,StrkPric,OptnTp,SttlmPric\r\n2026-10-27,NIFTY,2026-10-27,24500,CE,120.00\r\n";
      const zip1 = createTestZip("bhav1.csv", csv1);
      const res1 = ingestSettlementArchive(zip1, { storageDir: tempDir });

      const csv2 = "TradDt,TckrSymb,XpryDt,StrkPric,OptnTp,SttlmPric\r\n2026-10-27,NIFTY,2026-10-27,24500,CE,125.00\r\n";
      const zip2 = createTestZip("bhav2.csv", csv2);
      const res2 = ingestSettlementArchive(zip2, { storageDir: tempDir });

      const promoteRes = promoteCandidateRevision(tempDir, {
        tradeDate: "2026-10-27",
        candidateArchiveHash: res2.archiveHash,
        expectedPreviousHash: res1.archiveHash,
        confirmed: true,
        operatorId: "OP_OPERATOR_01",
        reason: "Exchange published revised settlement price",
      });

      assert.equal(promoteRes.success, true);
      assert.equal(promoteRes.promotedArchiveHash, res2.archiveHash);

      // Verify active metadata updated
      const activeMeta = loadMetadata(tempDir, "2026-10-27");
      assert.equal(activeMeta?.archiveHash, res2.archiveHash);
      assert.equal(activeMeta?.status, "SUCCESS");
      assert.match(activeMeta?.revisionNote!, /Promoted by OP_OPERATOR_01/);

      // Verify audit file created
      const auditFile = path.join(tempDir, "revisions_audit.jsonl");
      assert.ok(fs.existsSync(auditFile));
      const auditLines = fs.readFileSync(auditFile, "utf8").trim().split("\n");
      assert.equal(auditLines.length, 1);
      const audit = JSON.parse(auditLines[0]);
      assert.equal(audit.operatorId, "OP_OPERATOR_01");

      // Idempotency: promoting already active returns alreadyActive: true
      const idemp = promoteCandidateRevision(tempDir, {
        tradeDate: "2026-10-27",
        candidateArchiveHash: res2.archiveHash,
        confirmed: true,
        operatorId: "OP_OPERATOR_01",
        reason: "Repeat",
      });
      assert.equal(idemp.success, true);
      assert.equal(idemp.alreadyActive, true);
    });
  });

  // ── G7: Persistent Bhavcopy Quarantine Log ─────────────────────────────────
  describe("G7 — Persistent Quarantine Audit Log", () => {
    it("conflicting duplicate rows write quarantine record to quarantine_log.jsonl", () => {
      const csv =
        "TradDt,TckrSymb,XpryDt,StrkPric,OptnTp,SttlmPric\r\n" +
        "2026-10-27,NIFTY,2026-10-27,24500,CE,120.00\r\n" +
        "2026-10-27,NIFTY,2026-10-27,24500,CE,130.00\r\n"; // conflicting price
      const zip = createTestZip("conflict.csv", csv);

      const res = ingestSettlementArchive(zip, { storageDir: tempDir });
      assert.equal(res.status, "QUARANTINED");

      const qRecords = listQuarantineRecords(tempDir);
      assert.equal(qRecords.length, 1);
      assert.equal(qRecords[0].tradeDate, "2026-10-27");
      assert.match(qRecords[0].reason, /Conflicting duplicate rows/);
      assert.ok(qRecords[0].parserVersion.includes("bhavcopy"));
    });
  });

  // ── G14: Unsupported Symbols & Duplicate Handling ──────────────────────────
  describe("G14 — Unsupported Symbols & Deduplication", () => {
    it("skips unsupported index symbols without failing supported rows", () => {
      const csv =
        "TradDt,TckrSymb,XpryDt,StrkPric,OptnTp,SttlmPric\r\n" +
        "2026-10-27,NIFTY,2026-10-27,24500,CE,120.00\r\n" +
        "2026-10-27,FINNIFTY,2026-10-27,22000,CE,50.00\r\n" + // FINNIFTY unsupported
        "2026-10-27,BANKNIFTY,2026-10-27,52000,CE,250.00\r\n";
      const zip = createTestZip("symbols.csv", csv);

      const res = ingestSettlementArchive(zip, { storageDir: tempDir });
      assert.equal(res.status, "SUCCESS");
      assert.equal(res.records.length, 2); // NIFTY and BANKNIFTY ingested
      assert.ok(res.records.every((r) => r.symbol === "NIFTY" || r.symbol === "BANKNIFTY"));
    });

    it("safely dedupes identical duplicate rows with an advisory warning", () => {
      const csv =
        "TradDt,TckrSymb,XpryDt,StrkPric,OptnTp,SttlmPric\r\n" +
        "2026-10-27,NIFTY,2026-10-27,24500,CE,120.00\r\n" +
        "2026-10-27,NIFTY,2026-10-27,24500,CE,120.00\r\n"; // identical duplicate
      const zip = createTestZip("dup.csv", csv);

      const res = ingestSettlementArchive(zip, { storageDir: tempDir });
      assert.equal(res.status, "SUCCESS");
      assert.equal(res.records.length, 1);
      assert.ok(res.warnings.some((w) => w.includes("Duplicate identical row")));
    });
  });
});
