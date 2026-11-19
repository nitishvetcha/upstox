import test from "node:test";
import assert from "node:assert/strict";
import { pickSpotCandle, nearestStrike, localStep, verifyContract, nearestListed, type Candle } from "./historicalCoverageSelect.ts";

test("spot is the latest candle on or before expiry, regardless of array order", () => {
  const newestFirst: Candle[] = [
    ["2026-11-10T15:15:00+05:30", 1, 1, 1, 999, 0],
    ["2026-11-09T15:15:00+05:30", 1, 1, 1, 25000, 0],
    ["2026-11-06T15:15:00+05:30", 1, 1, 1, 24000, 0],
  ];
  const oldestFirst = [...newestFirst].reverse();
  assert.equal(pickSpotCandle(newestFirst, "2026-11-09")?.candle[4], 25000);
  assert.equal(pickSpotCandle(oldestFirst, "2026-11-09")?.candle[4], 25000);
  assert.equal(pickSpotCandle(newestFirst, "2026-11-09")?.date, "2026-11-09");
});

test("no candle on or before expiry returns null", () => {
  assert.equal(pickSpotCandle([["2026-11-10T15:15:00+05:30", 1, 1, 1, 5, 0]], "2026-11-09"), null);
});

test("ATM is the listed strike nearest spot", () => {
  assert.equal(nearestStrike([23700, 24000, 24500, 25000, 25500], 24800), 25000);
  assert.equal(nearestStrike([], 24800), null);
});

test("step is the interval around ATM, and irregular grids are flagged", () => {
  const regular = localStep([24000, 24050, 24100, 24150], 24100);
  assert.equal(regular?.step, 50);
  assert.equal(regular?.agree, true);

  // Wide gap far from ATM must not change the step at ATM.
  const wideFar = localStep([20000, 24000, 24050, 24100, 24150], 24100);
  assert.equal(wideFar?.step, 50);

  const irregular = localStep([24000, 24050, 24200], 24050);
  assert.equal(irregular?.agree, false);
});

test("contract verification rejects wrong type, expiry or strike", () => {
  const ok = { instrument_type: "CE", expiry: "2026-11-09", strike_price: 25000, instrument_key: "NSE_FO|1|09-11-2026" };
  assert.equal(verifyContract(ok, "2026-11-09", "CE", 25000), null);
  assert.equal(verifyContract(ok, "2026-11-09", "PE", 25000), "instrument type mismatch");
  assert.equal(verifyContract({ ...ok, expiry: "2026-11-16" }, "2026-11-09", "CE", 25000), "expiry mismatch");
  assert.equal(verifyContract(ok, "2026-11-09", "CE", 25050), "strike mismatch");
});

test("nearest listed contract is chosen per type", () => {
  const rows = [
    { instrument_type: "CE", strike_price: 25000, instrument_key: "a" },
    { instrument_type: "CE", strike_price: 25150, instrument_key: "b" },
    { instrument_type: "PE", strike_price: 24850, instrument_key: "c" },
  ];
  assert.equal(nearestListed(rows, "CE", 25100)?.instrument_key, "b");
  assert.equal(nearestListed(rows, "PE", 25100)?.instrument_key, "c");
  assert.equal(nearestListed(rows, "PE", 99999)?.instrument_key, "c");
});
