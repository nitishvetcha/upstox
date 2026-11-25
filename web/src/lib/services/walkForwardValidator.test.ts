import test from "node:test";
import assert from "node:assert/strict";
import {
  splitChronologicalCandles,
  partitionTradesByRegime,
  computeBootstrapConfidenceIntervals,
  runStatisticalValidation,
} from "./walkForwardValidator.ts";
import type { Candle } from "../types.ts";
import type { ReplayTrade } from "./contractReplayBacktester.ts";

test("WFV-SPLIT-1: Splits candles chronologically into non-overlapping IS and OOS sets", () => {
  const candles: Candle[] = [];
  for (let i = 0; i < 100; i++) {
    candles.push({
      timestamp: `2026-11-20T${String(9 + Math.floor(i / 10)).padStart(2, "0")}:${String((i % 10) * 5).padStart(2, "0")}:00.000Z`,
      open: 25000 + i,
      high: 25010 + i,
      low: 24990 + i,
      close: 25005 + i,
      volume: 1000,
    });
  }

  const { inSample, outOfSample } = splitChronologicalCandles(candles, 0.70);
  assert.equal(inSample.length, 70);
  assert.equal(outOfSample.length, 30);
  assert.equal(inSample[inSample.length - 1].open, 25000 + 69);
  assert.equal(outOfSample[0].open, 25000 + 70);
});

test("WFV-BOOTSTRAP-1: Computes 95% bootstrap confidence intervals across trade distribution", () => {
  const dummyTrades: ReplayTrade[] = [
    {
      tradeId: "T1",
      underlying: "nifty",
      contractSymbol: "NIFTY 25000 CE",
      strike: 25000,
      optionType: "CE",
      entryTime: "2026-11-20T04:00:00.000Z",
      exitTime: "2026-11-20T05:00:00.000Z",
      durationMinutes: 60,
      entrySpot: 25000,
      exitSpot: 25050,
      entryAsk: 100,
      exitBid: 130,
      lots: 1,
      quantity: 65,
      grossPnl: 1950,
      totalCosts: 65,
      netPnl: 1885,
      pnlPercent: 29.0,
      exitReason: "TARGET",
      costBreakdown: {} as any,
    },
    {
      tradeId: "T2",
      underlying: "nifty",
      contractSymbol: "NIFTY 25000 PE",
      strike: 25000,
      optionType: "PE",
      entryTime: "2026-11-20T06:00:00.000Z",
      exitTime: "2026-11-20T06:30:00.000Z",
      durationMinutes: 30,
      entrySpot: 25050,
      exitSpot: 25080,
      entryAsk: 110,
      exitBid: 88,
      lots: 1,
      quantity: 65,
      grossPnl: -1430,
      totalCosts: 65,
      netPnl: -1495,
      pnlPercent: -20.9,
      exitReason: "STOP_LOSS",
      costBreakdown: {} as any,
    },
    {
      tradeId: "T3",
      underlying: "nifty",
      contractSymbol: "NIFTY 25100 CE",
      strike: 25100,
      optionType: "CE",
      entryTime: "2026-11-20T07:00:00.000Z",
      exitTime: "2026-11-20T08:00:00.000Z",
      durationMinutes: 60,
      entrySpot: 25080,
      exitSpot: 25150,
      entryAsk: 95,
      exitBid: 125,
      lots: 1,
      quantity: 65,
      grossPnl: 1950,
      totalCosts: 65,
      netPnl: 1885,
      pnlPercent: 30.5,
      exitReason: "TARGET",
      costBreakdown: {} as any,
    },
  ];

  const ci = computeBootstrapConfidenceIntervals(dummyTrades, 500);
  assert.equal(ci.resamples, 500);
  assert.ok(ci.winRate.mean > 50, "Mean win rate should reflect 2 wins out of 3");
  assert.ok(ci.winRate.ci95Lower <= ci.winRate.mean);
  assert.ok(ci.winRate.ci95Upper >= ci.winRate.mean);
  assert.ok(ci.expectedTradeNetPnl.mean > 0);
});

test("WFV-REGIME-1: Partitions trades by trend, volatility, and session", () => {
  const dummyTrades: ReplayTrade[] = [
    {
      tradeId: "T_MORNING_TREND",
      underlying: "crudeoil",
      contractSymbol: "CRUDEOIL 6800 CE",
      strike: 6800,
      optionType: "CE",
      entryTime: "2026-11-25T05:30:00.000Z", // 11:00 IST
      exitTime: "2026-11-25T06:30:00.000Z",
      durationMinutes: 60,
      entrySpot: 6800,
      exitSpot: 6860, // +0.88% move -> TRENDING
      entryAsk: 120,
      exitBid: 156,
      lots: 1,
      quantity: 100,
      grossPnl: 3600,
      totalCosts: 70,
      netPnl: 3530,
      pnlPercent: 29.4,
      exitReason: "TARGET",
      costBreakdown: {} as any,
    },
    {
      tradeId: "T_EVENING_RANGE",
      underlying: "crudeoil",
      contractSymbol: "CRUDEOIL 6850 PE",
      strike: 6850,
      optionType: "PE",
      entryTime: "2026-11-25T13:30:00.000Z", // 19:00 IST -> EVENING
      exitTime: "2026-11-25T15:00:00.000Z",
      durationMinutes: 90,
      entrySpot: 6860,
      exitSpot: 6870, // +0.14% move -> RANGING
      entryAsk: 110,
      exitBid: 88,
      lots: 1,
      quantity: 100,
      grossPnl: -2200,
      totalCosts: 70,
      netPnl: -2270,
      pnlPercent: -20.6,
      exitReason: "STOP_LOSS",
      costBreakdown: {} as any,
    },
  ];

  const part = partitionTradesByRegime(dummyTrades, "crudeoil");
  assert.equal(part.sessionRegimes.morningSession.tradeCount, 1);
  assert.equal(part.sessionRegimes.eveningSession.tradeCount, 1);
  assert.equal(part.trendRegimes.trending.tradeCount, 1);
  assert.equal(part.trendRegimes.ranging.tradeCount, 1);
  assert.equal(part.trendRegimes.trending.winRatePct, 100);
  assert.equal(part.trendRegimes.ranging.winRatePct, 0);
});
