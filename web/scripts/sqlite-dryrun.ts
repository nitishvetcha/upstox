// SQLite dry run: backup copy, manifest, dry-run import into a SEPARATE database, reconciliation, integrity and rollback rehearsal.
// Reads originals only to copy them. Never modifies or deletes any JSON/JSONL/CSV source. Never switches the application.
// Usage: node --experimental-strip-types scripts/sqlite-dryrun.ts
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = path.join(root, ".research-data", "migration-backup", stamp);
const dryDir = path.join(root, ".research-data", "migration-dryrun");
const dbPath = path.join(dryDir, "dryrun.sqlite");
const reportPath = path.join(root, "docs", "phase0", "SQLITE_DRYRUN_REPORT.json");

const sha = (file: string) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

// 1. Backup: copy the files in scope, then re-hash the copies and compare with the originals.
const sources = [
  ".research-data/historical-pilot-raw/candles.csv",
  "docs/phase0/historical-pilot-acquisition-log.json",
  "docs/phase0/historical-coverage-probe.json",
  "docs/phase0/historical-expired-probe.json",
  ...fs.readdirSync(path.join(root, ".research-data", "rate-limit-test")).map((f) => `.research-data/rate-limit-test/${f}`),
];
fs.mkdirSync(backupDir, { recursive: true });
const manifest: { file: string; bytes: number; sha256: string; copySha256: string }[] = [];
for (const rel of sources) {
  const src = path.join(root, rel);
  const dst = path.join(backupDir, rel.replace(/[\\/]/g, "__"));
  const before = sha(src);
  fs.copyFileSync(src, dst);
  const copy = sha(dst);
  if (copy !== before) throw new Error(`backup copy hash mismatch: ${rel}`);
  manifest.push({ file: rel, bytes: fs.statSync(src).size, sha256: before, copySha256: copy });
}
fs.writeFileSync(path.join(backupDir, "manifest.json"), JSON.stringify(manifest, null, 2));

// 2. Dry-run database (separate file). Schema per DATABASE_MIGRATION_AND_ROLLBACK_PLAN.md section 4.
fs.mkdirSync(dryDir, { recursive: true });
if (fs.existsSync(dbPath)) fs.rmSync(dbPath); // dry-run file only, never an original
const db = new DatabaseSync(dbPath);
db.exec(`
PRAGMA foreign_keys = ON;
CREATE TABLE migration_log (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL, script_sha256 TEXT NOT NULL);
CREATE TABLE instrument_contract (
  instrument_key TEXT PRIMARY KEY, index_name TEXT NOT NULL, expiry TEXT NOT NULL, option_type TEXT NOT NULL, strike REAL NOT NULL
);
CREATE TABLE candle (
  instrument_key TEXT NOT NULL REFERENCES instrument_contract(instrument_key),
  interval TEXT NOT NULL, bar_timestamp TEXT NOT NULL,
  open REAL NOT NULL, high REAL NOT NULL, low REAL NOT NULL, close REAL NOT NULL,
  volume INTEGER NOT NULL, oi INTEGER, request_seq INTEGER NOT NULL, retrieved_at TEXT NOT NULL,
  quality_status TEXT NOT NULL,
  PRIMARY KEY (instrument_key, interval, bar_timestamp, request_seq)
);
CREATE INDEX candle_by_time ON candle(instrument_key, interval, bar_timestamp);
`);
const scriptSha = sha(path.join(root, "scripts", "sqlite-dryrun.ts"));
db.prepare("INSERT INTO migration_log VALUES ('v1-dryrun', ?, ?)").run(new Date().toISOString(), scriptSha);

// 3. Import candles.csv: quarantine any row that fails to parse; never skip silently.
const csv = fs.readFileSync(path.join(backupDir, ".research-data__historical-pilot-raw__candles.csv"), "utf8").trim().split("\n");
const header = csv.shift()!.split(",");
const col = (name: string) => header.indexOf(name);
const quarantine: { line: number; reason: string }[] = [];
const insContract = db.prepare("INSERT OR IGNORE INTO instrument_contract VALUES (?, ?, ?, ?, ?)");
const insCandle = db.prepare("INSERT INTO candle VALUES (?, '30minute', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')");
let parsed = 0, inserted = 0, dupes = 0;
const srcVolume = { sum: 0, rows: 0 }, srcClose = { sum: 0 };
db.exec("BEGIN");
csv.forEach((line, i) => {
  const c = line.split(",");
  const v = (n: string) => c[col(n)];
  const row = {
    index: v("index"), expiry: v("expiry"), type: v("type"), strike: Number(v("strike")),
    key: v("expired_instrument_key"), seq: Number(v("request_seq")), retrieved: v("retrieved_at"),
    ts: v("bar_timestamp"), o: Number(v("open")), h: Number(v("high")), l: Number(v("low")), cl: Number(v("close")),
    vol: Number(v("volume")), oi: v("oi") === "" ? null : Number(v("oi")),
  };
  const bad = [row.key, row.ts, row.retrieved].some((s) => !s) || [row.o, row.h, row.l, row.cl, row.vol, row.strike, row.seq].some((n) => Number.isNaN(n));
  if (bad) { quarantine.push({ line: i + 2, reason: "unparseable field" }); return; }
  parsed++;
  srcVolume.sum += row.vol; srcVolume.rows++; srcClose.sum += row.cl;
  insContract.run(row.key, row.index, row.expiry, row.type, row.strike);
  try {
    insCandle.run(row.key, row.ts, row.o, row.h, row.l, row.cl, row.vol, row.oi, row.seq, row.retrieved);
    inserted++;
  } catch (e) {
    if (/UNIQUE/.test((e as Error).message)) dupes++; else throw e;
  }
});
db.exec("COMMIT");
db.exec("UPDATE candle SET quality_status = CASE WHEN oi IS NULL THEN 'OI_MISSING' WHEN oi = 0 THEN 'OI_ZERO' ELSE 'OK' END");

// 4. Reconciliation: row counts and numeric sums against the source file.
const srcLines = csv.length;
const dbRows = (db.prepare("SELECT COUNT(*) AS n FROM candle").get() as { n: number }).n;
const dbVol = (db.prepare("SELECT SUM(volume) AS s FROM candle").get() as { s: number }).s;
const dbClose = (db.prepare("SELECT SUM(close) AS s FROM candle").get() as { s: number }).s;
const recon = {
  sourceDataLines: srcLines, parsed, quarantined: quarantine.length, inserted, duplicatesRejected: dupes,
  dbRows, rowCountMatches: dbRows === inserted && inserted + dupes + quarantine.length === srcLines,
  sumVolumeSource: srcVolume.sum, sumVolumeDb: dbVol, volumeMatches: Math.abs(srcVolume.sum - dbVol) < 1e-6,
  sumCloseSource: Number(srcClose.sum.toFixed(6)), sumCloseDb: Number((dbClose ?? 0).toFixed(6)),
  closeMatches: Math.abs(srcClose.sum - (dbClose ?? 0)) < 1e-6,
};

// 5. Integrity and foreign keys.
const integrity = (db.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check;
const fkViolations = db.prepare("PRAGMA foreign_key_check").all().length;
const statusCounts = db.prepare("SELECT quality_status AS s, COUNT(*) AS n FROM candle GROUP BY quality_status").all();
db.close();

// 6. Rollback rehearsal on a COPY: change the copy, restore it from the pre-rehearsal copy, prove identical bytes.
const pre = path.join(dryDir, "dryrun.pre-rehearsal.sqlite");
const work = path.join(dryDir, "dryrun.rehearsal.sqlite");
fs.copyFileSync(dbPath, pre);
fs.copyFileSync(pre, work);
const r = new DatabaseSync(work);
r.exec("DELETE FROM candle WHERE rowid IN (SELECT rowid FROM candle LIMIT 100)");
r.close();
const changedSha = sha(work);
fs.copyFileSync(pre, work); // rollback = restore the verified pre-rehearsal copy
const rollback = { changedHashDiffers: changedSha !== sha(pre), restoredHashMatches: sha(work) === sha(pre) };
fs.rmSync(work);

const report = {
  generatedAt: new Date().toISOString(), backupDir: path.relative(root, backupDir), backupFiles: manifest.length,
  backupAllCopiesVerified: manifest.every((m) => m.sha256 === m.copySha256),
  dryRunDb: path.relative(root, dbPath), dryRunDbSha256: sha(dbPath),
  reconciliation: recon, quarantine: quarantine.slice(0, 20), quarantineTotal: quarantine.length,
  qualityStatusCounts: statusCounts, integrityCheck: integrity, foreignKeyViolations: fkViolations, rollbackRehearsal: rollback,
  scriptSha256: scriptSha,
  note: "Dry run only. Application storage NOT switched. JSON and JSONL sources untouched.",
};
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
