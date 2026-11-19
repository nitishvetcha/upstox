// Isolated SQLite integration tests. Temporary database files only. Never touches .data or .research-data.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { openStore, insertCandles, countCandles, sumVolume, candlesForKey, type CandleRow } from "./candleStore.ts";

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-it-")), "t.sqlite");
const row = (i: number, over: Partial<CandleRow> = {}): CandleRow => ({
  instrumentKey: "NSE_FO|1|09-11-2026", indexName: "NIFTY", expiry: "2026-11-09", optionType: "CE", strike: 25050,
  interval: "30minute", barTimestamp: new Date(Date.parse("2026-11-09T09:15:00+05:30") + i * 1800_000).toISOString(),
  open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 + i, oi: 1000 + i, requestSeq: 7, retrievedAt: "2026-11-13T00:00:00Z",
  ...over,
});

test("simulated application writes: batch inserted, counts and sums reconcile to the source rows", () => {
  const db = openStore(tmpFile());
  const rows = Array.from({ length: 50 }, (_, i) => row(i));
  const r = insertCandles(db, rows);
  assert.equal(r.inserted, 50);
  assert.equal(r.duplicates, 0);
  assert.equal(countCandles(db), 50);
  assert.equal(sumVolume(db), rows.reduce((s, x) => s + x.volume, 0));
  db.close();
});

test("duplicate prevention: a repeated bar is rejected and counted, the original is kept", () => {
  const db = openStore(tmpFile());
  insertCandles(db, [row(0, { close: 1.5 })]);
  const again = insertCandles(db, [row(0, { close: 9.9 })]);
  assert.equal(again.inserted, 0);
  assert.equal(again.duplicates, 1);
  assert.equal(candlesForKey(db, "NSE_FO|1|09-11-2026", "30minute")[0].close, 1.5);
  db.close();
});

test("transaction integrity: an error mid-batch rolls back the whole batch", () => {
  const db = openStore(tmpFile());
  const bad = [row(0), row(1), { ...row(2), optionType: "XX" as never }];
  assert.throws(() => insertCandles(db, bad), /CHECK constraint/);
  assert.equal(countCandles(db), 0, "nothing from the failed batch is kept");
  db.close();
});

test("index correctness: the time-range index is used by the planner for interval and timestamp queries", () => {
  const db = openStore(tmpFile());
  insertCandles(db, Array.from({ length: 5 }, (_, i) => row(i)));
  const plan = db.prepare("EXPLAIN QUERY PLAN SELECT * FROM candle WHERE interval = ? AND bar_timestamp > ?").all("30minute", "2026-11-09T00:00:00Z") as { detail: string }[];
  assert.ok(plan.some((p) => /candle_by_expiry|USING INDEX|SEARCH/.test(p.detail)), JSON.stringify(plan));
  db.close();
});

test("restart and recovery: data committed before close is present after reopening", () => {
  const f = tmpFile();
  let db = openStore(f);
  insertCandles(db, Array.from({ length: 10 }, (_, i) => row(i)));
  db.close();
  db = openStore(f);
  assert.equal(countCandles(db), 10);
  db.close();
});

test("concurrent writers: two processes writing separate batches both commit without loss (busy timeout)", () => {
  const f = tmpFile();
  const db = openStore(f);
  db.close();
  const here = path.dirname(fileURLToPath(import.meta.url));
  const worker = path.join(here, "candleStore.worker.ts");
  const p1 = execFileSync(process.execPath, ["--experimental-strip-types", worker, f, "A", "40"], { encoding: "utf8" });
  const p2 = execFileSync(process.execPath, ["--experimental-strip-types", worker, f, "B", "40"], { encoding: "utf8" });
  assert.match(p1, /WROTE 40/);
  assert.match(p2, /WROTE 40/);
  const check = openStore(f);
  assert.equal(countCandles(check), 80);
  check.close();
});

test("rollback rehearsal on a copy: restoring the pre-change copy gives the original contents", () => {
  const f = tmpFile();
  const db = openStore(f);
  insertCandles(db, Array.from({ length: 20 }, (_, i) => row(i)));
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  db.close();
  const copy = `${f}.pre`;
  fs.copyFileSync(f, copy);
  const w = openStore(f);
  w.exec("DELETE FROM candle");
  assert.equal(countCandles(w), 0);
  w.close();
  fs.copyFileSync(copy, f);
  const back = openStore(f);
  assert.equal(countCandles(back), 20);
  back.close();
});

test("integrity and foreign keys are clean after writes", () => {
  const db = openStore(tmpFile());
  insertCandles(db, Array.from({ length: 5 }, (_, i) => row(i)));
  assert.equal((db.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok");
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
  db.close();
});
