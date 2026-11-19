// Engineering audit — expiry selection. The live chain uses the nearest listed expiry on or after today's IST date;
// today's expiry is over at 15:30 IST. Offline: pure function, fixed clock.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validExpiries } from "./optionChainAnalytics.ts";

const LIST = ["2026-10-06", "2026-10-05", "2026-10-13", "2026-10-06"];

test("EX-1. before the close, today's expiry is still valid; duplicates removed; sorted", () => {
  const v = validExpiries(LIST, new Date("2026-10-05T07:00:00Z")); // 12:30 IST
  assert.deepEqual(v, ["2026-10-05", "2026-10-06", "2026-10-13"]);
});

test("EX-2. after 15:30 IST, today's expiry is over and the next expiry becomes the nearest", () => {
  const v = validExpiries(LIST, new Date("2026-10-05T10:05:00Z")); // 15:35 IST
  assert.deepEqual(v, ["2026-10-06", "2026-10-13"]);
});

test("EX-3. exactly 15:30 IST counts as closed", () => {
  const v = validExpiries(["2026-10-05", "2026-10-06"], new Date("2026-10-05T10:00:00Z")); // 15:30 IST
  assert.deepEqual(v, ["2026-10-06"]);
});

test("EX-4. past expiries and malformed strings are never selected", () => {
  const v = validExpiries(["2026-10-01", "not-a-date", "2026-10-06", "2026-13-40"], new Date("2026-10-05T07:00:00Z"));
  assert.deepEqual(v, ["2026-10-06"]);
});

test("EX-5. no expiry left after the last listed one is an empty list (the chain fetch then reports no expiry)", () => {
  assert.deepEqual(validExpiries(["2026-10-01"], new Date("2026-10-05T07:00:00Z")), []);
});

import { resolveLotSize } from "./upstoxMarket.ts";
test("LS-1. lot size: agreement or a single source is used; disagreement is unknown (null), never silently chosen", () => {
  assert.equal(resolveLotSize(75, 75), 75);
  assert.equal(resolveLotSize(75, null), 75);
  assert.equal(resolveLotSize(null, 30), 30);
  assert.equal(resolveLotSize(null, null), null);
  assert.equal(resolveLotSize(75, 30), null, "BANK NIFTY 30 vs NIFTY 75 style disagreement must not size a trade");
});
