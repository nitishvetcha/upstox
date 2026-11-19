import { describe, it, beforeEach, afterEach } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  acquirePaperLedgerLock,
  releasePaperLedgerLock,
  withPaperLedgerLock,
  cleanOrphanTempFiles,
  readLockToken,
  isProcessAlive,
  type PaperLedgerLockToken,
} from "./paperLedgerLock.ts";

const TEST_DIR = path.join(process.cwd(), ".test-data", "paper-ledger-lock-tests");

describe("Paper Ledger Lock Manager — PID-Reuse Protection & Concurrency Safety", () => {
  beforeEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("acquires and releases exclusive lock cleanly in normal operation", () => {
    const lockFile = path.join(TEST_DIR, ".paper-ledger.lock");
    assert.equal(fs.existsSync(lockFile), false);

    const token = acquirePaperLedgerLock(TEST_DIR);
    assert.equal(fs.existsSync(lockFile), true);
    assert.equal(token.pid, process.pid);
    assert.equal(token.hostname, os.hostname());
    assert.ok(token.lockNonce.length > 10);
    assert.ok(new Date(token.leaseExpireUtc).getTime() > Date.now());

    // Verify token persisted on disk
    const diskToken = readLockToken(lockFile);
    assert.deepEqual(diskToken, token);

    releasePaperLedgerLock(TEST_DIR, token);
    assert.equal(fs.existsSync(lockFile), false);
  });

  it("withPaperLedgerLock guarantees release even when user function throws", () => {
    const lockFile = path.join(TEST_DIR, ".paper-ledger.lock");

    assert.throws(() => {
      withPaperLedgerLock(TEST_DIR, () => {
        assert.equal(fs.existsSync(lockFile), true);
        throw new Error("simulated failure during write");
      });
    }, /simulated failure during write/);

    // Lock file must be released in finally block
    assert.equal(fs.existsSync(lockFile), false);
  });

  it("blocks concurrent lock acquisition while lock is actively held", () => {
    const token1 = acquirePaperLedgerLock(TEST_DIR, { leaseMs: 10000 });
    assert.ok(token1);

    // Attempting to acquire again from simulated other process
    assert.throws(
      () => acquirePaperLedgerLock(TEST_DIR, { leaseMs: 10000 }),
      /PAPER_LEDGER_LOCK_HELD/
    );

    releasePaperLedgerLock(TEST_DIR, token1);
  });

  it("CRITICAL: PID-reuse protection — refuses to reclaim lock when lease is expired but PID is still alive", () => {
    const lockFile = path.join(TEST_DIR, ".paper-ledger.lock");

    // Construct a lock token with the CURRENT alive PID, but an expired lease in the past
    const simulatedToken: PaperLedgerLockToken = {
      pid: process.pid, // Current process is alive!
      hostname: os.hostname(),
      processStartTime: Date.now() - 60000,
      processTitle: "unrelated-recycled-process",
      acquiredAtUtc: new Date(Date.now() - 30000).toISOString(),
      leaseExpireUtc: new Date(Date.now() - 10000).toISOString(), // Expired 10s ago
      lockNonce: "nonce-from-previous-dead-holder",
    };

    fs.writeFileSync(lockFile, JSON.stringify(simulatedToken, null, 2) + "\n", "utf8");

    // The PID is alive, but lease is expired.
    // Must NOT blindly reclaim! Must fail closed due to PID recycling uncertainty!
    assert.throws(
      () => acquirePaperLedgerLock(TEST_DIR),
      /PAPER_LEDGER_LOCK_UNCERTAIN: Lock lease expired at .*, but PID .* is still alive on .*\. Cannot verify whether PID was recycled by the OS; refusing to reclaim lock/
    );

    // Lock file must remain untouched
    assert.equal(fs.existsSync(lockFile), true);
  });

  it("safely reclaims stale lock ONLY when PID is confirmed DEAD and lease is expired", () => {
    const lockFile = path.join(TEST_DIR, ".paper-ledger.lock");

    // Find a PID that is definitely not running
    let deadPid = 99999;
    while (isProcessAlive(deadPid)) {
      deadPid--;
    }
    assert.equal(isProcessAlive(deadPid), false);

    // Write a stale lock from dead PID with expired lease
    const staleToken: PaperLedgerLockToken = {
      pid: deadPid,
      hostname: os.hostname(),
      processStartTime: Date.now() - 120000,
      processTitle: "dead-crashed-worker",
      acquiredAtUtc: new Date(Date.now() - 60000).toISOString(),
      leaseExpireUtc: new Date(Date.now() - 10000).toISOString(), // Expired 10s ago
      lockNonce: "stale-dead-nonce",
    };

    fs.writeFileSync(lockFile, JSON.stringify(staleToken, null, 2) + "\n", "utf8");

    // Acquisition must safely detect that deadPid is not running and lease is expired,
    // safely reclaim the dead lock, and acquire fresh lock for current process!
    const freshToken = acquirePaperLedgerLock(TEST_DIR);
    assert.ok(freshToken);
    assert.equal(freshToken.pid, process.pid);
    assert.notEqual(freshToken.lockNonce, staleToken.lockNonce);

    releasePaperLedgerLock(TEST_DIR, freshToken);
    assert.equal(fs.existsSync(lockFile), false);
  });

  it("refuses to reclaim lock prematurely if PID is dead but lease has NOT expired yet", () => {
    const lockFile = path.join(TEST_DIR, ".paper-ledger.lock");

    let deadPid = 99998;
    while (isProcessAlive(deadPid)) {
      deadPid--;
    }

    // Dead PID, but lease is still active in the future
    const unexpiredDeadToken: PaperLedgerLockToken = {
      pid: deadPid,
      hostname: os.hostname(),
      processStartTime: Date.now() - 5000,
      processTitle: "crashed-worker",
      acquiredAtUtc: new Date().toISOString(),
      leaseExpireUtc: new Date(Date.now() + 60000).toISOString(), // Active for 60s
      lockNonce: "unexpired-nonce",
    };

    fs.writeFileSync(lockFile, JSON.stringify(unexpiredDeadToken, null, 2) + "\n", "utf8");

    // Must refuse to steal lock before lease expiration
    assert.throws(
      () => acquirePaperLedgerLock(TEST_DIR),
      /PAPER_LEDGER_LOCK_HELD: Process \(PID \d+\) is absent, but lease remains active/
    );
  });

  it("fails closed when lock file contains corrupt, unparseable, or incomplete JSON", () => {
    const lockFile = path.join(TEST_DIR, ".paper-ledger.lock");
    fs.writeFileSync(lockFile, "{ torn lock write ... not json", "utf8");

    // Never delete or overwrite uncertain corrupted locks
    assert.throws(
      () => acquirePaperLedgerLock(TEST_DIR),
      /PAPER_LEDGER_LOCK_UNCERTAIN: Lock file .* exists but contains unparseable or incomplete token\. Refusing to reclaim; manual reconciliation required\./
    );

    assert.equal(fs.readFileSync(lockFile, "utf8"), "{ torn lock write ... not json");
  });

  it("refuses to reclaim or delete locks held by foreign hostnames", () => {
    const lockFile = path.join(TEST_DIR, ".paper-ledger.lock");
    const foreignToken: PaperLedgerLockToken = {
      pid: 1234,
      hostname: "remote-cluster-node-99.internal",
      processStartTime: Date.now() - 50000,
      processTitle: "remote-supervisor",
      acquiredAtUtc: new Date(Date.now() - 30000).toISOString(),
      leaseExpireUtc: new Date(Date.now() - 10000).toISOString(),
      lockNonce: "foreign-nonce",
    };

    fs.writeFileSync(lockFile, JSON.stringify(foreignToken, null, 2) + "\n", "utf8");

    assert.throws(
      () => acquirePaperLedgerLock(TEST_DIR),
      /PAPER_LEDGER_LOCK_HELD: Lock is held by remote host "remote-cluster-node-99\.internal"/
    );
  });

  it("refuses to release lock if caller's nonce does not match disk token", () => {
    const lockFile = path.join(TEST_DIR, ".paper-ledger.lock");
    const token = acquirePaperLedgerLock(TEST_DIR);

    // Tamper with nonce on disk (or simulated replacement)
    const tampered: PaperLedgerLockToken = {
      ...token,
      lockNonce: "different-hijacked-nonce",
    };
    fs.writeFileSync(lockFile, JSON.stringify(tampered, null, 2) + "\n", "utf8");

    // Calling release with original token must fail to prevent clobbering another lock
    assert.throws(
      () => releasePaperLedgerLock(TEST_DIR, token),
      /PAPER_LEDGER_LOCK_RELEASE_ERROR: Nonce mismatch/
    );

    // Tampered lock must remain on disk
    assert.equal(fs.existsSync(lockFile), true);
  });

  it("cleanOrphanTempFiles removes temp files from dead PIDs and preserves in-flight alive PIDs", () => {
    let deadPid = 99997;
    while (isProcessAlive(deadPid)) {
      deadPid--;
    }

    const aliveTemp = path.join(TEST_DIR, `trades.json.tmp-${process.pid}`);
    const deadTemp = path.join(TEST_DIR, `trades.json.tmp-${deadPid}`);

    fs.writeFileSync(aliveTemp, "alive temp", "utf8");
    fs.writeFileSync(deadTemp, "dead temp", "utf8");

    const cleaned = cleanOrphanTempFiles(TEST_DIR);

    assert.equal(cleaned.includes(`trades.json.tmp-${deadPid}`), true);
    assert.equal(fs.existsSync(deadTemp), false, "dead PID temp file must be cleaned");
    assert.equal(fs.existsSync(aliveTemp), true, "alive process temp file must NOT be cleaned");
  });
});
