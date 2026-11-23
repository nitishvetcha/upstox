import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isScheduledScanTime, SCHEDULE_SLOTS } from "./marketScheduleRunner.ts";

describe("marketScheduleRunner", () => {
  it("contains 13 exact scheduled scan slots including 09:35, 09:45, and every 30m up to 15:15", () => {
    assert.equal(SCHEDULE_SLOTS.length, 13);
    assert.equal(SCHEDULE_SLOTS[0].hour, 9);
    assert.equal(SCHEDULE_SLOTS[0].minute, 35);
    assert.equal(SCHEDULE_SLOTS[1].hour, 9);
    assert.equal(SCHEDULE_SLOTS[1].minute, 45);
    assert.equal(SCHEDULE_SLOTS[2].hour, 10);
    assert.equal(SCHEDULE_SLOTS[2].minute, 15);
    assert.equal(SCHEDULE_SLOTS[12].hour, 15);
    assert.equal(SCHEDULE_SLOTS[12].minute, 15);
  });

  it("matches 09:35 IST on a weekday (Tuesday)", () => {
    // 2026-11-24 is a Tuesday. 09:35 IST = 04:05 UTC
    const t0935 = new Date("2026-11-24T04:05:00.000Z");
    const check = isScheduledScanTime(t0935);
    assert.equal(check.isScheduled, true);
    assert.ok(check.label.includes("09:35 IST"));
  });

  it("matches 09:45 IST on a weekday (Tuesday)", () => {
    // 09:45 IST = 04:15 UTC
    const t0945 = new Date("2026-11-24T04:15:00.000Z");
    const check = isScheduledScanTime(t0945);
    assert.equal(check.isScheduled, true);
    assert.ok(check.label.includes("09:45 IST"));
  });

  it("matches 10:15 IST and 15:15 IST", () => {
    // 10:15 IST = 04:45 UTC
    const t1015 = new Date("2026-11-24T04:45:00.000Z");
    assert.equal(isScheduledScanTime(t1015).isScheduled, true);

    // 15:15 IST = 09:45 UTC
    const t1515 = new Date("2026-11-24T09:45:00.000Z");
    assert.equal(isScheduledScanTime(t1515).isScheduled, true);
  });

  it("returns OUTSIDE_SCHEDULE for off-schedule times like 10:00 IST", () => {
    // 10:00 IST = 04:30 UTC
    const t1000 = new Date("2026-11-24T04:30:00.000Z");
    const check = isScheduledScanTime(t1000);
    assert.equal(check.isScheduled, false);
    assert.equal(check.label, "OUTSIDE_SCHEDULE");
  });

  it("suppresses scans on weekends (Sunday)", () => {
    // 2026-11-22 is a Sunday
    const sunday0935 = new Date("2026-11-22T04:05:00.000Z");
    const check = isScheduledScanTime(sunday0935);
    assert.equal(check.isScheduled, false);
    assert.equal(check.label, "WEEKEND");
  });
});
