// Independent known-answer tests for option-chain metrics and expiry filtering. Expected values are hand-derived
// in the comments from the definitions; they are not computed by calling the implementation's own helpers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { atmStrike, sliceAroundAtm, validExpiries, chainMetrics } from "./optionChainAnalytics.ts";
import type { OptionRow, Quote } from "../types.ts";

const q = (over: Partial<Quote>): Quote => ({ ltp: 10, bid: null, ask: null, oi: 0, chgOi: 0, volume: 0, iv: null, delta: null, ...over });
const row = (strike: number, call: Partial<Quote>, put: Partial<Quote>): OptionRow => ({ strike, call: q(call), put: q(put) });

// Chain (strike, call OI, put OI, call chgOI, put chgOI, call volume, put volume):
//   90:  callOI 100, putOI 50,  callChg 0, putChg 10,  callVol 40, putVol 20
//  100:  callOI 200, putOI 100, callChg 0, putChg 40,  callVol 60, putVol 30
//  110:  callOI 50,  putOI 300, callChg 5, putChg 0,   callVol 10, putVol 90
// Spot 103 → ATM is 100 (|100-103|=3 < |110-103|=7). ATM IV: call 12, put 14 → average 13.
const CHAIN: OptionRow[] = [
  row(90, { oi: 100, chgOi: 0, volume: 40 }, { oi: 50, chgOi: 10, volume: 20 }),
  row(100, { oi: 200, chgOi: 0, volume: 60, iv: 12 }, { oi: 100, chgOi: 40, volume: 30, iv: 14 }),
  row(110, { oi: 50, chgOi: 5, volume: 10 }, { oi: 300, chgOi: 0, volume: 90 }),
];
const SPOT = 103;
const NOW = new Date("2026-11-10T10:00:00Z"); // exactly 7 days before the 2026-11-17 expiry close (10:00 UTC)

test("ATM strike is the strike nearest spot (100 for spot 103)", () => {
  assert.equal(atmStrike(CHAIN, SPOT), 100);
});

test("ATM is not the same as the nearest-below strike when spot is closer to the upper strike", () => {
  assert.equal(atmStrike(CHAIN, 107), 110); // |110-107|=3 < |100-107|=7
});

test("ATM strike on an exact tie keeps the first strike in chain order (documented tie rule)", () => {
  const tie: OptionRow[] = [row(100, {}, {}), row(110, {}, {})];
  assert.equal(atmStrike(tie, 105), 100);
});

test("empty chain: ATM throws instead of inventing a strike", () => {
  assert.throws(() => atmStrike([], 100), /empty option chain/);
});

test("sliceAroundAtm(range 1) returns the ATM and one strike either side", () => {
  assert.deepEqual(sliceAroundAtm(CHAIN, SPOT, 1).map((r) => r.strike), [90, 100, 110]);
});

test("sliceAroundAtm at the chain edge does not invent strikes", () => {
  assert.deepEqual(sliceAroundAtm(CHAIN, 89, 2).map((r) => r.strike), [90, 100, 110]);
});

// PCR OI = (50+100+300) / (100+200+50) = 450/350 = 1.2857142857...
test("PCR by open interest = total put OI / total call OI (450/350)", () => {
  const m = chainMetrics({ spot: SPOT, expiry: "2026-11-17", chain: CHAIN }, NOW);
  assert.ok(m.pcrOi !== null && Math.abs(m.pcrOi - 450 / 350) < 1e-12, `got ${m.pcrOi}`);
});

// PCR volume = (20+30+90) / (40+60+10) = 140/110 = 1.2727...
test("PCR by volume = total put volume / total call volume (140/110)", () => {
  const m = chainMetrics({ spot: SPOT, expiry: "2026-11-17", chain: CHAIN }, NOW);
  assert.ok(m.pcrVolume !== null && Math.abs(m.pcrVolume - 140 / 110) < 1e-12, `got ${m.pcrVolume}`);
});

test("PCR is null (not Infinity or NaN) when there is no call OI", () => {
  const noCalls = CHAIN.map((r) => ({ ...r, call: { ...r.call, oi: 0 } }));
  const m = chainMetrics({ spot: SPOT, expiry: "2026-11-17", chain: noCalls }, NOW);
  assert.equal(m.pcrOi, null);
});

// Max pain: pain(S) = Σ callOI·max(0,S−K) + putOI·max(0,K−S).
//   S=90:  0 + 100·10 + 300·20 = 7000.   S=100: 100·10 + 0 + 300·10 = 4000.   S=110: 200·10 + 100·0... = 4000.
// Strict minimum at S=100 (the first to reach 4000; S=110 ties and does not replace it).
test("max pain = 100 (minimum total writer payout, first minimum kept on a tie)", () => {
  const m = chainMetrics({ spot: SPOT, expiry: "2026-11-17", chain: CHAIN }, NOW);
  assert.equal(m.maxPain, 100);
  assert.equal(m.maxPainDistance, 3); // spot 103 − 100
});

test("OI support = highest put OI at or below spot (strike 100, OI 100)", () => {
  assert.equal(chainMetrics({ spot: SPOT, expiry: "2026-11-17", chain: CHAIN }, NOW).support, 100);
});

test("OI resistance = highest call OI at or above spot (only strike 110 qualifies)", () => {
  assert.equal(chainMetrics({ spot: SPOT, expiry: "2026-11-17", chain: CHAIN }, NOW).resistance, 110);
});

test("OI-change support: largest fresh put writing at or below spot (strike 100, +40)", () => {
  assert.equal(chainMetrics({ spot: SPOT, expiry: "2026-11-17", chain: CHAIN }, NOW).supportByOiChange, 100);
});

test("OI-change resistance: largest fresh call writing at or above spot (strike 110, +5)", () => {
  assert.equal(chainMetrics({ spot: SPOT, expiry: "2026-11-17", chain: CHAIN }, NOW).resistanceByOiChange, 110);
});

test("OI-change support is null when no strike below spot has fresh put writing", () => {
  const noFresh = CHAIN.map((r) => ({ ...r, put: { ...r.put, chgOi: 0 } }));
  assert.equal(chainMetrics({ spot: SPOT, expiry: "2026-11-17", chain: noFresh }, NOW).supportByOiChange, null);
});

test("ATM IV: call 12, put 14, average 13", () => {
  const iv = chainMetrics({ spot: SPOT, expiry: "2026-11-17", chain: CHAIN }, NOW).atmIv;
  assert.equal(iv.call, 12);
  assert.equal(iv.put, 14);
  assert.equal(iv.average, 13);
});

// Expected move (1 sigma to expiry) = spot × avgIV% × √(years). Years = 7 days / 365 = 0.0191781.
// 103 × 0.13 × √0.0191781 = 13.39 × 0.138485 = 1.854 → rounds to 2.
test("expected move = 1-sigma move to expiry, hand-derived 2 points", () => {
  assert.equal(chainMetrics({ spot: SPOT, expiry: "2026-11-17", chain: CHAIN }, NOW).expectedMove, 2);
});

test("expected move is null when no ATM implied volatility is available", () => {
  const noIv = CHAIN.map((r) => ({ ...r, call: { ...r.call, iv: null }, put: { ...r.put, iv: null } }));
  assert.equal(chainMetrics({ spot: SPOT, expiry: "2026-11-17", chain: noIv }, NOW).expectedMove, null);
});

test("expected move uses a one-hour floor on time to expiry, so an expired expiry cannot divide by zero", () => {
  const m = chainMetrics({ spot: SPOT, expiry: "2026-11-10", chain: CHAIN }, new Date("2026-11-10T10:00:00Z"));
  assert.ok(m.expectedMove !== null && Number.isFinite(m.expectedMove));
});

// ── Expiry filtering ────────────────────────────────────────────────────────
test("expiry filter keeps future dates, sorted and de-duplicated", () => {
  const now = new Date("2026-11-10T04:00:00Z"); // 09:30 IST, market open
  assert.deepEqual(validExpiries(["2026-11-24", "2026-11-17", "2026-11-17", "2026-11-03"], now), ["2026-11-17", "2026-11-24"]);
});

test("expiry filter rejects impossible calendar dates (2026-13-40)", () => {
  assert.deepEqual(validExpiries(["2026-13-40", "2026-11-17"], new Date("2026-11-10T04:00:00Z")), ["2026-11-17"]);
});

test("expiry filter rejects malformed strings", () => {
  assert.deepEqual(validExpiries(["17-11-2026", "", "2026/11/17", "2026-11-17"], new Date("2026-11-10T04:00:00Z")), ["2026-11-17"]);
});

test("today's expiry is still valid before the 15:30 IST close", () => {
  // 2026-11-17 09:30 IST = 04:00 UTC
  assert.deepEqual(validExpiries(["2026-11-17"], new Date("2026-11-17T04:00:00Z")), ["2026-11-17"]);
});

test("today's expiry drops out after the 15:30 IST close (10:00 UTC)", () => {
  // 2026-11-17 15:31 IST = 10:01 UTC
  assert.deepEqual(validExpiries(["2026-11-17"], new Date("2026-11-17T10:01:00Z")), []);
});

test("an expiry on the day before is not valid (only today onward)", () => {
  assert.deepEqual(validExpiries(["2026-11-09"], new Date("2026-11-10T04:00:00Z")), []);
});
