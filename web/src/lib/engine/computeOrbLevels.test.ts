import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeOrbLevels } from "./stockOpportunityEngine.ts";
import type { Candle } from "../types.ts";

function bar(date: string, timeUtc: string, high: number, low: number): Candle {
  // IST = UTC + 5:30. NSE opens at 09:15 IST = 03:45 UTC.
  return { timestamp: `${date}T${timeUtc}`, open: (high + low) / 2, high, low, close: (high + low) / 2, volume: 1000 };
}

describe("computeOrbLevels", () => {
  const session = "2026-11-23";

  it("computes ORB from first 3 five-minute bars of the session", () => {
    const candles: Candle[] = [
      bar(session, "03:45:00.000Z", 100, 95),  // 09:15 IST
      bar(session, "03:50:00.000Z", 102, 97),  // 09:20 IST
      bar(session, "03:55:00.000Z", 101, 96),  // 09:25 IST
      bar(session, "04:00:00.000Z", 105, 98),  // 09:30 IST — excluded (4th bar)
    ];
    const { orbHigh, orbLow } = computeOrbLevels(candles, session);
    assert.equal(orbHigh, 102);
    assert.equal(orbLow, 95);
  });

  it("returns null when fewer than 2 bars exist", () => {
    const candles: Candle[] = [bar(session, "03:45:00.000Z", 100, 95)];
    const { orbHigh, orbLow } = computeOrbLevels(candles, session);
    assert.equal(orbHigh, null);
    assert.equal(orbLow, null);
  });

  it("excludes candles from other sessions", () => {
    const candles: Candle[] = [
      bar("2026-11-22", "03:45:00.000Z", 200, 180), // yesterday
      bar(session, "03:45:00.000Z", 100, 95),
      bar(session, "03:50:00.000Z", 102, 97),
    ];
    const { orbHigh, orbLow } = computeOrbLevels(candles, session);
    assert.equal(orbHigh, 102);
    assert.equal(orbLow, 95);
  });

  it("returns null for empty candle list", () => {
    const { orbHigh, orbLow } = computeOrbLevels([], session);
    assert.equal(orbHigh, null);
    assert.equal(orbLow, null);
  });
});
