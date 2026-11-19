// Engineering audit — option-chain normalisation: one row per strike, positive strikes, malformed rows skipped.
// Offline: pure function on fixture payloads.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeChain } from "./upstoxMarket.ts";

const side = (key: string, ltp: number) => ({
  instrument_key: key,
  market_data: { ltp, bid: ltp - 0.5, ask: ltp + 0.5, oi: 1000, volume: 100, close_price: ltp },
  option_greeks: { iv: 15, delta: 0.5 },
});
const row = (strike: number, tag = "") => ({
  strike_price: strike,
  underlying_spot_price: 24010,
  lot_size: 75,
  call_options: side(`NSE_FO|C${strike}${tag}`, 100),
  put_options: side(`NSE_FO|P${strike}${tag}`, 90),
});

test("CN-1. a normal chain is normalised, sorted, and keeps its spot and lot size", () => {
  const c = normalizeChain([row(24100), row(24000), row(24050)], "nifty", "2026-10-06");
  assert.deepEqual(c.rows.map((r) => r.strike), [24000, 24050, 24100]);
  assert.equal(c.spot, 24010);
  assert.equal(c.lotSize, 75);
});

test("CN-2. a duplicate strike is kept once: the first occurrence wins, deterministically", () => {
  const c = normalizeChain([row(24000, "A"), row(24050), row(24000, "B")], "nifty", "2026-10-06");
  assert.deepEqual(c.rows.map((r) => r.strike), [24000, 24050]);
  assert.equal(c.rows[0].call.instrumentKey, "NSE_FO|C24000A");
});

test("CN-3. non-positive and non-numeric strikes are not contracts and are dropped", () => {
  const c = normalizeChain([row(0), row(-100), { ...row(24000), strike_price: "NaN" }, row(24050)], "nifty", "2026-10-06");
  assert.deepEqual(c.rows.map((r) => r.strike), [24050]);
});

test("CN-4. a chain with no usable strike rows is rejected, not returned empty", () => {
  assert.throws(() => normalizeChain([row(0)], "nifty", "2026-10-06"), (e: { reason?: string }) => e.reason === "UPSTOX_BAD_RESPONSE");
});
