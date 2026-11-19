// Known-answer tests for the technical-indicator display rules. Null is never shown as 0; zero is shown as zero.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtIndicator, hasAnyIndicator, indicatorGroups, statusBadge, type TechnicalPayload } from "./technicalDisplay.ts";

const row = (groups: ReturnType<typeof indicatorGroups>, label: string) => groups.flatMap((g) => g.rows).find((r) => r.label === label)!;

test("null shows N/A and is marked missing; zero shows 0.00 and is not missing", () => {
  assert.deepEqual(fmtIndicator(null), { text: "N/A", missing: true });
  assert.deepEqual(fmtIndicator(undefined), { text: "N/A", missing: true });
  assert.deepEqual(fmtIndicator(Number.NaN), { text: "N/A", missing: true });
  assert.deepEqual(fmtIndicator(0), { text: "0.00", missing: false });
});

test("values use the requested digits (RSI to 1 decimal, levels to 0)", () => {
  const g = indicatorGroups({ rsi: 61.44, previousDayHigh: 25064.4 });
  assert.equal(row(g, "RSI 14").value, "61.4");
  assert.equal(row(g, "Previous day high").value, "25,064");
});

test("EMA 200 null is shown as N/A, not zero", () => {
  const g = indicatorGroups({ ema9: 25090, ema21: 25045, ema50: 24960, ema200: null });
  assert.equal(row(g, "EMA 200").value, "N/A");
  assert.equal(row(g, "EMA 200").missing, true);
  assert.equal(row(g, "EMA 9").value, "25,090.00");
});

test("spot VWAP null carries the index-has-no-volume note; futures VWAP shows its instrument and state", () => {
  const g = indicatorGroups({ vwap: null, futuresVwap: { instrument: "NIFTY FUT 26 NOV 26", vwap: 25100.5, price: 25120, distance: 19.5, distancePercent: 0.08, state: "ABOVE" } });
  assert.equal(row(g, "Spot VWAP").note, "Index candles carry no volume");
  assert.equal(row(g, "Futures VWAP").value, "25,100.50");
  assert.equal(row(g, "Futures VWAP").note, "NIFTY FUT 26 NOV 26 · ABOVE");
  assert.equal(row(g, "Futures distance from VWAP").note, "0.08%");
});

test("no futures VWAP gives N/A for the futures rows", () => {
  const g = indicatorGroups({ futuresVwap: null });
  assert.equal(row(g, "Futures VWAP").missing, true);
  assert.equal(row(g, "Futures price").value, "N/A");
});

test("status: LIVE/STALE/END OF DAY/UNAVAILABLE map to their own labels", () => {
  assert.equal(statusBadge("LIVE", "LIVE").label, "LIVE");
  assert.equal(statusBadge("STALE", "LIVE").label, "STALE");
  assert.equal(statusBadge("END_OF_DAY", "END_OF_DAY").label, "END OF DAY");
  assert.equal(statusBadge("UNAVAILABLE", "UNAVAILABLE").label, "UNAVAILABLE");
});

test("mock data with no freshness is named as mock and never shown as live", () => {
  const b = statusBadge(null, "MOCK");
  assert.equal(b.label, "MOCK DATA · NOT LIVE");
  assert.notEqual(b.label, "LIVE");
});

test("unknown status with a non-mock source is shown as unknown, not live", () => {
  assert.equal(statusBadge(null, "UPSTOX").label, "STATUS UNKNOWN");
});

test("hasAnyIndicator is false when every value is null, true when any is present", () => {
  const empty: TechnicalPayload = { ema9: null, rsi: null, futuresVwap: null };
  assert.equal(hasAnyIndicator(empty), false);
  assert.equal(hasAnyIndicator({ ...empty, rsi: 0 }), true);
});
