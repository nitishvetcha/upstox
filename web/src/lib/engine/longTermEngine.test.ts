import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scanLongTerm,
  NO_FUNDAMENTAL_PROVIDER,
  VERIFIED_BLUECHIP_PROVIDER,
  calculateFundamentalScore,
} from "./longTermEngine.ts";

test("LT-01: NO_FUNDAMENTAL_PROVIDER preserves fail-closed behavior", async () => {
  const r = await scanLongTerm(NO_FUNDAMENTAL_PROVIDER);
  assert.equal(r.fundamentalDataAvailable, false);
  assert.equal(r.fundamentalProvider, "NONE");
  assert.equal(r.topOpportunities.length, 0);
  assert.ok(r.noOpportunityReason && r.noOpportunityReason.includes("No fundamental data provider"));
});

test("LT-02: Default scanLongTerm provides scored bluechip long-term opportunities", async () => {
  const r = await scanLongTerm();
  assert.equal(r.fundamentalDataAvailable, true);
  assert.equal(r.fundamentalProvider, "NSE_BLUECHIP_FUNDAMENTALS");
  assert.ok(r.topOpportunities.length >= 5, "Must provide top bluechip opportunities");

  const tcs = r.topOpportunities.find((o) => o.symbol === "TCS");
  assert.ok(tcs, "TCS must be present");
  assert.equal(tcs.rating, "ACCUMULATE");
  assert.ok((tcs.fundamentalScore ?? 0) >= 80, "TCS should score high on fundamentals");
  assert.ok(tcs.roce && tcs.roce > 50, "TCS ROCE must be accurate");
  assert.ok(tcs.thesis.length > 20, "Thesis must be informative");
});

test("LT-03: calculateFundamentalScore behaves monotonically with quality metrics", () => {
  const highQuality = calculateFundamentalScore({
    symbol: "TEST",
    roce: 35,
    roe: 28,
    debtToEquity: 0,
    operatingMargin: 26,
    revenueGrowthYoy: 18,
    profitGrowthYoy: 20,
    source: "AUDITED",
    asOf: "2026-03-31",
  });
  assert.ok(highQuality >= 90, `High quality score should be >= 90, got ${highQuality}`);

  const weakQuality = calculateFundamentalScore({
    symbol: "WEAK",
    roce: 5,
    roe: 4,
    debtToEquity: 2.5,
    operatingMargin: 3,
    revenueGrowthYoy: 1,
    profitGrowthYoy: -5,
    source: "AUDITED",
    asOf: "2026-03-31",
  });
  assert.ok(weakQuality <= 40, `Weak quality score should be <= 40, got ${weakQuality}`);
});
