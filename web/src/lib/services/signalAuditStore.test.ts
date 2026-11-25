import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  recordSignalAudit,
  getSignalAuditRecords,
  verifySignalAuditIntegrity,
  hashSnapshotInputs,
  clearSignalAuditForTesting,
  signalAuditLogFile,
} from "./signalAuditStore.ts";
import { mockSnapshot } from "./mock.ts";

const TEST_DIR = path.join(process.cwd(), ".test-data", "signal-audit-test");

beforeEach(() => {
  process.env.SIGNAL_AUDIT_DIR = TEST_DIR;
  clearSignalAuditForTesting();
});

afterEach(() => {
  clearSignalAuditForTesting();
  delete process.env.SIGNAL_AUDIT_DIR;
});

test("SIGNAL-AUDIT-1. Snapshot hashing is deterministic and sensitive to input changes", () => {
  const fixedNow = new Date("2026-11-24T10:00:00.000Z");
  const snap1 = mockSnapshot("nifty", fixedNow);
  const snap2 = mockSnapshot("nifty", fixedNow);
  const hash1 = hashSnapshotInputs(snap1);
  const hash2 = hashSnapshotInputs(snap2);

  assert.equal(hash1, hash2, "Identical snapshots must yield identical hashes");

  const snapCrude = mockSnapshot("crudeoil", fixedNow);
  const hashCrude = hashSnapshotInputs(snapCrude);
  assert.notEqual(hash1, hashCrude, "Different underlyings must yield different hashes");

  const modifiedSpot = { ...snap1, spot: snap1.spot + 10 };
  assert.notEqual(hash1, hashSnapshotInputs(modifiedSpot), "Changed spot must alter the snapshot hash");
});

test("SIGNAL-AUDIT-2. Signal evaluations append sequentially with cryptographic chaining", () => {
  const snapNifty = mockSnapshot("nifty");
  const snapCrude = mockSnapshot("crudeoil");

  const rec1 = recordSignalAudit({
    timestamp: new Date().toISOString(),
    underlying: "nifty",
    action: "OPPORTUNITY_EVALUATED",
    spotPrice: snapNifty.spot,
    snapshotHash: hashSnapshotInputs(snapNifty),
    strategy: "Bull Call Spread",
    bias: "BULLISH",
    regime: "BULLISH",
    grade: "Grade A",
    score: 8.5,
    tradePlan: {
      strategy: "Bull Call Spread",
      legs: [
        { side: "BUY", type: "CE", strike: 25100, ltp: 120 },
        { side: "SELL", type: "CE", strike: 25200, ltp: 65 },
      ],
      entry: 55,
      stop: 30,
      target1: 95,
      target2: 120,
      rr: 1.6,
    },
    engineVersion: "11.4",
    inputSnapshotSummary: {
      atmStrike: 25100,
      atmIv: 12.5,
      pcrOi: 1.15,
      lotSize: 65,
      source: "MOCK",
      indicatorsAvailable: true,
    },
  });

  assert.equal(rec1.sequenceNumber, 1);
  assert.equal(rec1.previousChecksum, "GENESIS");
  assert.equal(rec1.exchange, "NSE_FO");
  assert.equal(rec1.estimatedCosts.taxType, "STT");

  const rec2 = recordSignalAudit({
    timestamp: new Date().toISOString(),
    underlying: "crudeoil",
    action: "SIGNAL_GENERATED",
    spotPrice: snapCrude.spot,
    snapshotHash: hashSnapshotInputs(snapCrude),
    strategy: "Long Call",
    bias: "BULLISH",
    regime: "STRONG BULLISH",
    grade: "Grade B",
    score: 7.2,
    tradePlan: {
      strategy: "Long Call",
      legs: [{ side: "BUY", type: "CE", strike: 6250, ltp: 85 }],
      entry: 85,
      stop: 60,
      target1: 125,
      target2: 150,
      rr: 1.6,
    },
    engineVersion: "11.4",
    inputSnapshotSummary: {
      atmStrike: 6250,
      atmIv: 24.5,
      pcrOi: 1.1,
      lotSize: 100,
      source: "MOCK",
      indicatorsAvailable: true,
    },
  });

  assert.equal(rec2.sequenceNumber, 2);
  assert.equal(rec2.previousChecksum, rec1.checksum, "rec2 must cryptographically chain rec1's checksum");
  assert.equal(rec2.exchange, "MCX_FO");
  assert.equal(rec2.estimatedCosts.taxType, "CTT");

  const integrity = verifySignalAuditIntegrity();
  assert.equal(integrity.valid, true);
  assert.equal(integrity.totalRecords, 2);
});

test("SIGNAL-AUDIT-3. Tamper detection detects modified logs and broken hash chains", () => {
  const snap = mockSnapshot("nifty");

  recordSignalAudit({
    timestamp: new Date().toISOString(),
    underlying: "nifty",
    action: "OPPORTUNITY_EVALUATED",
    spotPrice: snap.spot,
    snapshotHash: hashSnapshotInputs(snap),
    strategy: "Long Call",
    bias: "BULLISH",
    regime: "BULLISH",
    score: 8.0,
    tradePlan: null,
    engineVersion: "11.4",
    inputSnapshotSummary: {
      atmStrike: 25100,
      atmIv: 12.0,
      pcrOi: 1.1,
      lotSize: 65,
      source: "MOCK",
      indicatorsAvailable: true,
    },
  });

  const integrityBefore = verifySignalAuditIntegrity();
  assert.equal(integrityBefore.valid, true);

  // Tamper with the log file
  const logFile = signalAuditLogFile();
  const raw = fs.readFileSync(logFile, "utf8");
  const tampered = raw.replace('"score":8', '"score":9.9');
  fs.writeFileSync(logFile, tampered, "utf8");

  const integrityAfter = verifySignalAuditIntegrity();
  assert.equal(integrityAfter.valid, false, "Must detect altered record content");
  assert.match(integrityAfter.error!, /Tamper detected/);
});

test("SIGNAL-AUDIT-4. Query and filter audit records", () => {
  const snapNifty = mockSnapshot("nifty");
  const snapCrude = mockSnapshot("crudeoil");

  recordSignalAudit({
    timestamp: new Date().toISOString(),
    underlying: "nifty",
    action: "OPPORTUNITY_EVALUATED",
    spotPrice: snapNifty.spot,
    snapshotHash: hashSnapshotInputs(snapNifty),
    strategy: "Bull Call Spread",
    bias: "BULLISH",
    regime: "BULLISH",
    score: 8.0,
    tradePlan: null,
    engineVersion: "11.4",
    inputSnapshotSummary: {
      atmStrike: 25100,
      atmIv: 12.0,
      pcrOi: 1.1,
      lotSize: 65,
      source: "MOCK",
      indicatorsAvailable: true,
    },
  });

  recordSignalAudit({
    timestamp: new Date().toISOString(),
    underlying: "crudeoil",
    action: "OPPORTUNITY_EVALUATED",
    spotPrice: snapCrude.spot,
    snapshotHash: hashSnapshotInputs(snapCrude),
    strategy: "Long Call",
    bias: "BULLISH",
    regime: "BULLISH",
    score: 7.5,
    tradePlan: null,
    engineVersion: "11.4",
    inputSnapshotSummary: {
      atmStrike: 6250,
      atmIv: 24.0,
      pcrOi: 1.0,
      lotSize: 100,
      source: "MOCK",
      indicatorsAvailable: true,
    },
  });

  const all = getSignalAuditRecords();
  assert.equal(all.length, 2);

  const crudeOnly = getSignalAuditRecords({ underlying: "crudeoil" });
  assert.equal(crudeOnly.length, 1);
  assert.equal(crudeOnly[0].underlying, "crudeoil");

  const niftyOnly = getSignalAuditRecords({ underlying: "nifty" });
  assert.equal(niftyOnly.length, 1);
  assert.equal(niftyOnly[0].underlying, "nifty");
});
