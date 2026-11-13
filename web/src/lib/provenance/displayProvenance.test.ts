// Provenance display tests. Labels only. Engine calculations are checked to be unchanged.
import test from "node:test";
import assert from "node:assert/strict";
import { breadthDisplayLabel, dataQualityDisplayLabel, backtestDisplayProvenance } from "./displayProvenance.ts";
import { calculateBreadth } from "../services/breadthService.ts";

const NOW = new Date("2026-11-12T05:00:00.000Z");
const quotes = (n: number) => Array.from({ length: n }, (_, i) => ({
  symbol: `S${i}`, lastPrice: 100, previousClose: 99, change: 1, changePercent: 1.01, timestamp: NOW.toISOString(),
}));

test("synthetic MOCK source is shown as MOCK even when the engine status says LIVE", () => {
  assert.equal(breadthDisplayLabel("LIVE", { source: "MOCK", provider: "MOCK" }), "MOCK");
  assert.equal(breadthDisplayLabel("PARTIAL", { source: "MOCK", provider: "MOCK" }), "MOCK");
});

test("backtest and historical sources are shown as BACKTEST, never LIVE", () => {
  assert.equal(breadthDisplayLabel("LIVE", { source: "HISTORICAL", provider: "UPSTOX" }), "BACKTEST");
  assert.equal(breadthDisplayLabel("LIVE", { source: "BACKTEST", provider: null }), "BACKTEST");
});

test("LIVE is shown only for a LIVE source from the live provider", () => {
  assert.equal(breadthDisplayLabel("LIVE", { source: "LIVE", provider: "UPSTOX" }), "LIVE");
  assert.notEqual(breadthDisplayLabel("LIVE", { source: "LIVE", provider: "MOCK" }), "LIVE");
});

test("stale, delayed and unavailable map to their own labels", () => {
  assert.equal(breadthDisplayLabel("STALE", { source: "STALE", provider: "UPSTOX" }), "STALE");
  assert.equal(breadthDisplayLabel("UNAVAILABLE", { source: "UNAVAILABLE", provider: null }), "UNAVAILABLE");
  assert.equal(breadthDisplayLabel("LIVE", null), "UNAVAILABLE");
});

test("backtest data-quality labels: synthetic and model-derived are MOCK, historical measured is BACKTEST, never LIVE", () => {
  assert.equal(dataQualityDisplayLabel("SYNTHETIC"), "MOCK");
  assert.equal(dataQualityDisplayLabel("MODEL DERIVED"), "MOCK");
  assert.equal(dataQualityDisplayLabel("HISTORICAL MEASURED"), "BACKTEST");
  assert.equal(dataQualityDisplayLabel("RECONSTRUCTED"), "BACKTEST");
  assert.equal(dataQualityDisplayLabel("LIVE"), "LIVE");
  assert.equal(dataQualityDisplayLabel(undefined), "UNAVAILABLE");
});

test("backtestDisplayProvenance labels every input without changing the report", () => {
  const dq = { spot: "HISTORICAL MEASURED", breadth: "SYNTHETIC", oi: "NOT AVAILABLE", note: "x" };
  const before = JSON.stringify(dq);
  const labels = backtestDisplayProvenance(dq);
  assert.equal(labels.spot, "BACKTEST");
  assert.equal(labels.breadth, "MOCK");
  assert.equal(JSON.stringify(dq), before, "input report is not mutated");
});

test("engine breadth calculation is unchanged: status and source are the same with or without the label layer", () => {
  const src = { source: "MOCK" as const, provider: "MOCK" as const, fetchedAt: NOW.toISOString() };
  const b1 = calculateBreadth("nifty", quotes(50), 0.5, NOW, src as never);
  const b2 = calculateBreadth("nifty", quotes(50), 0.5, NOW, src as never);
  assert.equal(b1.status, b2.status);
  assert.equal(b1.status, "LIVE", "engine status is not altered by the display layer");
  assert.equal(b1.source?.source, "MOCK");
  // The display layer reads the value but does not return a different engine object.
  assert.equal(breadthDisplayLabel(b1.status, b1.source), "MOCK");
  assert.equal(b1.status, "LIVE");
});
