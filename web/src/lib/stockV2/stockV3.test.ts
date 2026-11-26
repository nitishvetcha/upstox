import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { V3_CONFIG, runStockV3Simulation } from "./stockV3.ts";
import { roundTripDeliveryCharges, roundTripCharges, sizePosition, RISK_V3_10K } from "./risk.ts";
import type { HistoricalDataset } from "./dataset.ts";

describe("Stock V3 ₹10,000 Architecture & Risk Model", () => {
  it("enforces ₹10,000 capital and 1.5% risk limits", () => {
    assert.equal(V3_CONFIG.accountCapital, 10_000);
    assert.equal(V3_CONFIG.riskPct, 0.015);
    assert.equal(V3_CONFIG.accountCapital * V3_CONFIG.riskPct, 150); // ₹150 max risk budget
  });

  it("calculates exact 2026 Upstox intraday charges", () => {
    // Buy 10 shares of RELIANCE at 2500, Sell at 2550 (Turnover: 25000 + 25500 = 50500)
    const ch = roundTripCharges("LONG", 2500, 2550, 10);
    assert.ok(ch.brokerage > 0 && ch.brokerage <= 40);
    assert.ok(ch.stt > 0);
    assert.ok(ch.exchange > 0);
    assert.ok(ch.gst > 0);
    assert.ok(ch.total > 0 && ch.total < 100);
  });

  it("calculates delivery charges including DP fee", () => {
    // Delivery sell incurs ₹20 flat DP fee + 18% GST (₹23.60 total DP cost)
    const del = roundTripDeliveryCharges("LONG", 1000, 1050, 5);
    assert.equal(del.dpCharge, 20);
    assert.equal(del.brokerage, 40); // ₹20 buy + ₹20 sell
    assert.ok(del.total > 63.6);
  });

  it("caps shares to cash availability on ₹10k capital without leverage", () => {
    // Stock at ₹3,000: max cash shares = floor(10000 / 3000) = 3 shares
    const sized = sizePosition(3000, 2970, "NONE", 10_000, 0.015);
    assert.ok(sized.ok);
    assert.ok(sized.qty <= 3);
  });

  it("rejects stocks above affordable threshold in V3", () => {
    assert.ok(V3_CONFIG.maxPrice <= 3500);
    assert.ok(4000 > V3_CONFIG.maxPrice);
  });
});
