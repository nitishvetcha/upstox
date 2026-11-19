// Known-answer tests for session boundaries in IST (UTC+05:30). Each instant is written in UTC with its IST
// equivalent in the comment. Expected states come from the NSE regular session 09:15–15:30 IST, the 15-minute
// pre-open window before it, and the special Muhurat session listed in time.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { marketStatus } from "./time.ts";

// Monday 2026-11-09 (a trading day, not in NSE_HOLIDAYS).
const at = (istHHMM: string) => {
  const [h, m] = istHHMM.split(":").map(Number);
  const utcMinutes = h * 60 + m - 330; // subtract 5h30m
  const d = new Date("2026-11-09T00:00:00Z");
  d.setUTCMinutes(utcMinutes);
  return d;
};

test("08:59 IST is CLOSED (before the pre-open window)", () => {
  assert.equal(marketStatus(at("08:59")), "CLOSED");
});

test("09:00 IST is PRE-OPEN (start of the 15-minute pre-open window)", () => {
  assert.equal(marketStatus(at("09:00")), "PRE-OPEN");
});

test("09:14 IST is still PRE-OPEN", () => {
  assert.equal(marketStatus(at("09:14")), "PRE-OPEN");
});

test("09:15 IST is OPEN (first minute of the regular session)", () => {
  assert.equal(marketStatus(at("09:15")), "OPEN");
});

test("15:29 IST is OPEN (last minute of the regular session)", () => {
  assert.equal(marketStatus(at("15:29")), "OPEN");
});

test("15:30 IST is CLOSED (the session end is exclusive)", () => {
  assert.equal(marketStatus(at("15:30")), "CLOSED");
});

test("a fixed UTC instant maps to the correct IST state across midnight UTC", () => {
  // 2026-11-09T21:00:00Z = 2026-11-10 02:30 IST (a Tuesday holiday, closed)
  assert.equal(marketStatus(new Date("2026-11-09T21:00:00Z")), "CLOSED");
});

test("Muhurat special session on Sunday 2026-11-08 18:00–19:00 IST is OPEN at 18:30", () => {
  // 18:30 IST on 2026-11-08 = 13:00 UTC
  assert.equal(marketStatus(new Date("2026-11-08T13:00:00Z")), "OPEN");
});

test("Muhurat: 17:44 IST is CLOSED (before the 15-minute pre-open window that starts at 17:45)", () => {
  // 17:44 IST on 2026-11-08 = 12:14 UTC
  assert.equal(marketStatus(new Date("2026-11-08T12:14:00Z")), "CLOSED");
});

test("Muhurat: 17:59 IST is PRE-OPEN (inside the pre-open window before the 18:00 special open)", () => {
  // 17:59 IST on 2026-11-08 = 12:29 UTC
  assert.equal(marketStatus(new Date("2026-11-08T12:29:00Z")), "PRE-OPEN");
});

test("a Saturday with no special session is CLOSED even at 11:00 IST", () => {
  // 2026-11-14 11:00 IST = 05:30 UTC
  assert.equal(marketStatus(new Date("2026-11-14T05:30:00Z")), "CLOSED");
});
