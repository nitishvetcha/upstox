// Expiry calendar — the weekday rules behind the mock and backtest expiries, checked against the holiday table.
// Scope, stated plainly: these tests verify that the code implements the stated rule (NIFTY weekly on Tuesday,
// BANK NIFTY monthly on the last Tuesday, a holiday moves the expiry to the previous trading day). They do NOT verify
// the NSE calendar itself. The live path uses the expiries Upstox lists (see EX-1..5 in expiryCalendar.test.ts).
// Offline and deterministic: fixed clocks, pure functions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { nextTuesday, lastTuesday } from "./mock.ts";
import { isRegularSession, NSE_HOLIDAYS } from "../time.ts";

const at = (iso: string) => new Date(iso); // ISO with explicit offset

test("EX-M1. NIFTY: on Monday 2026-10-05 at 12:30 IST the next weekly expiry is Tuesday 2026-10-06", () => {
  assert.equal(nextTuesday(at("2026-10-05T07:00:00Z")), "2026-10-06");
});

test("EX-M2. NIFTY: a Tuesday holiday moves the expiry to the previous trading day (Dussehra, Tue 2026-10-20 → Mon 2026-10-19)", () => {
  assert.ok(NSE_HOLIDAYS.has("2026-10-20"), "the holiday table lists 2026-10-20");
  assert.equal(nextTuesday(at("2026-10-19T04:30:00Z")), "2026-10-19"); // Mon 10:00 IST
});

test("EX-M3. NIFTY: after 15:30 IST on expiry day the contract is over and the following Tuesday is selected", () => {
  assert.equal(nextTuesday(at("2026-10-06T10:15:00Z")), "2026-10-13"); // Tue 15:45 IST
});

test("EX-M4. BANK NIFTY: the monthly expiry is the last Tuesday of the month (October 2026 → 2026-10-27)", () => {
  assert.equal(lastTuesday(at("2026-10-05T07:00:00Z")), "2026-10-27");
});

test("EX-M5. BANK NIFTY: a last-Tuesday holiday moves to the previous trading day (Guru Nanak Jayanti, Tue 2026-11-24 → Mon 2026-11-23)", () => {
  assert.ok(NSE_HOLIDAYS.has("2026-11-24"), "the holiday table lists 2026-11-24");
  assert.equal(lastTuesday(at("2026-11-02T04:30:00Z")), "2026-11-23");
});

test("EX-M6. every mock expiry is a regular trading session and is not in the past, across a range of dates", () => {
  for (let d = 0; d < 60; d++) {
    const now = new Date(Date.parse("2026-10-01T04:30:00Z") + d * 86_400_000);
    for (const exp of [nextTuesday(now), lastTuesday(now)]) {
      assert.ok(isRegularSession(exp), `${exp} from ${now.toISOString()} must be a regular session`);
      assert.ok(exp >= now.toISOString().slice(0, 10), `${exp} must not be before the clock date`);
    }
  }
});

test("EX-M7. the holiday table is internally sound: no weekend entries, and every entry is a date", () => {
  for (const h of NSE_HOLIDAYS) {
    assert.match(h, /^\d{4}-\d{2}-\d{2}$/);
    const wd = new Date(`${h}T00:00:00Z`).getUTCDay();
    assert.ok(wd !== 0 && wd !== 6, `${h} is a weekend and should not be listed`);
  }
});

test("EX-M8. NIFTY: with Tue 2026-11-10 an NSE trading holiday (Diwali Balipratipada), the week's weekly expiry is Mon 2026-11-09", () => {
  assert.ok(NSE_HOLIDAYS.has("2026-11-10"), "the holiday table lists 2026-11-10");
  // From Wed 2026-11-04 the week's Tuesday is the 10th (a holiday). From Mon 11-02 the next expiry is Tue 11-03, a normal day.
  assert.equal(nextTuesday(at("2026-11-04T04:30:00Z")), "2026-11-09");
});

test("EX-M9. BANK NIFTY: the November 2026 monthly (last Tuesday 2026-11-24, a holiday) is Mon 2026-11-23", () => {
  assert.equal(lastTuesday(at("2026-11-06T04:30:00Z")), "2026-11-23");
});

