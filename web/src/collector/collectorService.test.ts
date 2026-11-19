// End-to-End Prototype Integration Tests for Collector Service (Gate 1 Scope)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { CollectorService } from "./collectorService.ts";
import { ReplayEngine } from "./replayEngine.ts";
import { StorageManager } from "./storageManager.ts";
import { ProtobufDecoder } from "./protobufDecoder.ts";
import type { RawMasterContract } from "./universeSelector.ts";

const TEST_DIR = path.join(process.cwd(), ".test-data", "collector-service-tests");

function cleanTestDir() {
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
}

function generateMockMaster(): RawMasterContract[] {
  const contracts: RawMasterContract[] = [
    {
      instrumentKey: "NSE_INDEX|Nifty 50",
      exchangeToken: "26000",
      tradingSymbol: "NIFTY 50",
      underlying: "NIFTY",
      expiryDate: "2026-11-19",
      strikePrice: 0,
      instrumentType: "INDEX",
      lotSize: 1,
      segment: "NSE_INDEX",
    },
    {
      instrumentKey: "NSE_INDEX|Nifty Bank",
      exchangeToken: "26001",
      tradingSymbol: "NIFTY BANK",
      underlying: "BANKNIFTY",
      expiryDate: "2026-11-26",
      strikePrice: 0,
      instrumentType: "INDEX",
      lotSize: 1,
      segment: "NSE_INDEX",
    },
    {
      instrumentKey: "NSE_FO|NIFTY26NOVFUT",
      exchangeToken: "40001",
      tradingSymbol: "NIFTY 26NOV FUT",
      underlying: "NIFTY",
      expiryDate: "2026-11-26",
      strikePrice: 0,
      instrumentType: "FUTIDX",
      lotSize: 25,
      segment: "NSE_FO",
    },
    {
      instrumentKey: "NSE_FO|BANKNIFTY26NOVFUT",
      exchangeToken: "40002",
      tradingSymbol: "BANKNIFTY 26NOV FUT",
      underlying: "BANKNIFTY",
      expiryDate: "2026-11-26",
      strikePrice: 0,
      instrumentType: "FUTIDX",
      lotSize: 15,
      segment: "NSE_FO",
    },
  ];

  // NIFTY options (5 strikes around ATM 24500)
  for (const exp of ["2026-11-19", "2026-11-26"]) {
    for (let offset = -5; offset <= 5; offset++) {
      const strike = 24500 + offset * 50;
      for (const type of ["CE", "PE"] as const) {
        contracts.push({
          instrumentKey: `NSE_FO|NIFTY${exp}${type}${strike}`,
          exchangeToken: `TOK_NIFTY_${exp}_${strike}_${type}`,
          tradingSymbol: `NIFTY ${exp} ${strike} ${type}`,
          underlying: "NIFTY",
          expiryDate: exp,
          strikePrice: strike,
          instrumentType: type,
          lotSize: 25,
          segment: "NSE_FO",
        });
      }
    }
  }

  // BANKNIFTY monthly options (5 strikes around ATM 51200)
  for (const exp of ["2026-11-26", "2026-12-31"]) {
    for (let offset = -5; offset <= 5; offset++) {
      const strike = 51200 + offset * 100;
      for (const type of ["CE", "PE"] as const) {
        contracts.push({
          instrumentKey: `NSE_FO|BANKNIFTY${exp}${type}${strike}`,
          exchangeToken: `TOK_BN_${exp}_${strike}_${type}`,
          tradingSymbol: `BANKNIFTY ${exp} ${strike} ${type}`,
          underlying: "BANKNIFTY",
          expiryDate: exp,
          strikePrice: strike,
          instrumentType: type,
          lotSize: 15,
          segment: "NSE_FO",
        });
      }
    }
  }

  return contracts;
}

test("Collector Service: full end-to-end offline prototype lifecycle", () => {
  cleanTestDir();

  const masterContracts = generateMockMaster();
  const masterRaw = JSON.stringify(masterContracts);

  const service = new CollectorService({
    baseDirectory: TEST_DIR,
    sessionDate: "2026-11-16",
    masterSource: "mock_daily_master.json",
    masterRawContent: masterRaw,
    referencePrices: {
      niftyCashPrice: 24500,
      bankniftyCashPrice: 51200,
      priceTimestamp: "2026-11-16T09:00:00+05:30",
      method: "PRE_OPEN_CASH_0900_IST",
    },
    wingStrikesCount: 5,
    bufferCapacity: 1000,
  });

  const universe = service.getUniverseManifest();
  assert.equal(universe.universeStatus, "COMPLETE");
  assert.equal(universe.expectedKeysCount, 92);
  assert.equal(universe.resolvedKeysCount, 92);

  const plan = service.getSubscriptionPlan();
  assert.equal(plan.quotaStatus, "OK");
  assert.equal(plan.totalKeysCount, 92);

  service.start();

  const decoder = new ProtobufDecoder();
  const t0 = Date.parse("2026-11-16T09:30:00.000Z");

  // Ingest valid option frame
  const optFrame = decoder.encodeMock({
    type: "live_feed",
    currentTs: t0,
    feeds: {
      "NSE_FO|NIFTY2026-11-19CE24500": {
        requestMode: "full_d5",
        fullFeed: {
          marketFF: {
            ltpc: { ltp: 160.0, ltq: 25, ltt: t0 - 50, cp: 150.0 },
            marketLevel: {
              bidAskQuote: [
                { bidP: 159.5, bidQ: 50, askP: 160.5, askQ: 50 },
              ],
            },
            oi: 45000,
            vtt: 90000,
            iv: 0.17,
            optionGreeks: { delta: 0.54, gamma: 0.002, theta: -10, vega: 15, rho: 0.05 },
          },
        },
      },
    },
  });

  const res1 = service.ingestFrame("ws-pool-01", optFrame);
  assert.equal(res1.ok, true);
  assert.ok(res1.eventsProduced >= 4);

  // Ingest malformed frame (verifies zero crash, error counter incremented)
  const malformedFrame = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x01, 0x02]);
  const res2 = service.ingestFrame("ws-pool-01", malformedFrame);
  assert.equal(res2.ok, false);
  assert.equal(res2.eventsProduced, 0);

  // Record an explicit outage gap
  service.recordGap({
    gapId: "gap-proto-01",
    sessionDate: "2026-11-16",
    gapStartUtcIso: "2026-11-16T09:32:00.000Z",
    gapEndUtcIso: "2026-11-16T09:33:00.000Z",
    gapDurationMs: 60000,
    affectedInstrumentsCount: 92,
    cause: "DISCONNECTION",
    restSnapshotReferenceTaken: false,
    notes: "Network drop test gap",
  });

  // Stop and finalize session
  const manifest = service.stop();
  assert.equal(manifest.totalGapsRecorded, 1);
  assert.equal(manifest.droppedEventCount, 0);
  assert.equal(manifest.sessionIntegrityStatus, "PARTIAL_DATA_SESSION"); // because 1 gap recorded

  // Check stats
  const stats = service.getStats();
  assert.equal(stats.decoder.totalDecodeErrors, 1);
  assert.equal(stats.decoder.totalFramesDecoded, 1);

  // Verify Session Integrity
  const integrity = StorageManager.verifySessionIntegrity(service.getSessionDir());
  assert.equal(integrity.valid, true);
  assert.equal(integrity.corruptFiles.length, 0);

  // Replay Session
  const replay = new ReplayEngine(service.getSessionDir());
  assert.ok(replay.getRowCount() >= 4);
  assert.equal(replay.getGaps().length, 1);

  const replayRun1 = replay.replayAll();
  const replayRun2 = replay.replayAll();
  assert.equal(replayRun1.streamSha256, replayRun2.streamSha256);
});
