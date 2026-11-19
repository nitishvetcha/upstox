import test from "node:test";
import assert from "node:assert/strict";
import { defaultDateRange } from "./uiConfig.ts";

// IST is UTC+05:30. The bug window is 00:00–05:30 IST, when the UTC date is still the previous day.
test("00:30 IST on 13 Nov is the 13 Nov range (UTC date would be 12 Nov)", () => {
  assert.equal(defaultDateRange(new Date("2026-11-12T19:00:00Z")).endDate, "2026-11-13");
});

test("23:59:59 IST on 12 Nov is still the 12 Nov range", () => {
  assert.equal(defaultDateRange(new Date("2026-11-12T18:29:59Z")).endDate, "2026-11-12");
});

test("exactly 00:00 IST on 13 Nov starts the 13 Nov range", () => {
  assert.equal(defaultDateRange(new Date("2026-11-12T18:30:00Z")).endDate, "2026-11-13");
});

test("05:30 IST on 13 Nov is the 13 Nov range", () => {
  assert.equal(defaultDateRange(new Date("2026-11-13T00:00:00Z")).endDate, "2026-11-13");
});

test("start date is lookbackMonths before the IST end date", () => {
  assert.deepEqual(defaultDateRange(new Date("2026-11-12T19:00:00Z"), 12), { startDate: "2025-11-13", endDate: "2026-11-13" });
});
