// Issue 2 / B2 — tick-aware option-price consistency. Pure function tests: no network, no clock.
import { test } from "node:test";
import assert from "node:assert/strict";
import { OPTION_PRICE_TICK, optionPriceTolerance, optionPricesConsistent } from "./optionPriceVerification.ts";

test("PC-1. tolerance is never below one tick (₹0.05)", () => {
  assert.equal(OPTION_PRICE_TICK, 0.05);
  assert.equal(optionPriceTolerance(0.5), 0.05, "2% of 0.50 is 0.01, below a tick: the tick governs");
  assert.equal(optionPriceTolerance(2.0), 0.05, "2% of 2.00 is 0.04: the tick governs");
});

test("PC-2. low premium: one tick apart (0.50 vs 0.55) is consistent, not a mismatch", () => {
  assert.equal(optionPricesConsistent(0.5, 0.55), true);
  assert.equal(optionPricesConsistent(0.55, 0.5), true, "symmetric");
});

test("PC-3. low premium: two ticks apart (0.50 vs 0.60) is a genuine mismatch", () => {
  assert.equal(optionPricesConsistent(0.5, 0.6), false);
});

test("PC-4. mid premium: 1.00 vs 1.05 (one tick) is consistent; 1.00 vs 1.10 (two ticks) is not", () => {
  assert.equal(optionPricesConsistent(1.0, 1.05), true);
  assert.equal(optionPricesConsistent(1.0, 1.1), false);
});

test("PC-5. the percentage governs above the tick: 2% of 50 is ₹1.00", () => {
  assert.equal(optionPriceTolerance(50), 1.0);
  assert.equal(optionPricesConsistent(50, 50.9), true, "1.8% apart");
  assert.equal(optionPricesConsistent(50, 51.2), false, "2.4% apart");
});

test("PC-6. dear premium: 2% of 100 is ₹2.00", () => {
  assert.equal(optionPricesConsistent(100, 101.5), true);
  assert.equal(optionPricesConsistent(100, 102.5), false);
});

test("PC-7. missing and zero values are never consistent", () => {
  assert.equal(optionPricesConsistent(0, 0.5), false);
  assert.equal(optionPricesConsistent(-1, -1), false);
  assert.equal(optionPricesConsistent(1, Number.NaN), false);
  assert.equal(optionPricesConsistent(1, Number.POSITIVE_INFINITY), false);
});

test("PC-8. exact equality and a difference of exactly one tick at the boundary are consistent", () => {
  assert.equal(optionPricesConsistent(3.25, 3.25), true);
  assert.equal(optionPricesConsistent(1.0, 0.95), true, "exactly one tick below");
});
