import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { bearishSnapshotWithSpread } from "../services/phase3A4MultiLegIntegrity.test.ts";
import { FIXTURE_DEPS, FIXTURE_NOW } from "../testFixtures/stockScan.ts";
import { evaluateOptionsOpportunity } from "./opportunityEngine.ts";
import { detectIntradaySetup, scanStocks } from "./stockOpportunityEngine.ts";
import type { StockMarketData } from "../services/stockService.ts";

describe("20.2 stock policy", () => {
  const savedProvider = process.env.MARKET_DATA_PROVIDER;
  before(() => { process.env.MARKET_DATA_PROVIDER = "upstox"; });
  after(() => {
    if (savedProvider === undefined) delete process.env.MARKET_DATA_PROVIDER;
    else process.env.MARKET_DATA_PROVIDER = savedProvider;
  });

  it("scores a verified previous-day breakout rather than only naming it", () => {
    const base: StockMarketData = {
      symbol: "TEST", exchange: "NSE", instrumentKey: "NSE_EQ|TEST", timestamp: FIXTURE_NOW.toISOString(),
      ltp: 102, open: 100, high: 102.2, low: 99.8, previousClose: 100,
      change: 2, changePercent: 2, volume: 100_000, marketStatus: "OPEN",
      freshness: "LIVE", source: "UPSTOX", unavailableReason: null,
    };
    const withoutPdh = detectIntradaySetup(base, 0);
    const withPdh = detectIntradaySetup({ ...base, previousDayHigh: 101 }, 0);
    assert.equal(withPdh.setup, "BREAKOUT");
    assert.equal(withPdh.score, withoutPdh.score + 15);
  });

  it("caps Stock V1 candidates at watch-only because its validation expectancy is negative", async () => {
    const result = await scanStocks("intraday", FIXTURE_NOW, FIXTURE_DEPS);
    assert.ok(result.topOpportunities.length > 0);
    assert.ok(result.topOpportunities.every((candidate) => candidate.grade === "C" || candidate.grade === "REJECT"));
    assert.ok(result.topOpportunities
      .filter((candidate) => candidate.grade === "C")
      .every((candidate) => candidate.gradeReasons?.some((reason) => reason.includes("PF 0.69"))));
  });
});

describe("20.2 options actionability policy", () => {
  it("keeps missing IV-percentile history out of actionable grades", () => {
    const snapshot = { ...bearishSnapshotWithSpread(), ivPercentile: null };
    const result = evaluateOptionsOpportunity(snapshot, "NIFTY", new Date("2026-11-20T10:30:00+05:30"));
    assert.equal(result.recommendedStrategy, "NO_TRADE");
    assert.ok(result.topOpportunities.every((candidate) => candidate.grade === "C" || candidate.grade === "REJECT"));
    assert.ok(result.topOpportunities.some((candidate) => candidate.reasons.some((reason) => reason.includes("IV percentile unavailable"))));
  });

  it("keeps 0-DTE candidates research-only even when all other gates pass", () => {
    const result = evaluateOptionsOpportunity(
      bearishSnapshotWithSpread(),
      "NIFTY",
      new Date("2026-11-23T10:30:00+05:30"),
    );
    assert.equal(result.isZeroDte, true);
    assert.equal(result.recommendedStrategy, "NO_TRADE");
    assert.ok(result.topOpportunities.every((candidate) => candidate.grade === "C" || candidate.grade === "REJECT"));
    assert.ok(result.topOpportunities.some((candidate) => candidate.reasons.some((reason) => reason.includes("0-DTE"))));
  });
});
