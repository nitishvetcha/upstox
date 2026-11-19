import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pruneRunFiles } from "./runLogRetention.ts";

function dirWith(names: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "run-retention-"));
  for (const n of names) fs.writeFileSync(path.join(dir, n), "{}");
  return dir;
}

test("keeps exactly the newest 200 run files and deletes the oldest", () => {
  const runs = Array.from({ length: 205 }, (_, i) => `mon_${1_000 + i}_abc.json`);
  const dir = dirWith(runs);
  pruneRunFiles(dir, "mon_");
  const left = fs.readdirSync(dir).sort();
  assert.equal(left.length, 200);
  assert.ok(!left.includes("mon_1000_abc.json"), "oldest removed");
  assert.ok(!left.includes("mon_1004_abc.json"), "fifth-oldest removed");
  assert.ok(left.includes("mon_1005_abc.json"), "sixth-oldest kept");
  assert.ok(left.includes("mon_1204_abc.json"), "newest kept");
});

test("ordering is by the millisecond timestamp, not by file name", () => {
  // "mon_9_" sorts after "mon_10_" as text, but 9 ms is older than 10 ms.
  const dir = dirWith(["mon_9_aaa.json", "mon_10_aaa.json"]);
  pruneRunFiles(dir, "mon_", 1);
  assert.deepEqual(fs.readdirSync(dir), ["mon_10_aaa.json"]);
});

test("files that are not run files are never deleted", () => {
  const others = ["notes.txt", "run_1_api.json", "mon_custom.json", "mon_1_abc.json.bak", "mon_1_abc.json.tmp-9"];
  const dir = dirWith([...others, "mon_1_abc.json", "mon_2_abc.json"]);
  pruneRunFiles(dir, "mon_", 1);
  const left = fs.readdirSync(dir).sort();
  for (const o of others) assert.ok(left.includes(o), `${o} must survive`);
  assert.ok(left.includes("mon_2_abc.json"));
  assert.ok(!left.includes("mon_1_abc.json"));
});

test("a missing directory is not an error", () => {
  assert.doesNotThrow(() => pruneRunFiles(path.join(os.tmpdir(), "no-such-dir-xyz"), "run_"));
});

test("under the limit nothing is deleted", () => {
  const dir = dirWith(["run_1_api.json", "run_2_api.json"]);
  pruneRunFiles(dir, "run_", 200);
  assert.equal(fs.readdirSync(dir).length, 2);
});

// ── Newest LIVE collection kept beyond the cap ───────────────────────────────

// Writes run files with a sourceStatus, so the predicate can read it. Ids are <ms>_api, as the collector writes them.
function runsWithStatus(entries: [number, string][]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "run-live-"));
  for (const [at, status] of entries) {
    fs.writeFileSync(path.join(dir, `run_${at}_api.json`), JSON.stringify({ sourceStatus: status }));
  }
  return dir;
}
const isLive = (file: string) => (JSON.parse(fs.readFileSync(file, "utf8")) as { sourceStatus: string }).sourceStatus === "LIVE";

test("newest LIVE inside the newest 200: exactly 200 kept", () => {
  // 210 runs; the LIVE one is at index 5 (newest 200 cover it), older ones are MOCK.
  const entries: [number, string][] = Array.from({ length: 210 }, (_, i) => [1_000 + i, i === 204 ? "LIVE" : "MOCK"]);
  const dir = runsWithStatus(entries);
  pruneRunFiles(dir, "run_", 200, isLive);
  assert.equal(fs.readdirSync(dir).length, 200);
});

test("newest LIVE older than the newest 200: 201 kept, and that LIVE file is the one kept", () => {
  // Newest 210 runs: index 0..209 by age. LIVE is the 10th-newest from the bottom: at ms 1_005 (oldest-but-some).
  const entries: [number, string][] = Array.from({ length: 260 }, (_, i) => [1_000 + i, i === 5 ? "LIVE" : "MOCK"]);
  const dir = runsWithStatus(entries);
  pruneRunFiles(dir, "run_", 200, isLive);
  const left = fs.readdirSync(dir).sort();
  assert.equal(left.length, 201);
  assert.ok(left.includes("run_1005_api.json"), "the newest LIVE, outside the newest 200, is kept");
  assert.ok(left.includes("run_1060_api.json"), "newest 200 kept");
});

test("no LIVE file at all: only the newest 200 are kept", () => {
  const dir = runsWithStatus(Array.from({ length: 260 }, (_, i) => [1_000 + i, "MOCK"]));
  pruneRunFiles(dir, "run_", 200, isLive);
  assert.equal(fs.readdirSync(dir).length, 200);
});

test("older LIVE files do not displace the newest LIVE file", () => {
  // Two LIVE files outside the newest 200: at 1_010 and 1_020. Only the newer (1_020) is kept.
  const entries: [number, string][] = Array.from({ length: 260 }, (_, i) => [1_000 + i, i === 10 || i === 20 ? "LIVE" : "MOCK"]);
  const dir = runsWithStatus(entries);
  pruneRunFiles(dir, "run_", 200, isLive);
  const left = fs.readdirSync(dir).sort();
  assert.equal(left.length, 201);
  assert.ok(left.includes("run_1020_api.json"), "newest LIVE kept");
  assert.ok(!left.includes("run_1010_api.json"), "older LIVE not kept");
});

test("non-LIVE sources (EOD, STALE, MOCK) are never kept as LIVE", () => {
  const entries: [number, string][] = Array.from({ length: 260 }, (_, i) => [1_000 + i, i === 5 ? "END_OF_DAY" : i === 6 ? "STALE" : "MOCK"]);
  const dir = runsWithStatus(entries);
  pruneRunFiles(dir, "run_", 200, isLive);
  assert.equal(fs.readdirSync(dir).length, 200);
});

test("unreadable or unrelated files beside the LIVE check are untouched", () => {
  const entries: [number, string][] = Array.from({ length: 260 }, (_, i) => [1_000 + i, i === 5 ? "LIVE" : "MOCK"]);
  const dir = runsWithStatus(entries);
  fs.writeFileSync(path.join(dir, "notes.txt"), "keep");
  fs.writeFileSync(path.join(dir, "run_1_api.json.bak"), "keep");
  pruneRunFiles(dir, "run_", 200, (f) => { try { return isLive(f); } catch { return false; } });
  const left = fs.readdirSync(dir);
  assert.ok(left.includes("notes.txt") && left.includes("run_1_api.json.bak"));
});
