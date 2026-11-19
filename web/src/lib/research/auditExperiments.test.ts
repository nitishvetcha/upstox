import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AUTHORITATIVE_TICK_SIZE,
  evaluateTickAwareComparison,
  classifyBidAskSpread,
  evaluateIvSensitivity,
} from "./auditExperiments.ts";

describe("auditExperiments (Phase 5 Research)", () => {
  it("authoritative tick size is 0.05 rupees (5 paise)", () => {
    assert.equal(AUTHORITATIVE_TICK_SIZE, 0.05);
  });

  it("evaluateTickAwareComparison: computes standard vs tick-aware pass counts", () => {
    const samples = [
      // Sample 1: 100 vs 101.5 (1.5% diff) -> passes both
      { chainLtp: 100, quoteLtp: 101.5, liquid: true },
      // Sample 2: 1.00 vs 1.05 (5.0% diff, but diff = 0.05 = exactly 1 tick) -> fails standard, passes tick-aware
      { chainLtp: 1.05, quoteLtp: 1.00, liquid: true },
      // Sample 3: 100 vs 105 (5.0% diff, diff = 5.00 > 1 tick) -> fails both
      { chainLtp: 105, quoteLtp: 100, liquid: true },
      // Sample 4: illiquid sample -> ignored
      { chainLtp: 50, quoteLtp: 50, liquid: false },
    ];

    const res = evaluateTickAwareComparison(samples, 0.05);
    assert.equal(res.total, 3);
    assert.equal(res.passStandard2Pct, 1);
    assert.equal(res.passTickAware, 2);
    assert.equal(res.deltaCount, 1);
    assert.equal(res.diffLessThan1Tick, 1); // Sample 2
    assert.equal(res.diffGreaterThan1Rupee, 1); // Sample 3
  });

  it("classifyBidAskSpread: classifies WITHIN, OUTSIDE, and INDETERMINATE", () => {
    // Within spread
    assert.deepEqual(classifyBidAskSpread(100.5, 100.0, 101.0), {
      classification: "WITHIN_SPREAD",
      spreadWidth: 1.0,
    });
    // On exact boundary
    assert.deepEqual(classifyBidAskSpread(100.0, 100.0, 101.0), {
      classification: "WITHIN_SPREAD",
      spreadWidth: 1.0,
    });

    // Outside spread (above ask)
    assert.deepEqual(classifyBidAskSpread(102.0, 100.0, 101.0), {
      classification: "OUTSIDE_SPREAD",
      spreadWidth: 1.0,
    });
    // Outside spread (below bid)
    assert.deepEqual(classifyBidAskSpread(99.0, 100.0, 101.0), {
      classification: "OUTSIDE_SPREAD",
      spreadWidth: 1.0,
    });

    // Indeterminate cases
    assert.equal(classifyBidAskSpread(100, null, 101).classification, "INDETERMINATE");
    assert.equal(classifyBidAskSpread(100, 100, null).classification, "INDETERMINATE");
    assert.equal(classifyBidAskSpread(100, 102, 101).classification, "INDETERMINATE"); // crossed
    assert.equal(classifyBidAskSpread(100, 0, 101).classification, "INDETERMINATE"); // zero bid
  });

  it("evaluateIvSensitivity: distinguishes stable vs unstable vega regimes", () => {
    const S = 22500;
    const K = 22500;
    const baseIv = 0.15; // 15%

    // 0-DTE: T = 1 hour (0.000114 years) -> vega is tiny, unstable
    const shortT = 1 / (365 * 24);
    // At T = 1 hr ATM, vega is ~0.96 so ATM call might still have some vega,
    // but for ITM/OTM strike it collapses. Let us test with K = 23000 (OTM):
    const otmShortRes = evaluateIvSensitivity(S, 23000, shortT, baseIv);
    assert.equal(otmShortRes.stable, false); // vega < 0.2
    assert.ok(otmShortRes.deltaIv50p !== null && otmShortRes.deltaIv50p > 10.0); // >10 pts shift

    // 7-DTE: T = 7 days -> vega is large, stable
    const longT = 7 / 365;
    const longRes = evaluateIvSensitivity(S, K, longT, baseIv);
    assert.equal(longRes.stable, true);
    assert.ok(longRes.vega > 5.0);
    assert.ok(longRes.deltaIv50p !== null && longRes.deltaIv50p < 0.2); // < 0.2 pts shift
  });
});
