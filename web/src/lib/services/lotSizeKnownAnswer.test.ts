// Known-answer tests for lot-size resolution and the lot-size guards on option-contract input.
// Rule under test (upstoxMarket.ts): two sources must agree when both are present; a disagreement yields
// null (UNKNOWN), which the risk layer blocks. Non-positive or non-numeric lot sizes are treated as absent.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveLotSize, normalizeOptionContracts } from "./upstoxMarket.ts";

test("both sources agree on 50 → 50", () => {
  assert.equal(resolveLotSize(50, 50), 50);
});

test("sources disagree (50 vs 25) → null (UNKNOWN), never a silent preference", () => {
  assert.equal(resolveLotSize(50, 25), null);
});

test("only the chain source is present → chain value", () => {
  assert.equal(resolveLotSize(75, null), 75);
});

test("only the contract source is present → contract value", () => {
  assert.equal(resolveLotSize(null, 75), 75);
});

test("neither source present → null", () => {
  assert.equal(resolveLotSize(null, null), null);
});

// Contract lot-size guards: zero, negative, string and missing values must not become a lot size.
test("a zero lot size in the contract master is treated as absent", () => {
  const r = normalizeOptionContracts([{ instrument_key: "NSE_FO|1", underlying_key: "NSE_INDEX|Nifty 50", expiry: "2026-11-17", strike_price: 25000, instrument_type: "CE", lot_size: 0 }]);
  assert.equal(r.lotSize, null);
  assert.equal(r.contracts[0]?.lotSize ?? null, null);
});

test("a negative lot size is treated as absent", () => {
  const r = normalizeOptionContracts([{ instrument_key: "NSE_FO|2", underlying_key: "NSE_INDEX|Nifty 50", expiry: "2026-11-17", strike_price: 25000, instrument_type: "PE", lot_size: -75 }]);
  assert.equal(r.lotSize, null);
});

test("a string lot size is not coerced into a number", () => {
  const r = normalizeOptionContracts([{ instrument_key: "NSE_FO|3", underlying_key: "NSE_INDEX|Nifty 50", expiry: "2026-11-17", strike_price: 25000, instrument_type: "CE", lot_size: "75" }]);
  assert.equal(r.lotSize, null);
});

test("a valid positive lot size on the contract is carried through", () => {
  const r = normalizeOptionContracts([{ instrument_key: "NSE_FO|4", underlying_key: "NSE_INDEX|Nifty 50", expiry: "2026-11-17", strike_price: 25000, instrument_type: "CE", lot_size: 75 }]);
  assert.equal(r.lotSize, 75);
  assert.equal(r.contracts[0]?.lotSize, 75);
});
