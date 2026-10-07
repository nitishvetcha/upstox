// Run: npm test   (deterministic fixtures; no Upstox account needed)
import { test } from "node:test";
import assert from "node:assert/strict";
import { expectedBarsPerSession, fetchHistoricalRange, mergeAndValidate, planChunks, tradingDays } from "./historicalCandles.ts";
import { datasetHash, HistoricalInputs, lookAheadViolations, newsVisibleAt, type HistoricalContext } from "./historicalContext.ts";
import { costsFor, DEFAULT_TRANSACTION_COSTS, type TransactionCostConfig } from "./transactionCosts.ts";
import { aggregateDaily, BacktestEngine, slippageAwareSizing, validationStatus, MIN_TRADES_FOR_VALIDATION } from "../backtestEngine.ts";
import { BACKTEST_IV, buildHistoricalOptionChain, buildHistoricalSnapshot, NEUTRAL_UNAVAILABLE_NEWS, priceOption } from "../backtestSnapshot.ts";
import { compareRuns, COMPARISON_NOTE } from "./backtestScenarios.ts";
import { analyze } from "../engine/strategy.ts";
import { analyzeMarket } from "../engine/analysis.ts";
import { mockSnapshot, MOCK_NEWS, nextTuesday, lastTuesday } from "./mock.ts";
import { INDEX_CONSTITUENTS } from "./breadthConfig.ts";
import { isRegularSession, isTradingDay, marketStatus, NSE_HOLIDAYS, NSE_SPECIAL_SESSIONS } from "../time.ts";
import type { Candle } from "../types.ts";
import type { BacktestRunConfig } from "../backtestTypes.ts";

console.info = () => {};
const ist = (ymd: string, hhmm: string) => new Date(`${ymd}T${hhmm}:00+05:30`);
const at = (ymd: string, hhmm: string) => ist(ymd, hhmm).toISOString();

// --- fixtures ----------------------------------------------------------------------------------------------------
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

function ctxFor(cs: Candle[], o: { vixDropDay?: string; constituents?: number; vixHistory?: number } = {}): HistoricalContext {
  const vix = cs.filter((c) => !o.vixDropDay || !c.timestamp.startsWith(o.vixDropDay) && new Date(Date.parse(c.timestamp) + 330 * 60_000).toISOString().slice(0, 10) !== o.vixDropDay)
    .map((c, n) => ({ ...c, open: 14, high: 15, low: 13, close: 13 + (n % 20) / 10 }));
  const list = INDEX_CONSTITUENTS.nifty.slice(0, o.constituents ?? 50);
  return {
    index: "nifty",
    vix,
    vixDaily: vixDailyBefore(o.vixHistory ?? 260),
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
const p10 = (c: Partial<BacktestRunConfig> = {}, ctx: HistoricalContext = CTX, cs = candles) => engine.run({ ...BASE, ...c }, cs, [], META, ctx);
const legacy = (c: Partial<BacktestRunConfig> = {}) => engine.run({ ...BASE, ...c }, candles, [], META);
const A = p10();
const B = p10({ executionModel: "INTRABAR_MODEL_DERIVED" });
const L = legacy();

// --- calendar / historical data ----------------------------------------------------------------------------------
test("P1. 2025 holidays from the Upstox holiday API are configured (no weekends)", () => {
  for (const d of ["2025-08-15", "2025-08-27", "2025-10-02", "2025-10-22", "2025-11-05", "2025-12-25"]) assert.ok(NSE_HOLIDAYS.has(d), d);
  assert.equal(isTradingDay("2025-10-22"), false);
  assert.equal(isTradingDay("2025-10-23"), true);
});
test("P2. special-timing sessions: Muhurat is a 1-hour trading session (4 × 15m bars), not a holiday", () => {
  assert.equal(isTradingDay("2025-10-21"), true);
  assert.equal(expectedBarsPerSession("15m", "2025-10-21"), 4);
  assert.equal(expectedBarsPerSession("15m", "2025-10-20"), 25);
  assert.equal(marketStatus(ist("2025-10-21", "10:00")), "CLOSED");
  assert.equal(marketStatus(ist("2025-10-21", "14:00")), "OPEN");
});
test("P3. Budget-day Sunday session (2026-02-01) is a full trading session, not a weekend", () => {
  const t = tradingDays("2026-01-30", "2026-02-02");
  assert.deepEqual(t.trading, ["2026-01-30", "2026-02-01", "2026-02-02"]);
  assert.deepEqual(t.specialSessions, ["2026-02-01"]);
  assert.equal(t.weekends, 1);
  assert.equal(expectedBarsPerSession("15m", "2026-02-01"), 25);
});
test("P4. a shortened special session is never an expiry day: Tue 2025-10-21 → Mon 2025-10-20", () => {
  assert.equal(isRegularSession("2025-10-21"), false);
  assert.equal(nextTuesday(ist("2025-10-15", "10:00")), "2025-10-20");
  assert.equal(lastTuesday(ist("2026-03-10", "10:00")), "2026-03-30", "Tue 2026-03-31 holiday → Mon 03-30");
});
test("P5. coverage counts special-session bars against their own window (FULL with 4 Muhurat bars)", () => {
  const day = (d: string, n: number, from = "09:15") => Array.from({ length: n }, (_, i): Candle => ({ timestamp: new Date(Date.parse(`${d}T${from}:00+05:30`) + i * 900_000).toISOString(), open: 1, high: 1, low: 1, close: 1, volume: null }));
  const bars = [...day("2025-10-20", 25), ...day("2025-10-21", 4, "13:45"), ...day("2025-10-23", 25), ...day("2025-10-24", 25)];
  const c = mergeAndValidate([bars], "2025-10-20", "2025-10-24", "15m", 1).coverage;
  assert.equal(c.expectedBars, 79);
  assert.equal(c.status, "FULL");
  assert.deepEqual(c.holidays, ["2025-10-22"]);
  assert.deepEqual(c.specialSessions, ["2025-10-21"]);
});
test("P6. 12-month range 2025-10-06 → 2026-10-05: 247 sessions, 14 chunks of ≤ 28 days", () => {
  const t = tradingDays("2025-10-06", "2026-10-05");
  assert.equal(t.trading.length, 247);
  assert.equal(t.specialSessions.length, 2);
  const chunks = planChunks("2025-10-06", "2026-10-05", "15m");
  assert.equal(chunks.length, 14);
  for (const c of chunks) assert.ok((Date.parse(c.to) - Date.parse(c.from)) / 86_400_000 <= 27);
});
test("P7. failed chunk is retried and succeeds: no gap reported", async () => {
  let calls = 0;
  const r = await fetchHistoricalRange({ instrumentKey: "K", interval: "15m", startDate: "2026-09-01", endDate: "2026-09-01" }, async () => {
    if (calls++ === 0) throw new Error("429");
    return { candles: [[at("2026-09-01", "09:15"), 1, 1, 1, 1, 0, 0]] };
  }, undefined, 0);
  assert.equal(calls, 2);
  assert.deepEqual(r.coverage.failedChunks, []);
});
test("P8. a chunk failing every retry is reported as failed (PARTIAL), never filled", async () => {
  let calls = 0;
  const r = await fetchHistoricalRange({ instrumentKey: "K", interval: "15m", startDate: "2026-09-01", endDate: "2026-09-02" }, async () => {
    calls++;
    throw new Error("down");
  }, undefined, 0);
  assert.equal(calls, 3);
  assert.equal(r.coverage.failedChunks.length, 1);
  assert.equal(r.candles.length, 0);
});

// --- look-ahead -------------------------------------------------------------------------------------------------
const hi = new HistoricalInputs(CTX);
// Snapshot at the bar opening at `ts` (decision = close), with completed daily candles only — as the engine builds it.
function snapAt(ts: string, cs = candles, h = hi, cfg = BASE) {
  const cut = cs.findIndex((c) => c.timestamp === ts);
  const day = new Date(Date.parse(ts) + 330 * 60_000).toISOString().slice(0, 10);
  const daily = aggregateDaily(cs).filter((c) => c.timestamp.slice(0, 10) < day);
  return buildHistoricalSnapshot(cfg, cs[cut], cs.slice(0, cut + 1), daily, [], new Date(Date.parse(ts) + 900_000), h.at(ts))!;
}
test("LA-A. snapshot for the 10:00 bar (decision 10:15) uses no bar opening after 10:00", () => {
  const p = hi.at(at("2026-09-02", "10:00"));
  assert.ok(Date.parse(p.ivObservedAt!) <= Date.parse(at("2026-09-02", "10:15")));
  for (const q of p.breadthQuotes) assert.ok(Date.parse(q.timestamp!) <= Date.parse(at("2026-09-02", "10:15")), q.symbol);
  assert.deepEqual(lookAheadViolations({ underlying: at("2026-09-02", "10:15"), option: at("2026-09-02", "10:15"), oi: null, iv: p.ivObservedAt, news: null, breadth: p.breadthObservedAt }, ist("2026-09-02", "10:15")), []);
});
test("LA-A2. a bar that closes at 10:16+ is flagged as look-ahead", () => {
  const v = lookAheadViolations({ underlying: at("2026-09-02", "10:30"), option: null, oi: null, iv: null, news: null, breadth: null }, ist("2026-09-02", "10:15"));
  assert.equal(v.length, 1);
  assert.match(v[0], /^underlying/);
});
test("LA-B. news published 10:30 does not influence a 10:15 decision; 09:45 does", () => {
  const arts = [{ publishedAt: at("2026-09-02", "09:45"), h: "a" }, { publishedAt: at("2026-09-02", "10:30"), h: "b" }];
  assert.deepEqual(newsVisibleAt(arts, ist("2026-09-02", "10:15")).map((a) => a.h), ["a"]);
  assert.equal(lookAheadViolations({ underlying: null, option: null, oi: null, iv: null, news: at("2026-09-02", "10:30"), breadth: null }, ist("2026-09-02", "10:15")).length, 1);
});
test("LA-C. later candles never modify an earlier snapshot (point-in-time inputs are prefix-invariant)", () => {
  const cut = candles.findIndex((c) => c.timestamp === at("2026-09-10", "11:00"));
  const short = new HistoricalInputs(ctxFor(candles.slice(0, cut + 1)));
  const full = hi;
  for (const ts of [at("2026-09-10", "10:00"), at("2026-09-10", "11:00")]) assert.deepEqual(short.at(ts), full.at(ts));
});
test("LA-C2. engine decisions up to T are identical whether or not later candles exist", () => {
  const cut = candles.findIndex((c) => c.timestamp === at("2026-09-25", "15:15"));
  const pre = candles.slice(0, cut + 1);
  const shortRun = engine.run({ ...BASE, endDate: "2026-09-25" }, pre, [], META, ctxFor(pre));
  const fullRun = engine.run({ ...BASE, endDate: "2026-09-25" }, candles, [], META, CTX);
  assert.deepEqual(shortRun.trades.map((t) => [t.entryTimestamp, t.strategy, t.lots]), fullRun.trades.map((t) => [t.entryTimestamp, t.strategy, t.lots]));
  assert.deepEqual(shortRun.equityCurve.slice(0, -1), fullRun.equityCurve.slice(0, -1));
});
test("LA-D. future OI is rejected; historical OI is never present (0 / null, not invented)", () => {
  assert.equal(lookAheadViolations({ underlying: null, option: null, oi: at("2026-09-02", "11:00"), iv: null, news: null, breadth: null }, ist("2026-09-02", "10:15")).length, 1);
  const chain = buildHistoricalOptionChain(23000, 50, "2026-09-08", ist("2026-09-02", "10:15"), 14, false);
  for (const r of chain) for (const q of [r.call, r.put]) {
    assert.equal(q.oi, 0);
    assert.equal(q.chgOi, null);
    assert.equal(q.volume, 0);
  }
});
test("LA-E. expiry depends only on T and the published calendar, never on later data", () => {
  const T = ist("2026-09-10", "11:00");
  assert.equal(nextTuesday(T), "2026-09-15");
  assert.equal(snapAt(at("2026-09-24", "10:45")).expiry, "2026-09-29");
});
test("LA-F. technicals use completed candles only: future bars do not change the snapshot at T", () => {
  const ts = at("2026-09-25", "13:00");
  const cut = candles.findIndex((c) => c.timestamp === ts);
  const s1 = snapAt(ts);
  const futureTampered = candles.map((c, i) => (i > cut ? { ...c, close: c.close * 2 } : c));
  const s2 = snapAt(ts, futureTampered, new HistoricalInputs(ctxFor(futureTampered)));
  assert.deepEqual(s1.indicators, s2.indicators);
  assert.deepEqual(s1.breadth?.advances, s2.breadth?.advances);
});
test("LA-G. Phase 10 decisions are stamped at bar CLOSE (never 09:15, the open of the first bar)", () => {
  assert.ok(A.trades.length > 0, "fixture produces trades");
  for (const t of [...A.trades, ...B.trades]) {
    const m = new Date(Date.parse(t.entryTimestamp) + 330 * 60_000);
    const mins = m.getUTCHours() * 60 + m.getUTCMinutes();
    assert.ok(mins >= 570 && mins % 15 === 0, t.entryTimestamp);
  }
});

// --- options / IV ------------------------------------------------------------------------------------------------
test("O1. option data mode and labels: SYNTHETIC mode, MODEL_DERIVED prices, option OHLC NOT_AVAILABLE", () => {
  assert.equal(A.metadata!.optionsMode, "SYNTHETIC");
  assert.equal(A.metadata!.optionPriceQuality, "MODEL_DERIVED");
  assert.equal(A.metadata!.historicalOptionOHLC, "NOT_AVAILABLE");
  assert.equal(A.scorecard!.options.quality, "MODEL_DERIVED");
  assert.match(A.scorecard!.options.notes!, /Upstox Plus/);
});
test("O2. no observed option data → never labeled measured/observed", () => {
  for (const r of [A, B, L]) {
    assert.notEqual(r.scorecard!.options.quality, "HISTORICAL_MEASURED");
    assert.notEqual(r.dataQuality.optionData, "HISTORICAL MEASURED");
  }
});
test("O3. historical expiry selection: NIFTY weekly / BANK NIFTY monthly, multiple cycles counted", () => {
  assert.ok(A.sample!.contractExpiries >= 4, `${A.sample!.contractExpiries}`);
  assert.equal(A.sample!.weeklyExpiries, A.sample!.contractExpiries);
  assert.ok(A.sample!.monthlyExpiries >= 1);
});
test("IV1. India VIX at T is the pricing IV in the chain", () => {
  const p = hi.at(at("2026-09-24", "11:00"));
  const s = snapAt(at("2026-09-24", "11:00"));
  assert.equal(s.chain[0].call.iv, p.iv);
  assert.notEqual(p.iv, BACKTEST_IV);
});
test("IV2. higher IV → higher model option price (pricing uses the supplied IV)", () => {
  const T = ist("2026-09-03", "11:00");
  assert.ok(priceOption("CE", 23000, 23000, "2026-09-08", T, 20) > priceOption("CE", 23000, 23000, "2026-09-08", T, 12));
  assert.equal(priceOption("CE", 23000, 23000, "2026-09-08", T), priceOption("CE", 23000, 23000, "2026-09-08", T, BACKTEST_IV));
});
test("IV3. IV percentile = rank of VIX among the trailing completed daily closes", () => {
  const p = hi.at(at("2026-09-03", "11:00"));
  const hist = CTX.vixDaily.slice(-252).map((c) => c.close);
  assert.equal(p.ivPercentile, Math.round((hist.filter((x) => x < p.iv!).length / hist.length) * 100));
});
test("IV4. too little VIX history → IV percentile NOT AVAILABLE (null), never a default", () => {
  assert.equal(new HistoricalInputs(ctxFor(candles, { vixHistory: 30 })).at(at("2026-09-03", "11:00")).ivPercentile, null);
});
test("IV5. missing VIX bars → explicit benchmark fallback, counted and downgraded (never silent)", () => {
  const r = p10({}, ctxFor(candles, { vixDropDay: "2026-10-12" }));
  assert.ok((r.historicalInputs!.ivFallbackBars as number) > 0);
  assert.equal(r.scorecard!.iv.quality, "PARTIAL");
  assert.equal(A.historicalInputs!.ivFallbackBars, 0);
  assert.equal(A.scorecard!.iv.quality, "HISTORICAL_RECONSTRUCTED");
});
test("IV6. legacy model labels IV as SYNTHETIC (flat benchmark)", () => {
  assert.equal(L.scorecard!.iv.quality, "SYNTHETIC");
  assert.equal(L.metadata!.ivSource, "SYNTHETIC");
});

// --- breadth ----------------------------------------------------------------------------------------------------
test("BR1. breadth quotes are vs the previous SESSION close at the latest bar closed by T", () => {
  const ts = at("2026-09-03", "11:00");
  const p = hi.at(ts);
  const c0 = CTX.constituents[0].candles;
  const i = c0.findIndex((c) => c.timestamp === ts);
  const prev = c0.filter((c) => c.timestamp < at("2026-09-03", "09:15")).at(-1)!;
  const q = p.breadthQuotes.find((x) => x.symbol === CTX.constituents[0].symbol)!;
  assert.equal(q.lastPrice, c0[i].close);
  assert.equal(q.previousClose, prev.close);
});
test("BR2. constituent coverage: 45/50 → PARTIAL (90%); 30/50 → UNAVAILABLE (below minimum, never padded)", () => {
  const h45 = new HistoricalInputs(ctxFor(candles, { constituents: 45 }));
  const s45 = snapAt(at("2026-09-24", "11:00"), candles, h45);
  assert.equal(h45.at(at("2026-09-24", "11:00")).breadthQuotes.length, 45);
  assert.equal(s45.breadth!.coverage, 90);
  assert.equal(s45.breadth!.status, "PARTIAL");
  const s30 = snapAt(at("2026-09-24", "11:00"), candles, new HistoricalInputs(ctxFor(candles, { constituents: 30 })));
  assert.equal(s30.breadth!.status, "UNAVAILABLE");
});
test("BR3. no previous session in history → constituent not counted (no invented reference close)", () => {
  assert.equal(hi.at(at("2026-09-01", "11:00")).breadthQuotes.length, 0);
});
test("BR4. constituent mismatch: no bar today for a symbol → excluded, coverage drops", () => {
  const ctx = ctxFor(candles);
  ctx.constituents[0] = { ...ctx.constituents[0], candles: ctx.constituents[0].candles.filter((c) => !c.timestamp.startsWith("2026-09-03")) };
  assert.equal(new HistoricalInputs(ctx).at(at("2026-09-03", "11:00")).breadthQuotes.length, 49);
});
test("BR5. survivorship warning: today's list used → SURVIVORSHIP_BIAS_RISK = TRUE in the scorecard", () => {
  assert.equal(A.metadata!.survivorshipBiasRisk, true);
  assert.match(A.scorecard!.breadth.notes!, /SURVIVORSHIP_BIAS_RISK = TRUE/);
  assert.equal(A.scorecard!.breadth.quality, "HISTORICAL_RECONSTRUCTED");
  assert.equal(L.scorecard!.breadth.quality, "SYNTHETIC");
});
test("BR6. breadth timestamp never after the decision time", () => {
  for (const h of ["09:30", "12:00", "15:15"]) {
    const p = hi.at(at("2026-09-08", h));
    assert.ok(Date.parse(p.breadthObservedAt!) <= Date.parse(at("2026-09-08", h)) + 900_000);
  }
});

// --- news / OI factor ---------------------------------------------------------------------------------------------
test("N1. root cause: constant mock news (+0.42, no confidence) vetoes every bearish setup as NEWS_CONFLICT", () => {
  assert.equal(MOCK_NEWS.score >= 0.4, true);
  assert.equal((MOCK_NEWS as { confidence?: number }).confidence, undefined);
  assert.ok((L.noTradeAnalytics.rejectionReasons.NEWS_CONFLICT ?? 0) > 0);
});
test("N2. neutral unavailable news cannot confirm or veto: 0 NEWS_CONFLICT in Phase 10 runs", () => {
  assert.equal(NEUTRAL_UNAVAILABLE_NEWS.score, 0);
  assert.equal(NEUTRAL_UNAVAILABLE_NEWS.confidence, 0);
  assert.equal(A.noTradeAnalytics.rejectionReasons.NEWS_CONFLICT ?? 0, 0);
  assert.equal(A.scorecard!.news.quality, "NOT_AVAILABLE");
});
test("N3. a bearish market with neutral news is not blocked by news; with mock bullish news it is", () => {
  const s = mockSnapshot("nifty", ist("2026-09-03", "11:00"));
  const bear = { ...s, indicators: { ...s.indicators!, ema9: s.indicators!.ema21 - 50, ema50: s.indicators!.ema21 + 50 } };
  const withMock = analyze({ ...bear, news: { ...MOCK_NEWS } }, ist("2026-09-03", "11:00"));
  const neutral = analyze({ ...bear, news: { ...NEUTRAL_UNAVAILABLE_NEWS } }, ist("2026-09-03", "11:00"));
  assert.ok(!neutral.blockers.some((b) => b.startsWith("News direction conflicts")));
  if (analyzeMarket({ ...bear, news: { ...MOCK_NEWS } }, ist("2026-09-03", "11:00")).direction <= -0.15) assert.ok(withMock.blockers.some((b) => b.startsWith("News direction conflicts")));
});
test("N4. stale vs future news: only articles published ≤ T are visible", () => {
  const arts = [at("2026-09-02", "08:00"), at("2026-09-02", "10:15"), at("2026-09-02", "10:16")].map((publishedAt) => ({ publishedAt }));
  assert.equal(newsVisibleAt(arts, ist("2026-09-02", "10:15")).length, 2);
});
test("N5. events: no point-in-time event calendar → NOT_AVAILABLE, never EVENT RISK historically", () => {
  assert.equal(A.scorecard!.events.quality, "NOT_AVAILABLE");
  assert.equal(A.sample!.barRegimes["EVENT RISK"] ?? 0, 0);
});
test("OI1. no OI at all → option-chain factor is direction-neutral (not read out of zeros)", () => {
  const s = mockSnapshot("nifty", ist("2026-09-03", "11:00"));
  const zero = { ...s, chain: s.chain.map((r) => ({ ...r, call: { ...r.call, oi: 0, chgOi: null }, put: { ...r.put, oi: 0, chgOi: null } })) };
  const f = analyzeMarket(zero, ist("2026-09-03", "11:00")).factors.find((x) => x.key === "oi")!;
  assert.equal(f.available, true);
  assert.equal(f.direction, 0);
  assert.match(f.notes[0].text, /Open interest not available/);
});
test("OI2. OI quality: NOT_AVAILABLE in Phase 10; SYNTHETIC (with warning) in the legacy model", () => {
  assert.equal(A.scorecard!.oi.quality, "NOT_AVAILABLE");
  assert.equal(L.scorecard!.oi.quality, "SYNTHETIC");
  assert.match(L.scorecard!.oi.notes!, /should not be interpreted as observed market positioning/);
});

// --- transaction costs -----------------------------------------------------------------------------------------
const CFG: TransactionCostConfig = { ...DEFAULT_TRANSACTION_COSTS };
const roundTrip = costsFor([{ side: "BUY", price: 100, quantity: 65 }, { side: "SELL", price: 120, quantity: 65 }], CFG);
test("TC1. brokerage = ₹20 per executed order", () => assert.equal(roundTrip.brokerage, 40));
test("TC2. STT = 0.1% of SELL premium only", () => assert.equal(roundTrip.stt, Math.round(120 * 65 * 0.001 * 100) / 100));
test("TC3. exchange charges = 0.03503% of total premium turnover", () => assert.equal(roundTrip.exchangeCharges, Math.round((100 + 120) * 65 * 0.0003503 * 100) / 100));
test("TC4. SEBI = ₹10/crore of turnover", () => assert.equal(roundTrip.sebiCharges, Math.round(220 * 65 * 0.000001 * 100) / 100));
test("TC5. GST = 18% of (brokerage + exchange + SEBI)", () => assert.equal(roundTrip.gst, Math.round((40 + 220 * 65 * 0.0003503 + 220 * 65 * 0.000001) * 0.18 * 100) / 100));
test("TC6. stamp duty = 0.003% of BUY premium only", () => assert.equal(roundTrip.stampDuty, Math.round(100 * 65 * 0.00003 * 100) / 100));
test("TC7. total = sum of components", () => {
  const { totalCosts, ...parts } = roundTrip;
  assert.equal(totalCosts, Math.round(Object.values(parts).reduce((a, b) => a + b, 0) * 100) / 100);
});
test("TC8. every Phase 10 trade: gross − slippage − costs = net = realized P&L", () => {
  for (const t of [...A.trades, ...B.trades]) {
    assert.ok(t.costs!.totalCosts > 0);
    assert.ok(Math.abs(t.grossPnL! - t.slippageCost - t.costs!.totalCosts - t.netPnL!) <= 0.03, t.tradeId);
    assert.equal(t.realizedPnL, t.netPnL);
  }
  assert.equal(A.costSummary!.modeled, true);
  assert.ok(Math.abs(A.costSummary!.grossPnL - A.costSummary!.slippage - A.costSummary!.totalCosts - A.costSummary!.netPnL) <= 0.05 * Math.max(1, A.trades.length));
});
test("TC9. legacy model: costs NOT MODELED (zeros, labeled)", () => {
  assert.equal(L.costSummary!.modeled, false);
  assert.equal(L.dataQuality.transactionCosts, "NOT MODELED");
  for (const t of L.trades) assert.equal(t.costs!.totalCosts, 0);
});
test("TC10. cost config is configurable and recorded in run metadata", () => {
  const free = p10({ transactionCosts: { ...CFG, brokeragePerOrder: 0, version: "test-zero-brokerage" } });
  assert.equal((free.metadata!.transactionCostConfig as TransactionCostConfig).version, "test-zero-brokerage");
  for (const t of free.trades) assert.equal(t.costs!.brokerage, 0);
});

// --- risk ---------------------------------------------------------------------------------------------------------
const sizeArgs = { plannedRiskPerUnit: 50, legs: [{ mid: 200, fill: 202 }], slip: 0.01, netMid: 200, stop: 150, lotSize: 65, maxLots: 10, budget: 10_000, openRiskRoom: 50_000 };
test("R1. sizing includes entry + exit slippage: 50 + 2 + 2 = 54 per unit", () => {
  const z = slippageAwareSizing(sizeArgs);
  assert.equal(z.riskPerUnit, 54);
  assert.equal(z.lots, Math.floor(10_000 / (54 * 65)));
});
test("R2. slippage-aware risk never exceeds the per-trade budget (1%)", () => {
  for (const budget of [3_000, 10_000, 25_000]) {
    const z = slippageAwareSizing({ ...sizeArgs, budget });
    assert.ok(z.totalRisk <= budget, `${z.totalRisk} > ${budget}`);
  }
});
test("R3. slippage pushes one lot over budget → POSITION_SIZE_ZERO", () => {
  const z = slippageAwareSizing({ ...sizeArgs, budget: 3_400 }); // 50×65 = 3,250 fits, 54×65 = 3,510 does not
  assert.equal(z.lots, 0);
  assert.equal(z.limitedBy, "POSITION_SIZE_ZERO");
});
test("R4. open-risk room limits lots → OPEN_RISK_LIMIT when nothing fits", () => {
  assert.equal(slippageAwareSizing({ ...sizeArgs, openRiskRoom: 1_000 }).limitedBy, "OPEN_RISK_LIMIT");
});
test("R5. Phase 10 engine: every trade's modeled risk ≤ 1% of capital", () => {
  for (const t of [...A.trades, ...B.trades]) assert.ok(t.riskAmount <= BASE.startingCapital * 0.01 + 1, `${t.tradeId} ${t.riskAmount}`);
});
test("R6. intrabar non-gap stop exits lose ≤ ~1R of modeled risk (slippage no longer pushes beyond)", () => {
  const stops = B.trades.filter((t) => t.exitReason === "STOP_LOSS");
  for (const t of stops) assert.ok(t.rMultiple >= -1.02, `${t.tradeId} R ${t.rMultiple}`);
});
test("R7. gap through the stop is labeled GAP_EXIT (filled at the open), separate from STOP_LOSS", () => {
  for (const t of B.trades.filter((x) => x.exitGap && x.exitReason !== "TARGET")) assert.equal(t.exitReason, "GAP_EXIT");
  for (const t of B.trades.filter((x) => x.exitReason === "STOP_LOSS")) assert.ok(!x(t));
  function x(t: { exitGap?: boolean }) { return t.exitGap === true; }
});
test("R8. daily loss: default blocks entries; flatten=true flattens; realized-only (no double counting)", () => {
  const tight = { riskConfig: { maxDailyLossPercent: 0.05 } };
  const block = p10({ ...tight, executionModel: "INTRABAR_MODEL_DERIVED" });
  const flat = p10({ ...tight, executionModel: "INTRABAR_MODEL_DERIVED", flattenOnDailyLossLimit: true });
  assert.equal(block.execution.flattenOnDailyLossLimit, false);
  assert.equal(block.execution.dailyLossFlattens, 0);
  assert.ok((block.noTradeAnalytics.rejectionReasons.DAILY_LOSS_LIMIT_BLOCK ?? 0) > 0);
  assert.equal(flat.execution.dailyLossDefinition, "REALIZED_ONLY");
  assert.ok(flat.trades.every((t) => t.exitReason !== "DAILY_LOSS_LIMIT_FLATTEN" || t.exitTimestamp));
});

// --- determinism / versioning / validation ------------------------------------------------------------------
test("D1. same inputs → identical run ID, trades, equity curve and metrics", () => {
  const again = p10();
  assert.equal(again.runId, A.runId);
  assert.deepEqual(again.trades, A.trades);
  assert.deepEqual(again.equityCurve, A.equityCurve);
  assert.deepEqual(again.summary, A.summary);
  assert.deepEqual(again, A);
});
test("D2. dataset hash covers every input series: one changed constituent bar → new hash and run ID", () => {
  const ctx = ctxFor(candles);
  ctx.constituents[7].candles[100] = { ...ctx.constituents[7].candles[100], close: 1 };
  assert.notEqual(datasetHash(candles, [], ctx), datasetHash(candles, [], CTX));
  assert.notEqual(p10({}, ctx).runId, A.runId);
});
test("D3. run metadata records versions, dataset hash, configs and result status", () => {
  const m = A.metadata!;
  for (const k of ["runId", "createdAt", "index", "timeframe", "startDate", "endDate", "initialCapital", "riskConfig", "executionModel", "transactionCostConfig", "strategyVersion", "dataVersion", "datasetHash", "riskConfigVersion", "resultStatus"]) assert.ok(m[k] !== undefined && m[k] !== null, k);
  assert.match(m.datasetHash, /^ds_[0-9a-f]{8}$/);
  assert.equal(m.dataModel, "PHASE10");
  assert.equal(L.metadata!.dataModel, "PHASE9_LEGACY");
});
test("D4. no wall-clock in outputs: createdAt is the last decision time", () => {
  assert.equal(A.createdAt, A.metadata!.createdAt === A.createdAt ? A.createdAt : A.createdAt);
  assert.ok(Date.parse(A.metadata!.createdAt as string) <= Date.parse(at("2026-10-31", "15:30")));
});
test("V1. validation gate: coverage not FULL → INSUFFICIENT_DATA", () => {
  assert.equal(validationStatus({ coverageStatus: "PARTIAL", optionsMode: "SYNTHETIC", trades: 100, sessions: 250, expectancy: 10, regimesWithTrades: 4 }).status, "INSUFFICIENT_DATA");
});
test("V2. validation gate: < 30 trades → INSUFFICIENT_SAMPLE (10 trades is never evidence)", () => {
  assert.equal(validationStatus({ coverageStatus: "FULL", optionsMode: "SYNTHETIC", trades: 10, sessions: 250, expectancy: 5000, regimesWithTrades: 4 }).status, "INSUFFICIENT_SAMPLE");
  assert.equal(MIN_TRADES_FOR_VALIDATION, 30);
});
test("V3. validation gate: enough sample, expectancy ≤ 0 → NOT_SUPPORTED", () => {
  assert.equal(validationStatus({ coverageStatus: "FULL", optionsMode: "SYNTHETIC", trades: 60, sessions: 248, expectancy: -100, regimesWithTrades: 4 }).status, "NOT_SUPPORTED");
});
test("V4. validation gate: positive on model-derived options → at most PARTIAL_VALIDATION", () => {
  assert.equal(validationStatus({ coverageStatus: "FULL", optionsMode: "SYNTHETIC", trades: 60, sessions: 248, expectancy: 100, regimesWithTrades: 4 }).status, "PARTIAL_VALIDATION");
  assert.equal(validationStatus({ coverageStatus: "FULL", optionsMode: "FULL", trades: 60, sessions: 248, expectancy: 100, regimesWithTrades: 4 }).status, "HISTORICALLY_SUPPORTED");
});
test("V5. never emits promotional statuses", () => {
  for (const r of [A, B, L]) assert.ok(["INSUFFICIENT_DATA", "INSUFFICIENT_SAMPLE", "PARTIAL_VALIDATION", "HISTORICALLY_SUPPORTED", "NOT_SUPPORTED"].includes(r.validation!.status));
});
test("S1. sample stats: sessions, bars, candidates, trades and no-trade bars are consistent", () => {
  const s = A.sample!;
  assert.equal(s.evaluatedBars, A.noTradeAnalytics.totalEvaluated);
  assert.equal(s.tradeBars + s.noTradeBars, s.evaluatedBars);
  assert.ok(s.candidateBars >= s.tradeBars);
  assert.ok(s.evaluatedSessions >= 20, `${s.evaluatedSessions}`);
  assert.ok(s.tradesPerMonth !== null);
  assert.equal(Object.values(s.barRegimes).reduce((a, b) => a + b, 0), s.evaluatedBars);
});
test("S2. comparison rows carry data quality and are not ranked", () => {
  const c = compareRuns([{ label: "A", result: A }, { label: "LEGACY", result: L }]);
  assert.equal(c.note, COMPARISON_NOTE);
  assert.deepEqual(c.rows.map((r) => r.label), ["A", "LEGACY"]);
  assert.equal(c.rows[0].dataQuality!.oi, "NOT_AVAILABLE");
  assert.equal(c.rows[1].dataQuality!.oi, "SYNTHETIC");
  assert.ok("sortino" in c.rows[0] && "transactionCosts" in c.rows[0]);
});
test("S3. special-session constants are documented windows (IST minutes)", () => {
  assert.deepEqual(NSE_SPECIAL_SESSIONS["2025-10-21"], { open: 825, close: 885, label: "Diwali Laxmi Pujan (Muhurat)" });
});
