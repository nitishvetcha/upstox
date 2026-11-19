// Scanner fixture tests: every I/O dependency is injected (deps), so these run as Upstox-mode engine tests with NO token
// available. The token path is pointed at a file that does not exist and the analytics token is cleared, so no request can leave.
process.env.MARKET_DATA_PROVIDER = "upstox";
process.env.UPSTOX_TOKEN_FILE = "/nonexistent/upstox-token-for-scanner-fixture-tests.json";
delete process.env.UPSTOX_ANALYTICS_TOKEN;
// Stock provider provenance: the source is the provider that produced the data, never a constant.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeStockQuote, type StockInstrument, type StockMarketData } from "./services/stockService.ts";
import { scanStocks } from "./engine/stockOpportunityEngine.ts";
import { stockProvenance } from "./savedPickMapping.ts";

const inst: StockInstrument = { symbol: "RELIANCE", name: "Reliance", exchange: "NSE", instrumentKey: "NSE_EQ|INE002A01018", kind: "EQUITY" };
const now = new Date("2026-11-09T05:00:00Z"); // 10:30 IST, market open
const raw = { "NSE_EQ|INE002A01018": { last_price: 2500, instrument_token: "NSE_EQ|INE002A01018", ltt: now.getTime(), ohlc: { open: 2480, high: 2510, low: 2470, close: 2480 }, volume: 100000 } };

function quote(o: Partial<StockMarketData>): StockMarketData {
  return { symbol: "X", exchange: "NSE", instrumentKey: "k", timestamp: now.toISOString(), marketStatus: "OPEN", source: null, freshness: "LIVE", ltp: 100, unavailableReason: null, ...o } as StockMarketData;
}

test("P-1 a quote normalised without a provider has source null, not UPSTOX", () => {
  assert.equal(normalizeStockQuote(raw, inst, now).source, null);
});

test("P-2 an explicitly MOCK-provided quote is tagged MOCK", () => {
  assert.equal(normalizeStockQuote(raw, inst, now, "MOCK").source, "MOCK");
});

test("P-3 only the Upstox request path tags UPSTOX (explicit provider passed)", () => {
  assert.equal(normalizeStockQuote(raw, inst, now, "UPSTOX").source, "UPSTOX");
});

test("P-4 scanner source is UPSTOX only when every available quote is UPSTOX", async () => {
  const deps = { quotes: async () => [quote({ source: "UPSTOX" }), quote({ symbol: "Y", source: "UPSTOX" })] };
  assert.equal((await scanStocks("intraday", now, deps)).source, "UPSTOX");
});

test("P-5 scanner source is MOCK when the quotes are mock, even though nothing says UPSTOX", async () => {
  const deps = { quotes: async () => [quote({ source: "MOCK" }), quote({ symbol: "Y", source: "MOCK" })] };
  assert.equal((await scanStocks("intraday", now, deps)).source, "MOCK");
});

test("P-6 mixed providers are reported as MIXED, not as UPSTOX", async () => {
  const deps = { quotes: async () => [quote({ source: "UPSTOX" }), quote({ symbol: "Y", source: "MOCK" })] };
  assert.equal((await scanStocks("intraday", now, deps)).source, "MIXED");
});

test("P-7 no available quotes is UNAVAILABLE", async () => {
  const deps = { quotes: async () => [quote({ ltp: null, freshness: "UNAVAILABLE", source: null })] };
  assert.equal((await scanStocks("intraday", now, deps)).source, "UNAVAILABLE");
});

test("P-8 a MOCK-sourced quote can never become a LIVE saved pick", () => {
  const p = stockProvenance({ symbol: "X", direction: "BULLISH", entry: 100, stop: 95, target1: 110, target2: 120, source: "MOCK", freshness: "LIVE", exchangeTimestamp: now.toISOString(), fetchedAt: now.toISOString(), dataAgeSeconds: 3 });
  assert.equal(p.source, "RESEARCH");
});
