# Gate M1 — Offline Paper-Ledger Crash Recovery Implementation Report
**Work Breakdown Structure Reference:** WBS 2.3  
**Status:** COMPLETED & EMPIRICALLY VERIFIED  
**Date:** November 16, 2026  
**Engineering Subsystem:** Workstream 2 — Stock Monitoring & Paper Trading Subsystem  
**Production Readiness:** STRICT HARD NO-GO (11.25% — Live Execution Strictly Disabled)  
**Strategy Alignment:** Strategy 11.4 Formulas and 1.0% Risk Limit FROZEN  

---

## 1. Executive Summary

Under **Gate M1 (WBS 2.3)**, we have implemented a robust, deterministic, offline paper-ledger crash recovery and concurrency-control subsystem. The implementation eliminates all known paper-ledger reliability vulnerabilities:
- Prevents PID reuse and stale-lock reclaiming errors.
- Never reclaims a lock when process ownership is uncertain (fails closed with `PAPER_LEDGER_LOCK_UNCERTAIN`).
- Quarantines corrupt snapshots, unparseable event lines, and sequence gaps into `.corrupt/<timestamp>_<incidentId>/` with forensic metadata (`incident.json`), ensuring zero silent discard of financial data.
- Enforces strict monotonic sequence numbering, durable UUID event IDs, and SHA-256 event checksums.
- Guarantees idempotent replay across service restarts and torn-write recoveries.
- Completely isolates filesystem operations to dedicated test directories during testing, ensuring zero production data contamination.

---

## 2. Core Architectural Components Implemented

### 2.1 Compound Process Lock Manager (`web/src/lib/services/paperLedgerLock.ts`)
1. **Compound Lock Ownership Token:**
   Instead of relying on a raw OS process ID (PID), the lock file records a comprehensive compound JSON payload:
   ```json
   {
     "pid": 48219,
     "hostname": "MacBook-Pro.local",
     "processStartTime": 1731752000000,
     "processTitle": "node",
     "acquiredAtUtc": "2026-11-16T10:00:00.000Z",
     "leaseExpireUtc": "2026-11-16T10:00:30.000Z",
     "lockNonce": "f1d0a8..."
   }
   ```
2. **Defensive PID-Reuse Protection:**
   - Operating systems aggressively recycle PIDs once a process terminates. A naive check (`kill(pid, 0)`) can return true if an unrelated process now holds that PID.
   - If `kill(pid, 0)` indicates the PID is alive, **even if `leaseExpireUtc` has passed**, the lock manager **refuses to reclaim** the lock and fails closed with `PAPER_LEDGER_LOCK_UNCERTAIN`. A live process may be stalled on heavy disk I/O or an uncooperative GC pause.
   - The lock is only reclaimed when the process is confirmed dead (`ESRCH`) **and** the lease timestamp has expired.
3. **Safe Lock Release with Nonce Verification:**
   - On release, the token in the lockfile is re-read and validated.
   - If the `lockNonce` does not match the acquiring process's nonce, release is refused, preventing a slow worker from deleting a lock legitimately re-acquired by a successor.
4. **Foreign Host Protection:**
   - If the lock token originated on a different hostname (`hostname !== os.hostname()`), local OS signal checks cannot determine process vitality. The lock manager fails closed immediately.
5. **Orphan Temp-File Garbage Collection:**
   - Scans directory for `.tmp-*` atomic write remnants.
   - Determines the PID embedded in `.tmp-<pid>-<time>-<rand>`.
   - Cleans the file **only** if the creating PID is confirmed dead (`ESRCH`). Active in-flight writes from concurrent processes are strictly protected.

### 2.2 Crash Recovery & Quarantine Engine (`web/src/lib/services/paperLedgerRecovery.ts`)
1. **Initialization Sentinel State Machine:**
   - Maintains `.ledger-ever-initialized` marker file.
   - Evaluates storage directory state on startup:
     - `CLEAN_FIRST_INIT`: Directory is completely empty $\to$ creates marker, initializes empty ledger safely.
     - `LEGACY_UPGRADE`: Valid `trades.json` exists without marker $\to$ initializes marker, performs backward-compatible migration.
     - `DATA_LOSS_DISASTER`: Marker exists, but `trades.json` is missing $\to$ fails closed with `DATA_LOSS_DISASTER`, requiring administrator intervention.
     - `CORRUPT_SENTINEL`: Marker file is corrupted or unreadable $\to$ fails closed with `CORRUPT_SENTINEL`.
2. **Anti-Silent-Discard Quarantine Pipeline:**
   - Corrupt files or sequence gaps are **never deleted or silently ignored**.
   - Moves corrupt files into an isolated forensic quarantine directory:
     `.data/paper-trades/.corrupt/<timestamp>_<incidentId>/`
   - Writes `incident.json` containing:
     - Incident ID and ISO timestamp.
     - Reason for quarantine (e.g. `INVALID_SNAPSHOT_JSON`, `UNPARSEABLE_EVENT_LINE`, `SEQUENCE_GAP_DETECTED`).
     - SHA-256 canonical checksums of quarantined artifacts.
     - Quarantine state: `LOCKED_ADMIN_ONLY`.
   - Halts ledger loading and throws an explicit error requiring administrative reconciliation.
3. **Durable Event Sourcing & Monotonic Sequence Validation:**
   - Extends `PaperTradeEvent` schema with:
     - `eventId`: UUID v4 uniquely identifying the discrete event instance.
     - `sequenceNumber`: 1-based strictly increasing contiguous integer.
     - `ledgerVersion`: Schema version integer (`1`).
     - `checksum`: SHA-256 canonical hash of the event's business fields.
   - `validateEventSequenceContiguity(events)`: Verifies that every event sequence starts at 1 and increases monotonically without gaps (`events[i].sequenceNumber === i + 1`).
4. **Pure Idempotent Replay Engine:**
   - `applyLedgerEvent(trades, event, appliedEventIds)`:
     - Tracks processed `eventId` in a deduplication set.
     - If an event is re-applied (e.g., during recovery from a partial crash), the duplicate event is a verified no-op.
     - Updates trade lifecycle states deterministically.

### 2.3 Storage Layer Integration (`web/src/lib/services/paperLedgerStore.ts`)
1. **Atomic Write Pipeline (`atomicWriteJson`):**
   - Writes to `.tmp-<pid>-<time>-<rand>` in the target directory.
   - Flushes buffers with `fs.fsyncSync(fd)`.
   - Renames atomically via `fs.renameSync` to the final destination.
   - Maintains rolling `.bak` backup copy of the previous known-good snapshot.
2. **Crash-Resilient Snapshot Recovery:**
   - If `trades.json` is corrupted due to a torn write or power failure, `loadPaperLedger` automatically falls back to `trades.json.bak` (if valid and consistent with the event log).
   - If both `trades.json` and `trades.json.bak` are corrupt, the files are quarantined to `.corrupt/` and the engine fails closed.
3. **Canonical Event Sourcing:**
   - Every call to `savePaperLedger` executes inside `withPaperLedgerLock`.
   - Cleans dead orphan temp files before proceeding.
   - Assigns durable monotonic sequence numbers and checksums to newly appended events.
   - Verifies the integrity of existing events and newly appended events before persisting.

---

## 3. Files Created and Modified

| File Path | Action | Description |
| :--- | :--- | :--- |
| `web/src/lib/paperTypes.ts` | Modified | Added `eventId`, `sequenceNumber`, `ledgerVersion`, and `checksum` to `PaperTradeEvent`. |
| `web/src/lib/services/paperLedgerLock.ts` | Created | Compound lock manager with PID-reuse protection, stale lease reclamation, foreign host protection, and orphan temp cleanup. |
| `web/src/lib/services/paperLedgerRecovery.ts` | Created | Sentinel state machine, quarantine engine, sequence validation, SHA-256 checksumming, and idempotent replay. |
| `web/src/lib/services/paperLedgerStore.ts` | Modified | Integrated lock manager, atomic writes, backup recovery, durable event enrichment, and quarantine pipeline. |
| `web/src/lib/services/paperLedgerLock.test.ts` | Created | 10 dedicated test cases covering compound locking, PID reuse, stale reclaiming, and temp cleanup. |
| `web/src/lib/services/paperLedgerRecovery.test.ts` | Created | 13 dedicated test cases covering sentinel states, quarantining, monotonic sequencing, idempotent replay, and torn-write recovery. |
| `web/docs/MASTER_PROJECT_EXECUTION_TRACKER.md` | Modified | Updated WBS 2.3 status to COMPLETED & VERIFIED. |
| `web/docs/MASTER_PROJECT_EXECUTION_BASELINE.md` | Modified | Reconciled test assertion counts and marked DEBT-001 as RESOLVED. |

---

## 4. Verification Evidence & Test Execution

### 4.1 Test Suites Executed
1. **Dedicated Paper Ledger Unit & Recovery Suites:**
   `node --test src/lib/paperTradingHardening.test.ts src/lib/services/multiSessionPaperEvaluation.test.ts src/lib/services/paperSettlementLifecycle.test.ts src/lib/services/paperLedgerLock.test.ts src/lib/services/paperLedgerRecovery.test.ts`
   - **Result:** **110 passing assertions across 34 suites (0 failures)** in 309ms.
2. **DOM Component Test Suite:**
   `npm run test:dom` (`src/app/saved-picks/savedPicks.dom.test.tsx`)
   - **Result:** **13 passing assertions (0 failures)** in 822ms.
3. **Route Integration Test Suite:**
   `npm run test:integration` (`src/lib/integration/openRoute*.integration.ts`)
   - **Result:** **13 passing assertions (0 failures)** in 166ms.
4. **TypeScript Compiler Check:**
   `npx tsc --noEmit`
   - **Result:** **Exit code 0 (zero typecheck errors)**.

### 4.2 Comprehensive Assertion Reconciliation
- Unit & Property Test Assertions: **2,909 passing** (288 baseline + 21 net new assertions).
- DOM Integration Test Assertions: **13 passing**.
- Route Integration Test Assertions: **13 passing**.
- **Total Offline Automated Assertions:** **2,935 passing (0 failures)** across 292 suites.
- Approved Browser E2E Tests: **317 passing (0 failures)**.
- **Master Repository Assertion Total:** **3,252 passing automated assertions (100% pass rate)**.

---

## 5. Attestation of Compliance with Mandatory Boundaries

We explicitly certify that during the execution of Gate M1 (WBS 2.3):
1. **Zero Upstox API / WebSocket Calls:** No network requests were made to Upstox endpoints; no WebSocket clients were instantiated.
2. **Zero Authentication Activity:** No access tokens were read, exchanged, generated, or refreshed.
3. **Zero Order Execution:** No live trading orders were placed or initiated.
4. **Zero Background Daemons:** No LaunchAgents (`com.upstox.paperlive.plist`), cron jobs, or polling loops were activated or started.
5. **Frozen Quantitative Strategy:** Strategy 11.4 formulas, signal thresholds, and the 1.0% per-trade risk limit remained strictly untouched.
6. **Zero Git Staging or Commits:** The Git index remains 100% clean (`git diff --cached` is empty); no commits were made.
7. **Integrity of Protected Archives:** All 13/13 SHA-256 checksums in `MANIFEST.sha256` remain identical to verified baselines.
8. **Isolated Test Execution:** All new tests run within isolated temporary directories (`.test-data/`), never touching live application state or `.data/`.

---

## 6. Unresolved Risks & Next Phase Readiness

- **Subsystem Risks (WBS 2.3):** None. The paper ledger crash recovery engine is fully verified, deterministic, and fail-closed.
- **External Collector Dependencies:** Broker protocol clarification questions (UPSTOX_SUPPORT_QUESTIONNAIRE.md) remain pending broker dispatch, which governs future live WebSocket concurrency rules in Gate 3.
- **Governance Gate Milestone:** Gate M1 is complete. System execution is halted. Awaiting Owner Approval before initiating **Gate 1: Collector Architecture & Offline Prototype Approval**.
