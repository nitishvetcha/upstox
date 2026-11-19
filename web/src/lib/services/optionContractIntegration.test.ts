// Option-contract integration on synthetic fixtures (no live data).
// Workflow under test: instrument → underlying key → expiry → strike → CE/PE → canonical instrument key → lot size
// → coverage check → error type. Expected values are written from the rules, not from the implementation's output.
import { test } from "node:test";
import assert from "node:assert/strict";
import { INSTRUMENTS, isIndexId } from "./instrumentRegistry.ts";
import { normalizeOptionContracts, normalizeExpiries, validateCanonicalOptionRows, resolveLotSize, reasonFor } from "./upstoxMarket.ts";
import type { CanonicalOptionContract } from "./upstoxMarket.ts";
import { UpstoxError } from "./errors.ts";
import type { OptionRow, Quote } from "../types.ts";

const UNDER = "NSE_INDEX|Nifty 50";
const EXP = "2026-11-17";
const q = (instrumentKey: string | null): Quote => ({ ltp: 10, bid: null, ask: null, oi: 0, chgOi: 0, volume: 0, iv: null, delta: null, instrumentKey } as Quote);

// Raw Upstox-shaped contract master rows (synthetic).
const raw = (strike: number, type: "CE" | "PE", over: Record<string, unknown> = {}) => ({
  instrument_key: `NSE_FO|${strike}${type}`, underlying_key: UNDER, expiry: EXP, strike_price: strike, instrument_type: type, lot_size: 75, ...over,
});

// Full coverage for strikes 24000 and 24100: 4 contracts.
const FULL_RAW = [raw(24000, "CE"), raw(24000, "PE"), raw(24100, "CE"), raw(24100, "PE")];
const FULL = normalizeOptionContracts(FULL_RAW);
const ROWS: OptionRow[] = [
  { strike: 24000, call: q("NSE_FO|24000CE"), put: q("NSE_FO|24000PE") },
  { strike: 24100, call: q("NSE_FO|24100CE"), put: q("NSE_FO|24100PE") },
];

// ── Instrument mapping ──────────────────────────────────────────────────────
test("known instrument id maps to its Upstox underlying key (nifty → NSE_INDEX|Nifty 50)", () => {
  assert.equal(isIndexId("nifty"), true);
  assert.equal(INSTRUMENTS.nifty.underlyingKey, UNDER);
});

test("unknown or wrongly-cased instrument is rejected (NIFTY is not an id)", () => {
  assert.equal(isIndexId("NIFTY"), false);
  assert.equal(isIndexId("unknown"), false);
});

test("sensex maps to the BSE segment, not NSE", () => {
  assert.ok(INSTRUMENTS.sensex.underlyingKey.startsWith("BSE_INDEX|"));
});

// ── Expiry ──────────────────────────────────────────────────────────────────
test("expiries are de-duplicated and sorted; non-string expiries are dropped", () => {
  const exp = normalizeExpiries([raw(1, "CE", { expiry: "2026-11-24" }), raw(1, "CE", { expiry: EXP }), raw(1, "CE", { expiry: EXP }), raw(1, "CE", { expiry: 20261117 })]);
  assert.deepEqual(exp, [EXP, "2026-11-24"]);
});

test("a contract master that is not a list is a bad response, not an empty chain", () => {
  assert.throws(() => normalizeOptionContracts({ data: [] }), (e: unknown) => e instanceof UpstoxError && e.reason === "UPSTOX_BAD_RESPONSE");
});

// ── Contract mapping (CE/PE, strike, identifier) ────────────────────────────
test("full synthetic chain normalises to 4 contracts with CE and PE on each strike", () => {
  assert.equal(FULL.contracts.length, 4);
  assert.equal(FULL.contracts.filter((c) => c.type === "CE").length, 2);
  assert.equal(FULL.contracts.filter((c) => c.type === "PE").length, 2);
  assert.deepEqual(FULL.contracts.map((c) => c.strike).sort((a, b) => a - b), [24000, 24000, 24100, 24100]);
});

test("contracts with missing identifier, unknown type, zero strike or zero lot are dropped, not invented", () => {
  const bad = normalizeOptionContracts([
    raw(24000, "CE", { instrument_key: undefined }),
    raw(24000, "PE", { instrument_type: "FUT" }),
    raw(0, "CE"),
    raw(24100, "PE", { lot_size: 0 }),
    raw(24100, "CE"),
  ]);
  assert.equal(bad.contracts.length, 1);
  assert.equal(bad.contracts[0].strike, 24100);
  assert.equal(bad.contracts[0].type, "CE");
});

test("a string strike is not coerced into a number", () => {
  const r = normalizeOptionContracts([raw(24000, "CE", { strike_price: "24000" })]);
  assert.equal(r.contracts.length, 0);
});

// ── Lot size across contract and chain sources ──────────────────────────────
test("lot size from the master (75) is carried onto each contract", () => {
  assert.equal(FULL.lotSize, 75);
  assert.ok(FULL.contracts.every((c) => c.lotSize === 75));
});

test("chain and contract lot sizes disagree (75 vs 50) → UNKNOWN (null), never silently preferred", () => {
  assert.equal(resolveLotSize(75, 50), null);
});

test("no lot size from either source → UNKNOWN (null)", () => {
  assert.equal(resolveLotSize(null, null), null);
});

// ── Coverage: duplicates, missing contracts, mismatches ─────────────────────
test("a complete, consistent chain passes coverage validation", () => {
  assert.doesNotThrow(() => validateCanonicalOptionRows(ROWS, FULL.contracts, UNDER, EXP));
});

test("duplicate canonical key in the chain is rejected", () => {
  const dup: OptionRow[] = [ROWS[0], { strike: 24100, call: q("NSE_FO|24000CE"), put: q("NSE_FO|24100PE") }];
  assert.throws(() => validateCanonicalOptionRows(dup, FULL.contracts, UNDER, EXP), /duplicate|mismatch/);
});

test("missing call key on a row is rejected", () => {
  const missing: OptionRow[] = [{ strike: 24000, call: q(null), put: q("NSE_FO|24000PE") }, ROWS[1]];
  assert.throws(() => validateCanonicalOptionRows(missing, FULL.contracts, UNDER, EXP), /missing or duplicate/);
});

test("incomplete coverage (only 3 of 4 contracts present) is rejected, not padded", () => {
  const partial: OptionRow[] = [ROWS[0], { strike: 24100, call: q("NSE_FO|24100CE"), put: q(null) }];
  assert.throws(() => validateCanonicalOptionRows(partial, FULL.contracts, UNDER, EXP));
});

test("a row whose key exists under a different strike is a mismatch", () => {
  const wrongStrike: OptionRow[] = [{ strike: 24050, call: q("NSE_FO|24000CE"), put: q("NSE_FO|24000PE") }, ROWS[1]];
  assert.throws(() => validateCanonicalOptionRows(wrongStrike, FULL.contracts, UNDER, EXP), /mismatch/);
});

test("the wrong instrument (different underlying key) is rejected", () => {
  assert.throws(() => validateCanonicalOptionRows(ROWS, FULL.contracts, "NSE_INDEX|Nifty Bank", EXP), /mismatch|incomplete/);
});

test("an incorrect or unavailable expiry (no contracts for that date) is rejected", () => {
  assert.throws(() => validateCanonicalOptionRows(ROWS, FULL.contracts, UNDER, "2026-12-29"), /mismatch|incomplete/);
});

test("a CE key used on the PE side is a type mismatch", () => {
  const swapped: OptionRow[] = [{ strike: 24000, call: q("NSE_FO|24000PE"), put: q("NSE_FO|24000CE") }, ROWS[1]];
  assert.throws(() => validateCanonicalOptionRows(swapped, FULL.contracts, UNDER, EXP), /mismatch/);
});

// ── Error propagation to the API and UI ─────────────────────────────────────
test("upstream 401 maps to UPSTOX_AUTH_EXPIRED (the UI shows an expired session, not 'never connected')", () => {
  assert.equal(reasonFor(401, null), "UPSTOX_AUTH_EXPIRED");
});

test("upstream 404 maps to UPSTOX_NOT_FOUND (unavailable expiry or instrument)", () => {
  assert.equal(reasonFor(404, null), "UPSTOX_NOT_FOUND");
});

test("a rate-limit response maps to UPSTOX_RATE_LIMITED", () => {
  assert.equal(reasonFor(429, null), "UPSTOX_RATE_LIMITED");
});

test("every coverage failure is an UpstoxError with a reason the UI can display", () => {
  try { validateCanonicalOptionRows([], FULL.contracts, UNDER, EXP); assert.fail("expected an error"); }
  catch (e) { assert.ok(e instanceof UpstoxError); assert.equal(e.reason, "UPSTOX_BAD_RESPONSE"); }
});
