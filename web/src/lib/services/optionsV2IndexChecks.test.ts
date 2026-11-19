// Options V2 — independent NIFTY and BANK NIFTY checks: instrument identity, strike step, lot size, candidate window
// and expiry selection, each checked per index against that index's own fixture. Offline: pure functions only.
// The lot sizes in these fixtures are TEST INPUTS. The live lot size is whatever Upstox reports; nothing here asserts
// the current NSE lot size.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeChain } from "./upstoxMarket.ts";
import { INSTRUMENTS } from "./instrumentRegistry.ts";
import { strikeStep, validExpiries, atmStrike } from "./optionChainAnalytics.ts";
import { candidateWindow, CANDIDATE_MAX_STRIKES_ATM } from "./optionCandidateWindow.ts";
import type { IndexId } from "../types.ts";

interface IndexFixture { index: IndexId; spot: number; step: number; lot: number; key: string; symbol: string }
const NIFTY: IndexFixture = { index: "nifty", spot: 24010, step: 50, lot: 75, key: "NSE_INDEX|Nifty 50", symbol: "NIFTY" };
const BANKNIFTY: IndexFixture = { index: "banknifty", spot: 55210, step: 100, lot: 30, key: "NSE_INDEX|Nifty Bank", symbol: "BANKNIFTY" };

const side = (key: string, ltp: number) => ({
  instrument_key: key,
  market_data: { ltp, bid: ltp - 0.5, ask: ltp + 0.5, oi: 1000, volume: 100, close_price: ltp },
  option_greeks: { iv: 15, delta: 0.5 },
});
// 25 strikes centred on the ATM strike, one step apart.
function rawChain(f: IndexFixture, lot = f.lot): unknown[] {
  const atm = Math.round(f.spot / f.step) * f.step;
  return Array.from({ length: 25 }, (_, k) => {
    const strike = atm + (k - 12) * f.step;
    return {
      strike_price: strike,
      underlying_spot_price: f.spot,
      lot_size: lot,
      call_options: side(`NSE_FO|${f.symbol}C${strike}`, 100),
      put_options: side(`NSE_FO|${f.symbol}P${strike}`, 90),
    };
  });
}

for (const f of [NIFTY, BANKNIFTY]) {
  test(`IDX-${f.symbol}-1. instrument identity: the registry maps ${f.symbol} to its own Upstox index key`, () => {
    assert.equal(INSTRUMENTS[f.index].symbol, f.symbol);
    assert.equal(INSTRUMENTS[f.index].underlyingKey, f.key);
  });

  test(`IDX-${f.symbol}-2. strike step is derived from this index's own chain (${f.step} points), not a shared constant`, () => {
    const c = normalizeChain(rawChain(f), f.index, "2026-10-06");
    assert.equal(c.strikeStep, f.step);
    assert.equal(strikeStep(c.rows, f.spot), f.step);
  });

  test(`IDX-${f.symbol}-3. lot size is the one this chain reports (${f.lot}), not another index's value`, () => {
    const c = normalizeChain(rawChain(f), f.index, "2026-10-06");
    assert.equal(c.lotSize, f.lot);
    const other = f.index === "nifty" ? BANKNIFTY.lot : NIFTY.lot;
    assert.notEqual(c.lotSize, other);
  });

  test(`IDX-${f.symbol}-4. candidate window is ATM ±${CANDIDATE_MAX_STRIKES_ATM} listed strikes: ${2 * CANDIDATE_MAX_STRIKES_ATM + 1} strikes, ±${CANDIDATE_MAX_STRIKES_ATM * f.step} points`, () => {
    const c = normalizeChain(rawChain(f), f.index, "2026-10-06");
    const w = candidateWindow(c.rows, f.spot);
    assert.equal(w.atmStrike, atmStrike(c.rows, f.spot));
    assert.equal(w.strikes.length, 2 * CANDIDATE_MAX_STRIKES_ATM + 1);
    const lo = Math.min(...w.strikes), hi = Math.max(...w.strikes);
    assert.equal(hi - w.atmStrike, CANDIDATE_MAX_STRIKES_ATM * f.step, "upper edge is 7 steps from ATM");
    assert.equal(w.atmStrike - lo, CANDIDATE_MAX_STRIKES_ATM * f.step, "lower edge is 7 steps from ATM");
    assert.ok(!w.strikeSet.has(w.atmStrike + (CANDIDATE_MAX_STRIKES_ATM + 1) * f.step), "the strike just outside is excluded");
  });

  test(`IDX-${f.symbol}-5. expiry: the nearest listed expiry on or after today is chosen; past and impossible dates are dropped`, () => {
    const now = new Date("2026-10-05T07:00:00Z"); // Mon 12:30 IST
    const listed = ["2026-10-01", "2026-10-05", "2026-10-06", "2026-13-40", "2026-10-27"];
    const valid = validExpiries(listed, now);
    assert.deepEqual(valid, ["2026-10-05", "2026-10-06", "2026-10-27"]);
    assert.equal(valid[0], "2026-10-05", "today's expiry is still open at 12:30 IST");
  });

  test(`IDX-${f.symbol}-6. after 15:30 IST today's expiry is over and the next listed one is selected`, () => {
    const afterClose = new Date("2026-10-05T10:05:00Z"); // 15:35 IST
    assert.deepEqual(validExpiries(["2026-10-05", "2026-10-06"], afterClose), ["2026-10-06"]);
  });
}

test("IDX-X-1. the two indices never share a step, lot size or window width in points", () => {
  const n = normalizeChain(rawChain(NIFTY), "nifty", "2026-10-06");
  const b = normalizeChain(rawChain(BANKNIFTY), "banknifty", "2026-10-06");
  assert.notEqual(n.strikeStep, b.strikeStep);
  assert.notEqual(n.lotSize, b.lotSize);
  const widthN = 2 * CANDIDATE_MAX_STRIKES_ATM * NIFTY.step, widthB = 2 * CANDIDATE_MAX_STRIKES_ATM * BANKNIFTY.step;
  assert.notEqual(widthN, widthB);
});
