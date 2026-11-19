// Stock instrument master: mock mode must never contact Upstox or write the protected data directory.
// Offline: a scratch data root (APP_DATA_DIR) and an injected fetch. The real .data/ is never touched.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

const DIR = path.join(process.cwd(), ".test-data", "stock_master_guard");
process.env.APP_DATA_DIR = DIR;
const { equityMaster } = await import("./stockService.ts");
const FILE = path.join(DIR, "instruments", "NSE_EQ.json");

const ROWS = [{ segment: "NSE_EQ", instrument_type: "EQ", trading_symbol: "TESTCO", name: "Test Co", instrument_key: "NSE_EQ|TEST1" }];

function recordingFetch(calls: string[]): typeof fetch {
  return (async (url: string | URL | Request) => {
    calls.push(String(url));
    return new Response(zlib.gzipSync(Buffer.from(JSON.stringify(ROWS))));
  }) as typeof fetch;
}

function reset() {
  delete (globalThis as { __nseEq?: unknown }).__nseEq;
  fs.rmSync(DIR, { recursive: true, force: true });
}

test("SM-1. mock mode: no network call, no file written, offline constituents used", async () => {
  const saved = process.env.MARKET_DATA_PROVIDER;
  reset();
  delete process.env.MARKET_DATA_PROVIDER;
  try {
    const calls: string[] = [];
    const m = await equityMaster(recordingFetch(calls), Date.now());
    assert.equal(calls.length, 0, "no request to any host, including the Upstox asset host");
    assert.equal(m.source, "CONSTITUENT_FALLBACK");
    assert.equal(fs.existsSync(FILE), false, "nothing is written under the data root");
  } finally {
    if (saved === undefined) delete process.env.MARKET_DATA_PROVIDER; else process.env.MARKET_DATA_PROVIDER = saved;
    reset();
  }
});

test("SM-2. live mode: the master is downloaded and cached, so the guard does not disable the live path", async () => {
  const saved = process.env.MARKET_DATA_PROVIDER;
  reset();
  process.env.MARKET_DATA_PROVIDER = "upstox";
  try {
    const calls: string[] = [];
    const m = await equityMaster(recordingFetch(calls), Date.now());
    assert.equal(calls.length, 1, "one download of the instrument master");
    assert.equal(m.source, "UPSTOX_INSTRUMENT_MASTER");
    assert.ok(m.list.some((i) => i.symbol === "TESTCO"));
    assert.equal(fs.existsSync(FILE), true, "the cache is written under the data root in live mode");
  } finally {
    if (saved === undefined) delete process.env.MARKET_DATA_PROVIDER; else process.env.MARKET_DATA_PROVIDER = saved;
    reset();
  }
});
