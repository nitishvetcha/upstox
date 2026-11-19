// Tests for Module 9: Storage Partitioning & Integrity Manifest (WBS 4.4)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { StorageManager } from "./storageManager.ts";
import type { BestBidAskEvent, FuturesBarEvent, LTPCEvent, SpotIndexBarEvent } from "./collectorTypes.ts";

const TEST_DIR = path.join(process.cwd(), ".test-data", "collector-storage-tests");

function cleanTestDir() {
  if (fs.existsSync(TEST_DIR)) {
    // Reset permissions if any 0444 files exist
    try {
      const files = fs.readdirSync(TEST_DIR, { recursive: true });
      for (const f of files) {
        const p = path.join(TEST_DIR, String(f));
        try { fs.chmodSync(p, 0o777); } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_DIR, { recursive: true });
}

test("Storage Manager: creates partitioned directory layout and routes events correctly", () => {
  cleanTestDir();

  const sm = new StorageManager({
    baseDirectory: TEST_DIR,
    sessionDate: "2026-11-16",
    universeManifestHash: "mock_universe_hash_12345",
  });

  const sessionDir = sm.getSessionDir();
  assert.ok(fs.existsSync(path.join(sessionDir, "segment=options")));
  assert.ok(fs.existsSync(path.join(sessionDir, "segment=futures")));
  assert.ok(fs.existsSync(path.join(sessionDir, "segment=spot")));
  assert.ok(fs.existsSync(path.join(sessionDir, "segment=late")));

  // 1. Write an options event
  const optEvent: BestBidAskEvent = {
    schemaVersion: "1.0.0",
    eventId: "evt-opt-01",
    eventType: "BEST_BID_ASK",
    instrumentKey: "NSE_FO|NIFTY26NOV24500CE",
    connectionId: "ws-01",
    provenance: "EXCHANGE_ORDER_BOOK",
    localReceiptMonoNs: BigInt(1000),
    localReceiptUtcIso: "2026-11-16T09:30:00.000Z",
    feedServerTs: 1731749400000,
    transportLatencyMs: 12,
    qualityFlags: [],
    bestBidPrice: 150.0,
    bestBidQuantity: 25,
    bestAskPrice: 150.5,
    bestAskQuantity: 50,
    spreadPct: 0.0033,
    quoteSourceTs: "UNKNOWN",
  };
  sm.writeEvent(optEvent);

  // 2. Write a spot index event
  const spotEvent: SpotIndexBarEvent = {
    schemaVersion: "1.0.0",
    eventId: "evt-spot-01",
    eventType: "SPOT_INDEX_BAR",
    instrumentKey: "NSE_INDEX|Nifty 50",
    connectionId: "ws-01",
    provenance: "EXCHANGE_INDEX_CALCULATION",
    localReceiptMonoNs: BigInt(1100),
    localReceiptUtcIso: "2026-11-16T09:30:00.000Z",
    feedServerTs: 1731749400000,
    transportLatencyMs: 12,
    qualityFlags: [],
    barTimestamp: "2026-11-16T09:30:00+05:30",
    open: 24500,
    high: 24510,
    low: 24490,
    close: 24505,
    volume: null,
    openInterest: null,
  };
  sm.writeEvent(spotEvent);

  // 3. Write a futures bar event
  const futEvent: FuturesBarEvent = {
    schemaVersion: "1.0.0",
    eventId: "evt-fut-01",
    eventType: "FUTURES_BAR",
    instrumentKey: "NSE_FO|NIFTY26NOVFUT",
    connectionId: "ws-01",
    provenance: "LOCAL_BAR_AGGREGATION",
    localReceiptMonoNs: BigInt(1200),
    localReceiptUtcIso: "2026-11-16T09:30:00.000Z",
    feedServerTs: 1731749400000,
    transportLatencyMs: 12,
    qualityFlags: [],
    barTimestamp: "2026-11-16T09:30:00+05:30",
    open: 24550,
    high: 24560,
    low: 24540,
    close: 24555,
    volume: 500,
    openInterest: 1200000,
    vwap: 24552.5,
  };
  sm.writeEvent(futEvent);

  // 4. Write a late out-of-order event
  const lateEvent: LTPCEvent = {
    schemaVersion: "1.0.0",
    eventId: "evt-late-01",
    eventType: "LTPC",
    instrumentKey: "NSE_FO|NIFTY26NOV24500CE",
    connectionId: "ws-01",
    provenance: "EXCHANGE_MATCHING_ENGINE",
    localReceiptMonoNs: BigInt(900), // out of order
    localReceiptUtcIso: "2026-11-16T09:29:59.000Z",
    feedServerTs: 1731749399000,
    transportLatencyMs: 12,
    qualityFlags: ["LATE_OUT_OF_ORDER"],
    ltp: 149.5,
    ltq: 25,
    lastTradeTs: 1731749399000,
    sessionVolume: 1000,
    closePrice: 140.0,
  };
  sm.writeEvent(lateEvent);

  // Append a raw binary frame
  sm.appendRawFrame(new Uint8Array([1, 2, 3, 4, 5]));

  // Record a gap
  sm.recordGap({
    gapId: "gap-01",
    sessionDate: "2026-11-16",
    gapStartUtcIso: "2026-11-16T09:35:00.000Z",
    gapEndUtcIso: "2026-11-16T09:36:00.000Z",
    gapDurationMs: 60000,
    affectedInstrumentsCount: 252,
    cause: "FEED_STALL",
    restSnapshotReferenceTaken: false,
    notes: "Feed silence exceeded watchdog threshold",
  });

  // Finalize Session
  const manifest = sm.finalizeSession();
  assert.equal(manifest.totalEventsProcessed, 4);
  assert.equal(manifest.totalGapsRecorded, 1);
  assert.equal(manifest.sessionIntegrityStatus, "PARTIAL_DATA_SESSION"); // because gap occurred
  assert.equal(manifest.partitionFiles.length, 4);

  // Verify File Integrity Verification
  const verifyRes = StorageManager.verifySessionIntegrity(sessionDir);
  assert.equal(verifyRes.valid, true);
  assert.equal(verifyRes.corruptFiles.length, 0);
  assert.equal(verifyRes.manifest?.sessionId, manifest.sessionId);

  // Tamper Evidence Test: mutate options file and verify detection
  const optFile = path.join(sessionDir, "segment=options", "part-0000.data");
  // Make writable for test tamper
  fs.chmodSync(optFile, 0o666);
  fs.appendFileSync(optFile, '{"tampered": true}\n');

  const tamperedVerify = StorageManager.verifySessionIntegrity(sessionDir);
  assert.equal(tamperedVerify.valid, false);
  assert.ok(tamperedVerify.corruptFiles.includes(optFile));
});
