import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { monitoringView } from "./opportunityMonitoring.ts";
import type { PaperOpportunity } from "./services/paperOpportunityStore.ts";

const base = {
  entry: 100, stop: 95, target1: 110, target2: 120, riskPerUnit: 5,
  direction: "BULLISH", lastLivePrice: 105, lastLivePriceAt: "2026-11-20T06:29:30.000Z",
} as PaperOpportunity;

describe("opportunity monitoring view", () => {
  it("computes current P&L, R and freshness without changing the immutable plan", () => {
    const view = monitoringView(base, new Date("2026-11-20T06:30:00.000Z"));
    assert.equal(view.currentPnlPerUnit, 5);
    assert.equal(view.currentR, 1);
    assert.equal(view.freshness, "FRESH");
    assert.equal(base.stop, 95);
  });

  it("handles bearish P&L direction and stale prices", () => {
    const view = monitoringView({ ...base, direction: "BEARISH", lastLivePrice: 90 }, new Date("2026-11-20T06:35:00.000Z"));
    assert.equal(view.currentPnlPerUnit, 10);
    assert.equal(view.currentR, 2);
    assert.equal(view.freshness, "STALE");
  });
});
