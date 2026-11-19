// Tests for Module 12: Deterministic Replay Engine (WBS 4.4 / 1.5)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { StorageManager } from "./storageManager.ts";
import { ReplayEngine } from "./replayEngine.ts";
import type { BestBidAskEvent, LTPCEvent } from "./collectorTypes.ts";

const TEST_DIR = path.join(process.cwd(), ".test-data", "collector-replay-tests");

function setupReplaySession(): string {
  if (fs.existsSync(TEST_DIR)) {
    try {
      const files = fs.readdirSync(TEST_DIR, { recursive: true });
      for (const f of files) {
        try { fs.chmodSync(path.join(TEST_DIR, String(f)), 0o777); } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_DIR, { recursive: true });

  const sm = new StorageManager({
    baseDirectory: TEST_DIR,
    sessionDate: "2026-11-16",
    universeManifestHash: "replay_manifest_hash_54321",
  });

  // Write events with explicit monotonic sequence
  const evt1: LTPCEvent = {
    schemaVersion: "1.0.0",
    eventId: "evt-001",
    eventType: "LTPC",
    instrumentKey: "NSE_FO|NIFTY26NOV24500CE",
    connectionId: "ws-01",
    provenance: "EXCHANGE_MATCHING_ENGINE",
    localReceiptMonoNs: BigInt(1000000000),
    localReceiptUtcIso: "2026-11-16T09:30:00.000Z",
    feedServerTs: 1731749400000,
    transportLatencyMs: 10,
    qualityFlags: [],
    ltp: 150.0,
    ltq: 25,
    lastTradeTs: 1731749400000,
    sessionVolume: 5000,
    closePrice: 140.0,
  };
  const evt2: BestBidAskEvent = {
    schemaVersion: "1.0.0",
    eventId: "evt-002",
    eventType: "BEST_BID_ASK",
    instrumentKey: "NSE_FO|NIFTY26NOV24500CE",
    connectionId: "ws-01",
    provenance: "EXCHANGE_ORDER_BOOK",
    localReceiptMonoNs: BigInt(1000000050),
    localReceiptUtcIso: "2026-11-16T09:30:00.050Z",
    feedServerTs: 1731749400000,
    transportLatencyMs: 10,
    qualityFlags: [],
    bestBidPrice: 149.8,
    bestBidQuantity: 50,
    bestAskPrice: 150.2,
    bestAskQuantity: 75,
    spreadPct: 0.0026,
    quoteSourceTs: "UNKNOWN",
  };
  const evt3: LTPCEvent = {
    schemaVersion: "1.0.0",
    eventId: "evt-003",
    eventType: "LTPC",
    instrumentKey: "NSE_FO|NIFTY26NOV24500CE",
    connectionId: "ws-01",
    provenance: "EXCHANGE_MATCHING_ENGINE",
    localReceiptMonoNs: BigInt(1000000100),
    localReceiptUtcIso: "2026-11-16T09:30:00.100Z",
    feedServerTs: 1731749400050,
    transportLatencyMs: 10,
    qualityFlags: [],
    ltp: 150.2,
    ltq: 50,
    lastTradeTs: 1731749400050,
    sessionVolume: 5050,
    closePrice: 140.0,
  };

  sm.writeEvent(evt1);
  sm.writeEvent(evt2);
  sm.writeEvent(evt3);

  sm.recordGap({
    gapId: "gap-replay-01",
    sessionDate: "2026-11-16",
    gapStartUtcIso: "2026-11-16T09:35:00.000Z",
    gapEndUtcIso: "2026-11-16T09:36:00.000Z",
    gapDurationMs: 60000,
    affectedInstrumentsCount: 252,
    cause: "DISCONNECTION",
    restSnapshotReferenceTaken: false,
    notes: "Simulated disconnect outage",
  });

  sm.finalizeSession();
  return sm.getSessionDir();
}

test("Replay Engine: loads and deterministically replays events in monotonic order", () => {
  const sessionDir = setupReplaySession();
  const engine = new ReplayEngine(sessionDir);

  // Total rows: evt1 (LTPC), evt2 (BBA), evt3 (LTPC)
  assert.equal(engine.getRowCount(), 3);
  assert.equal(engine.getGaps().length, 1);
  assert.equal(engine.getGaps()[0].gapId, "gap-replay-01");

  const eventIds: string[] = [];
  const replayRes1 = engine.replayAll((row) => {
    eventIds.push(row.event_id);
  });

  assert.equal(replayRes1.totalEvents, 3);
  assert.equal(replayRes1.gapsCount, 1);
  assert.deepEqual(eventIds, ["evt-001", "evt-002", "evt-003"]);

  // Reproducibility test: second run produces exact same stream SHA-256
  const replayRes2 = engine.replayAll();
  assert.equal(replayRes1.streamSha256, replayRes2.streamSha256);
  assert.ok(replayRes1.streamSha256.length === 64);
});
