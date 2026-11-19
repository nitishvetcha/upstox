import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  writeSnapshotOnce, validateSnapshot, evaluateSession, recordFailure, inSessionIst, restFreshness, scrub,
  type SnapshotRecord, type LegQuote,
} from "./evidence.ts";

const depth = (n: number) => Array.from({ length: n }, (_, i) => ({ price: 100 - i, quantity: 10 + i }));
const RULES = { maxStaleSec: 900, maxSkewSec: 2 }; // illustrative test values only, not production thresholds

function leg(over: Partial<LegQuote> = {}): LegQuote {
  return {
    instrumentKey: "NSE_FO|1", index: "NIFTY", expiry: "2026-11-17", strike: 25000, optionType: "CE",
    bidPrice: 100, askPrice: 101, bidQty: 50, askQty: 40, bidDepth: depth(5), askDepth: depth(5),
    lastTradeTime: "2026-11-12T05:40:00.000Z", ...over,
  };
}
function snap(over: Partial<SnapshotRecord> = {}): SnapshotRecord {
  return {
    sessionDate: "2026-11-12", snapshotTimeUtc: "2026-11-12T05:45:00.000Z", retrievedAtUtc: "2026-11-12T05:45:00.500Z",
    requestSeq: 1, httpStatus: 200, source: "REST", legs: [leg()], ...over,
  };
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "ev-"));

test("normal snapshot is VALID", () => {
  const r = validateSnapshot(snap(), RULES);
  assert.equal(r.verdict, "VALID");
  assert.deepEqual(r.reasons, []);
});

test("old last_trade_time does NOT reject an illiquid REST leg; REST quote freshness is UNKNOWN", () => {
  const r = validateSnapshot(snap({ legs: [leg({ lastTradeTime: "2026-11-12T04:00:00.000Z" })] }), RULES);
  assert.equal(r.verdict, "VALID");
  assert.equal(r.legs[0].fresh, null, "REST quote freshness must be UNKNOWN (null)");
  assert.ok((r.legs[0].ageSec ?? 0) > 3000, "last-trade age recorded descriptively");
});

test("REST never reports quote freshness as fresh", () => {
  const r = validateSnapshot(snap(), RULES);
  assert.ok(r.legs.every((l) => l.fresh === null));
});

test("missing depth is INCOMPLETE, not VALID", () => {
  const r = validateSnapshot(snap({ legs: [leg({ askDepth: depth(3) })] }), RULES);
  assert.equal(r.verdict, "INCOMPLETE");
  assert.match(r.reasons.join(" "), /depth5/);
});

test("missing bid quantity is INCOMPLETE", () => {
  const r = validateSnapshot(snap({ legs: [leg({ bidQty: null })] }), RULES);
  assert.equal(r.verdict, "INCOMPLETE");
  assert.match(r.reasons.join(" "), /bidQty/);
});

test("non-200 response is REJECTED", () => {
  assert.equal(validateSnapshot(snap({ httpStatus: 401 }), RULES).verdict, "REJECTED");
});

test("empty leg list is REJECTED", () => {
  assert.equal(validateSnapshot(snap({ legs: [] }), RULES).verdict, "REJECTED");
});

test("clock skew above threshold is flagged", () => {
  const r = validateSnapshot(snap({ retrievedAtUtc: "2026-11-12T05:45:10.000Z" }), RULES);
  assert.equal(r.verdict, "INCOMPLETE");
  assert.match(r.reasons.join(" "), /clock skew/);
});

test("duplicate snapshot is refused by the write-once writer", () => {
  const dir = tmp();
  const rec = snap();
  writeSnapshotOnce(dir, rec, "{}");
  assert.throws(() => writeSnapshotOnce(dir, rec, "{}"), /EEXIST/);
});

test("writer stores the raw body hash and no token", () => {
  const dir = tmp();
  const { file } = writeSnapshotOnce(dir, snap(), '{"status":"success"}');
  const body = fs.readFileSync(file, "utf8");
  assert.match(body, /"rawSha256"/);
  assert.doesNotMatch(body, /accessToken|Bearer/);
});

test("session with a 20-minute gap is EXCLUDED", () => {
  const outcomes = Array.from({ length: 100 }, () => ({ verdict: "VALID" as const, pairedValid: true }));
  const r = evaluateSession(outcomes, 100, [20], true);
  assert.equal(r.status, "EXCLUDED");
  assert.match(r.reasons.join(" "), /gap 20/);
});

test("session with coverage 94% is EXCLUDED", () => {
  const outcomes = Array.from({ length: 94 }, () => ({ verdict: "VALID" as const, pairedValid: true }));
  assert.equal(evaluateSession(outcomes, 100, [], true).status, "EXCLUDED");
});

test("session with unknown calendar is HOLD, not INCLUDED", () => {
  const outcomes = Array.from({ length: 100 }, () => ({ verdict: "VALID" as const, pairedValid: true }));
  assert.equal(evaluateSession(outcomes, 100, [], false).status, "HOLD");
});

test("complete session is INCLUDED", () => {
  const outcomes = Array.from({ length: 100 }, () => ({ verdict: "VALID" as const, pairedValid: true }));
  assert.equal(evaluateSession(outcomes, 100, [5], true).status, "INCLUDED");
});

test("failure recorder appends and strips bearer tokens", () => {
  const f = path.join(tmp(), "failures.jsonl");
  recordFailure(f, { kind: "API_ERROR", atUtc: "2026-11-12T05:00:00Z", sessionDate: "2026-11-12", detail: "HTTP 401 Authorization: Bearer abc.def-123" });
  recordFailure(f, { kind: "RATE_LIMIT", atUtc: "2026-11-12T05:01:00Z", sessionDate: "2026-11-12", detail: "429" });
  const lines = fs.readFileSync(f, "utf8").trim().split("\n");
  assert.equal(lines.length, 2);
  assert.doesNotMatch(lines[0], /abc\.def/);
  assert.equal(scrub("Bearer xyz"), "Bearer [REDACTED]");
});

test("session window is 09:15 to 15:30 IST on weekdays only", () => {
  assert.equal(inSessionIst("2026-11-12T03:45:00.000Z"), true); // 09:15 IST Thursday
  assert.equal(inSessionIst("2026-11-12T10:00:00.000Z"), true); // 15:30 IST, inclusive boundary
  assert.equal(inSessionIst("2026-11-12T10:01:00.000Z"), false); // 15:31 IST
  assert.equal(inSessionIst("2026-11-12T03:44:00.000Z"), false); // 09:14 IST
  assert.equal(inSessionIst("2026-11-14T05:00:00.000Z"), false); // Saturday
});

test("REST freshness returns null when last_trade_time is absent", () => {
  assert.equal(restFreshness(null, "2026-11-12T05:45:00Z", 900).fresh, null);
});
