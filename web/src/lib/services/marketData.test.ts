// Run: npm test   (no Upstox account needed: fetch is stubbed with documented Upstox response shapes)
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { clearUpstoxCache, normalizeChain, normalizeQuote, upstoxProvider } from "./upstoxMarket.ts";
import { atmStrike, chainMetrics, validExpiries } from "./optionChainAnalytics.ts";
import { getSnapshot, withFallback, type FallbackDeps } from "./market.ts";
import { UpstoxError } from "./errors.ts";
import { analyze } from "../engine/strategy.ts";
import { mockSnapshot } from "./mock.ts";
import { freshnessOf, tradeFreshnessOf } from "../time.ts";
import type { OptionRow, Quote } from "../types.ts";

const NOW = new Date("2026-10-05T07:00:00Z"); // Mon 12:30 IST
const TOKEN = "secret-token-xyz";
const NIFTY_EXP = "2026-10-06";
const BANK_EXP = "2026-10-27";

// --- Upstox-shaped fixtures ---
const side = (ltp: number, oi: number, prevOi: number, iv: number, delta: number) => ({
  instrument_key: "NSE_FO|1",
  market_data: { ltp, volume: oi * 2, oi, close_price: ltp, bid_price: ltp - 0.5, bid_qty: 75, ask_price: ltp + 0.5, ask_qty: 75, prev_oi: prevOi },
  option_greeks: { vega: 8.3, theta: -12.4, gamma: 0.002, delta, iv, pop: 50 },
});
function chainRows(spot: number, step: number, expiry: string, key: string) {
  const atm = Math.round(spot / step) * step;
  return Array.from({ length: 21 }, (_, k) => {
    const strike = atm + (k - 10) * step;
    return {
      expiry, pcr: 1, strike_price: strike, underlying_key: key, underlying_spot_price: spot,
      call_options: side(Math.max(1, spot - strike + 100), strike > spot ? 9000 : 3000, 8000, 14.1, 0.5),
      put_options: side(Math.max(1, strike - spot + 100), strike < spot ? 11000 : 2000, 9000, 14.5, -0.5),
    };
  }).reverse(); // unsorted on purpose
}
const quoteData = (key: string, last: number, change: number) => ({
  [key.replace("|", ":")]: { instrument_token: key, last_price: last, net_change: change, ohlc: { open: 1, high: 1, low: 1, close: 1 } },
});

let calls: string[] = [];
let logs: string[] = [];
const realFetch = globalThis.fetch;
const realInfo = console.info;
const realWarn = console.warn;

// Route stubbed Upstox endpoints. `override` can force a status/body per path.
function stubUpstox(override: (path: string, q: URLSearchParams) => Response | null = () => null) {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    calls.push(url.pathname + "?" + url.searchParams.toString());
    const forced = override(url.pathname, url.searchParams);
    if (forced) return forced;
    const key = url.searchParams.get("instrument_key")!;
    const nifty = key === "NSE_INDEX|Nifty 50";
    const ok = (data: unknown) => Response.json({ status: "success", data });
    if (url.pathname.endsWith("/market-quote/quotes")) return ok(nifty ? quoteData(key, 25137, 84.2) : quoteData(key, 56240, -170));
    if (url.pathname.endsWith("/option/contract"))
      return ok((nifty ? ["2026-09-29", NIFTY_EXP, "2026-10-13"] : ["2026-09-29", BANK_EXP]).map((expiry) => ({ expiry, strike_price: 1, instrument_type: "CE", lot_size: 75 })));
    if (url.pathname.endsWith("/option/chain"))
      return ok(nifty ? chainRows(25137, 50, url.searchParams.get("expiry_date")!, key) : chainRows(56240, 100, url.searchParams.get("expiry_date")!, key));
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

const deps = (over: Partial<FallbackDeps> = {}): FallbackDeps => ({
  mode: "upstox",
  getToken: async () => TOKEN,
  onAuthExpired: async () => {},
  now: () => NOW,
  ...over,
});

beforeEach(() => {
  clearUpstoxCache();
  calls = [];
  logs = [];
  console.info = (m: string) => logs.push(m);
  console.warn = (m: string) => logs.push(m);
});
afterEach(() => {
  globalThis.fetch = realFetch;
  console.info = realInfo;
  console.warn = realWarn;
});

const q = (ltp: number, oi: number, volume = oi, chgOi: number | null = 0): Quote => ({ ltp, bid: ltp, ask: ltp, oi, chgOi, volume, iv: 12, delta: 0.5 });

test("1. Upstox responses normalize to internal shapes", () => {
  const quote = normalizeQuote(quoteData("NSE_INDEX|Nifty 50", 25137, 84.2), "nifty");
  assert.deepEqual(quote, { index: "nifty", spot: 25137, prevClose: 25052.8, lastTradeTime: null });

  const c = normalizeChain(chainRows(25137, 50, NIFTY_EXP, "NSE_INDEX|Nifty 50"), "nifty", NIFTY_EXP);
  assert.equal(c.spot, 25137);
  assert.equal(c.strikeStep, 50);
  assert.ok(c.rows.every((r, i) => i === 0 || r.strike > c.rows[i - 1].strike), "sorted by strike");
  const r = c.rows.find((x) => x.strike === 25150)!;
  assert.equal(r.call.oi, 9000);
  assert.equal(r.call.chgOi, 1000); // oi - prev_oi
  assert.equal(r.call.iv, 14.1);
  assert.equal(r.put.delta, -0.5);
  assert.equal(r.call.vega, 8.3);
  assert.equal(r.call.bid, r.call.ltp - 0.5);
  assert.ok(!("market_data" in r.call) && !("option_greeks" in r.call), "no raw Upstox field names leak");
});

test("2. missing option fields become 0 (traded quantities) or null (quotes, IV, change in OI)", () => {
  const c = normalizeChain(
    [{ strike_price: 100, underlying_spot_price: 100, call_options: { market_data: { ltp: 5 } } }],
    "nifty",
    NIFTY_EXP,
  );
  const { call, put } = c.rows[0];
  assert.deepEqual(call, { ltp: 5, bid: null, ask: null, oi: 0, chgOi: null, volume: 0, iv: null, delta: null, gamma: null, theta: null, vega: null, instrumentKey: null });
  assert.equal(put.ltp, 0);
  assert.equal(put.bid, null);
});

test("3. expiry selection: nearest on/after today's IST date; today's expiry drops after 15:30", () => {
  const list = ["2026-10-06", "2026-09-29", "2026-10-05", "not-a-date", "2026-10-05"];
  assert.deepEqual(validExpiries(list, NOW), ["2026-10-05", "2026-10-06"]);
  assert.deepEqual(validExpiries(list, new Date("2026-10-05T10:31:00Z")), ["2026-10-06"]); // 16:01 IST
});

test("3b. provider picks the nearest valid expiry, not a past one", async () => {
  stubUpstox();
  const c = await upstoxProvider(TOKEN, () => NOW).getOptionChain("nifty");
  assert.equal(c.expiry, NIFTY_EXP);
  assert.ok(calls.some((u) => u.includes(`expiry_date=${NIFTY_EXP}`)));
});

test("4. ATM strike is the strike closest to spot", () => {
  const rows: OptionRow[] = [25050, 25100, 25150, 25200].map((strike) => ({ strike, call: q(1, 1), put: q(1, 1) }));
  assert.equal(atmStrike(rows, 25137), 25150);
  assert.equal(atmStrike(rows, 25112), 25100);
});

const chain = (rows: [number, Quote, Quote][]) => ({
  spot: 100,
  expiry: NIFTY_EXP,
  chain: rows.map(([strike, call, put]) => ({ strike, call, put })),
});

test("5. PCR: OI and volume", () => {
  const m = chainMetrics(chain([[90, q(11, 100, 50), q(1, 300, 10)], [110, q(1, 100, 50), q(11, 100, 30)]]), NOW);
  assert.equal(m.pcrOi, 2); // 400 / 200
  assert.equal(m.pcrVolume, 0.4); // 40 / 100
});

test("6. max pain is the strike with the smallest writer payout", () => {
  // Heavy put OI at 110 pulls max pain up to 110.
  const m = chainMetrics(chain([[90, q(1, 10), q(1, 10)], [100, q(1, 10), q(1, 10)], [110, q(1, 10), q(1, 900)]]), NOW);
  assert.equal(m.maxPain, 110);
  assert.equal(m.maxPainDistance, -10);
});

test("7. OI support/resistance and fresh-writing levels", () => {
  const m = chainMetrics(
    chain([
      [90, q(1, 10), q(1, 500, 0, 20)],
      [95, q(1, 10), q(1, 100, 0, 90)],
      [105, q(1, 50, 0, 80), q(1, 10)],
      [110, q(1, 400, 0, 5), q(1, 10)],
    ]),
    NOW,
  );
  assert.equal(m.support, 90);
  assert.equal(m.resistance, 110);
  assert.equal(m.supportByOiChange, 95);
  assert.equal(m.resistanceByOiChange, 105);
});

test("8. freshness bands and stale live data never trade", () => {
  assert.equal(freshnessOf(new Date(NOW.getTime() - 29_000).toISOString(), NOW).freshness, "LIVE");
  assert.equal(freshnessOf(new Date(NOW.getTime() - 30_000).toISOString(), NOW).freshness, "AGING");
  assert.equal(freshnessOf(new Date(NOW.getTime() - 121_000).toISOString(), NOW).freshness, "STALE");

  const s = mockSnapshot("nifty", NOW);
  const old = new Date(NOW.getTime() - 180_000).toISOString();
  s.sources.market = { ...s.sources.market, fetchedAt: old };
  const a = analyze(s, NOW);
  assert.equal(a.status, "NO TRADE");
  assert.ok(a.blockers.includes("Market data is stale"));
});

test("9. no token -> mock fallback, labelled", async () => {
  stubUpstox();
  const s = await getSnapshot("nifty", deps({ getToken: async () => null }));
  assert.equal(s.fallbackReason, "UPSTOX_NOT_CONNECTED");
  assert.equal(s.sources.market.source, "MOCK");
  assert.equal(calls.length, 0, "no Upstox call without a token");
});

test("10. Upstox 401 -> mock fallback, token cleared, token never logged", async () => {
  let cleared = false;
  stubUpstox(() => Response.json({ status: "error", errors: [{ errorCode: "UDAPI100050", message: "Invalid token used to access API" }] }, { status: 401 }));
  const s = await getSnapshot("nifty", deps({ onAuthExpired: async () => void (cleared = true) }));
  assert.equal(s.fallbackReason, "UPSTOX_AUTH_EXPIRED");
  assert.equal(s.sources.market.source, "MOCK");
  assert.ok(cleared);
  assert.ok(logs.length > 0 && logs.every((l) => !l.includes(TOKEN)));
  assert.ok(logs.some((l) => JSON.parse(l).status === 401));
});

test("11. NIFTY option chain is cached under its own key", async () => {
  stubUpstox();
  const p = upstoxProvider(TOKEN, () => NOW);
  const a = await p.getOptionChain("nifty");
  const before = calls.length;
  await p.getOptionChain("banknifty");
  const again = await p.getOptionChain("nifty");
  assert.equal(again, a, "second NIFTY read served from cache");
  assert.equal(calls.filter((u) => u.includes("/option/chain") && u.includes("Nifty+50")).length, 1);
  assert.ok(calls.length > before, "BANK NIFTY made its own requests");
  assert.equal(again.spot, 25137, "not overwritten by BANK NIFTY");
});

test("12. BANK NIFTY option chain is cached under its own key", async () => {
  stubUpstox();
  const p = upstoxProvider(TOKEN, () => NOW);
  const b = await p.getOptionChain("banknifty");
  await p.getOptionChain("nifty");
  const again = await p.getOptionChain("banknifty");
  assert.equal(again, b);
  assert.equal(again.spot, 56240);
  assert.equal(again.expiry, BANK_EXP);
  assert.equal(again.strikeStep, 100);
  assert.equal(calls.filter((u) => u.includes("/option/chain") && u.includes("Nifty+Bank")).length, 1);
});

test("13. invalid / empty option-chain responses fall back with a reason", async () => {
  assert.throws(() => normalizeChain({ nope: 1 }, "nifty", NIFTY_EXP), (e: UpstoxError) => e.reason === "UPSTOX_BAD_RESPONSE");
  assert.throws(() => normalizeChain([], "nifty", NIFTY_EXP), (e: UpstoxError) => e.reason === "UPSTOX_EMPTY_CHAIN");
  assert.throws(() => normalizeChain([{ foo: 1 }], "nifty", NIFTY_EXP), (e: UpstoxError) => e.reason === "UPSTOX_BAD_RESPONSE");

  stubUpstox((path) => (path.endsWith("/option/chain") ? Response.json({ status: "success", data: [] }) : null));
  const { data, fallbackReason } = await withFallback((p) => p.getOptionChain("nifty"), deps());
  assert.equal(fallbackReason, "UPSTOX_EMPTY_CHAIN");
  assert.equal(data.source.source, "MOCK");
});

test("14. division by zero never yields Infinity or NaN", () => {
  const m = chainMetrics(chain([[100, q(0, 0, 0), q(0, 50, 0)]]), NOW);
  assert.equal(m.pcrOi, null);
  assert.equal(m.pcrVolume, null);
  const json = JSON.stringify(m);
  assert.ok(!/NaN|Infinity/.test(json));
});

test("15. unavailable Greeks stay null and live data without indicators never trades", async () => {
  const c = normalizeChain([{ strike_price: 100, underlying_spot_price: 100, call_options: { market_data: { ltp: 5, oi: 1 } } }], "nifty", NIFTY_EXP);
  for (const g of ["delta", "gamma", "theta", "vega", "iv"] as const) assert.equal(c.rows[0].call[g], null);

  // Upstox placeholder Greeks when IV isn't computed (seen live): must not pass as real values.
  const deep = normalizeChain(
    [{ strike_price: 20000, underlying_spot_price: 22484, call_options: { market_data: { ltp: 2480, oi: 5 }, option_greeks: { iv: 0, delta: 1, gamma: 0, theta: 0, vega: 0, pop: 99 } } }],
    "nifty",
    NIFTY_EXP,
  );
  for (const g of ["delta", "gamma", "theta", "vega", "iv"] as const) assert.equal(deep.rows[0].call[g], null, g);

  stubUpstox();
  const s = await getSnapshot("nifty", deps(), NOW);
  assert.equal(s.fallbackReason, null);
  assert.equal(s.sources.market.source, "LIVE");
  assert.equal(s.sources.optionChain.source, "LIVE");
  assert.equal(s.sources.technical.source, "UNAVAILABLE");
  assert.equal(s.indicators, null);
  const a = analyze(s, NOW);
  assert.equal(a.status, "NO TRADE");
  assert.equal(a.plan, null);
  assert.ok(a.blockers.some((b) => b.startsWith("Not enough comparable data")));
  assert.ok(!a.factors.find((f) => f.key === "news")!.available, "mock news is not scored against live prices");
  assert.equal(a.chain.atmStrike, 25150);
});

test("16. Phase 6A.2 trade-time freshness logic", () => {
  const openTime = new Date("2026-10-05T10:00:00+05:30");
  const closedTime = new Date("2026-10-05T16:51:00+05:30");

  // Market open + recent trade -> LIVE
  const recentTrade = "2026-10-05T09:59:00+05:30";
  assert.equal(tradeFreshnessOf(recentTrade, openTime).source, "LIVE");

  // Market open + stale trade -> STALE
  const staleTrade = "2026-10-05T09:50:00+05:30";
  assert.equal(tradeFreshnessOf(staleTrade, openTime).source, "STALE");

  // Market closed + today's final trade (15:59 IST) -> END_OF_DAY
  const eodTrade = "2026-10-05T15:59:59+05:30";
  assert.equal(tradeFreshnessOf(eodTrade, closedTime).source, "END_OF_DAY");

  // Market closed + previous session trade -> STALE
  const prevSessionTrade = "2026-10-02T15:59:59+05:30";
  assert.equal(tradeFreshnessOf(prevSessionTrade, closedTime).source, "STALE");

  // Missing trade timestamp -> UNAVAILABLE
  assert.equal(tradeFreshnessOf(null, closedTime).source, "UNAVAILABLE");
});
