// Regression tests for the Upstox network gate. fetch is replaced with a recorder so the tests prove
// whether an outbound request was attempted, rather than inferring it from a missing token.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { assertUpstoxNetworkAllowed, UpstoxNetworkBlockedError } from "./upstoxNetworkGate.ts";
import { get } from "./upstoxMarket.ts";
import { fetchFuturesContracts } from "./futures.ts";

const realFetch = globalThis.fetch;
const realWarn = console.warn;
let calls: string[] = [];
let savedProvider: string | undefined;
let savedToken: string | undefined;

beforeEach(() => {
  savedProvider = process.env.MARKET_DATA_PROVIDER;
  savedToken = process.env.UPSTOX_ANALYTICS_TOKEN;
  calls = [];
  // A token is deliberately present: the gate must refuse even when credentials exist.
  process.env.UPSTOX_ANALYTICS_TOKEN = "test-token-not-real";
  globalThis.fetch = (async (input: unknown) => {
    calls.push(String(input));
    return new Response(JSON.stringify({ status: "success", data: {} }), { status: 200 });
  }) as typeof fetch;
  console.warn = () => {}; // silence the expected blocked-attempt log in test output
});

afterEach(() => {
  if (savedProvider === undefined) delete process.env.MARKET_DATA_PROVIDER; else process.env.MARKET_DATA_PROVIDER = savedProvider;
  if (savedToken === undefined) delete process.env.UPSTOX_ANALYTICS_TOKEN; else process.env.UPSTOX_ANALYTICS_TOKEN = savedToken;
  globalThis.fetch = realFetch;
  console.warn = realWarn;
});

test("gate refuses when MARKET_DATA_PROVIDER is unset", () => {
  delete process.env.MARKET_DATA_PROVIDER;
  assert.throws(() => assertUpstoxNetworkAllowed("/v2/x"), UpstoxNetworkBlockedError);
});

test("gate refuses when MARKET_DATA_PROVIDER is mock", () => {
  process.env.MARKET_DATA_PROVIDER = "mock";
  assert.throws(() => assertUpstoxNetworkAllowed("/v2/x"), UpstoxNetworkBlockedError);
});

test("gate refuses non-exact values such as UPSTOX in upper case", () => {
  process.env.MARKET_DATA_PROVIDER = "UPSTOX";
  assert.throws(() => assertUpstoxNetworkAllowed("/v2/x"), UpstoxNetworkBlockedError);
});

test("gate allows only the exact value upstox", () => {
  process.env.MARKET_DATA_PROVIDER = "upstox";
  assert.doesNotThrow(() => assertUpstoxNetworkAllowed("/v2/x"));
});

test("market quote path sends zero requests in mock mode even with a token present", async () => {
  process.env.MARKET_DATA_PROVIDER = "mock";
  await assert.rejects(() => get("token", "/v2/market-quote/quotes", { instrument_key: "NSE_INDEX|Nifty 50" }, { index: "nifty" }), UpstoxNetworkBlockedError);
  assert.equal(calls.length, 0, `expected 0 outbound requests, saw ${calls.length}: ${calls.join(", ")}`);
});

test("historical candle path sends zero requests in mock mode", async () => {
  process.env.MARKET_DATA_PROVIDER = "mock";
  await assert.rejects(() => get("token", "/v3/historical-candle/NSE_INDEX|Nifty 50/days/1/2026-11-09/2025-08-16", {}, { index: "nifty" }), UpstoxNetworkBlockedError);
  assert.equal(calls.length, 0);
});

test("instrument-master download sends zero requests in mock mode (no token needed by that path)", async () => {
  process.env.MARKET_DATA_PROVIDER = "mock";
  // futures.ts wraps the gate error in its own UpstoxError, so match on the message rather than the class.
  await assert.rejects(() => fetchFuturesContracts(new Date()), /Upstox request blocked/);
  assert.equal(calls.length, 0, `expected 0 outbound requests, saw ${calls.length}`);
});

test("the gate does not block requests when provider is upstox (the live path still reaches fetch)", async () => {
  process.env.MARKET_DATA_PROVIDER = "upstox";
  await get("token", "/v2/market-quote/quotes", { instrument_key: "NSE_INDEX|Nifty 50" }, { index: "nifty" }).catch(() => undefined);
  assert.equal(calls.length, 1, "expected exactly one outbound request on the upstox path");
});

// Regression: the historical-options probe page used to crash (HTTP 500) when the gate threw. It must resolve instead.
test("historical-options availability probe resolves without any request in mock mode", async () => {
  const { upstoxHistoricalOptions } = await import("../adapters/upstoxHistoricalOptionsAdapter.ts");
  process.env.MARKET_DATA_PROVIDER = "mock";
  const report = await upstoxHistoricalOptions.getAvailability();
  assert.equal(calls.length, 0, `expected 0 outbound requests, saw ${calls.length}`);
  assert.ok(report, "probe must return a report, not throw");
});
