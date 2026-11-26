import test from "node:test";
import assert from "node:assert/strict";
import { chainMetrics } from "./optionChainAnalytics.ts";

test("chainMetrics returns neutral defaults when chain rows are empty", () => {
  const m = chainMetrics({ spot: 76500, expiry: "2026-12-28", chain: [] }, new Date("2026-11-26T10:00:00Z"));
  assert.equal(m.atmStrike, 76500);
  assert.equal(m.maxPain, 76500);
  assert.equal(m.maxPainDistance, 0);
  assert.equal(m.support, 76500);
  assert.equal(m.resistance, 76500);
  assert.equal(m.pcrOi, null);
  assert.equal(m.pcrVolume, null);
  assert.equal(m.expectedMove, null);
});
