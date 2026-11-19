// Mock breadth is labelled MOCK (never LIVE or PARTIAL) at the mock provider. Backtest breadth calls are unchanged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { asMockBreadth, calculateBreadth } from "./breadthService.ts";
import { INDEX_CONSTITUENTS } from "./breadthConfig.ts";
import { mockSnapshot } from "./mock.ts";
import { analyzeMarket } from "../engine/analysis.ts";
import type { ConstituentQuote } from "../types.ts";

const NOW = new Date("2026-11-11T04:30:00.000Z");
const quotes = (n: number): ConstituentQuote[] =>
  Array.from({ length: n }, (_, i) => ({
    symbol: `S${i}`, lastPrice: 110, previousClose: 100, change: 10, changePercent: 10, timestamp: NOW.toISOString(),
  })) as ConstituentQuote[];
const MOCK_SRC = { source: "MOCK", provider: "MOCK", fetchedAt: NOW.toISOString() } as const;

test("mock labelling: full-coverage synthetic breadth becomes MOCK, not LIVE", () => {
  const n = INDEX_CONSTITUENTS.nifty.length;
  const raw = calculateBreadth("nifty", quotes(n), 0.5, NOW, MOCK_SRC as never);
  assert.equal(raw.status, "LIVE", "the calculation itself is unchanged");
  assert.equal(asMockBreadth(raw).status, "MOCK");
});

test("mock labelling: partial-coverage synthetic breadth becomes MOCK, never PARTIAL", () => {
  const n = INDEX_CONSTITUENTS.nifty.length;
  const raw = calculateBreadth("nifty", quotes(Math.ceil(n * 0.9)), 0.5, NOW, MOCK_SRC as never);
  assert.equal(asMockBreadth(raw).status, "MOCK");
});

test("mock labelling keeps UNAVAILABLE as UNAVAILABLE (no data is not relabelled)", () => {
  const raw = calculateBreadth("nifty", quotes(3), 0.5, NOW, MOCK_SRC as never);
  assert.equal(asMockBreadth(raw).status, "UNAVAILABLE");
});

test("backtest-style calls are unchanged: a MOCK-labelled source still gives LIVE from the calculation", () => {
  const n = INDEX_CONSTITUENTS.nifty.length;
  const raw = calculateBreadth("nifty", quotes(n), 0.5, NOW, MOCK_SRC as never);
  assert.equal(raw.status, "LIVE");
});

test("the mock snapshot breadth is MOCK for both indices", () => {
  assert.equal(mockSnapshot("nifty", NOW).breadth!.status, "MOCK");
  assert.equal(mockSnapshot("banknifty", NOW).breadth!.status, "MOCK");
});

test("engine: MOCK breadth status makes the breadth factor unavailable (not scored)", () => {
  const f = analyzeMarket(mockSnapshot("nifty", NOW), NOW).factors.find((x) => x.key === "breadth")!;
  assert.equal(f.available, false);
});
