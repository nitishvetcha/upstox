import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { gradeGap, scoreBreakdownRows } from "./gradeGap.ts";
import { WEIGHTS } from "./opportunityEngine.ts";

describe("gradeGap", () => {
  it("returns null for A+ (no higher grade)", () => {
    assert.equal(gradeGap("A+", 80, 2.5, 80), null);
  });

  it("grade B → next is A: shows score delta", () => {
    const gap = gradeGap("B", 53, 1.2, 60);
    assert.ok(gap);
    assert.equal(gap.nextGrade, "A");
    assert.equal(gap.scoreDelta, 12); // need 65, have 53
    assert.ok(Math.abs(gap.rrDelta - 0.3) < 0.001); // need 1.5, have 1.2
    assert.equal(gap.scoreOk, false);
    assert.equal(gap.rrOk, false);
    assert.equal(gap.confOk, true); // 60 >= 60
  });

  it("grade A → next is A+: all criteria reported", () => {
    const gap = gradeGap("A", 68, 1.8, 65);
    assert.ok(gap);
    assert.equal(gap.nextGrade, "A+");
    assert.equal(gap.scoreDelta, 7); // need 75, have 68
    assert.equal(gap.rrOk, false);  // need 2.0, have 1.8
    assert.equal(gap.confOk, false); // 65 < 70 needed
    assert.equal(gap.confDelta, 5); // need 70, have 65
  });

  it("grade C → next is B", () => {
    const gap = gradeGap("C", 42, 1.0, 30);
    assert.ok(gap);
    assert.equal(gap.nextGrade, "B");
    assert.equal(gap.scoreDelta, 8);              // need 50, have 42
    assert.ok(Math.abs(gap.rrDelta - 0.2) < 0.001); // need 1.2, have 1.0
    assert.equal(gap.confDelta, 20);              // need 50, have 30
  });
});

describe("scoreBreakdownRows", () => {
  it("maps breakdown to labeled rows sorted by max weight", () => {
    const rows = scoreBreakdownRows({ underlying_direction: 20, rr_quality: 10, event_penalty: -5 });
    assert.equal(rows[0].key, "underlying_direction"); // max 30 — biggest
    assert.equal(rows[0].earned, 20);
    assert.ok(rows[0].pct > 60 && rows[0].pct < 70); // 20/30 ≈ 66.7%
    const penalty = rows.find((r) => r.key === "event_penalty");
    assert.ok(penalty);
    assert.equal(penalty!.earned, -5);
  });

  it("WEIGHT_LABELS matches WEIGHTS from opportunityEngine and sums to 100", () => {
    const breakdown: Record<string, number> = {};
    for (const [k, v] of Object.entries(WEIGHTS)) {
      breakdown[k] = v;
    }
    const rows = scoreBreakdownRows(breakdown);
    const totalMax = rows.reduce((acc, r) => acc + (r.key === "event_penalty" ? 0 : r.max), 0);
    assert.equal(totalMax, 100);
    for (const [k, v] of Object.entries(WEIGHTS)) {
      const match = rows.find((r) => r.key === k);
      assert.ok(match, `Missing row for weight key ${k}`);
      assert.equal(match!.max, v, `Weight max mismatch for ${k}`);
      assert.equal(match!.pct, 100, `Earned percentage for full score should be 100%`);
    }
  });
});
