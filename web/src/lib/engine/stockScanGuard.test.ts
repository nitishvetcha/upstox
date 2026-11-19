// Regression: outside Upstox mode the stock scan returns UNAVAILABLE before any token is read or any request is made.
// Every I/O function is observed: file reads, environment token, and fetch. Sentinel token; no real token; no network.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import * as path from "node:path";
import { scanStocks, type ScanDeps } from "./stockOpportunityEngine.ts";

const NOW = new Date("2026-10-05T04:00:00Z");
const SENTINEL_ANALYTICS = "SENTINEL-ANALYTICS-TOKEN-NOT-REAL";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scan-guard-"));
const tokenFile = path.join(dir, "upstox-token.json");
fs.writeFileSync(tokenFile, JSON.stringify({ accessToken: "SENTINEL-FILE-TOKEN-NOT-REAL", expiresAt: "2099-01-01T00:00:00.000Z" }));

const saved = { provider: process.env.MARKET_DATA_PROVIDER, tokenFile: process.env.UPSTOX_TOKEN_FILE, analytics: process.env.UPSTOX_ANALYTICS_TOKEN };
const realReadFileSync = fs.readFileSync;
const realReadFile = fs.promises.readFile;
const realFetch = globalThis.fetch;
let touched: string[] = [];
let fetchCalls = 0;

before(() => {
  fs.readFileSync = ((p: unknown, ...rest: unknown[]) => { touched.push(String(p)); return (realReadFileSync as (...a: unknown[]) => unknown)(p, ...rest); }) as typeof fs.readFileSync;
  fs.promises.readFile = ((p: unknown, ...rest: unknown[]) => { touched.push(String(p)); return (realReadFile as (...a: unknown[]) => unknown)(p, ...rest); }) as typeof fs.promises.readFile;
  syncBuiltinESMExports(); // named ESM imports (e.g. readFile from node:fs/promises) see the patched functions
  globalThis.fetch = (async () => { fetchCalls++; throw new Error("network blocked in test"); }) as typeof fetch;
});
after(() => {
  fs.readFileSync = realReadFileSync;
  fs.promises.readFile = realReadFile;
  syncBuiltinESMExports();
  globalThis.fetch = realFetch;
  for (const [k, v] of [["MARKET_DATA_PROVIDER", saved.provider], ["UPSTOX_TOKEN_FILE", saved.tokenFile], ["UPSTOX_ANALYTICS_TOKEN", saved.analytics]] as const) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

function mockMode() {
  delete process.env.MARKET_DATA_PROVIDER; // unset = mock (providerMode() returns "mock")
  process.env.UPSTOX_TOKEN_FILE = tokenFile;
  process.env.UPSTOX_ANALYTICS_TOKEN = SENTINEL_ANALYTICS;
  touched = []; fetchCalls = 0;
}

describe("stock scan guard: mock mode", () => {
  test("SG-1 mock mode returns UNAVAILABLE for intraday and swing, with no opportunities", async () => {
    mockMode();
    for (const kind of ["intraday", "swing"] as const) {
      const r = await scanStocks(kind, NOW);
      assert.equal(r.source, "UNAVAILABLE");
      assert.equal(r.freshness, "UNAVAILABLE");
      assert.equal(r.topOpportunities.length, 0, "no fabricated opportunities");
      assert.match(r.noOpportunityReason ?? "", /not in Upstox mode/);
    }
  });

  test("SG-2 mock mode never reads the token file or the analytics token", async () => {
    mockMode();
    await scanStocks("intraday", NOW);
    await scanStocks("swing", NOW);
    assert.equal(touched.filter((p) => p.includes("upstox-token") || p === tokenFile).length, 0, `files read: ${touched.join(", ")}`);
  });

  test("SG-3 mock mode makes zero HTTP requests", async () => {
    mockMode();
    await scanStocks("intraday", NOW);
    await scanStocks("swing", NOW);
    assert.equal(fetchCalls, 0);
  });

  test("SG-4 mock mode does not call injected quote or daily dependencies either (the check comes first)", async () => {
    mockMode();
    let quoteCalls = 0, dailyCalls = 0;
    const deps: ScanDeps = {
      quotes: async () => { quoteCalls++; return []; },
      daily: async () => { dailyCalls++; return new Map(); },
    };
    const r = await scanStocks("swing", NOW, deps);
    assert.equal(r.source, "UNAVAILABLE");
    assert.equal(quoteCalls, 0);
    assert.equal(dailyCalls, 0);
  });

  test("SG-5 an unset, empty or unknown provider is treated as not Upstox and returns UNAVAILABLE", async () => {
    for (const v of ["", "mock", "MOCK", "upstox-typo", "fallback"]) {
      mockMode();
      process.env.MARKET_DATA_PROVIDER = v;
      const r = await scanStocks("intraday", NOW);
      assert.equal(r.source, "UNAVAILABLE", `provider "${v}"`);
      assert.equal(fetchCalls, 0);
    }
  });
});

describe("stock scan guard: Upstox mode is unchanged", () => {
  test("SG-6 in Upstox mode the scan runs the injected quote dependency once (the normal path is reached)", async () => {
    process.env.MARKET_DATA_PROVIDER = "upstox";
    process.env.UPSTOX_TOKEN_FILE = path.join(dir, "absent.json"); // no token available: nothing can be requested
    delete process.env.UPSTOX_ANALYTICS_TOKEN;
    touched = []; fetchCalls = 0;
    let quoteCalls = 0;
    const deps: ScanDeps = { quotes: async (instruments) => { quoteCalls++; return instruments.map((i) => ({ symbol: i.symbol, exchange: "NSE" as const, instrumentKey: i.instrumentKey, timestamp: NOW.toISOString(), ltp: null, marketStatus: "CLOSED" as const, freshness: "UNAVAILABLE" as const, source: null, unavailableReason: "fixture" })); } };
    const r = await scanStocks("intraday", NOW, deps);
    assert.equal(quoteCalls, 1);
    assert.notEqual(r.noOpportunityReason ?? "", "", "normal result with a reason, not the mock-mode message");
    assert.doesNotMatch(r.noOpportunityReason ?? "", /not in Upstox mode/);
    assert.equal(fetchCalls, 0, "fixture-injected scan makes no network request");
  });
});
