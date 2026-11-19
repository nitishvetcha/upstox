// Phase 1 hardening: multi-leg engine execution, gap-through-level behaviour, tick-aligned executable prices, charge
// estimates, and performance-claim labels. Deterministic synthetic fixtures; no network; no stored data is written.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeAndValidate } from "./historicalCandles.ts";
import { type HistoricalContext } from "./historicalContext.ts";
import { BacktestEngine } from "../backtestEngine.ts";
import { adverseFill, OPTION_TICK } from "../backtestExecution.ts";
import { costsFor, DEFAULT_TRANSACTION_COSTS } from "./transactionCosts.ts";
import { performanceClaimOf, CLOSE_ONLY_CLAIM, INTRABAR_CLAIM } from "../backtestTiming.ts";
import { summaryRow, compareExecutionModels } from "./backtestScenarios.ts";
import { BACKTEST_IV, priceOption } from "../backtestSnapshot.ts";
import { INDEX_CONSTITUENTS } from "./breadthConfig.ts";
import type { Candle } from "../types.ts";
import type { BacktestRunConfig } from "../backtestTypes.ts";
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
const gapOf = (cs: Candle[], pct: (i: number) => number) => cs.map((c, i) => (i % 25 === 0 ? c : { ...c, open: Math.round(c.open * (1 + pct(i)) * 100) / 100 }));
const highVix = (c: HistoricalContext, v: number): HistoricalContext => ({ ...c, vix: c.vix.map((b) => ({ ...b, open: v, high: v, low: v, close: v })) });
const GAP1 = gapOf(candles, (i) => (i % 2 ? 0.01 : -0.01));
// VIX 20 makes the strategy choose debit spreads (IV percentile high), so multi-leg trades are produced by the engine.
const SPREAD_CTX = (cs: Candle[]) => highVix(ctxFor(cs), 20);
const indexOf = (cs: Candle[], ts: string) => cs.findIndex((c) => c.timestamp === ts);
const onTick = (x: number) => Math.abs(x / OPTION_TICK - Math.round(x / OPTION_TICK)) < 1e-6;

test("PH1. multi-leg execution through the engine: spreads are produced, and each leg is repriced at the fill open", () => {
  for (const cs of [candles, GAP1]) {
    const r = engine.run(BASE, cs, [], META, SPREAD_CTX(cs));
    const multi = r.trades.filter((t) => t.legs.length > 1);
    assert.ok(multi.length > 0, "fixture must produce multi-leg trades");
    for (const t of multi) {
      const fill = cs[indexOf(cs, t.entryBarTimestamp!)];
      for (const l of t.legs) {
        const atOpen = priceOption(l.type, fill.open, l.strike, t.expiry, new Date(t.entryTimestamp), 20);
        assert.ok(Math.abs(atOpen - l.entryMid) < 0.02, `${t.tradeId} ${l.type} ${l.strike}: ${l.entryMid} vs open-based ${atOpen}`);
        assert.equal(l.quantity, t.quantity, `${t.tradeId}: legs carry the trade quantity`);
      }
      // Net entry price is the sum of the legs' executable prices with their signs.
      const net = t.legs.reduce((a, l) => a + (l.side === "BUY" ? l.entryPrice : -l.entryPrice), 0);
      assert.ok(Math.abs(net - t.entryPrice) < 0.011, `${t.tradeId}: entry ${t.entryPrice} vs legs ${net}`);
    }
  }
});

test("PH2. every executable price is tick-aligned, and the fill is adverse to the mid on every leg", () => {
  for (const cs of [candles, GAP1]) for (const model of ["CLOSE_ONLY", "INTRABAR_MODEL_DERIVED"] as const) {
    const r = engine.run({ ...BASE, executionModel: model }, cs, [], META, SPREAD_CTX(cs));
    for (const t of r.trades) for (const l of t.legs) {
      assert.ok(onTick(l.entryPrice) && onTick(l.exitPrice), `${t.tradeId}: fills ${l.entryPrice} / ${l.exitPrice} off the tick`);
      if (l.side === "BUY") assert.ok(l.entryPrice >= l.entryMid, `${t.tradeId}: buy filled below mid`);
      else assert.ok(l.entryPrice <= l.entryMid, `${t.tradeId}: sell filled above mid`);
    }
  }
});

test("PH3. a round trip at the ₹0.05 floor is never free: the position loses at least one tick", () => {
  let floor = 0;
  for (const model of ["CLOSE_ONLY", "INTRABAR_MODEL_DERIVED"] as const) {
    for (const t of engine.run({ ...BASE, executionModel: model }, GAP1, [], META).trades) {
      if (t.legs.length === 1 && t.legs[0].entryMid <= OPTION_TICK + 1e-9 && t.exitTimestamp !== "") {
        floor++;
        assert.ok(t.realizedPnL < 0, `${t.tradeId}: floor round trip P&L ${t.realizedPnL}`);
      }
    }
  }
  assert.ok(floor > 0, "fixture must produce floor-priced positions");
  assert.equal(adverseFill("BUY", 0.05, 0.01), 0.1, "a buy at the floor pays one tick above it");
  assert.equal(adverseFill("SELL", 0.05, 0.01), 0.05, "a sell at the floor cannot go below the tick");
});

test("PH4. a stop gapped through after the fill (INTRABAR) is booked at the open of the gap bar, not at the level", () => {
  const trades = engine.run({ ...BASE, executionModel: "INTRABAR_MODEL_DERIVED" }, candles, [], META).trades
    .filter((t) => t.exitReason === "GAP_EXIT" && !t.exitAtFill);
  assert.ok(trades.length > 0, "fixture must produce a gap-through-stop after the fill");
  for (const t of trades) {
    const bar = candles[indexOf(candles, t.exitTimestamp)];
    for (const l of t.legs) {
      const atOpen = priceOption(l.type, bar.open, l.strike, t.expiry, new Date(t.exitTimestamp), BACKTEST_IV);
      assert.ok(Math.abs(atOpen - l.exitMid) < 0.02, `${t.tradeId}: exit mid ${l.exitMid} vs gap-bar open ${atOpen}`);
    }
  }
});

test("PH5. a target reached inside the bar (INTRABAR) is filled at the target level, not beyond it", () => {
  const trades = engine.run({ ...BASE, executionModel: "INTRABAR_MODEL_DERIVED" }, candles, [], META).trades
    .filter((t) => t.exitReason === "TARGET" && !t.exitAtFill && !t.exitGap && t.legs.length === 1);
  assert.ok(trades.length > 0, "fixture must produce in-bar target exits");
  for (const t of trades) {
    const v = t.legs[0].exitMid * (t.legs[0].side === "BUY" ? 1 : -1);
    // The exit mid is the position value at the crossing: at the target level, within bisection and the mark rounding.
    assert.ok(Math.abs(v - t.target1) <= 0.05 + 0.01 * Math.abs(t.target1), `${t.tradeId}: exit value ${v} vs target ${t.target1}`);
  }
});

test("PH6. CLOSE_ONLY stops are checked at the close only: exits can sit beyond the stop by more than a tick (documented limit)", () => {
  const stops = engine.run({ ...BASE, executionModel: "CLOSE_ONLY" }, candles, [], META).trades.filter((t) => t.exitReason === "STOP_LOSS" && t.legs.length === 1);
  assert.ok(stops.length > 0, "fixture must produce stop exits");
  const beyond = stops.filter((t) => t.legs[0].exitMid < t.stopLoss - OPTION_TICK);
  assert.ok(beyond.length > 0, "the close-only overshoot must be visible in the fixture, so the limit stays documented");
});

test("PH7. fill-time charge estimate covers realized charges on every trade (multi-leg and single-leg)", () => {
  const { costsFor: cf, DEFAULT_TRANSACTION_COSTS: cfg } = { costsFor, DEFAULT_TRANSACTION_COSTS };
  let checked = 0;
  for (const cs of [candles, GAP1]) {
    const r = engine.run(BASE, cs, [], META, SPREAD_CTX(cs));
    for (const t of r.trades) {
      const realized = t.costs?.totalCosts ?? 0;
      if (realized <= 0 || t.riskAmount < 1) continue;
      // The engine's estimate: fills at the fill mids, exit legs at the entry mids, with the charge margin.
      const fills = t.legs.flatMap((l) => {
        const ex: "BUY" | "SELL" = l.side === "BUY" ? "SELL" : "BUY";
        return [{ side: l.side, price: l.entryPrice, quantity: t.quantity }, { side: ex, price: adverseFill(ex, l.entryMid, 0.01), quantity: t.quantity }];
      });
      const est = 1.1 * cf(fills, cfg).totalCosts;
      checked++;
      assert.ok(realized <= est + 0.05 * t.riskAmount, `${t.tradeId}: realized charges ${realized} vs estimate ${est.toFixed(2)} (risk ${t.riskAmount})`);
    }
  }
  assert.ok(checked > 50, `enough trades with charges to test (${checked})`);
});

test("PH8. performance-claim labels: CLOSE_ONLY is disabled, INTRABAR is research only, both on every comparison row", () => {
  assert.equal(performanceClaimOf("CLOSE_ONLY"), CLOSE_ONLY_CLAIM);
  assert.equal(performanceClaimOf("INTRABAR_MODEL_DERIVED"), INTRABAR_CLAIM);
  assert.equal(performanceClaimOf(undefined), CLOSE_ONLY_CLAIM, "unknown models are treated as disabled, never as claimable");
  const cmp = compareExecutionModels(BASE, candles, [], { candleSource: "END_OF_DAY" }, CTX);
  assert.equal(cmp.closeOnly.performanceClaim, CLOSE_ONLY_CLAIM);
  assert.equal(cmp.intrabar.performanceClaim, INTRABAR_CLAIM);
  assert.equal(typeof cmp.closeOnly.slippage, "number", "comparison rows carry slippage");
  assert.ok(cmp.closeOnly.optionPrices.length > 0, "comparison rows carry the option-price label");
  assert.equal(summaryRow(cmp.runs.intrabar).executionModel, "INTRABAR_MODEL_DERIVED");
});
