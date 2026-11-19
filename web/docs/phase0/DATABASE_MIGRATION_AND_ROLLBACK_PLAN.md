# Persistent database: assessment, migration and rollback plan

Status: **plan only. No storage has been changed.** Existing JSON and JSONL data is preserved in place until the owner approves migration.

## 1. Current storage (verified)

- No database library in `package.json`. All state is JSON, JSON-lines and binary files under `.data/` (about 2.3 GB) and `.research-data/` (about 2.4 GB).
- Recent writes use write-once rules (`flag: "wx"`) in the new evidence and runner modules. Older modules write whole files.
- There are no indexes, no migrations and no referential checks. Queries scan files.
- Risk: a partial write can leave a file truncated. No integrity check runs on startup.

## 2. Why a database is worth considering

- Indexed lookups for contracts, expiries, bars and signals.
- Transactional writes, so partial updates cannot leave inconsistent state.
- Schema versioning and migrations.
- Provenance columns (source, retrieval time, exchange time, quality status) enforced by the schema.

## 3. Options

| Option | Pros | Cons |
|---|---|---|
| SQLite (embedded, single file) | No server; transactional; fits a single-user local app; easy backup as one file | Single writer; large raw blobs are better kept outside it |
| Postgres (server) | Strong concurrency and tooling | Needs a running service; more operations overhead |
| Keep JSON files, add integrity checks only | No migration risk | No indexes; no transactions; does not meet the completion requirement |

**Recommendation:** SQLite for structured tables (contracts, bars metadata, signals, trades, audit events), with large raw responses kept as files referenced by SHA-256 from the database. Postgres is not needed for a single-user local application. Final choice is the owner's.

## 4. Schema outline (proposed, not created)

- `instrument_contract` (instrument key, underlying, expiry, strike, option type, lot size, source, retrieved at).
- `candle` (instrument key, interval, bar timestamp, OHLC, volume, OI, source, retrieved at, quality status). Unique on (instrument key, interval, bar timestamp).
- `snapshot_quote` (later, for live evidence): instrument key, snapshot time, bid/ask price and quantity, depth, quote time, source.
- `signal`, `trade`, `execution_event`, `audit_event`: append-only, with a unique key on each trade's identifier.
- `migration_log`: version, applied at, checksum of the migration script.

Indexes: (instrument key, interval, timestamp); (underlying, expiry); (signal time); (trade id) unique.

## 5. Migration procedure (proposed)

1. **Freeze.** Stop every writer (no collectors, no scheduler, no paper-live job, no dashboard refresh that writes). Confirm `launchctl list` shows no Upstox job.
2. **Backup.** Copy `.data/` and `.research-data/` to a backup directory outside the project, with a manifest of file names, sizes and SHA-256. Verify the copy by re-hashing a sample and comparing totals.
3. **Import dry run.** Build the database in a separate file. Import from the backup copy only. Record row counts per source file and reject any file that fails to parse (quarantine list, not silent skip).
4. **Reconcile.** For every source file, confirm the imported row count equals the parsed line count. Confirm sums of key numeric fields match.
5. **Integrity check.** Run SQLite `PRAGMA integrity_check` and foreign-key checks.
6. **Owner review** of the reconciliation report.
7. **Switch.** Only after approval, point the application at the new database. Keep the JSON files untouched and read-only.
8. **Monitor.** Compare new writes against the JSON files for a defined period before retiring any JSON writer.

## 6. Rollback procedure

- **Trigger:** any reconciliation failure, integrity failure, or a defect found after switch.
- **Action:** set the application back to reading and writing the JSON files. The JSON files were never modified, so no restore is needed.
- **Database handling:** keep the failed database file for analysis; do not delete it.
- **Verification:** re-run the full regression suite and confirm the JSON-backed dashboard values match the pre-migration record.
- **Backup restore:** only if the JSON files themselves are found damaged. Restore from the verified backup, then re-hash against the manifest.

## 7. What is required before implementation

1. Owner approval of SQLite (or another option).
2. A dry-run import against the backup, with reconciliation report.
3. A rollback rehearsal on a copy.
4. Confirmation of disk space (about 5 GB free beyond the current data, since the backup and the database both exist during migration).

## 7a. Dry-run result (2026-11-13)

Scope: the 4,859-bar historical pilot candle file plus the 35-request rate-limit test output and the probe logs (75 files). Run with `node --experimental-strip-types scripts/sqlite-dryrun.ts`. Full report: `docs/phase0/SQLITE_DRYRUN_REPORT.json`.

- **Backup:** 75 files copied to `.research-data/migration-backup/<timestamp>/`. Every copy re-hashed equal to its original. Manifest written.
- **Dry-run database:** `.research-data/migration-dryrun/dryrun.sqlite`, separate from all sources.
- **Import:** 4,859 parsed, 4,859 inserted, 0 quarantined, 0 duplicates rejected.
- **Reconciliation:** row count matches (4,859 = 4,859). Sum of volume matches (17,924,841,865). Sum of close matches (1,955,265.74).
- **Integrity:** `PRAGMA integrity_check` returns ok. Foreign-key violations: 0.
- **Quality status:** 4,700 OK, 159 OI_ZERO. No OI_MISSING.
- **Rollback rehearsal:** on a copy, 100 rows were deleted. The copy was then restored from the verified pre-rehearsal copy, and the restored file's hash matched the pre-rehearsal hash.

Not done: the application still reads and writes JSON. No switch has been made. The owner must review this report before any switch is requested.

## 8. Risks

- Migration could mis-parse legacy JSON. Mitigated by quarantine and reconciliation.
- Two sources of truth during the transition. Mitigated by a single writer at any time.
- The research data is large; import time is unknown until a dry run.
