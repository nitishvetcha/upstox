import { test } from "node:test";
import assert from "node:assert/strict";
import { intradayConfidence } from "./stockOpportunityEngine.ts";
import type { StockMarketData } from "../services/stockService.ts";

const q = (o: Partial<StockMarketData>) => ({ symbol: "X", exchange: "NSE", instrumentKey: "k", timestamp: "", marketStatus: "OPEN", source: null, freshness: "LIVE", ltp: 105, previousClose: 100, open: 101, high: 106, low: 100, volume: 1e6, changePercent: 5, ...o }) as StockMarketData;

test("all checks agree + live data → 100", () => {
  assert.equal(intradayConfidence(q({}), 1, 2, 0.83), 100);
});
test("same evidence read for the wrong side scores low", () => {
  assert.ok(intradayConfidence(q({}), -1, 2, 0.83) <= 45, "only the size-of-move check agrees");
});
test("stale quote cannot reach high confidence", () => {
  assert.ok(intradayConfidence(q({ freshness: "STALE" as never }), 1, 2, 0.83) <= 82);
});
