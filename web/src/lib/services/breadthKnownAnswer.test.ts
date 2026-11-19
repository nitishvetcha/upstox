// Independent known-answer tests for calculateBreadth. Expected values are hand-derived from the definitions:
//   advance if changePercent > +0.05; decline if < -0.05; otherwise unchanged (BREADTH_NEUTRAL_TOLERANCE_PCT = 0.05, strict).
//   advancePercent = adv/total*100; breadthPercent = (adv-dec)/total*100; signal = (adv-dec)/total clamped to [-1,1];
//   advanceDeclineRatio = adv/dec, and = adv when dec = 0 (documented as advancing / max(declining,1)).
import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateBreadth } from "./breadthService.ts";
import type { ConstituentQuote, SourceInfo } from "../types.ts";

const MOCK: SourceInfo = { source: "MOCK", provider: "MOCK", fetchedAt: "2026-01-05T10:00:00+05:30", lastTradeTime: null };
const q = (symbol: string, changePercent: number): ConstituentQuote => ({
  symbol, lastPrice: 100 + changePercent, previousClose: 100, change: changePercent, changePercent, timestamp: "2026-01-05T10:00:00+05:30",
});

// 12 valid quotes: advances (+1, +0.5, +0.2, +0.06, +2, +0.1) = 6; declines (-1, -0.5, -0.06) = 3;
// unchanged: +0.05 and -0.05 (exactly at the strict tolerance) and 0 = 3.  total = 12.
const MIX = [q("A", 1), q("B", 0.5), q("C", 0.2), q("D", 0.06), q("E", 2), q("F", 0.1), q("G", -1), q("H", -0.5), q("I", -0.06), q("J", 0.05), q("K", -0.05), q("L", 0)];

test("breadth counts: 6 advances, 3 declines, 3 unchanged of 12", () => {
  const r = calculateBreadth("nifty", MIX, null, new Date("2026-01-05T04:30:00Z"), MOCK);
  assert.equal(r.advances, 6);
  assert.equal(r.declines, 3);
  assert.equal(r.unchanged, 3);
  assert.equal(r.total, 12);
});

test("breadth percentages: advance 50.0, decline 25.0, breadth 25.0, signal 0.25, A/D ratio 2", () => {
  const r = calculateBreadth("nifty", MIX, null, new Date("2026-01-05T04:30:00Z"), MOCK);
  assert.equal(r.advancePercent, 50);
  assert.equal(r.declinePercent, 25);
  assert.equal(r.breadthPercent, 25);
  assert.ok(Math.abs(r.signal - 0.25) < 1e-12);
  assert.equal(r.advanceDeclineRatio, 2);
});

test("tolerance is strict: exactly +0.05 and -0.05 are unchanged, not advance or decline", () => {
  const r = calculateBreadth("nifty", [q("X", 0.05), q("Y", -0.05)], null, new Date("2026-01-05T04:30:00Z"), MOCK);
  assert.equal(r.advances, 0);
  assert.equal(r.declines, 0);
  assert.equal(r.unchanged, 2);
});

test("invalid quotes are excluded from the count: previousClose 0, NaN price", () => {
  const bad1 = { ...q("Z1", 1), previousClose: 0 };
  const bad2 = { ...q("Z2", 1), lastPrice: Number.NaN };
  const r = calculateBreadth("nifty", [...MIX, bad1, bad2], null, new Date("2026-01-05T04:30:00Z"), MOCK);
  assert.equal(r.total, 12);
  assert.equal(r.advances, 6);
});

test("no declines: A/D ratio equals the advance count (advancing / max(declining,1))", () => {
  const r = calculateBreadth("nifty", [q("A", 1), q("B", 2), q("C", 3)], null, new Date("2026-01-05T04:30:00Z"), MOCK);
  assert.equal(r.declines, 0);
  assert.equal(r.advanceDeclineRatio, 3);
});

test("all advancing gives breadth 100 and signal 1; all declining gives -100 and -1", () => {
  const up = calculateBreadth("nifty", [q("A", 1), q("B", 2)], null, new Date("2026-01-05T04:30:00Z"), MOCK);
  assert.equal(up.breadthPercent, 100);
  assert.equal(up.signal, 1);
  const down = calculateBreadth("nifty", [q("A", -1), q("B", -2)], null, new Date("2026-01-05T04:30:00Z"), MOCK);
  assert.equal(down.breadthPercent, -100);
  assert.equal(down.signal, -1);
});

test("no quotes: UNAVAILABLE with zero counts and a reason (no invented breadth)", () => {
  const r = calculateBreadth("nifty", [], null, new Date("2026-01-05T04:30:00Z"), MOCK);
  assert.equal(r.status, "UNAVAILABLE");
  assert.equal(r.total, 0);
  assert.equal(r.advances, 0);
  assert.equal(r.breadthPercent, 0);
  assert.ok(r.reason && r.reason.length > 0);
});

test("incomplete coverage is reported as incomplete: 12 of the expected constituents is below the 80% minimum", () => {
  const r = calculateBreadth("nifty", MIX, null, new Date("2026-01-05T04:30:00Z"), MOCK);
  // Independent expectation: coverage = total/expected*100; with 12 quotes it is far below 80, so it must not read as usable breadth.
  assert.ok(r.coverage < 80, `coverage ${r.coverage}`);
  assert.equal(r.status, "UNAVAILABLE");
  assert.match(r.reason ?? "", /Coverage .* below minimum 80%/);
});
