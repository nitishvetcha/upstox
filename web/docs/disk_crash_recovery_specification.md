# Disk Crash Recovery Specification

**Status:** SPECIFICATION ONLY — not yet implemented.  
**Prerequisite:** This document must be reviewed and approved before modifying `paperEngine.ts` or `paperLedgerStore.ts` for recovery.

---

## 1. Problem Statement

### Current behavior

`paperLedgerStore.ts` uses atomic write via temporary file + rename:

```
writeFileSync(tmpFile, serializedState)   ← if crash here: .tmp-* orphan, .bak survives
renameSync(tmpFile, targetFile)           ← crash-safe only if rename is atomic (POSIX: yes)
```

The `.bak` file is written before the tmp file, so the **last durable snapshot is `.bak`**.

**Failure window:** Between `writeFileSync` and `renameSync`, a crash leaves:
- `targetFile.tmp-<pid>-<ts>` — partial/complete new snapshot (unconfirmed)
- `targetFile.bak` — last durable snapshot (previous state)
- `targetFile` — may or may not exist (was it the first write?)

### What is undefined

On restart, the code does not:
1. Detect orphaned `.tmp-*` files.
2. Choose between `.bak` and `.tmp-*` if the primary file is absent.
3. Replay any events that occurred after the `.bak` was written.

This means any state changes between the `.bak` snapshot and the crash are **silently lost**.

---

## 2. Required Event Schema

Every event appended to the event log must include these fields for recoverable replay:

```typescript
interface RecoverableEvent {
  eventId: string;           // UUID v4, globally unique, stable across retries
  sequenceNumber: number;    // Monotonically increasing per ledger, starting at 1
  eventType: PaperEventType; // Enum — see Section 6 for complete enumeration required
  tradeId: string | null;    // null for ledger-level events (e.g. CAPITAL_RELEASED_GLOBAL)
  timestamp: string;         // ISO 8601
  ledgerVersion: number;     // Snapshot version this event was applied on top of
  payload: unknown;          // Event-type-specific; schema TBD per event type
  checksum?: string;         // Optional SHA-256 of canonical JSON of the above fields
}
```

**Current gap:** The existing event log does not include `eventId`, `sequenceNumber`, or `ledgerVersion`. These fields must be added to every event before recovery can be implemented.

---

## 3. Idempotency Model

An event application function is idempotent if:

```
applyEvent(applyEvent(state, e), e) === applyEvent(state, e)
```

Implementation requirement: each event handler must check whether `e.eventId` is already in `state.appliedEventIds: Set<string>`. If it is, the handler returns `state` unchanged (no-op). If it is not, the handler applies the event and adds `e.eventId` to `appliedEventIds`.

The snapshot must persist `appliedEventIds` so that the set survives restart.

---

## 4. Snapshot / Event-Log Consistency

**Definition:** A snapshot at version `N` is consistent if it contains the result of applying all events with `sequenceNumber ≤ N` to the initial empty state.

**Consistency invariant:** The event log is consistent from version `M` (last snapshot version) to version `N` (latest event) if:
- No sequence number gaps exist in `[M+1, N]`.
- Each event's `ledgerVersion` equals the snapshot version it was applied to.

**Detection of inconsistency:**
- A gap in sequence numbers → event log is corrupt or truncated.
- An event with `ledgerVersion` that does not match the preceding snapshot → out-of-order replay.

---

## 5. Crash Recovery Algorithm

On startup, before loading the ledger into memory:

**Step 1 — Orphan cleanup**  
Scan the ledger directory for files matching `*.tmp-*`. Delete them. The `.bak` file is the last durable state.

**Step 2 — Load last durable snapshot**  
Try to read the primary file (`ledger.json`). If missing or fails JSON parse, read `ledger.json.bak`. If both fail, start from an empty ledger and log a warning.

**Step 3 — Read event log**  
Read all event log entries (JSONL) with `sequenceNumber > snapshot.version`.

**Step 4 — Validate event sequence**  
Check that sequence numbers form a contiguous range `[snapshot.version + 1, N]`. If gaps are found: log the gap, move the corrupt event file to `event_log.jsonl.quarantine-<ts>`, and stop replay at the gap (do not silently skip events after the gap).

**Step 5 — Idempotent replay**  
For each event in sequence order:
- If `event.eventId` is in `snapshot.appliedEventIds`: skip (already applied).
- Otherwise: apply event to in-memory state; add `eventId` to `appliedEventIds`.

**Step 6 — Persist recovered state**  
After replay completes, write a new snapshot at the highest replayed `sequenceNumber`. This collapses the event replay and prevents it from running again on the next restart.

**Step 7 — Unlock for normal operation**  
The ledger is now in a consistent state and accepts new events.

---

## 6. What Is Missing Before Implementation

The following must be specified and documented before any code is written:

### 6.1 Complete event type enumeration

Every event emitted by `paperEngine.ts` must be listed with:
- Its `eventType` string constant.
- Its `payload` schema (exact fields, types, required/optional).
- Its idempotency proof: explain why replaying this event twice produces the same state as replaying it once.

**Known event types (partial — must be completed):**
`PAPER_TRADE_OPENED`, `PAPER_TRADE_CLOSED`, `PAPER_TRADE_REJECTED`, `PAPER_TRADE_UPDATED`, `PAPER_TRADE_SETTLEMENT_PENDING`, `PAPER_TRADE_SETTLED`, `PAPER_TRADE_SETTLEMENT_UNVERIFIED`, `PAPER_QUOTE_UNAVAILABLE`, `PAPER_TRADE_MARK_UPDATED` — additional types may exist; full enumeration required.

### 6.2 Pure vs mutating `applyEvent`

**Decision required:** Should `applyEvent(state, event)` be:
- **Pure** (returns new state object, current state unchanged) — safer, enables undo, easier to test.
- **Mutating** (modifies state in place) — faster, compatible with current engine structure.

The recovery algorithm above assumes pure application. The current engine mutates state.

### 6.3 Schema versioning

If the event schema changes in a future release, older event log entries will not parse correctly. A `schemaVersion` field must be added to both the event log and the snapshot so that a reader can choose the correct deserializer.

### 6.4 `appliedEventIds` set persistence

The snapshot must include a serialized set of all applied `eventId` values. For a long-running ledger this set can grow large. A rolling compaction strategy (snapshot + truncate event log periodically) must be designed.

### 6.5 Concurrency

The current implementation assumes a single writer. If multiple processes or requests can write concurrently, a file lock or process-level mutex is required before this recovery scheme is safe.

---

## 7. Implementation Prerequisites

Before any recovery code is written:

1. ✅ This specification has been reviewed and approved.
2. ☐ All event types are enumerated with payload schemas.
3. ☐ Idempotency proof provided for each event type.
4. ☐ `applyEvent` purity decision made.
5. ☐ Schema versioning strategy agreed.
6. ☐ `appliedEventIds` compaction strategy agreed.
7. ☐ Test suite covering all 7 crash points in the recovery algorithm written and passing.

**Do not modify `paperEngine.ts` or `paperLedgerStore.ts` for recovery until all 7 items are checked.**

---

## 8. What the Current Implementation Guarantees (and Does Not Guarantee)

| Guarantee | Current status |
|-----------|----------------|
| In-memory rollback on persist failure | ✅ Complete — all mutation paths |
| Atomic snapshot rename (POSIX) | ✅ Via `renameSync` |
| Backup (.bak) before overwrite | ✅ Via `copyFileSync` before write |
| Orphan `.tmp-*` cleanup on restart | ❌ Not implemented |
| Event replay after crash | ❌ Not implemented |
| Event log integrity validation | ❌ Not implemented |
| `eventId` for idempotent replay | ❌ Events lack unique IDs |
| Sequence numbers | ❌ Events lack sequence numbers |

The current system **silently loses** in-memory state changes that occurred after the last `.bak` snapshot in the event of a disk crash. In-memory rollback prevents corrupt partial state, but it does not recover lost events.
