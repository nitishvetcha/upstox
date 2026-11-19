# Disk Crash Recovery — Authoritative Implementation Plan

**Date:** 2026-11-03  
**Status:** DESIGN COMPLETE; NOT IMPLEMENTED; ALL D1–D14 DECISIONS BELOW REMAIN PENDING OWNER APPROVAL  
**Safety boundary:** This plan does not authorize code changes, production `.data/` access, recovery, migration, runner startup, or trading.

This document is the single authority for the recovery design, state model, sentinel state machine, quarantine protocol, decision register, and crash-test requirements. Other Round 2 documents summarize or link here and must not redefine these rules.

## 1. Scope and current-code finding

The current `src/lib/services/paperLedgerStore.ts` provides snapshot loading, `.bak` fallback, append-only event writes, a temporary snapshot followed by rename, and fail-closed handling for some corrupt states. It does **not** implement the design in this document: there is no durable sentinel, recovery incident state machine, schema-versioned replay, sequence-numbered event log, crash-safe quarantine protocol, full verification, or fsync discipline. Current `.bak` rotation can overwrite the previous backup before a new snapshot is durably verified. Accordingly, disk crash recovery remains **Blocked**, not Complete.

Protected files for the future engineering phase include `paperLedgerStore.ts`, `paperEngine.ts`, event types, an admin-only reconciliation service/API, and isolated tests. Strategy 11.4 is not involved and must remain untouched.

## 2. Terms and invariants

| Term | Definition |
|---|---|
| `sequenceNumber` | Per-event, 1-based, contiguous integer assigned once by the single durable store writer. |
| `snapshotVersion` | Highest sequence fully represented by a snapshot; 0 for a genuinely new empty ledger. |
| `ledgerVersion` | Snapshot version on which an event was emitted. |
| `lastAppliedSequenceNumber` | Highest contiguous event durably applied to the recovered state. |
| recovery incident | Stable UUID identifying one detected recovery problem through reconciliation. |

Invariants:

1. Uncertain persistence state is never interpreted as first initialization.
2. Recovery never overwrites or rotates away the only known-good copy.
3. Active-log replacement is write-new, fsync, atomic rename, directory fsync; never in-place overwrite.
4. Trading cannot resume because an alert was merely acknowledged.
5. Only a verified, contiguous, schema-valid prefix may become the active log.
6. Every state-changing reconciliation is auditable.

## 3. Authoritative sentinel state machine (D12)

Proposed sentinel: `<ledger-dir>/.ledger-ever-initialized`, containing a schema version, ledger identifier, creation time, and checksum. The exact path and format require owner approval.

| Sentinel | Snapshot/event files | Required behavior |
|---|---|---|
| Absent | All absent | First initialization is permitted only after an exclusive initialization claim succeeds. Create sentinel durably before exposing an operational ledger. |
| Absent | One or more present | Legacy/upgrade state, never first initialization. Enter `RECOVERY_SUSPECT`; perform an approved legacy migration/recovery, or fail closed if it cannot be proven safe. |
| Present and valid | All absent | Historical data loss. Enter `LOCKED_ADMIN_ONLY`; no monitoring based on invented state and no new trades. |
| Present and valid | Valid files present | Run normal validation and recovery. Enter Normal only after all required checks pass. |
| Present but malformed | Any | Enter `LOCKED_ADMIN_ONLY`; fail closed. |
| Present but unreadable | Any | Enter `LOCKED_ADMIN_ONLY`; fail closed. |

### 3.1 Atomic exclusive creation

1. Create a unique temporary file in the ledger directory with exclusive creation (`O_CREAT | O_EXCL`); write complete sentinel content.
2. `fsync` the temporary file, then close it.
3. Atomically claim initialization by creating a fixed claim/lock with `O_CREAT | O_EXCL`. A contender that receives `EEXIST` must re-read and validate state; it must not initialize.
4. Re-check that sentinel, snapshots, and event files are still absent while the claim is held. Any unexpected file changes the path to `RECOVERY_SUSPECT`.
5. Atomically rename the complete temporary file to the sentinel path without replacing an existing sentinel. If the platform cannot provide no-replace rename, use an exclusive fixed-path creation followed by fsync rather than a replacing rename.
6. `fsync` the parent directory.
7. Re-read and validate the sentinel. Only then may creation of the initial snapshot/log proceed using the same durable-write rules.
8. Remove the claim and `fsync` the directory after initialization is durable.

Interrupted temporary files or stale claims are evidence of interrupted initialization. They are quarantined for inspection; their presence is never treated as a clean first run. A stale claim may be cleared only through an age/owner check defined in implementation and only after all ledger artifacts are re-evaluated. Concurrent initializers must yield one winner and all losers must load the winner's durable state.

## 4. Authoritative recovery states and transitions (D11)

| State | Permitted | Prohibited |
|---|---|---|
| Normal operational | Validated reads, monitoring, and normal paper-ledger mutations allowed by existing policy | Any bypass of normal validation |
| `RECOVERY_SUSPECT` | Read artifacts, preserve evidence, validate, build a recovered candidate in a separate path, show diagnostics | New trades, exits/settlements that mutate the uncertain ledger, promotion, deletion/rotation of evidence |
| `RECOVERY_FALLBACK_READONLY` | Read last verified fallback, display/monitor positions without persisting ledger mutations, prepare reconciliation | New trades; ledger mutation; claiming the fallback is complete; automatic promotion or resume |
| `LOCKED_ADMIN_ONLY` | Admin diagnostics, evidence export/backup reference, and an approved reconciliation action | Trading, automated monitoring that assumes positions, ledger mutation, non-admin recovery endpoints |

Transitions:

- startup uncertainty or validation failure → `RECOVERY_SUSPECT`;
- verified fallback available but complete recovery not proven → `RECOVERY_FALLBACK_READONLY`;
- sentinel/data-loss condition, no trustworthy snapshot, both snapshots corrupt, or malformed/unreadable sentinel → `LOCKED_ADMIN_ONLY`;
- `RECOVERY_SUSPECT` → Normal only after full automatic validation proves no loss and no reconciliation is required;
- any recovery state → Normal only through an allowed reconciliation choice that completes successfully and then passes full startup validation;
- failed reconciliation → previous safer state or `LOCKED_ADMIN_ONLY`, never Normal.

Alert acknowledgement records that the alert was seen and changes no recovery state.

### 4.1 Reconciliation choices

| Choice | Allowed from | Preconditions and result |
|---|---|---|
| Verify no open positions and adopt current/recovered state | `RECOVERY_FALLBACK_READONLY`; exceptionally `LOCKED_ADMIN_ONLY` only with an explicit owner-approved policy | Operator supplies evidence and reason; candidate passes full validation; a durable reconciliation event is written; then restart validation may enter Normal. |
| Restore from external backup | Any recovery state | Backup is copied to a separate staging path, provenance/hash recorded, fully validated, and crash-safely promoted without destroying existing evidence; then restart validation may enter Normal. |
| Continue read-only | `RECOVERY_SUSPECT` or `RECOVERY_FALLBACK_READONLY` | State remains non-operational; no resume. In `LOCKED_ADMIN_ONLY`, diagnostics remain admin-only rather than position monitoring. |

The first choice's admissibility from `LOCKED_ADMIN_ONLY` and the required evidence threshold remain owner decisions; the safe default is to disallow it there.

Every attempt must append a durable, immutable reconciliation audit event with: operator identity, reason, UTC timestamp, incident ID, selected action, previous state, result (`STARTED`, `SUCCEEDED`, or `FAILED`), resulting state, and evidence/backup reference plus hashes where applicable. The audit event must itself use write/fsync/directory-fsync discipline and must not contain credentials.

## 5. Backup protection and candidate promotion (D7, D8a, D13)

- Treat active snapshot, `.bak`, full-log backup, quarantines, and external backup as distinct evidence classes.
- Never write recovered output to the active snapshot or `.bak`. Write `*.recovered-<incident>.tmp`, fsync it, rename to `*.recovered-<incident>`, and fsync the directory.
- Verify the recovered candidate independently before promotion.
- Promotion first preserves the current active file under an incident-specific immutable name using copy-to-temp, file fsync, rename, and directory fsync. It must not replace `.bak`.
- Promote the verified candidate with file fsync already complete, atomic rename, and directory fsync. Re-open and verify the promoted file.
- Mark reconciliation successful only after promoted-file verification and a durable audit event.
- `.bak` and incident evidence remain protected until reconciliation succeeds and the retention policy permits rotation. Rotation must first prove at least one other verified recoverable copy exists; otherwise it aborts.
- A crash at any boundary leaves either the old active file or the new verified candidate recoverable, plus protected evidence. Restart uses the incident manifest to resume or roll back safely.

## 6. Crash-safe event-log quarantine (D9, D14)

For the first invalid line/sequence at expected boundary `N`, calculate the byte boundary and SHA-256 of the exact valid prefix before any replacement. Create an incident manifest that records source size/hash, expected final sequence, prefix size/hash, paths, and completed steps.

1. Copy the original full event log to `events.jsonl.full-backup-<incident>.tmp` without altering the source.
2. `fsync` the copy; verify its size and SHA-256 equal the original; rename to the final full-backup path; `fsync` the directory.
3. Write the suspect suffix, including the first suspect line, to `events.jsonl.quarantine-<incident>.tmp`; `fsync`; rename to final quarantine path; `fsync` the directory.
4. Write the valid prefix to `events.jsonl.prefix-<incident>.tmp`; `fsync` it.
5. Re-verify the temporary prefix using §7.
6. Atomically rename the temporary prefix over the active event log; `fsync` the directory.
7. Re-open and verify the active event log using §7.
8. Durably record verification success in the incident manifest/audit log.
9. Delete the full backup only after successful reconciliation and retention approval—not merely after technical verification. If deletion is permitted, unlink it and `fsync` the directory.

No step overwrites the active log in place. A failure preserves the original active log or the full backup. The quarantine suffix is never replayed automatically.

### 6.1 Restart at every crash boundary

| Crash boundary | Required restart behavior |
|---|---|
| During full-backup copy or before its fsync | Active log remains source of truth; discard/quarantine incomplete temp; restart copy. |
| After full-backup fsync, before backup rename/dir fsync | Validate temp/final candidate against manifest; finish durable rename or restart from active log. |
| During suffix write or before suffix fsync/rename | Preserve active and full backup; discard/quarantine incomplete suffix temp; recreate suffix. |
| After suffix is durable, before prefix temp | Recreate prefix from verified full backup. |
| During prefix temp write | Active log is still untouched; discard/quarantine incomplete temp and recreate. |
| After prefix fsync, before active rename | Verify temp; complete rename or recreate from full backup. |
| After rename, before directory fsync | Directory entry is uncertain; inspect active and full backup, verify hashes, then redo a safe promotion. Never assume either version won. |
| After directory fsync, before active verification | Verify active; on failure restore only from verified full backup through the same temp/rename protocol. |
| After verification, before manifest/audit update | Re-run idempotent verification and durably record success. |
| After success record, before permitted backup deletion | Keep backup; deletion can be retried only after reconciliation/retention policy allows it. |
| During/after backup deletion before directory fsync | Reconcile directory state; Normal is allowed only if another verified recoverable copy is proven. |

## 7. Quarantine verification

Verification reads the entire retained prefix and must prove all of the following; one failure rejects promotion:

- every non-empty line parses as JSON and matches the versioned event schema;
- required fields and event-type payload are valid;
- `sequenceNumber` values are integers, start at the expected first sequence, and are contiguous;
- every `eventId` is a valid approved identifier and unique within the prefix and against the base snapshot's retained IDs;
- the final sequence is exactly `N - 1` (or the manifest's explicit expected prefix boundary);
- exact retained bytes have the same length and SHA-256 calculated before replacement;
- replay against the selected base snapshot succeeds and results in the expected `lastAppliedSequenceNumber`;
- the full backup remains present and hash-valid throughout verification.

An empty prefix is valid only when the expected boundary explicitly permits zero retained events; “file exists,” “non-empty,” or “first line parses” is never sufficient.

## 8. Event replay design

Future implementation must use a versioned discriminated event schema and validate before replay. `applyEvent` must be deterministic and idempotent. Sequence ownership is single-writer. Legacy events must be migrated to a new file while preserving the original and detecting deterministic-ID collisions. Unknown schema versions and semantically invalid payloads fail closed. Compaction may happen only after a verified snapshot is durable and must never make the log/snapshot pair lose the only complete history.

## 9. Authoritative synthetic crash-test matrix

All tests use a newly created isolated temporary directory, synthetic fixtures, no `.data/`, no network, and no runtime process.

| ID | Scenario | Required assertion |
|---|---|---|
| R01 | Clean first initialization | One exclusive winner; durable valid sentinel; initial files valid. |
| R02 | Sentinel interrupted creation | Temp/claim causes fail-closed suspect handling; never clean init. |
| R03 | Sentinel malformed | `LOCKED_ADMIN_ONLY`; no writes to evidence. |
| R04 | Sentinel unreadable | `LOCKED_ADMIN_ONLY`; no first-init fallback. |
| R05 | Sentinel absent with legacy data | Legacy recovery/migration or fail closed; never empty init. |
| R06 | Valid sentinel, all ledger files absent | Historical-loss lock. |
| R07 | Concurrent initialization attempts | Exactly one initializes; losers load/re-evaluate; no replacement. |
| R08 | Crash during full-backup creation | Active intact; incomplete temp not trusted; restart succeeds safely. |
| R09 | Crash during suffix quarantine | Full backup retained; suffix recreated. |
| R10 | Crash during temporary prefix creation | Active intact; temp discarded/quarantined; recreated. |
| R11 | Crash after prefix fsync | Verified temp can be promoted idempotently; backup retained. |
| R12 | Crash after rename before directory fsync | Old/new ambiguity resolved by hashes and full backup, fail closed if uncertain. |
| R13 | Crash after directory fsync before verification | Active fully verified before progress. |
| R14 | Corrupt retained event | Verification fails; active/recovered state not accepted. |
| R15 | Sequence gap | Prefix ends exactly before gap; suffix quarantined. |
| R16 | Duplicate event ID | Verification fails even if sequence is contiguous. |
| R17 | Prefix hash mismatch | Verification fails; full backup preserved. |
| R18 | Both snapshots corrupt | `LOCKED_ADMIN_ONLY`; never usable empty ledger. |
| R19 | Valid `.bak` fallback | `RECOVERY_FALLBACK_READONLY`; `.bak` remains protected. |
| R20 | Backup preservation after fallback | Recovery output uses separate candidate; `.bak` bytes/hash unchanged. |
| R21 | Restart after interrupted recovery | Manifest resumes idempotently at every boundary without evidence loss. |
| R22 | Reconciliation acknowledgement only | No state change and no trading resume. |
| R23 | Each of three reconciliation choices | Only allowed origins/preconditions transition; complete audit fields recorded. |
| R24 | Backup rotation with only one good copy | Rotation aborts and copy remains. |
| R25 | Schema-invalid but parseable event | Verification fails and event is quarantined. |
| R26 | Invalid/non-unique event ID | Verification fails. |
| R27 | Final sequence differs from boundary | Verification fails. |

Tests must also cover success replay, already-applied event idempotency, unknown schema version, stale claim handling, recovered-candidate verification, promotion crashes, and audit-log durability.

## 10. Authoritative decision register

Exactly 15 named decisions are active: D1–D11, D8a, D12–D14. D15 is retired and absorbed into D8a. Every item is pending; proposals are not approvals.

| ID | Decision required | Proposed safe choice | Status |
|---|---|---|---|
| D1 | `applyEvent` semantics | Pure deterministic return value | Pending owner approval |
| D2 | Event schema versioning | Required literal version; unknown versions fail closed | Pending owner approval |
| D3 | Legacy migration and ID collision handling | Preserve original; create new migrated log; deterministic IDs with collision stop | Pending owner approval |
| D4 | New event ID generation | `crypto.randomUUID()` once at construction | Pending owner approval |
| D5 | Sequence ownership | Durable store is sole allocator/writer | Pending owner approval |
| D6 | Applied-ID compaction | Compact only with verified snapshot and protected archive | Pending owner approval |
| D7 | Snapshot/log atomicity | Log remains a replayable superset until snapshot verified | Pending owner approval |
| D8 | Concurrency model | Enforced single writer plus exclusive initialization/recovery lock | Pending owner approval |
| D8a | Durability | File fsync before rename/ack; directory fsync after rename/unlink; append fsync | Pending owner approval |
| D9 | Corrupt/truncated/gap handling | Preserve and quarantine from first suspect boundary; fail closed | Pending owner approval |
| D10 | Orphan temporary files | Quarantine, validate, never auto-promote or delete evidence | Pending owner approval |
| D11 | Recovery states and reconciliation | State/transition model in §4; acknowledgement never resumes | Pending owner approval |
| D12 | Sentinel | State machine and exclusive durable creation in §3 | Pending owner approval |
| D13 | Backup protection/promotion | Separate recovered candidate; retain `.bak` through reconciliation | Pending owner approval |
| D14 | Quarantine protocol/verification | Full protocol in §§6–7 | Pending owner approval |

Implementation is blocked until the owner explicitly approves or changes every decision. Approval must identify the decision IDs and chosen alternatives; document publication alone is not approval.

## 11. Engineering-phase acceptance gate

After approval, a separately authorized implementation may proceed only if it: implements the state machine and protocols exactly; adds R01–R27 plus the additional cases above; uses injected paths and synthetic fixtures; proves no `.data/` access; adds no broker calls; leaves Strategy 11.4 byte-identical; and reports exact pass/fail/skip counts. Until then this document is a design, not an implementation claim.
