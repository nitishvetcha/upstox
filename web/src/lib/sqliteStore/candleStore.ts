// Isolated SQLite candle store (NOT the active application storage; JSON remains the source of truth).
// Schema follows docs/phase0/DATABASE_MIGRATION_AND_ROLLBACK_PLAN.md section 4. Uses the built-in node:sqlite module.
import { DatabaseSync } from "node:sqlite";

export interface CandleRow {
  instrumentKey: string; indexName: string; expiry: string; optionType: "CE" | "PE"; strike: number;
  interval: string; barTimestamp: string; open: number; high: number; low: number; close: number;
  volume: number; oi: number | null; requestSeq: number; retrievedAt: string;
}

export function openStore(file: string): DatabaseSync {
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;");
  migrate(db);
  return db;
}

export function migrate(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS instrument_contract (
      instrument_key TEXT PRIMARY KEY, index_name TEXT NOT NULL, expiry TEXT NOT NULL,
      option_type TEXT NOT NULL CHECK (option_type IN ('CE','PE')), strike REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS candle (
      instrument_key TEXT NOT NULL REFERENCES instrument_contract(instrument_key),
      interval TEXT NOT NULL, bar_timestamp TEXT NOT NULL,
      open REAL NOT NULL, high REAL NOT NULL, low REAL NOT NULL, close REAL NOT NULL,
      volume INTEGER NOT NULL, oi INTEGER, request_seq INTEGER NOT NULL, retrieved_at TEXT NOT NULL,
      PRIMARY KEY (instrument_key, interval, bar_timestamp)
    );
    CREATE INDEX IF NOT EXISTS candle_by_expiry ON candle(interval, bar_timestamp);
    CREATE INDEX IF NOT EXISTS contract_by_expiry ON instrument_contract(index_name, expiry);
  `);
  db.prepare("INSERT OR IGNORE INTO schema_version VALUES (1, ?)").run(new Date().toISOString());
}

// Writes a batch in one transaction. A duplicate bar (same key and timestamp) is rejected and counted, never overwritten.
// Any other error rolls the whole batch back.
export function insertCandles(db: DatabaseSync, rows: CandleRow[]): { inserted: number; duplicates: number } {
  // ON CONFLICT DO NOTHING ignores only duplicate keys. (INSERT OR IGNORE would also hide CHECK violations.)
  const insContract = db.prepare("INSERT INTO instrument_contract VALUES (?, ?, ?, ?, ?) ON CONFLICT(instrument_key) DO NOTHING");
  const insCandle = db.prepare("INSERT INTO candle VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  let inserted = 0, duplicates = 0;
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const r of rows) {
      insContract.run(r.instrumentKey, r.indexName, r.expiry, r.optionType, r.strike);
      try {
        insCandle.run(r.instrumentKey, r.interval, r.barTimestamp, r.open, r.high, r.low, r.close, r.volume, r.oi, r.requestSeq, r.retrievedAt);
        inserted++;
      } catch (e) {
        if (/UNIQUE constraint failed/.test((e as Error).message)) duplicates++;
        else throw e;
      }
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return { inserted, duplicates };
}

export function countCandles(db: DatabaseSync): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM candle").get() as { n: number }).n;
}

export function sumVolume(db: DatabaseSync): number {
  return (db.prepare("SELECT COALESCE(SUM(volume),0) AS s FROM candle").get() as { s: number }).s;
}

export function candlesForKey(db: DatabaseSync, key: string, interval: string): { bar_timestamp: string; close: number }[] {
  return db.prepare("SELECT bar_timestamp, close FROM candle WHERE instrument_key = ? AND interval = ? ORDER BY bar_timestamp").all(key, interval) as { bar_timestamp: string; close: number }[];
}
