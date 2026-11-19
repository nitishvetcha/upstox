// Known-answer tests for informational contract selection. Expected values are written from the rules.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSelection, selectionStillValid, type ChainRowLite } from "./optionContractSelection.ts";

const ROWS: ChainRowLite[] = [
  { strike: 25000, call: { ltp: 300, instrumentKey: "NSE_FO|25000CE" }, put: { ltp: 120, instrumentKey: "NSE_FO|25000PE" } },
  { strike: 25100, call: { ltp: 197.4, instrumentKey: "NSE_FO|25100CE" }, put: { ltp: 148.1, instrumentKey: "NSE_FO|25100PE" } },
  { strike: 25200, call: { ltp: 0, instrumentKey: "NSE_FO|25200CE" }, put: { ltp: 210, instrumentKey: null } },
];
const U = "NIFTY 50", E = "2026-11-17";

test("no selection is NONE and never produces details", () => {
  assert.deepEqual(resolveSelection(ROWS, null, U, E, 75, 1), { kind: "NONE" });
});

test("CE at 25100 returns the backend premium and instrument key exactly", () => {
  const r = resolveSelection(ROWS, { strike: 25100, side: "CE" }, U, E, 75, 1);
  assert.equal(r.kind, "OK");
  if (r.kind !== "OK") return;
  assert.equal(r.details.ltp, 197.4);
  assert.equal(r.details.instrumentKey, "NSE_FO|25100CE");
  assert.equal(r.details.optionType, "CE");
  assert.equal(r.details.strike, 25100);
  assert.equal(r.details.expiry, E);
  assert.equal(r.details.underlying, U);
});

test("PE at 25100 returns the PE premium, not the CE premium", () => {
  const r = resolveSelection(ROWS, { strike: 25100, side: "PE" }, U, E, 75, 1);
  assert.equal(r.kind === "OK" && r.details.ltp, 148.1);
});

test("quantity = lots × lot size (3 lots of 75 = 225)", () => {
  const r = resolveSelection(ROWS, { strike: 25100, side: "CE" }, U, E, 75, 3);
  assert.equal(r.kind === "OK" && r.details.quantity, 225);
});

test("unknown lot size gives quantity null and a note, never an inferred lot size", () => {
  const r = resolveSelection(ROWS, { strike: 25100, side: "CE" }, U, E, null, 2);
  assert.equal(r.kind === "OK" && r.details.lotSize, null);
  assert.equal(r.kind === "OK" && r.details.quantity, null);
  assert.ok(r.kind === "OK" && r.notes.some((n) => /Lot size is unavailable/.test(n)));
});

test("a strike that is not in the chain is MISSING, not silently substituted", () => {
  assert.equal(resolveSelection(ROWS, { strike: 26000, side: "CE" }, U, E, 75, 1).kind, "MISSING");
});

test("zero premium is reported as no traded price (ltp null), not as a zero price", () => {
  const r = resolveSelection(ROWS, { strike: 25200, side: "CE" }, U, E, 75, 1);
  assert.equal(r.kind === "OK" && r.details.ltp, null);
  assert.ok(r.kind === "OK" && r.notes.some((n) => /No traded price/.test(n)));
});

test("a missing canonical key is shown as unavailable, not invented", () => {
  const r = resolveSelection(ROWS, { strike: 25200, side: "PE" }, U, E, 75, 1);
  assert.equal(r.kind === "OK" && r.details.instrumentKey, null);
  assert.ok(r.kind === "OK" && r.notes.some((n) => /instrument key/.test(n)));
});

test("invalid lots (0, 101, fractional) are rejected", () => {
  for (const lots of [0, 101, 1.5, -1]) {
    assert.equal(resolveSelection(ROWS, { strike: 25100, side: "CE" }, U, E, 75, lots).kind, "INVALID", `lots=${lots}`);
  }
});

test("an invalid option type is rejected", () => {
  assert.equal(resolveSelection(ROWS, { strike: 25100, side: "XX" as never }, U, E, 75, 1).kind, "INVALID");
});

test("a selection made for one symbol or expiry is not valid for another", () => {
  const made = { underlying: "NIFTY 50", expiry: "2026-11-17" };
  assert.equal(selectionStillValid(made, { underlying: "NIFTY 50", expiry: "2026-11-17" }), true);
  assert.equal(selectionStillValid(made, { underlying: "NIFTY 50", expiry: "2026-11-24" }), false);
  assert.equal(selectionStillValid(made, { underlying: "BANK NIFTY", expiry: "2026-11-17" }), false);
  assert.equal(selectionStillValid(null, { underlying: "NIFTY 50", expiry: "2026-11-17" }), false);
});
