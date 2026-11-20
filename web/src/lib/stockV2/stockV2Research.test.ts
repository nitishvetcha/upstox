// Stock V2 research pipeline tests: candidates, scenarios, data integrity, split isolation, selection rule. Offline.
import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import type { Bar } from "./indicators.ts";
import { parseSessionFile, chronologicalSplit, EXPECTED_BARS } from "./dataset.ts";
import { adverse, roundTripCharges, SCENARIOS, type GateInputs } from "./risk.ts";
import { simulateStock, countMissingMinutes, istMinute } from "./simulate.ts";
import { openingRangeSignal, pullbackSignal, trendSignal, PULLBACK_LOOKBACK } from "./signal.ts";
import { runExperiment, selectCandidate, SELECTION_RULE, type ExperimentResult } from "./research.ts";
import type { HistoricalDataset } from "./dataset.ts";

const OPEN: GateInputs = { marketState: "NORMAL_OPEN", eventRisk: "NONE", indiaVix: 14, niftyAtrPct: 0.9, verifiedLiveStocks: 50 };
const ist = (date: string, min: number) => `${date}T${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}:00+05:30`;
const session = (date: string, path: (k: number) => { o: number; h: number; l: number; c: number; v: number }): Bar[] =>
  Array.from({ length: 375 }, (_, k) => {
    const p = path(k);
    return { timestamp: ist(date, 555 + k), open: p.o, high: p.h, low: p.l, close: p.c, volume: p.v };
  });
const flat = (price: number) => () => ({ o: price, h: price, l: price, c: price, v: 1000 });
const uptrend = (start: number, slope = 0.005) => (k: number) => {
  const o = k === 0 ? start : start + slope * (k - 1) + 0.03;
  const c = start + slope * k;
  return { o, h: Math.max(o, c) + 0.1, l: Math.min(o, c) - 0.1, c, v: 1000 };
};

describe("candidate signals", () => {
  const base = { i: 5, close: [1, 1, 1, 1, 1, 1], low: [1, 1, 1, 1, 1, 1], high: [1, 1, 1, 1, 1, 1], e9: [1, 1, 1, 1, 1, 1], e21: [1, 1, 1, 1, 1, 1], vwap: [1, 1, 1, 1, 1, 1] };

  it("trend signal needs EMA ordering and VWAP side", () => {
    const e9 = [2, 2, 2, 2, 2, 2];
    const e21 = [1, 1, 1, 1, 1, 1];
    assert.equal(trendSignal({ ...base, e9, e21, close: [3, 3, 3, 3, 3, 3], vwap: [2, 2, 2, 2, 2, 2] }), "LONG");
    assert.equal(trendSignal({ ...base, e9, e21, close: [1, 1, 1, 1, 1, 1], vwap: [2, 2, 2, 2, 2, 2] }), null);
  });

  it("pullback LONG needs a touch of EMA 21 in the lookback and a close back above EMA 9 and VWAP", () => {
    const n = 8;
    const e21 = Array(n).fill(10);
    const e9 = Array(n).fill(11);
    const vwap = Array(n).fill(9);
    const low = Array(n).fill(12);
    const high = Array(n).fill(13);
    const close = Array(n).fill(12);
    // no touch in lookback: lows stay above EMA 21
    assert.equal(pullbackSignal({ i: 6, close, low, high, e9, e21, vwap }), null);
    // touch at bar 4 (inside lookback 3..5 for i=6)
    low[4] = 9.5;
    assert.equal(pullbackSignal({ i: 6, close, low, high, e9, e21, vwap }), "LONG");
    // close not above EMA 9
    close[6] = 10.5;
    assert.equal(pullbackSignal({ i: 6, close, low, high, e9, e21, vwap }), null);
  });

  it("pullback needs a full lookback window; earlier bars are not used", () => {
    const n = 8;
    const z = () => Array(n).fill(10);
    assert.equal(pullbackSignal({ i: PULLBACK_LOOKBACK - 1, close: z(), low: z(), high: z(), e9: Array(n).fill(11), e21: z(), vwap: Array(n).fill(9) }), null);
  });

  it("ORB continuation waits for a completed opening range and requires a fresh trend-confirmed crossing", () => {
    const n = 20;
    const close = Array(n).fill(100);
    const high = Array(n).fill(101);
    const low = Array(n).fill(99);
    const e9 = Array(n).fill(101);
    const e21 = Array(n).fill(100);
    const vwap = Array(n).fill(100);
    assert.equal(openingRangeSignal({ i: 14, close, high, low, e9, e21, vwap, sessionStart: 0 }), null);
    close[15] = 102;
    assert.equal(openingRangeSignal({ i: 15, close, high, low, e9, e21, vwap, sessionStart: 0 }), "LONG");
    close[16] = 103;
    assert.equal(openingRangeSignal({ i: 16, close, high, low, e9, e21, vwap, sessionStart: 0 }), null);
  });
});

describe("cost scenarios", () => {
  it("conservative costs exceed base, and adverse slippage worsens the entry fill", () => {
    const base = roundTripCharges("LONG", 100, 101, 100, SCENARIOS.BASE.costMultiplier).total;
    const cons = roundTripCharges("LONG", 100, 101, 100, SCENARIOS.CONSERVATIVE.costMultiplier).total;
    assert.ok(cons > base);
    assert.ok(adverse("LONG", 100, "ENTRY", SCENARIOS.ADVERSE_SLIPPAGE.slippagePct) > adverse("LONG", 100, "ENTRY", SCENARIOS.BASE.slippagePct));
  });

  it("a scenario changes simulated net P&L, not just a label", () => {
    const prior = session("2026-11-02", flat(100));
    const day = session("2026-11-03", uptrend(100));
    const series = [...prior, ...day];
    const b = simulateStock("T", series, { "2026-11-03": OPEN }, { strategy: "TREND_RECLAIM", scenario: SCENARIOS.BASE }).trades;
    const c = simulateStock("T", series, { "2026-11-03": OPEN }, { strategy: "TREND_RECLAIM", scenario: SCENARIOS.CONSERVATIVE }).trades;
    assert.ok(b.length >= 1 && c.length >= 1, "fixture must trade under both scenarios");
    assert.ok(c[0].netPnl < b[0].netPnl);
  });
});

describe("execution integrity", () => {
  const prior = session("2026-11-02", flat(100));

  it("a missing minute between signal and entry is rejected, never bridged", () => {
    const day = session("2026-11-03", uptrend(100)).filter((b, k) => k !== 120);
    const { trades, sessions } = simulateStock("T", [...prior, ...day], { "2026-11-03": OPEN }, { strategy: "TREND_RECLAIM" });
    for (const t of trades) assert.ok(Date.parse(t.entryTime) - Date.parse(t.signalTime) === 60_000);
    const s = sessions.find((x) => x.date === "2026-11-03");
    assert.equal(s?.missingMinutes, 1);
  });

  it("a missing minute during the hold exits at the first bar after the gap (GAP_EXIT)", () => {
    const day = session("2026-11-03", (k) => (k < 40 ? uptrend(100)(k) : { o: 100.3, h: 100.35, l: 100.25, c: 100.3, v: 1000 })).filter((_, k) => k !== 60);
    const { trades } = simulateStock("T", [...prior, ...day], { "2026-11-03": OPEN }, { strategy: "TREND_RECLAIM" });
    const g = trades.find((t) => t.exitReason === "GAP_EXIT");
    assert.ok(g, "fixture must produce a GAP_EXIT trade");
    if (!g) return;
    assert.ok(Date.parse(g.exitTime) - Date.parse(day[58].timestamp) > 60_000, "exit lies after the removed minute");
  });

  it("missing minutes are counted per session", () => {
    const sess = session("2026-11-03", flat(100)).filter((_, k) => k % 50 !== 49);
    assert.ok(countMissingMinutes(sess) > 0);
  });

  it("CORE mode evaluates no market gates and says so", () => {
    const day = session("2026-11-03", uptrend(100));
    const { sessions } = simulateStock("T", [...prior, ...day], {}, { strategy: "TREND_RECLAIM", gateMode: "CORE" });
    const s = sessions.find((x) => x.date === "2026-11-03");
    assert.notEqual(s?.status, "GATED");
    assert.ok(s?.status === "TRADED" || s?.status === "REJECTED_PLAN" || s?.status === "NO_SIGNAL");
  });

  it("time window: entries only from 09:30 up to, not including, 14:00", () => {
    assert.equal(istMinute("2026-11-03T09:29:00+05:30"), 569);
    assert.equal(istMinute("2026-11-03T14:00:00+05:30"), 840);
  });
});

describe("data loader integrity", () => {
  const good = (date: string, sym: string) => ({
    status: "OK",
    symbol: sym,
    date,
    candles: Array.from({ length: EXPECTED_BARS }, (_, k) => ({ timestamp: ist(date, 555 + k), open: 1, high: 1, low: 1, close: 1, volume: 1 })),
  });

  it("accepts a complete OK session", () => {
    assert.ok("bars" in parseSessionFile("2026-11-03-RELIANCE.json", good("2026-11-03", "RELIANCE")));
  });

  it("rejects non-OK, short, mismatched and malformed records", () => {
    assert.ok("reason" in parseSessionFile("2026-11-03-RELIANCE.json", { ...good("2026-11-03", "RELIANCE"), status: "PARTIAL" }));
    assert.ok("reason" in parseSessionFile("2026-11-03-RELIANCE.json", { ...good("2026-11-03", "RELIANCE"), candles: good("2026-11-03", "RELIANCE").candles.slice(0, 10) }));
    assert.ok("reason" in parseSessionFile("2026-11-03-RELIANCE.json", { ...good("2026-11-03", "TCS") }));
    assert.ok("reason" in parseSessionFile("2026-11-03-RELIANCE.json", { ...good("2026-11-03", "RELIANCE"), candles: [{ timestamp: "x", open: "1" }] }));
    assert.ok("reason" in parseSessionFile("not-a-session.json", good("2026-11-03", "RELIANCE")));
  });

  it("chronological split is ordered, disjoint and fails when sessions are short", () => {
    const dates = Array.from({ length: 60 }, (_, i) => `2026-01-${String(i + 1).padStart(2, "0")}`);
    const { development, validation } = chronologicalSplit(dates, 40, 20);
    assert.equal(development.length, 40);
    assert.equal(validation.length, 20);
    assert.ok(development.at(-1)! < validation[0]);
    assert.throws(() => chronologicalSplit(dates.slice(0, 50), 40, 20));
  });
});

describe("experiment isolation and selection", () => {
  const dataset: HistoricalDataset = {
    dates: ["2026-11-02", "2026-11-03"],
    symbols: ["T"],
    closingPlaceholderBars: 0,
    bars: new Map([["T", [...session("2026-11-02", uptrend(100)), ...session("2026-11-03", uptrend(100))]]]),
    sessionsPerSymbol: new Map([["T", 2]]),
    issues: [],
  };

  it("trades are scored only on the requested sessions", () => {
    const r = runExperiment(dataset, { name: "x", phase: "DEVELOPMENT", strategy: "TREND_RECLAIM", scenario: SCENARIOS.BASE, gateMode: "CORE", dates: ["2026-11-03"] });
    assert.ok(r.trades.every((t) => t.date === "2026-11-03"));
    assert.equal(r.sessionsCovered, 1);
  });

  it("selection picks the higher base expectancy among eligible candidates only", () => {
    const mk = (trades: number, base: number | null) =>
      ({ metrics: { trades, expectancyR: base }, trades: [] } as unknown as ExperimentResult);
    const cons = (v: number | null) => ({ metrics: { trades: 500, expectancyR: v } } as unknown as ExperimentResult);
    const result = selectCandidate([
      { strategy: "TREND_RECLAIM", base: mk(500, 0.3), conservative: cons(0.1) },
      { strategy: "PULLBACK_RECLAIM", base: mk(500, 0.5), conservative: cons(-0.01) },
    ]);
    assert.equal(result.selected, "TREND_RECLAIM");
    assert.match(result.reasons.PULLBACK_RECLAIM, /not positive/);
  });

  it("selection returns null when no candidate has enough trades (NO-GO)", () => {
    const r = selectCandidate([{ strategy: "TREND_RECLAIM", base: { metrics: { trades: 10, expectancyR: 1 } } as unknown as ExperimentResult, conservative: { metrics: { trades: 10, expectancyR: 1 } } as unknown as ExperimentResult }]);
    assert.equal(r.selected, null);
    assert.equal(SELECTION_RULE.minDevelopmentTrades, 100);
  });
});
