import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";

export interface PaperLedgerLockToken {
  pid: number;
  hostname: string;
  processStartTime: number;
  processTitle: string;
  acquiredAtUtc: string;
  leaseExpireUtc: string;
  lockNonce: string;
}

export interface LockOptions {
  leaseMs?: number;
  lockFilename?: string;
}

const DEFAULT_LEASE_MS = 15000;
const DEFAULT_LOCK_FILENAME = ".paper-ledger.lock";

/**
 * Checks whether a process with the given PID is currently alive on the local OS.
 * Returns true if the process is running, false if definitely dead (ESRCH).
 */
export function isProcessAlive(pid: number): boolean {
  if (pid <= 0 || !Number.isInteger(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ESRCH") return false; // No such process
    if (code === "EPERM") return true; // Process exists but owned by different user
    return false;
  }
}

/**
 * Returns the lock file path for a given ledger directory.
 */
export function getLockFilePath(dir: string, lockFilename = DEFAULT_LOCK_FILENAME): string {
  return path.join(dir, lockFilename);
}

/**
 * Attempts to parse an existing lock file.
 * Returns the parsed token, or null if the file is unreadable/invalid.
 */
export function readLockToken(lockPath: string): PaperLedgerLockToken | null {
  if (!fs.existsSync(lockPath)) return null;
  try {
    const raw = fs.readFileSync(lockPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<PaperLedgerLockToken>;
    if (
      typeof parsed.pid === "number" &&
      typeof parsed.hostname === "string" &&
      typeof parsed.lockNonce === "string" &&
      typeof parsed.leaseExpireUtc === "string"
    ) {
      return parsed as PaperLedgerLockToken;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Acquires an exclusive, compound lock on the paper ledger directory.
 * Defends against:
 * 1. Concurrent writes by another process.
 * 2. PID-reuse / PID recycling hazards: never reclaims a lock when PID is alive.
 * 3. Stale locks: safely reclaims ONLY if PID is definitively dead (ESRCH) AND lease is expired.
 * 4. Uncertain ownership: fails closed when lock state cannot be proven.
 */
export function acquirePaperLedgerLock(
  dir: string,
  options: LockOptions = {}
): PaperLedgerLockToken {
  fs.mkdirSync(dir, { recursive: true });
  const lockFilename = options.lockFilename ?? DEFAULT_LOCK_FILENAME;
  const lockPath = path.join(dir, lockFilename);
  const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;

  const now = Date.now();
  const token: PaperLedgerLockToken = {
    pid: process.pid,
    hostname: os.hostname(),
    processStartTime: now - Math.floor(process.uptime() * 1000),
    processTitle: process.title || "node",
    acquiredAtUtc: new Date(now).toISOString(),
    leaseExpireUtc: new Date(now + leaseMs).toISOString(),
    lockNonce: crypto.randomUUID(),
  };

  try {
    // Atomic exclusive creation via flag 'wx': fails with EEXIST if lock already exists
    fs.writeFileSync(lockPath, JSON.stringify(token, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    return token;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "EEXIST") {
      throw new Error(`PAPER_LEDGER_LOCK_ERROR: Failed to create lock file at ${lockPath}: ${(err as Error).message}`);
    }

    // Lock file already exists. Inspect ownership and validity.
    const existing = readLockToken(lockPath);
    if (!existing) {
      // Unparseable or corrupt lock file.
      // Strict rule: "never reclaim a lock when ownership is uncertain; fail closed"
      throw new Error(
        `PAPER_LEDGER_LOCK_UNCERTAIN: Lock file ${lockPath} exists but contains unparseable or incomplete token. Refusing to reclaim; manual reconciliation required.`
      );
    }

    // Check if owned by different host
    if (existing.hostname !== os.hostname()) {
      throw new Error(
        `PAPER_LEDGER_LOCK_HELD: Lock is held by remote host "${existing.hostname}" (PID ${existing.pid}). Cannot evaluate remote process state; manual reconciliation required.`
      );
    }

    // Check if owned by current process (re-entrant check)
    if (existing.pid === process.pid && existing.lockNonce === token.lockNonce) {
      return existing;
    }

    const isAlive = isProcessAlive(existing.pid);
    const leaseExpired = Date.now() > new Date(existing.leaseExpireUtc).getTime();

    if (isAlive) {
      // Process is alive!
      if (!leaseExpired) {
        throw new Error(
          `PAPER_LEDGER_LOCK_HELD: Active process (PID ${existing.pid}) holds ledger lock until ${existing.leaseExpireUtc}.`
        );
      }
      // CRITICAL REQUIREMENT: Lease is expired, BUT process with PID is still alive.
      // This is either PID reuse (an unrelated new process has taken that PID) or a frozen process.
      // Rule: "Prevent PID-reuse and stale-lock errors; never reclaim a lock when ownership is uncertain."
      throw new Error(
        `PAPER_LEDGER_LOCK_UNCERTAIN: Lock lease expired at ${existing.leaseExpireUtc}, but PID ${existing.pid} is still alive on ${existing.hostname}. Cannot verify whether PID was recycled by the OS; refusing to reclaim lock. Manual reconciliation required.`
      );
    }

    // Process is DEFINITIVELY DEAD (isAlive === false, ESRCH confirmed).
    if (!leaseExpired) {
      // Process died but lease has not expired yet.
      // Fail closed until lease expires to avoid race conditions.
      throw new Error(
        `PAPER_LEDGER_LOCK_HELD: Process (PID ${existing.pid}) is absent, but lease remains active until ${existing.leaseExpireUtc}. Awaiting lease expiration before reclamation.`
      );
    }

    // Safe to reclaim: Process is confirmed DEAD and lease is EXPIRED.
    try {
      const doubleCheck = readLockToken(lockPath);
      if (doubleCheck && doubleCheck.lockNonce === existing.lockNonce) {
        fs.unlinkSync(lockPath);
      } else {
        throw new Error("Lock token changed during reclamation attempt; race condition detected.");
      }
    } catch (reclaimErr) {
      throw new Error(
        `PAPER_LEDGER_LOCK_RECLAIM_FAILED: Could not safely remove stale lock from dead PID ${existing.pid}: ${(reclaimErr as Error).message}`
      );
    }

    // Retry acquisition once after safe reclamation of dead PID
    fs.writeFileSync(lockPath, JSON.stringify(token, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    return token;
  }
}

/**
 * Releases a previously acquired lock, ensuring the disk token matches the caller's nonce.
 */
export function releasePaperLedgerLock(
  dir: string,
  token: PaperLedgerLockToken,
  lockFilename = DEFAULT_LOCK_FILENAME
): void {
  const lockPath = path.join(dir, lockFilename);
  if (!fs.existsSync(lockPath)) return;

  const current = readLockToken(lockPath);
  if (!current) {
    throw new Error(
      `PAPER_LEDGER_LOCK_RELEASE_ERROR: Cannot release lock at ${lockPath}: token is unparseable or corrupted.`
    );
  }

  if (current.lockNonce !== token.lockNonce) {
    throw new Error(
      `PAPER_LEDGER_LOCK_RELEASE_ERROR: Nonce mismatch. Current: ${current.lockNonce}, caller: ${token.lockNonce}. Refusing to delete lock owned by another process.`
    );
  }

  fs.unlinkSync(lockPath);
}

/**
 * Scans a ledger directory for orphaned temporary files (*.tmp-*) left by crashed processes.
 * Cleans up only temporary write files (*.tmp-*) whose PID is dead, never in-flight files of alive processes.
 */
export function cleanOrphanTempFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const cleaned: string[] = [];
  const entries = fs.readdirSync(dir);
  for (const name of entries) {
    if (name.includes(".tmp-") || name.endsWith(".tmp")) {
      const match = name.match(/\.tmp-(\d+)/);
      if (match) {
        const pid = parseInt(match[1]!, 10);
        if (isProcessAlive(pid)) {
          // Process is currently alive; leave in-flight temp file alone
          continue;
        }
      }
      const fullPath = path.join(dir, name);
      try {
        fs.unlinkSync(fullPath);
        cleaned.push(name);
      } catch {
        // Leave unremovable temp files for investigation
      }
    }
  }
  return cleaned;
}

/**
 * Executes an operation with guaranteed exclusive lock acquisition and release.
 */
export function withPaperLedgerLock<T>(
  dir: string,
  fn: (token: PaperLedgerLockToken) => T,
  options: LockOptions = {}
): T {
  const token = acquirePaperLedgerLock(dir, options);
  try {
    return fn(token);
  } finally {
    try {
      releasePaperLedgerLock(dir, token, options.lockFilename);
    } catch (releaseErr) {
      console.error("Lock release error:", (releaseErr as Error).message);
    }
  }
}
