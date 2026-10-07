// Run: npm test   (deterministic fixtures; no Upstox account needed)
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeTechnicals, atr, chartSeries, ema, istDate, macd, openingRange, previousDay, priceStructure, rsi, volatilityRegime, vwap, VOLATILITY,
} from "./technicalAnalysis.ts";
import { mergeCandles, normalizeCandles } from "./candles.ts";
import { clearUpstoxCache, toIndicators, upstoxProvider } from "./upstoxMarket.ts";
import { getSnapshot, type FallbackDeps } from "./market.ts";
import { mockProvider } from "./mockMarket.ts";
import { mockSnapshot } from "./mock.ts";
import { analyze } from "../engine/strategy.ts";
import { UpstoxError } from "./errors.ts";
import type { Candle } from "../types.ts";

const NOW = new Date("2026-10-05T07:00:00Z"); // Mon 12:30 IST
const TOKEN = "secret-token-xyz";

const at = (ymd: string, hhmm: string) => `${ymd}T${hhmm}:00+05:30`;
const bar = (ts: string, o: number, h: number, l: number, c: number, v: number | null = null): Candle => ({ timestamp: ts, open: o, high: h, low: l, close: c, volume: v });

// n 15-minute bars of a straight trend, ending at 12:15 IST on `day` (spanning earlier days as needed).
function trend15(n: number, start: number, step: number, day = "2026-10-05", volume: number | null = null): Candle[] {
  const out: Candle[] = [];
  let d = new Date(at(day, "12:15")).getTime();
  for (let i = n - 1; i >= 0; i--) {
    const c = start + step * i;
    out.unshift(bar(new Date(d).toISOString(), c - step / 2, c + 2, c - 2, c, volume));
    d -= 15 * 60_000;
    // skip the overnight gap: 15:30 → next 09:15 is handled loosely; dates still move back across days
  }
  return out;
}
const days = (closes: number[], lastDay = "2026-10-02"): Candle[] =>
  closes.map((c, i) => {
    const d = new Date(Date.parse(lastDay + "T00:00:00Z") - (closes.length - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    return bar(at(d, "00:00"), c - 5, c + 60, c - 60, c);
  });

// --- 1–4: EMA ---
for (const p of [9, 21, 50, 200]) {
  test(`${[9, 21, 50, 200].indexOf(p) + 1}. EMA${p}: null until ${p} values, seeded with the SMA, then standard smoothing`, () => {
    const vals = [...Array(p).fill(100), 110];
    const e = ema(vals, p);
    assert.equal(e[p - 2], null);
    assert.equal(e[p - 1], 100);
    assert.ok(Math.abs(e[p]! - (100 + (10 * 2) / (p + 1))) < 1e-9);
    assert.equal(ema(vals.slice(0, p - 1), p).at(-1), null, "insufficient data stays null");
  });
}

test("5. RSI 14 (Wilder) matches the StockCharts reference within rounding", () => {
  const c = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28];
  assert.ok(Math.abs(rsi(c)! - 70.53) < 0.1);
  assert.ok(Math.abs(rsi([...c, 46.0])! - 66.32) < 0.1);
  assert.equal(rsi(c.slice(0, 14)), null);
  assert.equal(rsi(Array(20).fill(5)), 50);
});

test("6. VWAP = Σ(typical × volume) / Σ volume, reset each IST session", () => {
  const s = [bar(at("2026-10-05", "09:15"), 0, 12, 6, 9, 100), bar(at("2026-10-05", "09:30"), 0, 15, 9, 12, 300)];
  assert.ok(Math.abs(vwap(s)! - (9 * 100 + 12 * 300) / 400) < 1e-9);
  const yesterday = bar(at("2026-10-01", "15:15"), 0, 1000, 1000, 1000, 1_000_000);
  const series = chartSeries([yesterday, ...s]);
  assert.ok(Math.abs(series.at(-1)!.vwap! - 11.25) < 1e-9, "yesterday's huge volume does not leak into today");
});

test("7. ATR 14: Wilder average of true range (incl. gaps vs previous close)", () => {
  const c = [bar("2026-10-01T09:15:00+05:30", 10, 12, 8, 10), bar("2026-10-01T09:30:00+05:30", 10, 11, 9, 10), bar("2026-10-01T09:45:00+05:30", 15, 16, 14, 15)];
  // TRs: max(2,1,1)=2 ; max(2,6,4)=6 → period 2 → (2+6)/2 = 4
  assert.equal(atr(c, 2), 4);
  assert.equal(atr(c.slice(0, 2), 2), null);
});

test("8. MACD 12/26/9: zero on flat data, positive in an uptrend, null without 34 closes", () => {
  assert.equal(macd(Array(33).fill(1)), null);
  const flat = macd(Array(60).fill(100))!;
  assert.equal(flat.macd, 0);
  assert.equal(flat.histogram, 0);
  const up = macd(Array.from({ length: 60 }, (_, i) => 100 + i * i * 0.1))!;
  assert.ok(up.macd > 0 && up.macd > up.signal && up.histogram > 0);
});

test("9. previous-day levels come from the last completed daily candle before the session", () => {
  const d = [bar(at("2026-09-30", "00:00"), 1, 110, 90, 100), bar(at("2026-10-01", "00:00"), 1, 120, 95, 115), bar(at("2026-10-05", "00:00"), 1, 999, 1, 500)];
  assert.deepEqual(previousDay(d, "2026-10-05"), { high: 120, low: 95, close: 115 });
});

test("10. opening range = 09:15–09:30 IST, unavailable before 09:30", () => {
  const c = [bar(at("2026-10-05", "09:15"), 1, 105, 95, 100), bar(at("2026-10-05", "09:30"), 1, 130, 80, 110)];
  assert.deepEqual(openingRange(c, "2026-10-05", NOW), { high: 105, low: 95 }, "09:30 bar is outside the window");
  assert.equal(openingRange(c, "2026-10-05", new Date("2026-10-05T03:55:00Z")), null, "09:25 IST: not formed");
});

test("11. price structure: HH/HL bullish, LH/LL bearish, breakout/breakdown", () => {
  const up = priceStructure(trend15(30, 100, 5))!;
  assert.equal(up.structure, "BULLISH STRUCTURE");
  assert.ok(up.higherHigh && up.higherLow);
  assert.equal(up.event, "BREAKOUT");
  const down = priceStructure(trend15(30, 300, -5))!;
  assert.equal(down.structure, "BEARISH STRUCTURE");
  assert.equal(down.event, "BREAKDOWN");
  assert.equal(priceStructure(trend15(10, 100, 1)), null);
});

const analyse = (candles: Candle[], daily = days(Array.from({ length: 40 }, (_, i) => 22000 + i * 10))) =>
  analyzeTechnicals({ timeframe: "15m", candles, daily, openingCandles: candles, now: NOW })!;

test("12. trend classification with reasons", () => {
  const up = analyse(trend15(250, 22000, 5));
  assert.equal(up.trend.state, "STRONG_BULLISH");
  assert.ok(up.trend.reasons.length >= 3);
  assert.equal(analyse(trend15(250, 24000, -5)).trend.state, "STRONG_BEARISH");
  const flat = analyse(trend15(250, 22000, 0));
  assert.equal(flat.trend.state, "NEUTRAL");
  assert.equal(flat.priceAction!.structure, "RANGE", "equal highs/lows are a range, not bearish");
});

test("13. volatility regime uses documented, configurable thresholds", () => {
  assert.equal(volatilityRegime(VOLATILITY.lowAtrPct - 0.1), "LOW VOLATILITY");
  assert.equal(volatilityRegime(1.0), "NORMAL VOLATILITY");
  assert.equal(volatilityRegime(VOLATILITY.highAtrPct + 0.1), "HIGH VOLATILITY");
  assert.equal(volatilityRegime(1.0, VOLATILITY.highIv + 1), "HIGH VOLATILITY", "IV alone can flag high volatility");
  assert.equal(volatilityRegime(null, null), null);
});

test("14. technical score out of 15, rescaled over computable components", () => {
  const up = analyse(trend15(250, 22000, 5));
  assert.ok(up.technicalScore.score! >= 13, `strong trend scores high (got ${up.technicalScore.score})`);
  const vw = up.technicalScore.components.find((c) => c.name === "VWAP")!;
  assert.equal(vw.points, null, "index candles: VWAP not scored, not guessed");
  const withVol = analyse(trend15(250, 22000, 5, "2026-10-05", 1000));
  assert.notEqual(withVol.technicalScore.components.find((c) => c.name === "VWAP")!.points, null);
  assert.ok(up.technicalScore.score! <= 15 && up.technicalScore.max === 15);
});

test("15. insufficient candles: nulls, no fabricated values, no engine indicators", () => {
  const t = analyse(trend15(12, 22000, 5));
  assert.equal(t.ema21, null);
  assert.equal(t.ema50, null);
  assert.equal(t.ema200, null);
  assert.equal(t.rsi, null);
  assert.equal(t.macd, null);
  assert.equal(t.technicalScore.score, null);
  assert.equal(toIndicators(t), null);
  assert.equal(analyzeTechnicals({ timeframe: "15m", candles: [], daily: [], openingCandles: [], now: NOW }), null);
});

test("16. stale candle data and closed market never trade", () => {
  const s = mockSnapshot("nifty", NOW);
  s.sources.technical = { ...s.sources.technical, fetchedAt: new Date(NOW.getTime() - 10 * 60_000).toISOString() };
  const a = analyze(s, NOW);
  assert.equal(a.status, "NO TRADE");
  assert.ok(a.blockers.includes("Technical data is stale"));

  const s2 = mockSnapshot("nifty", NOW);
  s2.technical = { ...analyse(trend15(250, 22000, 5, "2026-10-02")) };
  assert.equal(s2.technical.marketClosed, true);
  const a2 = analyze(s2, NOW);
  assert.equal(a2.status, "NO TRADE");
  assert.ok(a2.blockers.some((b) => b.startsWith("Market closed")));
});

// --- Upstox candle stubs ---
let calls: string[] = [];
const realFetch = globalThis.fetch;
const realInfo = console.info;
const realWarn = console.warn;
const v3Candles = (base: number, n: number, intraday: boolean) => {
  const out: unknown[] = [];
  for (let i = 0; i < n; i++) {
    const t = intraday ? new Date(Date.parse(at("2026-10-05", "09:15")) + i * 900_000) : new Date(Date.parse(at("2026-10-01", "15:15")) - i * 900_000);
    const c = base + (intraday ? i : -i);
    out.push([t.toISOString().replace("Z", "+00:00"), c, c + 3, c - 3, c, 0, 0]);
  }
  return intraday ? out.reverse() : out; // newest first, like Upstox
};
function stub(over: (path: string) => Response | null = () => null) {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const path = decodeURIComponent(url.pathname);
    calls.push(path);
    const forced = over(path);
    if (forced) return forced;
    const nifty = path.includes("Nifty 50");
    const base = nifty ? 22400 : 54600;
    const ok = (data: unknown) => Response.json({ status: "success", data });
    if (path.includes("/v3/historical-candle/intraday/")) return ok({ candles: v3Candles(base, 13, true) });
    if (path.includes("/days/1/")) return ok({ candles: Array.from({ length: 30 }, (_, i) => [at(new Date(Date.parse("2026-10-01") - i * 86_400_000).toISOString().slice(0, 10), "00:00"), base, base + 150, base - 150, base - i, 0, 0]) });
    if (path.includes("/v3/historical-candle/")) return ok({ candles: v3Candles(base, 240, false) });
    const key = url.searchParams.get("instrument_key") ?? "";
    const n = key.includes("Nifty 50");
    const spot = n ? 22412 : 54612;
    if (path.endsWith("/market-quote/quotes")) return ok({ [key.replace("|", ":")]: { instrument_token: key, last_price: spot, net_change: 10 } });
    if (path.endsWith("/option/contract")) return ok([{ expiry: n ? "2026-10-06" : "2026-10-27" }]);
    if (path.endsWith("/option/chain")) {
      const step = n ? 50 : 100;
      const sd = (oi: number) => ({ market_data: { ltp: 100, oi, prev_oi: oi - 10, volume: 10, bid_price: 99, ask_price: 101 }, option_greeks: { iv: 15, delta: 0.5, gamma: 0.001, theta: -10, vega: 5 } });
      return ok(Array.from({ length: 11 }, (_, k) => ({ strike_price: Math.round(spot / step) * step + (k - 5) * step, underlying_spot_price: spot, call_options: sd(1000), put_options: sd(1200) })));
    }
    return new Response("nf", { status: 404 });
  }) as typeof fetch;
}
const deps = (over: Partial<FallbackDeps> = {}): FallbackDeps => ({ mode: "upstox", getToken: async () => TOKEN, onAuthExpired: async () => {}, now: () => NOW, ...over });

beforeEach(() => {
  clearUpstoxCache();
  calls = [];
  console.info = () => {};
  console.warn = () => {};
});
afterEach(() => {
  globalThis.fetch = realFetch;
  console.info = realInfo;
  console.warn = realWarn;
});

test("17. NIFTY and BANK NIFTY candles are cached under separate keys", async () => {
  stub();
  const p = upstoxProvider(TOKEN, () => NOW);
  const n1 = await p.getCandles("nifty", "15m");
  const b1 = await p.getCandles("banknifty", "15m");
  const before = calls.length;
  const n2 = await p.getCandles("nifty", "15m");
  const b2 = await p.getCandles("banknifty", "15m");
  assert.equal(calls.length, before, "second reads served from cache");
  assert.equal(n2.candles.at(-1)!.close, n1.candles.at(-1)!.close);
  assert.ok(n2.candles.at(-1)!.close < 30000 && b2.candles.at(-1)!.close > 50000, "no cross-index overwrite");
  assert.equal(b1.candles.length, b2.candles.length);
});

test("18. IST session boundaries (independent of server timezone)", () => {
  assert.equal(istDate("2026-10-04T19:00:00Z"), "2026-10-05"); // 00:30 IST
  assert.equal(istDate("2026-10-05T18:29:59Z"), "2026-10-05"); // 23:59:59 IST
  assert.equal(istDate("2026-10-05T18:30:00Z"), "2026-10-06");
  assert.equal(istDate(at("2026-10-05", "09:15")), "2026-10-05");
  const merged = mergeCandles([bar(at("2026-10-05", "09:15"), 1, 2, 0, 1)], [bar("2026-10-05T03:45:00Z", 9, 9, 9, 9)]);
  assert.equal(merged.length, 1, "same instant in two offsets is one candle");
});

test("19. missing volume (index candles report 0) becomes null, so VWAP is null", () => {
  const c = normalizeCandles({ candles: [[at("2026-10-05", "09:30"), 1, 2, 0, 1, 0, 0], [at("2026-10-05", "09:15"), 1, 2, 0, 1, 0, 0]] });
  assert.equal(c[0].timestamp, at("2026-10-05", "09:15"), "sorted oldest first");
  assert.ok(c.every((x) => x.volume === null));
  assert.equal(vwap(c), null);
});

test("20. missing / malformed candle responses: no fabricated candles", async () => {
  assert.throws(() => normalizeCandles({}), (e: UpstoxError) => e.reason === "UPSTOX_BAD_RESPONSE");
  assert.throws(() => normalizeCandles({ candles: [["x", "a"]] }), (e: UpstoxError) => e.reason === "UPSTOX_BAD_RESPONSE");
  assert.deepEqual(normalizeCandles({ candles: [] }), []);

  stub((path) => (path.includes("/v3/") ? Response.json({ status: "error", errors: [{ message: "boom" }] }, { status: 500 }) : null));
  const t = await upstoxProvider(TOKEN, () => NOW).getTechnicals("nifty");
  assert.equal(t.source.source, "UNAVAILABLE");
  assert.equal(t.indicators, null);
  assert.match(t.unavailableReason!, /Candles unavailable/);

  stub((path) => (path.includes("/v3/") ? Response.json({ status: "success", data: { candles: [] } }) : null));
  const closed = await upstoxProvider(TOKEN, () => NOW).getTechnicals("nifty");
  assert.equal(closed.unavailableReason, "MARKET CLOSED / NO DATA");

  clearUpstoxCache();
  stub((path) => (path.includes("/v3/") ? Response.json({ status: "error", errors: [{ message: "Invalid token" }] }, { status: 401 }) : null));
  await assert.rejects(upstoxProvider(TOKEN, () => NOW).getTechnicals("nifty"), (e: UpstoxError) => e.reason === "UPSTOX_AUTH_EXPIRED");
});

test("21. mock fallback: no token → mock technicals labelled MOCK, never candles", async () => {
  const s = await getSnapshot("nifty", deps({ getToken: async () => null }));
  assert.equal(s.fallbackReason, "UPSTOX_NOT_CONNECTED");
  assert.equal(s.sources.technical.source, "MOCK");
  assert.equal(s.technical, null);
  const c = await mockProvider(() => NOW).getCandles("nifty", "15m");
  assert.equal(c.candles.length, 0);
  assert.equal(c.source.source, "UNAVAILABLE");
});

test("22. live snapshot: real technicals feed the engine; mock news still blocks a trade", async () => {
  stub();
  const s = await getSnapshot("nifty", deps(), NOW);
  assert.equal(s.sources.technical.source, "LIVE");
  assert.ok(s.indicators && s.technical);
  assert.equal(s.indicators!.vwap, null);
  assert.equal(s.technical!.openingRangeHigh, 22403); // 09:15 bar: close 22400, high +3
  const a = analyze(s, NOW);
  assert.ok(a.factors.find((f) => f.key === "trend")!.available, "market structure now scored from real candles");
  assert.ok(a.factors.find((f) => f.key === "technical")!.available);
  assert.ok(!a.factors.find((f) => f.key === "news")!.available);
  assert.equal(a.status, "NO TRADE");
  assert.ok(a.blockers.includes("Full confirmation requires live news data"));
});

test("23. daily timeframe is evaluated as of today: previous day = last completed daily candle", () => {
  const d = [bar(at("2026-09-30", "00:00"), 1, 110, 90, 100), bar(at("2026-10-01", "00:00"), 1, 120, 95, 115)];
  const t = analyzeTechnicals({ timeframe: "1d", candles: d, daily: d, openingCandles: d, now: NOW })!;
  assert.equal(t.sessionDate, "2026-10-05");
  assert.equal(t.marketClosed, false);
  assert.equal(t.previousDayHigh, 120);
  assert.equal(t.openingRangeHigh, null, "no opening range on daily candles");
  assert.equal(t.vwap, null, "no multi-day VWAP");
});
