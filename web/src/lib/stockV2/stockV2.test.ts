// Stock V2 foundation tests. Synthetic fixtures only: no network, no production data, no performance claims.
import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { atr, ema, sessionVwap, type Bar } from "./indicators.ts";
import { adverse, COSTS, evaluateGates, rewardToRisk, RISK, roundTripCharges, sizePosition, type GateInputs } from "./risk.ts";
import { istDate, istMinute, simulateStock, type Trade } from "./simulate.ts";
import { groupBy, summarize } from "./metrics.ts";

const OPEN: GateInputs = { marketState: "NORMAL_OPEN", eventRisk: "NONE", indiaVix: 14, niftyAtrPct: 0.9, verifiedLiveStocks: 50 };
const ist = (date: string, min: number) => `${date}T${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}:00+05:30`;

// One regular session, 375 bars from 09:15 IST. `path(k)` returns OHLCV for bar k.
function session(date: string, path: (k: number) => { o: number; h: number; l: number; c: number; v: number }): Bar[] {
  return Array.from({ length: 375 }, (_, k) => {
    const p = path(k);
    return { timestamp: ist(date, 555 + k), open: p.o, high: p.h, low: p.l, close: p.c, volume: p.v };
  });
}
const flat = (price: number) => () => ({ o: price, h: price, l: price, c: price, v: 1000 });
const uptrend = (start: number, slope = 0.005) => (k: number) => {
  const o = k === 0 ? start : start + slope * (k - 1) + 0.03; // gap so next-open differs from prior close
  const c = start + slope * k;
  return { o, h: Math.max(o, c) + 0.1, l: Math.min(o, c) - 0.1, c, v: 1000 };
};

describe("indicators", () => {
  it("EMA is null until the period is filled, then equals the constant", () => {
    const e = ema(Array(12).fill(50), 9);
    assert.equal(e[7], null);
    assert.equal(e[8], 50);
    assert.equal(e[11], 50);
  });

  it("EMA seeds with the SMA of the first period and follows the smoothing factor", () => {
    const e = ema([1, 2, 3, 4], 2); // seed (1+2)/2 = 1.5 at index 1; k = 2/3
    assert.equal(e[1], 1.5);
    assert.ok(Math.abs((e[2] as number) - (3 * (2 / 3) + 1.5 * (1 / 3))) < 1e-12);
  });

  it("session VWAP is the volume-weighted typical price and is null while volume is zero", () => {
    const bars: Bar[] = [
      { timestamp: "t1", open: 10, high: 12, low: 8, close: 10, volume: 100 },
      { timestamp: "t2", open: 10, high: 20, low: 10, close: 20, volume: 300 },
    ];
    const v = sessionVwap(bars);
    assert.equal(v[0], 10);
    assert.ok(Math.abs((v[1] as number) - ((10 * 100 + 16.667 * 300) / 400)) < 0.01);
    assert.equal(sessionVwap([{ ...bars[0], volume: 0 }])[0], null);
  });

  it("VWAP resets when a new session is passed in", () => {
    const a = sessionVwap([{ timestamp: "a", open: 100, high: 100, low: 100, close: 100, volume: 10 }]);
    const b = sessionVwap([{ timestamp: "b", open: 200, high: 200, low: 200, close: 200, volume: 10 }]);
    assert.equal(a[0], 100);
    assert.equal(b[0], 200);
  });

  it("ATR is null until enough bars exist and is positive for a moving series", () => {
    const bars = session("2026-11-03", uptrend(100));
    const a = atr(bars, 14);
    assert.equal(a[13], null);
    assert.ok((a[100] as number) > 0);
  });
});

describe("market gates fail closed", () => {
  it("a missing input never passes and is named", () => {
    const g = evaluateGates({ marketState: null, eventRisk: null, indiaVix: null, niftyAtrPct: null, verifiedLiveStocks: null });
    assert.equal(g.allowed, false);
    for (const dep of ["market_state", "event_risk", "india_vix", "nifty_atr", "verified_live_stocks"]) {
      assert.ok(g.reasons.includes(`MISSING_DEPENDENCY:${dep}`), dep);
    }
  });

  it("all inputs within limits pass", () => {
    assert.equal(evaluateGates(OPEN).allowed, true);
  });

  it("each documented limit blocks", () => {
    assert.equal(evaluateGates({ ...OPEN, marketState: "PRE_OPEN" }).allowed, false);
    assert.equal(evaluateGates({ ...OPEN, eventRisk: "HIGH" }).allowed, false);
    assert.equal(evaluateGates({ ...OPEN, eventRisk: "EXTREME" }).allowed, false);
    assert.equal(evaluateGates({ ...OPEN, indiaVix: 25.5 }).allowed, false);
    assert.equal(evaluateGates({ ...OPEN, niftyAtrPct: 1.6 }).allowed, false);
    assert.equal(evaluateGates({ ...OPEN, verifiedLiveStocks: 19 }).allowed, false);
  });

  it("MEDIUM event risk passes with a 0.5 factor", () => {
    const g = evaluateGates({ ...OPEN, eventRisk: "MEDIUM" });
    assert.equal(g.allowed, true);
    assert.equal(g.eventFactor, 0.5);
  });

  it("exact boundaries pass: VIX 25, ATR 1.5%, 20 stocks", () => {
    assert.equal(evaluateGates({ ...OPEN, indiaVix: 25, niftyAtrPct: 1.5, verifiedLiveStocks: 20 }).allowed, true);
  });
});

describe("sizing, reward-to-risk and costs", () => {
  it("risks 1% of capital, rounded down to whole shares", () => {
    const s = sizePosition(100, 99, "NONE", 1_000_000);
    assert.equal(s.ok && s.qty, 10_000); // 10,000 budget / 1 per share
    const t = sizePosition(100, 98.5, "NONE", 1_000_000);
    assert.equal(t.ok && t.qty, 6_666); // 10,000 / 1.5 = 6666.67
  });

  it("notional never exceeds capital; a tight stop is capped and reported", () => {
    const s = sizePosition(100, 99.9, "NONE", 1_000_000);
    assert.ok(s.ok);
    if (!s.ok) return;
    assert.equal(s.qty, 10_000);
    assert.ok(s.qty * 100 <= 1_000_000);
    assert.equal(s.cappedByCapital, true);
    const wide = sizePosition(100, 99, "NONE", 1_000_000);
    assert.ok(wide.ok && wide.cappedByCapital === false);
  });

  it("MEDIUM halves the budget; HIGH and EXTREME reject", () => {
    const m = sizePosition(100, 99, "MEDIUM", 1_000_000);
    assert.equal(m.ok && m.qty, 5_000);
    assert.deepEqual(sizePosition(100, 99, "HIGH", 1_000_000), { ok: false, reason: "EVENT_RISK_HIGH" });
    assert.deepEqual(sizePosition(100, 99, "EXTREME", 1_000_000), { ok: false, reason: "EVENT_RISK_EXTREME" });
  });

  it("rejects zero risk and sub-one quantity", () => {
    assert.equal(sizePosition(100, 100, "NONE").ok, false);
    assert.deepEqual(sizePosition(100, 0.01, "NONE", 100), { ok: false, reason: "QTY_BELOW_ONE" });
  });

  it("reward-to-risk is target distance over stop distance", () => {
    assert.equal(rewardToRisk(100, 99, 102), 2);
    assert.equal(rewardToRisk(100, 100, 102), null);
  });

  it("slippage is adverse on entries and stops, and absent on targets by construction", () => {
    assert.ok(adverse("LONG", 100, "ENTRY") > 100);
    assert.ok(adverse("LONG", 100, "STOP_EXIT") < 100);
    assert.ok(adverse("SHORT", 100, "ENTRY") < 100);
    assert.ok(adverse("SHORT", 100, "TIME_EXIT") > 100);
  });

  it("round-trip charges match the documented formula", () => {
    const c = roundTripCharges("LONG", 100, 101, 100);
    const buy = 10_000, sell = 10_100, turnover = 20_100;
    const brokerage = Math.min(COSTS.brokeragePct * buy, 20) + Math.min(COSTS.brokeragePct * sell, 20);
    const gst = 0.18 * (brokerage + COSTS.exchangePct * turnover + COSTS.sebiPct * turnover);
    const expected = brokerage + COSTS.exchangePct * turnover + COSTS.sebiPct * turnover + COSTS.sttSellPct * sell + COSTS.stampBuyPct * buy + gst;
    assert.ok(Math.abs(c.total - expected) < 1e-9);
    assert.ok(c.total > 0);
  });

  it("STT applies to the sell side only and stamp duty to the buy side only", () => {
    const longC = roundTripCharges("LONG", 100, 100, 100);
    assert.ok(Math.abs(longC.stt - COSTS.sttSellPct * 10_000) < 1e-9);
    assert.ok(Math.abs(longC.stamp - COSTS.stampBuyPct * 10_000) < 1e-9);
    const shortC = roundTripCharges("SHORT", 100, 100, 100);
    assert.ok(Math.abs(shortC.stt - COSTS.sttSellPct * 10_000) < 1e-9);
    assert.ok(Math.abs(shortC.stamp - COSTS.stampBuyPct * 10_000) < 1e-9);
  });

  it("brokerage is capped at ₹20 per order", () => {
    const c = roundTripCharges("LONG", 1000, 1000, 100_000);
    assert.ok(c.brokerage <= 40 + 1e-9);
  });
});

describe("time window and calendar", () => {
  it("IST minute and date are derived from the timestamp", () => {
    assert.equal(istMinute("2026-11-03T09:30:00+05:30"), 570);
    assert.equal(istDate("2026-11-03T09:15:00+05:30"), "2026-11-03");
    assert.equal(istDate("2026-11-02T23:59:00+05:30"), "2026-11-02");
  });
});

describe("simulator: causality and execution", () => {
  // 1 prior flat day for EMA200 warmup, then the test session.
  const prior = session("2026-11-02", flat(100));

  it("a signal at bar i enters at the open of bar i+1, never at the close of bar i", () => {
    const day = session("2026-11-03", uptrend(100));
    const { trades } = simulateStock("TEST", [...prior, ...day], { "2026-11-03": OPEN }, { strategy: "TREND_RECLAIM" });
    assert.ok(trades.length >= 1, "fixture should produce a trade");
    const t = trades[0];
    const idx = day.findIndex((b) => b.timestamp === t.entryTime);
    assert.ok(idx > 0);
    const signalBar = day[idx - 1];
    assert.ok(Math.abs(t.entryFill - adverse("LONG", day[idx].open, "ENTRY")) < 1e-9);
    assert.notEqual(t.entryFill, adverse("LONG", signalBar.close, "ENTRY"));
  });

  it("changing bars after the entry bar cannot change the entry decision", () => {
    const day = session("2026-11-03", uptrend(100));
    const altered = day.map((b, k) => (k > 150 ? { ...b, open: 50, high: 50, low: 50, close: 50 } : b));
    const a = simulateStock("TEST", [...prior, ...day], { "2026-11-03": OPEN }, { strategy: "TREND_RECLAIM" }).trades[0];
    const b = simulateStock("TEST", [...prior, ...altered], { "2026-11-03": OPEN }, { strategy: "TREND_RECLAIM" }).trades[0];
    assert.ok(a && b);
    assert.equal(a.entryTime, b.entryTime);
    assert.equal(a.entryFill, b.entryFill);
    assert.equal(a.side, b.side);
  });

  it("at most one trade per stock per session", () => {
    const day = session("2026-11-03", uptrend(100));
    const { trades } = simulateStock("TEST", [...prior, ...day], { "2026-11-03": OPEN }, { strategy: "TREND_RECLAIM" });
    assert.equal(trades.filter((t) => t.date === "2026-11-03").length, 1);
  });

  it("a stock already well above its session low fails the 1.5 reward-to-risk rule (V1 stop/target methodology)", () => {
    const day = session("2026-11-03", uptrend(100, 0.05));
    const r = simulateStock("TEST", [...prior, ...day], { "2026-11-03": OPEN }, { strategy: "TREND_RECLAIM" });
    assert.equal(r.trades.length, 0);
    assert.equal(r.sessions.find((x) => x.date === "2026-11-03")?.status, "REJECTED_PLAN");
    assert.ok(r.sessions.find((x) => x.date === "2026-11-03")?.reasons.every((x) => x.includes("RR_BELOW_1_5")));
  });

  it("no signal is taken before 09:30 or at/after 14:00", () => {
    const day = session("2026-11-03", uptrend(100));
    const { trades } = simulateStock("TEST", [...prior, ...day], { "2026-11-03": OPEN }, { strategy: "TREND_RECLAIM" });
    const t = trades[0];
    assert.ok(t);
    assert.ok(istMinute(t.entryTime) >= 9 * 60 + 31, "entry bar follows a signal at or after 09:30");
    assert.ok(istMinute(t.entryTime) <= 14 * 60, "entry bar follows a signal before 14:00");
  });

  it("no position is held into the 15:15 square-off", () => {
    const day = session("2026-11-03", uptrend(100));
    const { trades } = simulateStock("TEST", [...prior, ...day], { "2026-11-03": OPEN }, { strategy: "TREND_RECLAIM" });
    for (const t of trades) assert.ok(istMinute(t.exitTime) < 15 * 60 + 15);
  });

  it("exit invariants hold for every trade: stop exits touch the stop, target exits have no earlier stop touch", () => {
    const day = session("2026-11-03", (k) => {
      if (k < 60) return uptrend(100)(k);
      if (k === 60) return { o: 102, h: 140, l: 60, c: 103, v: 1000 }; // touches both levels in one bar
      return uptrend(100)(k);
    });
    const { trades } = simulateStock("TEST", [...prior, ...day], { "2026-11-03": OPEN }, { strategy: "TREND_RECLAIM" });
    for (const t of trades) {
      const bars = day.filter((b) => b.timestamp >= t.entryTime && b.timestamp <= t.exitTime);
      if (t.exitReason === "STOP") {
        const last = bars[bars.length - 1];
        assert.ok(t.side === "LONG" ? last.low <= t.stop : last.high >= t.stop);
      }
      if (t.exitReason === "TARGET") {
        for (const b of bars.slice(0, -1)) assert.ok(t.side === "LONG" ? b.low > t.stop : b.high < t.stop, "earlier stop touch");
      }
    }
  });

  it("a session with zero volume has no VWAP and produces no trade", () => {
    const zero = session("2026-11-03", (k) => ({ ...uptrend(100)(k), v: 0 }));
    const { trades, sessions } = simulateStock("TEST", [...prior, ...zero], { "2026-11-03": OPEN }, { strategy: "TREND_RECLAIM" });
    assert.equal(trades.length, 0);
    assert.equal(sessions.find((s) => s.date === "2026-11-03")?.status, "NO_SIGNAL");
  });

  it("missing gate inputs produce no trade and name the missing dependency", () => {
    const day = session("2026-11-03", uptrend(100));
    const { trades, sessions } = simulateStock("TEST", [...prior, ...day], {}, { strategy: "TREND_RECLAIM" });
    assert.equal(trades.length, 0);
    const s = sessions.find((x) => x.date === "2026-11-03");
    assert.equal(s?.status, "GATED");
    assert.ok(s?.reasons.includes("MISSING_DEPENDENCY:nifty_atr"));
  });

  it("a session that fails a gate is never traded", () => {
    const day = session("2026-11-03", uptrend(100));
    const { trades } = simulateStock("TEST", [...prior, ...day], { "2026-11-03": { ...OPEN, indiaVix: 30 } }, { strategy: "TREND_RECLAIM" });
    assert.equal(trades.length, 0);
  });
});

describe("metrics", () => {
  const mk = (netR: number, netPnl: number, side: "LONG" | "SHORT" = "LONG", t = "2026-11-03T10:00:00+05:30"): Trade => ({
    symbol: "X", strategy: "TREND_RECLAIM", scenario: "BASE", date: "2026-11-03", side, signalTime: t, entryTime: t, entryFill: 100, stop: 99, target: 101,
    exitTime: t, exitFill: 100, exitReason: netPnl > 0 ? "TARGET" : "STOP", qty: 1, riskAmount: 1, eventFactor: 1, notional: 100,
    grossPnl: netPnl, charges: 0, netPnl, grossR: netR, netR, holdMinutes: 0, plannedRR: 2,
  });

  it("win rate, profit factor and expectancy are computed on net P&L", () => {
    const s = summarize([mk(2, 200), mk(-1, -100), mk(1, 100), mk(-1, -100)]);
    assert.equal(s.trades, 4);
    assert.equal(s.winRate, 0.5);
    assert.equal(s.profitFactor, 1.5); // 300 / 200
    assert.equal(s.expectancyR, 0.25);
    assert.equal(s.avgWinR, 1.5);
    assert.equal(s.avgLossR, -1);
  });

  it("max drawdown and consecutive losses come from the chronological sequence", () => {
    const s = summarize([mk(1, 100, "LONG", "2026-11-03T10:00:00+05:30"), mk(-1, -100, "LONG", "2026-11-03T10:10:00+05:30"), mk(-1, -100, "LONG", "2026-11-03T10:20:00+05:30"), mk(2, 200, "LONG", "2026-11-03T10:30:00+05:30")]);
    assert.equal(s.maxDrawdownPnl, 200);
    assert.equal(s.maxConsecutiveLosses, 2);
  });

  it("LONG and SHORT are counted separately and grouping works", () => {
    const trades = [mk(1, 100, "LONG"), mk(-1, -100, "SHORT")];
    assert.equal(summarize(trades).longs, 1);
    assert.equal(summarize(trades).shorts, 1);
    assert.equal(groupBy(trades, (t) => t.side).SHORT.trades, 1);
  });

  it("empty input yields null rates, never zero", () => {
    const s = summarize([]);
    assert.equal(s.winRate, null);
    assert.equal(s.profitFactor, null);
    assert.equal(s.expectancyR, null);
  });
});

describe("constants", () => {
  it("match the approved risk parameters", () => {
    assert.equal(RISK.riskPct, 0.01);
    assert.equal(RISK.minRewardToRisk, 1.5);
    assert.equal(RISK.maxIndiaVix, 25);
    assert.equal(RISK.maxNiftyAtrPct, 1.5);
    assert.equal(RISK.minVerifiedLiveStocks, 20);
  });
});
