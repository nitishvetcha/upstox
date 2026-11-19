// exec-next-bar-open-v1: a signal decided at bar N's close fills at bar N+1's open. Deterministic fixtures; no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeAndValidate } from "./historicalCandles.ts";
import { type HistoricalContext } from "./historicalContext.ts";
import { BacktestEngine, EXECUTION_TIMING, EXECUTION_TIMING_VERSION, executionTimingOf } from "../backtestEngine.ts";
import { BACKTEST_IV, priceOption } from "../backtestSnapshot.ts";
import { istDay } from "./performance/metrics.ts";
import { INDEX_CONSTITUENTS } from "./breadthConfig.ts";
import type { Candle } from "../types.ts";
import type { BacktestRunConfig, BacktestTrade } from "../backtestTypes.ts";
console.info = () => {};

// --- fixtures (same shape as phase10.test.ts: 25 fifteen-minute bars per session, weekdays only) ---------------
function sessions(days: number, start = 23000): Candle[] {
  const out: Candle[] = [];
  let p = start;
  for (let k = 0; out.length < days * 25; k++) {
    const day = new Date(Date.parse("2026-09-01T00:00:00Z") + k * 86_400_000);
    if (day.getUTCDay() === 0 || day.getUTCDay() === 6) continue;
    const ymd = day.toISOString().slice(0, 10);
    for (let i = 0; i < 25; i++) {
      const n = out.length;
      p += Math.sin(n / 7) * 18 + Math.cos(n / 3) * 9 + 2.5;
      out.push({ timestamp: new Date(Date.parse(`${ymd}T09:15:00+05:30`) + i * 900_000).toISOString(), open: p - 5, high: p + 12, low: p - 12, close: Math.round(p * 100) / 100, volume: null });
    }
  }
  return out;
}
const candles = sessions(40);
function vixDailyBefore(n: number): Candle[] {
  const out: Candle[] = [];
  for (let t = Date.parse("2026-08-31T00:00:00Z"); out.length < n; t -= 86_400_000) {
    const d = new Date(t);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const ymd = d.toISOString().slice(0, 10);
    const v = 11 + (out.length % 10);
    out.unshift({ timestamp: `${ymd}T00:00:00+05:30`, open: v, high: v, low: v, close: v, volume: null });
  }
  return out;
}
function ctxFor(cs: Candle[]): HistoricalContext {
  const list = INDEX_CONSTITUENTS.nifty.slice(0, 50);
  return {
    index: "nifty",
    vix: cs.map((c, n) => ({ ...c, open: 14, high: 15, low: 13, close: 13 + (n % 20) / 10 })),
    vixDaily: vixDailyBefore(260),
    vixCoverage: null,
    constituents: list.map((c, k) => ({ symbol: c.symbol, candles: cs.map((b, n) => ({ ...b, close: Math.round((b.close / 20 + Math.sin(n / (k + 3)) * 4 + k) * 100) / 100 })) })),
    constituentCoverage: list.map((c) => ({ symbol: c.symbol, bars: cs.length, firstDay: null, lastDay: null, coveragePercent: 100 })),
    expectedConstituents: INDEX_CONSTITUENTS.nifty.length,
    membershipAsOf: "2026-10-05",
    survivorshipBiasRisk: true,
  };
}
const CTX = ctxFor(candles);
const BASE: BacktestRunConfig = { index: "nifty", timeframe: "15m", startDate: "2026-09-01", endDate: "2026-10-31", startingCapital: 1_000_000 };
const META = { candleSource: "END_OF_DAY" as const, coverage: mergeAndValidate([candles], "2026-09-01", "2026-10-31", "15m", 1).coverage };
const engine = new BacktestEngine();
const PHASE10 = engine.run(BASE, candles, [], META, CTX);
const LEGACY = engine.run(BASE, candles, [], META);
const indexOf = (ts: string) => candles.findIndex((c) => c.timestamp === ts);
const trades = (r: { trades: BacktestTrade[] }) => r.trades;
// Position value in the plan's units at mid prices: debit = net value; credit = −net (what it costs to close).
const valueAtMid = (t: BacktestTrade) => {
  const net = t.legs.reduce((a, l) => a + (l.side === "BUY" ? l.entryMid : -l.entryMid), 0);
  return t.credit ? -net : net;
};

test("NB1. both data models produce trades on the fixture (the checks below are not vacuous)", () => {
  assert.ok(trades(PHASE10).length > 0, "PHASE10 fixture produces trades");
  assert.ok(trades(LEGACY).length > 0, "legacy fixture produces trades");
});

test("NB2. every entry fills at the OPEN of the bar after the signal bar", () => {
  for (const r of [PHASE10, LEGACY]) {
    for (const t of trades(r)) {
      assert.ok(t.signalBarTimestamp && t.entryBarTimestamp, t.tradeId);
      assert.equal(indexOf(t.entryBarTimestamp!) - indexOf(t.signalBarTimestamp!), 1, `${t.tradeId}: entry bar must be the next bar`);
      assert.equal(t.entryTimestamp, t.entryBarTimestamp, `${t.tradeId}: fills at the bar open`);
    }
  }
});

test("NB3. no trade enters on the bar that produced its signal (the same-candle defect is gone)", () => {
  for (const t of [...trades(PHASE10), ...trades(LEGACY)]) assert.notEqual(t.entryBarTimestamp, t.signalBarTimestamp, t.tradeId);
});

test("NB4. the signal bar is never the last bar of a session (the next bar is the next day, so it cannot fill)", () => {
  for (const t of [...trades(PHASE10), ...trades(LEGACY)]) {
    assert.notEqual(indexOf(t.signalBarTimestamp!) % 25, 24, `${t.tradeId} signalled on a session's last bar`);
    assert.equal(t.entrySession, istDay(t.entryTimestamp), t.tradeId);
    assert.equal(istDay(t.entryBarTimestamp!), istDay(t.signalBarTimestamp!), `${t.tradeId} crosses a session`);
  }
});

test("NB5. legacy-model entry prices are the model's option price at the NEXT bar's open, not at the signal close", () => {
  let differsFromSignalClose = 0;
  for (const t of trades(LEGACY)) {
    const entryBar = candles[indexOf(t.entryBarTimestamp!)];
    const signalBar = candles[indexOf(t.signalBarTimestamp!)];
    for (const l of t.legs) {
      const atOpen = priceOption(l.type, entryBar.open, l.strike, t.expiry, new Date(t.entryTimestamp), BACKTEST_IV);
      assert.ok(Math.abs(atOpen - l.entryMid) < 0.02, `${t.tradeId} ${l.type} ${l.strike}: ${l.entryMid} vs open-based ${atOpen}`);
      const atClose = priceOption(l.type, signalBar.close, l.strike, t.expiry, new Date(t.signalTimestamp), BACKTEST_IV);
      if (Math.abs(atClose - l.entryMid) > 0.02) differsFromSignalClose++;
    }
  }
  assert.ok(differsFromSignalClose > 0, "at least one leg is priced differently from the signal-close price");
});

test("NB6. open positions keep their stop and target on the correct side of the fill value; a level already passed at the open is booked at the open", () => {
  for (const t of [...trades(PHASE10), ...trades(LEGACY)]) {
    const v = valueAtMid(t);
    if (t.exitAtFill && t.exitReason === "GAP_EXIT") {
      // Gapped through the stop at the open: the value at the open is beyond the stop (never hidden by moving the level).
      assert.ok(t.credit ? v >= t.stopLoss : v <= t.stopLoss, `${t.tradeId} GAP_EXIT but value ${v} inside stop ${t.stopLoss}`);
      continue;
    }
    if (t.exitAtFill && t.exitReason === "TARGET") {
      assert.ok(t.credit ? v <= t.target1 : v >= t.target1, `${t.tradeId} TARGET at open but value ${v} below target ${t.target1}`);
      continue;
    }
    if (t.exitTimestamp === t.entryTimestamp) continue; // legacy same-bar exits (stamped at the bar open): no open-level claim
    if (t.credit) assert.ok(t.target1 < v && v < t.stopLoss, `${t.tradeId} credit: target ${t.target1} < value ${v} < stop ${t.stopLoss}`);
    else assert.ok(t.stopLoss < v && v < t.target1, `${t.tradeId} debit: stop ${t.stopLoss} < value ${v} < target ${t.target1}`);
  }
});
test("NB7. every trade's modeled risk is within the per-trade budget after re-sizing at the fill", () => {
  for (const r of [PHASE10, LEGACY]) {
    for (const t of trades(r)) assert.ok(t.riskAmount <= BASE.startingCapital * 0.01 + 1, `${t.tradeId} risk ${t.riskAmount}`);
  }
});

test("NB8. the run is deterministic and carries the execution-timing marker", () => {
  const again = engine.run(BASE, candles, [], META, CTX);
  assert.equal(again.runId, PHASE10.runId);
  assert.deepEqual(trades(again).map((t) => [t.tradeId, t.entryTimestamp, t.lots, t.entryPrice]), trades(PHASE10).map((t) => [t.tradeId, t.entryTimestamp, t.lots, t.entryPrice]));
  assert.equal(PHASE10.metadata?.executionTiming, EXECUTION_TIMING);
  assert.equal(PHASE10.metadata?.executionTimingVersion, EXECUTION_TIMING_VERSION);
  assert.equal(PHASE10.execution.entryTiming, EXECUTION_TIMING);
  assert.equal(executionTimingOf(PHASE10), "NEXT_BAR_OPEN");
});

test("NB9. stored runs without the marker are labelled LEGACY_SAME_CANDLE on read (never rewritten)", () => {
  assert.equal(executionTimingOf({ metadata: { dataModel: "PHASE10" } }), "LEGACY_SAME_CANDLE");
  assert.equal(executionTimingOf({ metadata: null, execution: null }), "LEGACY_SAME_CANDLE");
  assert.equal(executionTimingOf({ metadata: { executionTiming: "NEXT_BAR_OPEN" } }), "NEXT_BAR_OPEN");
  assert.equal(executionTimingOf({ execution: { entryTiming: "NEXT_BAR_OPEN" } }), "NEXT_BAR_OPEN");
});

test("NB10. a decision on the final bar is counted as unfilled, never booked", () => {
  const last = candles[candles.length - 1].timestamp; // the fixture ends inside the run window
  for (const t of [...trades(PHASE10), ...trades(LEGACY)]) assert.notEqual(t.signalBarTimestamp, last, t.tradeId);
});
