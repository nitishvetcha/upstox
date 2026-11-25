import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isScheduledScanTime,
  isScheduledCommodityScanTime,
  SCHEDULE_SLOTS,
  COMMODITY_SCHEDULE_SLOTS,
} from "./marketScheduleRunner.ts";
import { commoditySessionWindow, commodityMarketStatus } from "../time.ts";

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

  it("matches 09:35 IST on a regular trading day (Wednesday 2026-11-25)", () => {
    // 2026-11-25 is a Wednesday trading day. 09:35 IST = 04:05 UTC
    const t0935 = new Date("2026-11-25T04:05:00.000Z");
    const check = isScheduledScanTime(t0935);
    assert.equal(check.isScheduled, true);
    assert.ok(check.label.includes("09:35 IST"));
  });

  it("matches 09:45 IST on a regular trading day (Wednesday 2026-11-25)", () => {
    // 09:45 IST = 04:15 UTC
    const t0945 = new Date("2026-11-25T04:15:00.000Z");
    const check = isScheduledScanTime(t0945);
    assert.equal(check.isScheduled, true);
    assert.ok(check.label.includes("09:45 IST"));
  });

  it("matches 10:15 IST and 15:15 IST on a regular trading day", () => {
    // 10:15 IST = 04:45 UTC
    const t1015 = new Date("2026-11-25T04:45:00.000Z");
    assert.equal(isScheduledScanTime(t1015).isScheduled, true);

    // 15:15 IST = 09:45 UTC
    const t1515 = new Date("2026-11-25T09:45:00.000Z");
    assert.equal(isScheduledScanTime(t1515).isScheduled, true);
  });

  it("returns OUTSIDE_SCHEDULE for off-schedule times like 10:00 IST on a regular trading day", () => {
    // 10:00 IST = 04:30 UTC
    const t1000 = new Date("2026-11-25T04:30:00.000Z");
    const check = isScheduledScanTime(t1000);
    assert.equal(check.isScheduled, false);
    assert.equal(check.label, "OUTSIDE_SCHEDULE");
  });

  it("suppresses scans on holidays with MARKET_CLOSED (e.g. Guru Nanak Jayanti 2026-11-24)", () => {
    // 2026-11-24 is a trading holiday
    const holiday0935 = new Date("2026-11-24T04:05:00.000Z");
    const check = isScheduledScanTime(holiday0935);
    assert.equal(check.isScheduled, false);
    assert.equal(check.label, "MARKET_CLOSED");
  });

  it("suppresses scans on weekends (Sunday)", () => {
    // 2026-11-22 is a Sunday with no special session
    const sunday0935 = new Date("2026-11-22T04:05:00.000Z");
    const check = isScheduledScanTime(sunday0935);
    assert.equal(check.isScheduled, false);
    assert.equal(check.label, "WEEKEND");
  });

  it("dynamically generates scan slots on a special session (Sunday Muhurat 2026-11-08 18:00-19:00 IST)", () => {
    // 18:10 IST = 12:40 UTC (open + 10m initial scan)
    const muhuratInitial = new Date("2026-11-08T12:40:00.000Z");
    const check1 = isScheduledScanTime(muhuratInitial);
    assert.equal(check1.isScheduled, true);
    assert.ok(check1.label.includes("18:10 IST"));

    // 18:45 IST = 13:15 UTC (close - 15m square-off scan)
    const muhuratClose = new Date("2026-11-08T13:15:00.000Z");
    const check2 = isScheduledScanTime(muhuratClose);
    assert.equal(check2.isScheduled, true);
    assert.ok(check2.label.includes("18:45 IST"));

    // 17:50 IST = 12:20 UTC (before special session open)
    const beforeMuhurat = new Date("2026-11-08T12:20:00.000Z");
    assert.equal(isScheduledScanTime(beforeMuhurat).isScheduled, false);
    assert.equal(isScheduledScanTime(beforeMuhurat).label, "OUTSIDE_SCHEDULE");
  });

  it("contains 13 commodity schedule slots from 17:15 to 23:15 IST", () => {
    assert.equal(COMMODITY_SCHEDULE_SLOTS.length, 13);
    assert.equal(COMMODITY_SCHEDULE_SLOTS[0].hour, 17);
    assert.equal(COMMODITY_SCHEDULE_SLOTS[0].minute, 15);
    assert.equal(COMMODITY_SCHEDULE_SLOTS[12].hour, 23);
    assert.equal(COMMODITY_SCHEDULE_SLOTS[12].minute, 15);
  });

  it("calculates MCX commodity session window for Guru Nanak Jayanti (evening only: 17:00–23:30)", () => {
    const win = commoditySessionWindow("2026-11-24");
    assert.ok(win !== null);
    assert.equal(win.open, 17 * 60); // 17:00 IST
    assert.equal(win.close, 23 * 60 + 30); // 23:30 IST
    assert.equal(win.isEveningOnly, true);
  });

  it("calculates MCX commodity session window for regular weekday (09:00–23:30)", () => {
    const win = commoditySessionWindow("2026-11-25");
    assert.ok(win !== null);
    assert.equal(win.open, 9 * 60); // 09:00 IST
    assert.equal(win.close, 23 * 60 + 30); // 23:30 IST
    assert.equal(win.isEveningOnly, false);
  });

  it("evaluates commodity market status accurately across today's session", () => {
    // 14:00 IST = 08:30 UTC -> CLOSED
    assert.equal(commodityMarketStatus(new Date("2026-11-24T08:30:00Z")), "CLOSED");

    // 16:50 IST = 11:20 UTC -> PRE-OPEN
    assert.equal(commodityMarketStatus(new Date("2026-11-24T11:20:00Z")), "PRE-OPEN");

    // 17:15 IST = 11:45 UTC -> OPEN
    assert.equal(commodityMarketStatus(new Date("2026-11-24T11:45:00Z")), "OPEN");

    // 23:35 IST = 18:05 UTC -> CLOSED
    assert.equal(commodityMarketStatus(new Date("2026-11-24T18:05:00Z")), "CLOSED");
  });

  it("matches scheduled commodity scan at 17:15 IST today even while equity is closed", () => {
    // 17:15 IST = 11:45 UTC
    const t1715 = new Date("2026-11-24T11:45:00.000Z");
    const check = isScheduledScanTime(t1715);
    assert.equal(check.isScheduled, true);
    assert.ok(check.label.includes("17:15 IST Commodity Evening Opening Scan"));
  });

  it("matches scheduled commodity scan at 19:15 IST (US NYMEX Opening Range Scan)", () => {
    // 19:15 IST = 13:45 UTC
    const t1915 = new Date("2026-11-24T13:45:00.000Z");
    const check = isScheduledCommodityScanTime(t1915);
    assert.equal(check.isScheduled, true);
    assert.ok(check.label.includes("19:15 IST US NYMEX Opening Range Scan"));
  });

  it("matches scheduled commodity final square-off at 23:15 IST", () => {
    // 23:15 IST = 17:45 UTC
    const t2315 = new Date("2026-11-24T17:45:00.000Z");
    const check = isScheduledCommodityScanTime(t2315);
    assert.equal(check.isScheduled, true);
    assert.ok(check.label.includes("23:15 IST Final Commodity Square-Off & Settlement Scan"));
  });
});
