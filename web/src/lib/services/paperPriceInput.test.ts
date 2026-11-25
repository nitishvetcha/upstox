import test from "node:test";
import assert from "node:assert/strict";
import { optionUnderlyingId } from "./paperPriceInput.ts";

test("option paper monitoring resolves supported MCX and index underlyings without NIFTY fallback", () => {
  assert.equal(optionUnderlyingId("NIFTY"), "nifty");
  assert.equal(optionUnderlyingId("BANKNIFTY"), "banknifty");
  assert.equal(optionUnderlyingId("CRUDEOIL"), "crudeoil");
  assert.equal(optionUnderlyingId("NATURALGAS"), "naturalgas");
  assert.equal(optionUnderlyingId("unknown-contract"), null);
});
