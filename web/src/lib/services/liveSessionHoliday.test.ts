// Regression: the session controller used to ignore NSE holidays, so on a holiday the System Status panel read OPEN
// while the top bar (time.ts calendar) read CLOSED. Both must now agree. Dates are from the NSE_HOLIDAYS calendar in time.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { marketStatus as controllerStatus, isMarketOpen, nextSessionStart, minutesRemainingInSession } from "./liveSessionController.ts";
import { marketStatus as calendarStatus } from "../time.ts";

// 11:30 IST = 06:00 UTC.
const HOLIDAY_MIDDAY = new Date("2026-11-10T06:00:00Z"); // Diwali-Balipratipada (NSE trading holiday)
const TRADING_MIDDAY = new Date("2026-11-11T06:00:00Z"); // Wednesday, regular session

test("a trading holiday during session hours is CLOSED, not OPEN", () => {
  assert.equal(controllerStatus(HOLIDAY_MIDDAY), "CLOSED");
  assert.equal(isMarketOpen(HOLIDAY_MIDDAY), false);
  assert.equal(minutesRemainingInSession(HOLIDAY_MIDDAY), 0);
});

test("a regular weekday during session hours is OPEN", () => {
  assert.equal(controllerStatus(TRADING_MIDDAY), "OPEN");
  assert.equal(isMarketOpen(TRADING_MIDDAY), true);
  // 11:30 to 15:30 = 240 minutes remaining.
  assert.equal(minutesRemainingInSession(TRADING_MIDDAY), 240);
});

test("controller and the time.ts calendar agree on open/closed for holiday, trading day, after close, and weekend", () => {
  const instants = [
    HOLIDAY_MIDDAY,
    TRADING_MIDDAY,
    new Date("2026-11-11T11:00:00Z"), // 16:30 IST, after close
    new Date("2026-11-14T06:00:00Z"), // Saturday 11:30 IST
  ];
  for (const d of instants) {
    const a = controllerStatus(d) === "OPEN";
    const b = calendarStatus(d) === "OPEN";
    assert.equal(a, b, `disagreement at ${d.toISOString()}: controller=${controllerStatus(d)} calendar=${calendarStatus(d)}`);
  }
});

test("next session start skips the holiday: from Monday after close the next open is Wednesday 09:15 IST", () => {
  // Monday 2026-11-09 16:00 IST. Tuesday 2026-11-10 is a holiday. Next open: Wednesday 2026-11-11 09:15 IST = 03:45 UTC.
  assert.equal(nextSessionStart(new Date("2026-11-09T10:30:00Z")), "2026-11-11T03:45:00.000Z");
});

test("next session start skips a weekend: from Friday after close the next open is Monday 09:15 IST", () => {
  // Friday 2026-11-20 16:00 IST. Next open: Monday 2026-11-23 09:15 IST = 03:45 UTC (2026-11-24 is the next holiday, not this one).
  assert.equal(nextSessionStart(new Date("2026-11-20T10:30:00Z")), "2026-11-23T03:45:00.000Z");
});
