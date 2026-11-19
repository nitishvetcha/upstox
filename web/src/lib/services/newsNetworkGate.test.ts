// Regression tests: external news (NewsAPI, RSS) must send zero requests in mock mode, whatever keys exist.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fetchNewsPool } from "./newsProvider.ts";
import { fetchRss } from "./rssNewsProvider.ts";
import { newsExternalEnabled } from "./newsNetworkGate.ts";
import { clearRssBackoff } from "./rssNewsProvider.ts";
import { clearUpstoxCache } from "./cache.ts";

const realFetch = globalThis.fetch;
const realWarn = console.warn;
const realInfo = console.info;
const realError = console.error;
let calls: string[] = [];
const saved: Record<string, string | undefined> = {};
const KEYS = ["MARKET_DATA_PROVIDER", "NEWS_EXTERNAL_ENABLED", "NEWS_API_KEY"];

beforeEach(() => {
  for (const k of KEYS) saved[k] = process.env[k];
  calls = [];
  process.env.NEWS_API_KEY = "test-key-not-real"; // present on purpose: the gate must still refuse
  globalThis.fetch = (async (input: unknown) => {
    calls.push(String(input));
    return new Response(JSON.stringify({ status: "ok", articles: [] }), { status: 200 });
  }) as typeof fetch;
  console.warn = () => {};
  console.info = () => {};
  console.error = () => {};
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
  }
  globalThis.fetch = realFetch;
  console.warn = realWarn;
  console.info = realInfo;
  console.error = realError;
});

test("news is off in mock mode by default", () => {
  delete process.env.NEWS_EXTERNAL_ENABLED;
  process.env.MARKET_DATA_PROVIDER = "mock";
  assert.equal(newsExternalEnabled(), false);
});

test("NewsAPI sends zero requests in mock mode even with an API key present", async () => {
  delete process.env.NEWS_EXTERNAL_ENABLED;
  process.env.MARKET_DATA_PROVIDER = "mock";
  await assert.rejects(() => fetchNewsPool(), /blocked|NEWS_NETWORK|NEWS_EXTERNAL/i);
  assert.equal(calls.length, 0, `expected 0 news requests, saw: ${calls.join(", ")}`);
});

test("RSS sends zero requests in mock mode", async () => {
  delete process.env.NEWS_EXTERNAL_ENABLED;
  process.env.MARKET_DATA_PROVIDER = "mock";
  const r = await fetchRss();
  assert.equal(calls.length, 0, `expected 0 RSS requests, saw: ${calls.join(", ")}`);
  assert.ok(r, "RSS must return a result, not throw");
});

test("NEWS_EXTERNAL_ENABLED alone does not open news in mock mode (both conditions are required)", async () => {
  process.env.NEWS_EXTERNAL_ENABLED = "true";
  process.env.MARKET_DATA_PROVIDER = "mock";
  assert.equal(newsExternalEnabled(), false);
  await fetchRss();
  assert.equal(calls.length, 0);
});

test("MARKET_DATA_PROVIDER=upstox alone does not open news (the explicit news flag is required)", async () => {
  delete process.env.NEWS_EXTERNAL_ENABLED;
  process.env.MARKET_DATA_PROVIDER = "upstox";
  assert.equal(newsExternalEnabled(), false);
  await fetchRss();
  assert.equal(calls.length, 0);
});

test("with both authorisations set, news requests are allowed (the authorised path is preserved)", async () => {
  // Blocked results from earlier tests are cached; clear the caches so this call really reaches fetch.
  clearUpstoxCache();
  clearRssBackoff();
  process.env.NEWS_EXTERNAL_ENABLED = "true";
  process.env.MARKET_DATA_PROVIDER = "upstox";
  assert.equal(newsExternalEnabled(), true);
  await fetchRss();
  assert.ok(calls.length >= 1, "expected at least one RSS request on the authorised path");
});
