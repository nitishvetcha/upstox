import { test } from "node:test";
import assert from "node:assert/strict";
import type { ConstituentQuote } from "../types.ts";
import { calculateBreadth, classifyBreadthSignal, classifyPriceBreadthState, unavailableBreadth } from "./breadthService.ts";
import { mockProvider } from "./mockMarket.ts";
import { analyze } from "../engine/strategy.ts";
import { mockSnapshot } from "./mock.ts";

test("1. classification: stock movements around tolerance threshold", () => {
  const quotes: ConstituentQuote[] = [
    { symbol: "S1", lastPrice: 101, previousClose: 100, change: 1, changePercent: 1.0, timestamp: null }, // ADVANCING (> 0.05%)
    { symbol: "S2", lastPrice: 99, previousClose: 100, change: -1, changePercent: -1.0, timestamp: null }, // DECLINING (< -0.05%)
    { symbol: "S3", lastPrice: 100.02, previousClose: 100, change: 0.02, changePercent: 0.02, timestamp: null }, // UNCHANGED (<= 0.05%)
    { symbol: "S4", lastPrice: 99.98, previousClose: 100, change: -0.02, changePercent: -0.02, timestamp: null }, // UNCHANGED (>= -0.05%)
  ];

  const b = calculateBreadth("nifty", quotes, 0);
  assert.equal(b.advances, 1);
  assert.equal(b.declines, 1);
  assert.equal(b.unchanged, 2);
  assert.equal(b.total, 4);
});

test("2. calculation: advancing, declining, A/D ratio and breadth %", () => {
  // 35 advancing, 12 declining, 3 unchanged, 50 total
  const quotes: ConstituentQuote[] = [];
  for (let i = 1; i <= 35; i++) {
    quotes.push({ symbol: `ADV_${i}`, lastPrice: 102, previousClose: 100, change: 2, changePercent: 2.0, timestamp: null });
  }
  for (let i = 1; i <= 12; i++) {
    quotes.push({ symbol: `DEC_${i}`, lastPrice: 98, previousClose: 100, change: -2, changePercent: -2.0, timestamp: null });
  }
  for (let i = 1; i <= 3; i++) {
    quotes.push({ symbol: `UNC_${i}`, lastPrice: 100, previousClose: 100, change: 0, changePercent: 0.0, timestamp: null });
  }

  const b = calculateBreadth("nifty", quotes, 0.5);
  assert.equal(b.advances, 35);
  assert.equal(b.declines, 12);
  assert.equal(b.unchanged, 3);
  assert.equal(b.total, 50);
  assert.equal(b.coverage, 100);
  assert.equal(b.advanceDeclineRatio, 2.92); // 35 / 12 = 2.916 -> 2.92
  assert.equal(b.breadthPercent, 46); // (35 - 12) / 50 * 100 = 46%
  assert.equal(b.signal, 0.46);
  assert.equal(b.classification, "BULLISH");
});

test("3. signal & classification bands", () => {
  assert.equal(classifyBreadthSignal(0.8), "STRONGLY BULLISH");
  assert.equal(classifyBreadthSignal(0.35), "BULLISH");
  assert.equal(classifyBreadthSignal(0.0), "NEUTRAL");
  assert.equal(classifyBreadthSignal(-0.4), "BEARISH");
  assert.equal(classifyBreadthSignal(-0.75), "STRONGLY BEARISH");
});

test("4. coverage: 100%, acceptable partial coverage, below min coverage, no valid quotes", () => {
  // NIFTY 50 requires 50 constituents expected
  const now = new Date("2026-10-05T12:00:00+05:30");
  const makeQuotes = (count: number): ConstituentQuote[] =>
    Array.from({ length: count }, (_, i) => ({
      symbol: `STOCK_${i}`,
      lastPrice: 101,
      previousClose: 100,
      change: 1,
      changePercent: 1.0,
      timestamp: "2026-10-05T11:59:00+05:30",
    }));

  const b100 = calculateBreadth("nifty", makeQuotes(50), 0, now);
  assert.equal(b100.status, "LIVE");
  assert.equal(b100.coverage, 100);

  const bPartial = calculateBreadth("nifty", makeQuotes(42), 0, now); // 42/50 = 84% >= 80% min
  assert.equal(bPartial.status, "PARTIAL");
  assert.equal(bPartial.coverage, 84);

  const bLow = calculateBreadth("nifty", makeQuotes(35), 0); // 35/50 = 70% < 80% min
  assert.equal(bLow.status, "UNAVAILABLE");
  assert.equal(bLow.coverage, 70);

  const bZero = calculateBreadth("nifty", [], 0);
  assert.equal(bZero.status, "UNAVAILABLE");
  assert.equal(bZero.coverage, 0);
});

test("5. price/breadth confirmation and divergence classification", () => {
  // Price ↑ + Breadth ↑ -> bullish confirmation
  assert.equal(classifyPriceBreadthState(0.5, 0.6), "BULLISH_CONFIRMATION");

  // Price ↓ + Breadth ↓ -> bearish confirmation
  assert.equal(classifyPriceBreadthState(-0.5, -0.6), "BEARISH_CONFIRMATION");

  // Price ↑ + Breadth ↓ -> bearish divergence
  assert.equal(classifyPriceBreadthState(0.5, -0.5), "BEARISH_DIVERGENCE");

  // Price ↓ + Breadth ↑ -> bullish divergence
  assert.equal(classifyPriceBreadthState(-0.5, 0.5), "BULLISH_DIVERGENCE");

  // Price flat + Breadth strong -> directional buildup
  assert.equal(classifyPriceBreadthState(0.01, 0.7), "DIRECTIONAL_BUILDUP");
});

test("6. bank nifty breadth uses bank nifty constituent universe", () => {
  const b = calculateBreadth("banknifty", [
    { symbol: "HDFCBANK", lastPrice: 1600, previousClose: 1580, change: 20, changePercent: 1.27, timestamp: null },
    { symbol: "ICICIBANK", lastPrice: 1200, previousClose: 1190, change: 10, changePercent: 0.84, timestamp: null },
  ]);

  assert.equal(b.expected, 14);
  assert.equal(b.total, 2);
  assert.equal(b.status, "UNAVAILABLE"); // 2/14 = 14.3% < 80%
});

test("7. mock provider returns realistic breadth for both indices", async () => {
  const mock = mockProvider();
  const niftyB = await mock.getBreadth("nifty");
  assert.equal(niftyB.index, "nifty");
  assert.equal(niftyB.expected, 50);
  assert.equal(niftyB.advances, 34);

  const bankB = await mock.getBreadth("banknifty");
  assert.equal(bankB.index, "banknifty");
  assert.equal(bankB.expected, 14);
  assert.equal(bankB.advances, 4);
});

test("8. strategy engine safety: unavailable breadth blocks trade recommendation", () => {
  const s = mockSnapshot("nifty");
  s.breadth = unavailableBreadth("nifty", "Coverage below threshold");
  s.sources.breadth = { source: "UNAVAILABLE", provider: null, fetchedAt: null };

  const analysis = analyze(s);
  assert.equal(analysis.status, "NO TRADE");
  assert.ok(analysis.blockers.some((b) => b.includes("Breadth / confirmation unavailable")));
});

test("9. strategy engine with live breadth and extreme event risk", () => {
  const s = mockSnapshot("nifty");
  const eventReason = "EXTREME RBI POLICY EVENT TODAY";
  s.news.eventRisk = eventReason;
  s.news.detail = {
    ...s.news.detail!,
    eventRisk: { level: "EXTREME", status: "DETECTED", reason: eventReason, events: [] },
  };

  const analysis = analyze(s);
  assert.notEqual(analysis.status, "TRADE");
  assert.ok(analysis.risks.some((r) => r.includes("EXTREME")));
});

test("10. API failure / malformed quote handling returns unavailable breadth", () => {
  const unavail = unavailableBreadth("nifty", "Upstox network error");
  assert.equal(unavail.status, "UNAVAILABLE");
  assert.equal(unavail.total, 0);
  assert.equal(unavail.reason, "Upstox network error");
});

test("11. live quote shape: previous close = last_price − net_change (ohlc.close is the current price), quote time from last_trade_time", async () => {
  const { upstoxProvider, clearUpstoxCache } = await import("./upstoxMarket.ts");
  const { INDEX_CONSTITUENTS } = await import("./breadthConfig.ts");
  clearUpstoxCache();
  const realFetch = globalThis.fetch;
  const realInfo = console.info;
  console.info = () => {};
  const k = INDEX_CONSTITUENTS.banknifty;
  // Shape captured live 2026-10-05 (ITC-like move: ltp 268.9, net_change +13 → true previous close 255.9).
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const keys = (url.searchParams.get("instrument_key") ?? "").split(",");
    const data = Object.fromEntries(
      keys.map((key, i) => {
        const index = key.startsWith("NSE_INDEX");
        const row = index
          ? { instrument_token: key, last_price: 54714.1, net_change: 263.6, ohlc: { close: 54714.1 }, timestamp: "2026-10-05T16:49:55.363+05:30" }
          : i === 0
            ? { instrument_token: key, last_price: 268.9, net_change: 13, ohlc: { close: 268.9 }, last_trade_time: "1791196020105" }
            : i === 1
              ? { instrument_token: key, last_price: 100.04, net_change: 0.06, ohlc: { close: 100.04 }, last_trade_time: "1791196020105" } // +0.06% true, +0.0599…% → still > 0.05
              : { instrument_token: key, last_price: 500, net_change: null, ohlc: { close: 500 } }; // no net_change → invalid, not patched from ohlc.close
        return [`NSE_EQ:${i}`, row];
      }),
    );
    return Response.json({ status: "success", data });
  }) as typeof fetch;
  try {
    const b = await upstoxProvider("t").getBreadth("banknifty");
    const top = b.topAdvancers![0];
    assert.equal(top.previousClose, 255.9);
    assert.equal(top.changePercent, 5.08);
    assert.equal(top.timestamp, new Date(1791196020105).toISOString());
    assert.equal(b.total, 2, "quote without net_change is invalid");
    assert.equal(b.expected, k.length);
    assert.equal(b.advances, 2);
  } finally {
    globalThis.fetch = realFetch;
    console.info = realInfo;
  }
});

test("12. breadth status is END_OF_DAY when fetched after market close with today's quotes", () => {
  const afterHours = new Date("2026-10-05T16:51:00+05:30");
  const makeEodQuotes = (count: number): ConstituentQuote[] =>
    Array.from({ length: count }, (_, i) => ({
      symbol: `STOCK_${i}`,
      lastPrice: 105,
      previousClose: 100,
      change: 5,
      changePercent: 5.0,
      timestamp: "2026-10-05T15:59:59+05:30",
    }));

  const b = calculateBreadth("nifty", makeEodQuotes(50), 0, afterHours);
  assert.equal(b.status, "END_OF_DAY", "16:51 IST fetch with 15:59 IST quote must be END_OF_DAY");
  assert.equal(b.advances, 50);
});
