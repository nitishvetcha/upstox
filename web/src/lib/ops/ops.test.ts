import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readJsonl } from "./jsonl.ts";
import { deriveRunnerState, redact, logTail, runnerStatus } from "./opsStatus.ts";
import { auditReport } from "../optionsAuditReport.ts";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "ops-"));

test("JSONL: missing file, malformed and truncated lines are counted, never thrown", () => {
  const d = tmp();
  assert.deepEqual(readJsonl(path.join(d, "nope.jsonl")), { records: [], malformed: 0, missing: true });
  fs.writeFileSync(path.join(d, "a.jsonl"), '{"a":1}\nnot json\n\n{"b":2}\n{"c":');
  const r = readJsonl(path.join(d, "a.jsonl"));
  assert.equal(r.records.length, 2);
  assert.equal(r.malformed, 2);
});

test("runner state needs real evidence: a reachable UI is not a running collector", () => {
  const now = new Date("2026-10-26T05:00:00Z");
  assert.equal(deriveRunnerState({ lockPidAlive: false, market: "OPEN", lastCollectionAt: null, now }).state, "NOT_RUNNING");
  assert.equal(deriveRunnerState({ lockPidAlive: true, market: "OPEN", lastCollectionAt: "2026-10-26T04:50:00Z", now }).state, "STALLED", "10 min old");
  assert.equal(deriveRunnerState({ lockPidAlive: true, market: "OPEN", lastCollectionAt: "2026-10-26T04:59:30Z", now }).state, "RUNNING");
  assert.equal(deriveRunnerState({ lockPidAlive: false, market: "OPEN", lastCollectionAt: "2026-10-26T04:56:00Z", now }).state, "RUNNING", "cloud automation cycle within 4 min is active");
  assert.equal(deriveRunnerState({ lockPidAlive: false, market: "CLOSED", lastCollectionAt: null, now }).state, "IDLE_MARKET_CLOSED");
});

test("runner status with an empty data folder reports nothing running and no crash", () => {
  const d = tmp();
  process.env.COLLECTION_LOG_DIR = path.join(d, "c"); process.env.MONITOR_LOG_DIR = path.join(d, "m");
  const r = runnerStatus("OPEN", new Date(), d);
  delete process.env.COLLECTION_LOG_DIR; delete process.env.MONITOR_LOG_DIR;
  assert.equal(r.state, "NOT_RUNNING");
  assert.equal(r.lastCollectionAt, null);
  assert.deepEqual(r.healthEvents, []);
});

test("runner status detects active in-process supervisor heartbeat from paper-trading-lock.json", () => {
  const d = tmp();
  const c = path.join(d, "c");
  fs.mkdirSync(c);
  const now = new Date("2026-11-26T06:00:00.000Z");

  // Write active heartbeat (30 seconds ago)
  fs.writeFileSync(
    path.join(d, "paper-trading-lock.json"),
    JSON.stringify({
      pid: 999999,
      updatedAt: new Date(now.getTime() - 30_000).toISOString(),
      heartbeat: now.getTime() - 30_000,
      status: "RUNNING",
      runner: "RENDER_SUPERVISOR_IN_PROCESS",
    })
  );

  // Write recent collection run (45 seconds ago)
  fs.writeFileSync(
    path.join(c, "run_1000_api.json"),
    JSON.stringify({
      id: "1000_api",
      timestamp: new Date(now.getTime() - 45_000).toISOString(),
      marketStatus: "OPEN",
      sourceStatus: "LIVE",
      stockCount: 50,
      errors: [],
    })
  );

  process.env.COLLECTION_LOG_DIR = c;
  process.env.MONITOR_LOG_DIR = path.join(d, "m");
  const r = runnerStatus("OPEN", now, d);
  delete process.env.COLLECTION_LOG_DIR;
  delete process.env.MONITOR_LOG_DIR;

  assert.equal(r.lockPidAlive, true);
  assert.equal(r.state, "RUNNING");
  assert.match(r.reason, /Last collection \d+ s ago/);
  assert.equal(r.lastCollectionAt, new Date(now.getTime() - 45_000).toISOString());
});

test("runner status ignores expired paper-trading-lock.json heartbeat (> 5m ago)", () => {
  const d = tmp();
  const now = new Date("2026-11-26T06:00:00.000Z");

  // Write stale heartbeat (10 minutes ago)
  fs.writeFileSync(
    path.join(d, "paper-trading-lock.json"),
    JSON.stringify({
      pid: 999999,
      updatedAt: new Date(now.getTime() - 600_000).toISOString(),
      heartbeat: now.getTime() - 600_000,
      status: "RUNNING",
    })
  );

  process.env.COLLECTION_LOG_DIR = path.join(d, "c");
  process.env.MONITOR_LOG_DIR = path.join(d, "m");
  const r = runnerStatus("OPEN", now, d);
  delete process.env.COLLECTION_LOG_DIR;
  delete process.env.MONITOR_LOG_DIR;

  assert.equal(r.lockPidAlive, false);
  assert.equal(r.state, "NOT_RUNNING");
});

test("last collection advances only on LIVE data, never on auth-failed or no-attempt runs", () => {
  const d = tmp();
  const c = path.join(d, "c");
  fs.mkdirSync(c);
  const run = (id: string, timestamp: string, sourceStatus: string) =>
    fs.writeFileSync(path.join(c, `run_${id}_api.json`), JSON.stringify({ id: `${id}_api`, timestamp, marketStatus: "OPEN", sourceStatus, errors: [] }));
  run("1000", "2026-10-30T05:56:00.000Z", "LIVE");
  run("2000", "2026-10-30T06:10:00.000Z", "AUTH_EXPIRED");
  run("3000", "2026-10-30T06:20:00.000Z", "NONE");
  process.env.COLLECTION_LOG_DIR = c; process.env.MONITOR_LOG_DIR = path.join(d, "m");
  const r = runnerStatus("OPEN", new Date("2026-10-30T06:21:00.000Z"), d);
  delete process.env.COLLECTION_LOG_DIR; delete process.env.MONITOR_LOG_DIR;
  assert.equal(r.lastCollectionAt, "2026-10-30T05:56:00.000Z");
});

test("log redaction removes tokens, bearer headers and JWTs", () => {
  const line = 'Authorization: Bearer abc.DEF-123 {"access_token":"s3cr3t","code":"xyz"} eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.sig_part';
  const out = redact(line);
  for (const leak of ["abc.DEF-123", "s3cr3t", "xyz", "eyJhbGciOiJIUzI1NiJ9"]) assert.ok(!out.includes(leak), `leaked ${leak}: ${out}`);
});

test("log tail is bounded and drops routine request lines but keeps failures", () => {
  const d = tmp();
  const f = path.join(d, "x.log");
  fs.writeFileSync(f, [...Array.from({ length: 500 }, (_, i) => `line ${i}`), '{"evt":"upstox_request","ok":true}', '{"evt":"upstox_request","ok":false,"status":401}'].join("\n"));
  const t = logTail(f, 10);
  assert.equal(t.lines.length, 10);
  assert.ok(t.lines.at(-1)!.includes('"ok":false'));
  assert.ok(!t.lines.some((l) => l.includes('"ok":true')));
  assert.equal(logTail(path.join(d, "missing.log")).missing, true);
});

test("audit report: missing rounds file → INSUFFICIENT for all six; malformed lines counted; failures visible", () => {
  const d = tmp();
  const empty = auditReport(d);
  assert.equal(empty.roundsFileMissing, true);
  assert.equal(empty.indices.length, 6);
  assert.ok(empty.indices.every((i) => i.verdict === "INSUFFICIENT"));
  fs.writeFileSync(path.join(d, "rounds.jsonl"), [
    JSON.stringify({ version: "options-audit-1a", index: "nifty", session: "2026-10-27", at: "t1", error: "quote fetch failed" }),
    "{broken",
    JSON.stringify({ version: "options-audit-1a", index: "nifty", session: "2026-10-27", at: "t2", skipped: "gap" }),
  ].join("\n"));
  const r = auditReport(d, "options-audit-1a");
  const n = r.indices.find((i) => i.index === "nifty")!;
  assert.equal(r.version, "options-audit-1a");
  assert.equal(r.malformedLines, 1);
  assert.equal(n.roundsErrored, 1);
  assert.equal(n.roundsSkipped, 1);
  assert.equal(n.roundsAttempted, 2);
  assert.equal(n.verdict, "INSUFFICIENT");
});

test("audit report: version selection filters records and sets report version", () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, "rounds.jsonl"), [
    JSON.stringify({ version: "options-audit-1", index: "nifty", session: "2026-10-26", at: "t1", error: "v1 error" }),
    JSON.stringify({ version: "options-audit-1a", index: "nifty", session: "2026-10-27", at: "t2", error: "v1a error" }),
  ].join("\n"));
  const r1 = auditReport(d, "options-audit-1");
  const r1a = auditReport(d, "options-audit-1a");
  assert.equal(r1.version, "options-audit-1");
  assert.equal(r1a.version, "options-audit-1a");
  assert.equal(r1.indices.find((i) => i.index === "nifty")!.roundsAttempted, 1);
  assert.equal(r1a.indices.find((i) => i.index === "nifty")!.roundsAttempted, 1);
});

test("collector log folder is resolved per call: a test folder set after import is honoured", async () => {
  const { saveCollectionRun, listCollectionRuns } = await import("../services/liveOpportunityCollector.ts");
  const d = tmp();
  process.env.COLLECTION_LOG_DIR = d;
  saveCollectionRun({ id: "probe", timestamp: new Date().toISOString(), marketStatus: "OPEN", sourceStatus: "LIVE", generatedCount: 0, acceptedCount: 0, createdCount: 0, duplicateCount: 0, rejectedCount: 0, niftyCount: 0, bankNiftyCount: 0, stockCount: 0, durationMs: 0, errors: [] });
  assert.ok(fs.existsSync(path.join(d, "run_probe.json")));
  assert.equal(listCollectionRuns()[0].id, "probe");
  delete process.env.COLLECTION_LOG_DIR;
});

import { buildAttention, type AttentionInputs } from "./opsStatus.ts";
const base = (o: Partial<AttentionInputs> = {}): AttentionInputs => ({
  market: "OPEN", authStatus: "VERIFIED_CONNECTED", healthMalformed: 0, minSessions: 5, lastFirstOpen: null,
  runner: { state: "RUNNING", reason: "ok", lastCollectionErrors: [] },
  sources: [{ index: "NIFTY 50", subsystem: "market", source: "LIVE" }],
  audit: { malformedLines: 0, indices: [{ index: "nifty", verdict: "DATA_TRUSTED", sessionsWithEnoughRounds: 5, roundsSucceeded: 40, roundsErrored: 0, roundsSkipped: 0 }] },
  ...o,
});

test("attention: partial data raises a warning even while the runner is RUNNING", () => {
  const a = buildAttention(base({ sources: [{ index: "BANK NIFTY", subsystem: "optionChain", source: "STALE" }, { index: "BANK NIFTY", subsystem: "market", source: "LIVE" }] }));
  assert.ok(a.some((x) => x.severity === "warning" && /Partial data/.test(x.text) && /optionChain STALE/.test(x.text)));
});

test("attention: empty only when every check with evidence passes", () => {
  assert.deepEqual(buildAttention(base()), []);
  assert.ok(buildAttention(base({ sources: [{ index: "X", subsystem: "news", source: "MOCK" }] })).length > 0, "mock source is never silent");
});

test("attention: INSUFFICIENT is informational pending evidence, DATA_NOT_TRUSTED is a warning", () => {
  const ins = buildAttention(base({ audit: { malformedLines: 0, indices: [{ index: "nifty", verdict: "INSUFFICIENT", sessionsWithEnoughRounds: 1, roundsSucceeded: 7, roundsErrored: 0, roundsSkipped: 0 }] } }));
  assert.equal(ins.length, 1); assert.equal(ins[0].severity, "info"); assert.match(ins[0].text, /1\/5 sessions, 7 rounds/); assert.match(ins[0].text, /not a failure/);
  const bad = buildAttention(base({ audit: { malformedLines: 0, indices: [{ index: "nifty", verdict: "DATA_NOT_TRUSTED", sessionsWithEnoughRounds: 5, roundsSucceeded: 40, roundsErrored: 0, roundsSkipped: 0 }] } }));
  assert.equal(bad[0].severity, "warning");
});

test("attention: integrity problems sort first as critical", () => {
  const a = buildAttention(base({ healthMalformed: 2, authStatus: "EXPIRED" }));
  assert.equal(a[0].severity, "critical");
});
