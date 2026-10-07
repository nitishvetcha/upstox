// Run: npm test   (explicit historical timestamps only; no wall-clock time)
import { test } from "node:test";
import assert from "node:assert/strict";
import { isTradingDay, marketStatus, NSE_HOLIDAYS } from "./time.ts";
import { lastTuesday, nextTuesday } from "./services/mock.ts";
import { mergeAndValidate, tradingDays } from "./services/historicalCandles.ts";
import type { Candle } from "./types.ts";

const ist = (ymd: string, hhmm: string) => new Date(`${ymd}T${hhmm}:00+05:30`);

test("C1. 2026-09-14 (Ganesh Chaturthi) and 2026-10-02 (Gandhi Jayanti) are NSE holidays", () => {
  assert.equal(isTradingDay("2026-09-14"), false);
  assert.equal(isTradingDay("2026-10-02"), false);
});

test("C2. trading days around those holidays stay trading days", () => {
  for (const d of ["2026-09-11", "2026-09-15", "2026-10-01", "2026-10-05"]) assert.equal(isTradingDay(d), true, d);
});

test("C3. weekends are excluded independently of NSE_HOLIDAYS (and never listed in it)", () => {
  assert.equal(isTradingDay("2026-09-12"), false); // Saturday
  assert.equal(isTradingDay("2026-09-13"), false); // Sunday
  for (const d of NSE_HOLIDAYS) {
    const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
    assert.ok(wd !== 0 && wd !== 6, `${d} is a weekend and must not be in NSE_HOLIDAYS`);
    assert.match(d, /^20\d{2}-\d{2}-\d{2}$/, "IST session dates only, no timestamps");
  }
});

test("C4. 2026-09-01 → 2026-10-05: 23 trading sessions, 10 weekend days, 2 holidays", () => {
  const t = tradingDays("2026-09-01", "2026-10-05");
  assert.equal(t.trading.length, 23);
  assert.equal(t.weekends, 10);
  assert.deepEqual(t.holidays, ["2026-09-14", "2026-10-02"]);
});

test("C5. coverage: 23 full sessions = 575/575 bars, FULL, holidays not missing", () => {
  const bars: Candle[] = tradingDays("2026-09-01", "2026-10-05").trading.flatMap((d) =>
    Array.from({ length: 25 }, (_, i) => ({ timestamp: new Date(Date.parse(`${d}T09:15:00+05:30`) + i * 900_000).toISOString(), open: 1, high: 2, low: 0, close: 1, volume: null })),
  );
  const { coverage } = mergeAndValidate([bars], "2026-09-01", "2026-10-05", "15m", 2);
  assert.equal(coverage.expectedBars, 575);
  assert.equal(coverage.barCount, 575);
  assert.equal(coverage.coveragePercent, 100);
  assert.equal(coverage.status, "FULL");
  assert.deepEqual(coverage.missingSessions, []);
});

test("C6. market status: CLOSED all day on holidays, OPEN in session on neighbouring trading days", () => {
  for (const d of ["2026-09-14", "2026-10-02"]) {
    assert.equal(marketStatus(ist(d, "09:10")), "CLOSED");
    assert.equal(marketStatus(ist(d, "11:00")), "CLOSED");
  }
  for (const d of ["2026-09-15", "2026-10-01", "2026-10-05"]) {
    assert.equal(marketStatus(ist(d, "09:10")), "PRE-OPEN");
    assert.equal(marketStatus(ist(d, "11:00")), "OPEN");
    assert.equal(marketStatus(ist(d, "15:31")), "CLOSED");
  }
});

test("C7. NIFTY weekly expiry: normal Tuesday, weekend query, and holiday Tuesday rolled back", () => {
  assert.equal(nextTuesday(ist("2026-10-07", "10:00")), "2026-10-13", "normal week");
  assert.equal(nextTuesday(ist("2026-10-10", "10:00")), "2026-10-13", "Saturday → next Tuesday");
  // Tue 2026-10-20 is Dussehra: the week's expiry is Mon 2026-10-19 (as listed in Upstox option contracts).
  assert.equal(nextTuesday(ist("2026-10-14", "10:00")), "2026-10-19");
  assert.equal(nextTuesday(ist("2026-10-19", "15:00")), "2026-10-19", "expiry day before close");
  assert.equal(nextTuesday(ist("2026-10-19", "15:31")), "2026-10-27", "after the rolled expiry closes → following week");
  assert.equal(nextTuesday(ist("2026-09-08", "15:31")), "2026-09-15", "Tuesday after close → next week");
});

test("C8. BANK NIFTY monthly expiry: last Tuesday, unaffected when not a holiday", () => {
  assert.equal(lastTuesday(ist("2026-10-06", "10:00")), "2026-10-27");
  assert.equal(lastTuesday(ist("2026-09-15", "10:00")), "2026-09-29");
  assert.equal(lastTuesday(ist("2026-09-29", "15:31")), "2026-10-27");
});

test("C9. expiries in the Phase 9 range (Sep 1 – Oct 5) are unchanged by the calendar (no holiday Tuesdays)", () => {
  for (const d of ["2026-09-01", "2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29"]) assert.equal(isTradingDay(d), true, d);
  assert.equal(nextTuesday(ist("2026-09-11", "10:00")), "2026-09-15", "Friday before the Ganesh Chaturthi Monday");
});
