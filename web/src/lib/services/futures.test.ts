// Run: npm test   (deterministic fixtures; no Upstox account needed)
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { futuresVwapFrom, normalizeFuturesContracts, selectFuturesContract, tradingDaysLeft } from "./futures.ts";
import { analyzeTechnicals } from "./technicalAnalysis.ts";
import { normalizeCandles } from "./candles.ts";
import { clearUpstoxCache, upstoxProvider } from "./upstoxMarket.ts";
import { mockSnapshot } from "./mock.ts";
import { analyze } from "../engine/strategy.ts";
import type { Candle, FuturesVwap, SourceInfo } from "../types.ts";

const NOW = new Date("2026-10-05T07:00:00Z"); // Mon 12:30 IST
const TOKEN = "secret-token-xyz";
const NIFTY = "NSE_INDEX|Nifty 50";
const BANK = "NSE_INDEX|Nifty Bank";
const LIVE: SourceInfo = { source: "LIVE", provider: "UPSTOX", fetchedAt: NOW.toISOString() };
const endOfDayIst = (ymd: string) => Date.parse(`${ymd}T15:29:59+05:30`);

// Shaped like Upstox's NSE.json.gz entries (seen live 2026-10-05).
const master = [
  { segment: "NSE_FO", instrument_type: "FUT", underlying_key: NIFTY, instrument_key: "NSE_FO|48704", trading_symbol: "NIFTY FUT 27 OCT 26", expiry: endOfDayIst("2026-10-27"), lot_size: 65 },
  { segment: "NSE_FO", instrument_type: "FUT", underlying_key: NIFTY, instrument_key: "NSE_FO|61471", trading_symbol: "NIFTY FUT 23 NOV 26", expiry: endOfDayIst("2026-11-23"), lot_size: 65 },
  { segment: "NSE_FO", instrument_type: "FUT", underlying_key: NIFTY, instrument_key: "NSE_FO|1", trading_symbol: "NIFTY FUT 29 SEP 26", expiry: endOfDayIst("2026-09-29"), lot_size: 65 },
  { segment: "NSE_FO", instrument_type: "FUT", underlying_key: BANK, instrument_key: "NSE_FO|48699", trading_symbol: "BANKNIFTY FUT 27 OCT 26", expiry: endOfDayIst("2026-10-27"), lot_size: 30 },
  { segment: "NSE_FO", instrument_type: "CE", underlying_key: NIFTY, instrument_key: "NSE_FO|9", trading_symbol: "NIFTY 22500 CE", expiry: endOfDayIst("2026-10-06") },
  { segment: "NSE_EQ", instrument_type: "EQ", instrument_key: "NSE_EQ|X", trading_symbol: "RELIANCE" },
];
const contracts = normalizeFuturesContracts(master);

const at = (ymd: string, hhmm: string) => `${ymd}T${hhmm}:00+05:30`;
const bar = (ts: string, h: number, l: number, c: number, v: number | null): Candle => ({ timestamp: ts, open: c, high: h, low: l, close: c, volume: v });
const contract = contracts.find((c) => c.instrumentKey === "NSE_FO|48704")!;
const vw = (candles: Candle[], ltp: number | null = null, now = NOW) =>
  futuresVwapFrom({ candles, timeframe: "15m", contract, ltp, source: LIVE, now });

test("1. selects only NSE_FO futures of the requested underlying", () => {
  assert.equal(contracts.length, 4, "options, equities dropped");
  assert.equal(selectFuturesContract(contracts, NIFTY, NOW)!.contract.tradingSymbol, "NIFTY FUT 27 OCT 26");
  assert.equal(selectFuturesContract(contracts, BANK, NOW)!.contract.instrumentKey, "NSE_FO|48699");
  assert.equal(selectFuturesContract(contracts, "NSE_INDEX|Nifty IT", NOW), null);
});

test("2. nearest valid expiry; expired contracts are never selected", () => {
  const pick = selectFuturesContract(contracts, NIFTY, NOW)!;
  assert.equal(pick.contract.expiry, "2026-10-27");
  assert.equal(pick.rolledOver, false);
  const afterExpiry = new Date(endOfDayIst("2026-10-27") + 1000);
  assert.equal(selectFuturesContract(contracts, NIFTY, afterExpiry)!.contract.expiry, "2026-11-23");
  assert.equal(selectFuturesContract(contracts, BANK, afterExpiry), null, "only an expired BANK NIFTY contract left");
});

test("3. rollover: ≤ N trading days left (incl. today and expiry day) moves to the next contract", () => {
  const expiryDay = new Date("2026-10-27T05:00:00Z"); // Tue 10:30 IST, expiry day
  const dayBefore = new Date("2026-10-26T05:00:00Z"); // Mon
  const friBefore = new Date("2026-10-23T05:00:00Z"); // Fri: Fri, Mon, Tue = 3 trading days
  assert.equal(tradingDaysLeft("2026-10-27", friBefore), 3, "weekend not counted");
  assert.equal(selectFuturesContract(contracts, NIFTY, expiryDay, 2)!.contract.expiry, "2026-11-23");
  assert.equal(selectFuturesContract(contracts, NIFTY, dayBefore, 2)!.rolledOver, true);
  assert.equal(selectFuturesContract(contracts, NIFTY, friBefore, 2)!.contract.expiry, "2026-10-27");
  assert.equal(selectFuturesContract(contracts, NIFTY, expiryDay, 0)!.contract.expiry, "2026-10-27", "rollover 0 = hold to expiry");
  assert.equal(selectFuturesContract(contracts, BANK, expiryDay, 2)!.contract.expiry, "2026-10-27", "no next contract: keep nearest");
});

test("4. futures contract + candle normalization (expiry ms → IST date, volume kept)", () => {
  assert.equal(contract.expiry, "2026-10-27");
  assert.equal(contract.lotSize, 65);
  const c = normalizeCandles({ candles: [[at("2026-10-05", "09:30"), 22685.9, 22700, 22680, 22690, 412000, 19245655], [at("2026-10-05", "09:15"), 22630, 22691.8, 22611.1, 22685.9, 798525, 19245655]] });
  assert.deepEqual(c[0], { timestamp: at("2026-10-05", "09:15"), open: 22630, high: 22691.8, low: 22611.1, close: 22685.9, volume: 798525 });
});

test("5. non-zero futures volume is required and used", () => {
  const ok = vw([bar(at("2026-10-05", "09:15"), 110, 90, 100, 1000)]);
  assert.equal(ok.state !== "UNAVAILABLE", true);
  assert.equal(ok.candleCount, 1);
});

test("6. VWAP = Σ(typical × volume) / Σ volume; state and distance from futures LTP", () => {
  const s = [bar(at("2026-10-05", "09:15"), 12, 6, 9, 100), bar(at("2026-10-05", "09:30"), 15, 9, 12, 300)];
  const r = vw(s, 12);
  assert.equal(r.vwap, 11.25); // (9×100 + 12×300) / 400
  assert.equal(r.price, 12);
  assert.equal(r.distance, 0.75);
  assert.equal(r.state, "ABOVE VWAP");
  assert.equal(vw(s, 11.25).state, "AT VWAP");
  assert.equal(vw(s, 10).state, "BELOW VWAP");
  assert.equal(vw(s).price, 12, "falls back to the last futures close, never spot");
});

test("7. VWAP resets at the IST session boundary", () => {
  const prev = bar("2026-10-04T18:29:00Z", 500, 500, 500, 1_000_000); // 23:59 IST Oct 4
  const first = bar("2026-10-04T18:30:00Z", 12, 6, 9, 100); // 00:00 IST Oct 5 (fixture: session starts here)
  const r = vw([prev, first, bar(at("2026-10-05", "09:30"), 15, 9, 12, 300)]);
  assert.equal(r.vwap, 11.25);
  assert.equal(r.sessionDate, "2026-10-05");
});

test("8. multiple sessions: only the latest session's candles count", () => {
  const candles = [
    bar(at("2026-09-30", "15:15"), 900, 900, 900, 5000),
    bar(at("2026-10-01", "09:15"), 800, 800, 800, 5000),
    bar(at("2026-10-05", "09:15"), 12, 6, 9, 100),
    bar(at("2026-10-05", "09:30"), 15, 9, 12, 300),
  ];
  const r = vw(candles);
  assert.equal(r.vwap, 11.25);
  assert.equal(r.candleCount, 2);
  // Before today's first candle arrives during market hours, yesterday's VWAP is not presented as live.
  const stale = vw(candles.slice(0, 2));
  assert.equal(stale.state, "UNAVAILABLE");
  assert.match(stale.reason!, /No futures candles yet for today/);
});

test("9. zero-volume futures → UNAVAILABLE 'Futures volume unavailable'", () => {
  const z = normalizeCandles({ candles: [[at("2026-10-05", "09:15"), 1, 2, 0, 1, 0, 0]] });
  const r = vw(z);
  assert.equal(r.state, "UNAVAILABLE");
  assert.equal(r.reason, "Futures volume unavailable");
  assert.equal(r.vwap, null);
});

// --- provider-level tests with stubbed Upstox ---
let calls: string[] = [];
const realFetch = globalThis.fetch;
const realInfo = console.info;
const realWarn = console.warn;
const candlesFor = (base: number, vol: number) =>
  Array.from({ length: 13 }, (_, i) => [new Date(Date.parse(at("2026-10-05", "09:15")) + i * 900_000).toISOString(), base + i, base + i + 5, base + i - 5, base + i, vol, 0]).reverse();
function stub(over: (url: string) => Response | null = () => null) {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const path = decodeURIComponent(url.pathname);
    calls.push(path + url.search);
    const forced = over(url.href);
    if (forced) return forced;
    if (url.host === "assets.upstox.com") return new Response(gzipSync(JSON.stringify(master)));
    const ok = (data: unknown) => Response.json({ status: "success", data });
    const base = path.includes("48704") ? 22630 : path.includes("48699") ? 55095 : path.includes("Nifty 50") ? 22500 : 54600;
    const vol = path.includes("NSE_FO") ? 1000 : 0; // index candles carry no volume
    if (path.includes("/v3/historical-candle/intraday/")) return ok({ candles: candlesFor(base, vol) });
    if (path.includes("/v3/historical-candle/")) return ok({ candles: [] });
    if (path.endsWith("/market-quote/quotes")) {
      const key = url.searchParams.get("instrument_key")!;
      return ok({ [key.replace("|", ":")]: { instrument_token: key, last_price: key.includes("48704") ? 22650 : 55100, net_change: 1 } });
    }
    return new Response("nf", { status: 404 });
  }) as typeof fetch;
}
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

test("10. missing futures data → VWAP UNAVAILABLE with the reason; spot technicals still work", async () => {
  stub((u) => (u.includes("assets.upstox.com") ? new Response("down", { status: 503 }) : null));
  const t = await upstoxProvider(TOKEN, () => NOW).getTechnicals("nifty");
  assert.ok(t.analysis, "spot technicals unaffected");
  assert.equal(t.analysis!.futuresVwap!.state, "UNAVAILABLE");
  assert.match(t.analysis!.futuresVwap!.reason!, /Futures data unavailable/);
  assert.equal(t.analysis!.vwap, null, "no spot VWAP substituted");
  assert.equal(t.analysis!.technicalScore.components.find((c) => c.name === "VWAP")!.points, null);

  clearUpstoxCache();
  stub((u) => (u.includes("assets.upstox.com") ? new Response(gzipSync("[]")) : null));
  const none = await upstoxProvider(TOKEN, () => NOW).getTechnicals("nifty");
  assert.equal(none.analysis!.futuresVwap!.reason, "No valid futures contract found");
});

test("11. NIFTY and BANK NIFTY futures caches are isolated", async () => {
  stub();
  const p = upstoxProvider(TOKEN, () => NOW);
  const n = (await p.getTechnicals("nifty")).analysis!.futuresVwap!;
  const b = (await p.getTechnicals("banknifty")).analysis!.futuresVwap!;
  const before = calls.length;
  const n2 = (await p.getTechnicals("nifty")).analysis!.futuresVwap!;
  assert.equal(calls.length, before, "served from cache");
  assert.equal(n.instrumentKey, "NSE_FO|48704");
  assert.equal(b.instrumentKey, "NSE_FO|48699");
  assert.equal(n2.vwap, n.vwap);
  assert.ok(n.vwap! < 30000 && b.vwap! > 50000);
  assert.equal(calls.filter((c) => c.includes("instruments") || c.includes("NSE.json")).length, 1, "instrument master fetched once");
});

test("12. futures and spot candles never share a cache entry", async () => {
  stub();
  const p = upstoxProvider(TOKEN, () => NOW);
  const t = await p.getTechnicals("nifty");
  const spotIntraday = calls.filter((c) => c.includes("/intraday/NSE_INDEX|Nifty 50/minutes/15"));
  const futIntraday = calls.filter((c) => c.includes("/intraday/NSE_FO|48704/minutes/15"));
  assert.equal(spotIntraday.length, 1);
  assert.equal(futIntraday.length, 1);
  assert.ok(t.analysis!.price < t.analysis!.futuresVwap!.price!, "spot (22,5xx) and futures (22,650) kept separate");
  assert.equal(t.analysis!.vwap, null, "spot VWAP stays null (index volume 0)");
  assert.notEqual(t.analysis!.futuresVwap!.vwap, null);
});

test("13. stale futures VWAP data blocks a trade", () => {
  const s = mockSnapshot("nifty", NOW);
  const old: SourceInfo = { ...LIVE, fetchedAt: new Date(NOW.getTime() - 10 * 60_000).toISOString() };
  const f: FuturesVwap = { ...vw([bar(at("2026-10-05", "09:15"), 110, 90, 100, 1000)], 105), source: old };
  s.technical = { futuresVwap: f } as unknown as typeof s.technical; // only the futures block matters here
  const a = analyze(s, NOW);
  assert.equal(a.status, "NO TRADE");
  assert.ok(a.blockers.includes("Futures VWAP data is stale"));
});

const trendCandles = (n: number) =>
  Array.from({ length: n }, (_, i) => bar(new Date(Date.parse(at("2026-10-05", "12:15")) - (n - 1 - i) * 900_000).toISOString(), 22000 + i * 5 + 2, 22000 + i * 5 - 2, 22000 + i * 5, null));
const tech = (futuresVwap: FuturesVwap | null) =>
  analyzeTechnicals({ timeframe: "15m", candles: trendCandles(250), daily: [], openingCandles: [], futuresVwap, now: NOW })!;

test("14. unavailable futures VWAP is excluded from the score (rescaled), never guessed", () => {
  const missing = tech({ ...vw([], null), state: "UNAVAILABLE", reason: "Futures volume unavailable" });
  const comp = missing.technicalScore.components.find((c) => c.name === "VWAP")!;
  assert.equal(comp.points, null);
  assert.match(comp.note, /Futures VWAP unavailable: Futures volume unavailable/);
  const used = missing.technicalScore.components.filter((c) => c.points !== null).length;
  assert.equal(used, 4);
  assert.ok(missing.technicalScore.score! <= 15);
});

test("15. futures VWAP is a labelled trend signal (above confirms, below argues against)", () => {
  const above = tech(vw([bar(at("2026-10-05", "09:15"), 110, 90, 100, 1000)], 105));
  const comp = above.technicalScore.components.find((c) => c.name === "VWAP")!;
  assert.equal(comp.points, 3);
  assert.ok(above.trend.reasons.includes("Futures price above futures VWAP"));
  const below = tech(vw([bar(at("2026-10-05", "09:15"), 110, 90, 100, 1000)], 95));
  assert.equal(below.technicalScore.components.find((c) => c.name === "VWAP")!.points, 0);
  assert.ok(below.technicalScore.score! < above.technicalScore.score!);

  // Engine: the note names futures VWAP, and spot is never compared with it.
  const s = mockSnapshot("nifty", NOW);
  s.indicators = { ...s.indicators!, vwap: null, futuresVwapState: "ABOVE VWAP" };
  const a = analyze(s, NOW);
  assert.ok(a.factors.flatMap((f) => f.notes).some((n) => n.text === "Futures price above futures VWAP"));
});

