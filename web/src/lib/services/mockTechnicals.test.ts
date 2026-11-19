// Known-answer tests: mock technical analysis is derived from the same snapshot indicators the cards read.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mockTechnicalAnalysis } from "./mockMarket.ts";
import { mockSnapshot } from "./mock.ts";

const NOW = new Date("2026-11-11T04:30:00.000Z");

test("NIFTY: chart analysis carries the snapshot EMA, RSI and levels unchanged", () => {
  const s = mockSnapshot("nifty", NOW);
  const a = mockTechnicalAnalysis(s.indicators, s.spot, s.prevClose, "15m")!;
  assert.equal(a.ema9, s.indicators!.ema9);
  assert.equal(a.ema21, s.indicators!.ema21);
  assert.equal(a.ema50, s.indicators!.ema50);
  assert.equal(a.ema200, s.indicators!.ema200);
  assert.equal(a.rsi, s.indicators!.rsi);
  assert.equal(a.macdHistogram, s.indicators!.macdHist);
  assert.equal(a.previousDayHigh, s.indicators!.pdh);
  assert.equal(a.previousDayLow, s.indicators!.pdl);
  assert.equal(a.openingRangeHigh, s.indicators!.orHigh);
  assert.equal(a.openingRangeLow, s.indicators!.orLow);
  assert.equal(a.previousDayClose, s.prevClose);
  assert.equal(a.price, s.spot);
});

test("snapshot atr is DAILY ATR: it maps to dailyAtr, and the 15m ATR stays null", () => {
  const s = mockSnapshot("nifty", NOW);
  const a = mockTechnicalAnalysis(s.indicators, s.spot, s.prevClose, "15m")!;
  assert.equal(a.dailyAtr, s.indicators!.atr);
  assert.equal(a.atr, null);
});

test("values the snapshot does not carry stay null, never copied or invented", () => {
  const s = mockSnapshot("nifty", NOW);
  const a = mockTechnicalAnalysis(s.indicators, s.spot, s.prevClose, "15m")!;
  assert.equal(a.macd, null);
  assert.equal(a.macdSignal, null);
  assert.equal(a.vwap, null);
  assert.equal(a.futuresVwap, null);
  assert.equal(a.candleCount, 0);
  assert.equal(a.lastCandleAt, "");
});

test("BANK NIFTY maps its own snapshot values, not NIFTY's", () => {
  const n = mockSnapshot("nifty", NOW);
  const b = mockSnapshot("banknifty", NOW);
  const an = mockTechnicalAnalysis(n.indicators, n.spot, n.prevClose, "15m")!;
  const ab = mockTechnicalAnalysis(b.indicators, b.spot, b.prevClose, "15m")!;
  assert.equal(ab.ema9, b.indicators!.ema9);
  assert.notEqual(ab.ema9, an.ema9);
  assert.equal(ab.price, b.spot);
});

test("non-15m timeframes get no analysis (the snapshot is 15m only), and missing indicators give null", () => {
  const s = mockSnapshot("nifty", NOW);
  assert.equal(mockTechnicalAnalysis(s.indicators, s.spot, s.prevClose, "5m"), null);
  assert.equal(mockTechnicalAnalysis(s.indicators, s.spot, s.prevClose, "1d"), null);
  assert.equal(mockTechnicalAnalysis(null, s.spot, s.prevClose, "15m"), null);
});
