import test from "node:test";
import assert from "node:assert/strict";
import { addTradingDays, evaluateSwingModeB } from "./swingLiveScanner.ts";
import type { DailyBar } from "./swingV1.ts";

function makeBars(
  days: number,
  startPrice: number,
  step: number,
  vol = 100_000,
  lastVolMultiplier = 1
): DailyBar[] {
  const out: DailyBar[] = [];
  const base = new Date("2026-08-01T00:00:00Z");
  for (let i = 0; i < days; i++) {
    const d = new Date(base.getTime() + i * 86_400_000);
    const close = startPrice + i * step;
    const isLast = i === days - 1;
    out.push({
      date: d.toISOString().slice(0, 10),
      open: close - step * 0.5,
      high: close + 0.5,
      low: close - 2,
      close,
      volume: isLast ? vol * lastVolMultiplier : vol,
    });
  }
  return out;
}

test("addTradingDays skips weekends", () => {
  // 2026-11-27 is Friday; +1 trading day = Monday 2026-11-30
  assert.equal(addTradingDays("2026-11-27", 1), "2026-11-30");
  // +15 trading days = 3 weeks = 21 calendar days
  assert.equal(addTradingDays("2026-11-27", 15), "2026-12-18");
});

test("evaluateSwingModeB selects highest-conviction ₹10k Mode B pick", () => {
  const nifty = makeBars(60, 24000, 10, 1_000_000, 1);
  const stockA = makeBars(60, 500, 2, 100_000, 2.0); // strong uptrend + 2x vol
  const stockB = makeBars(60, 5000, 5, 100_000, 2.0); // > ₹3500, filtered out

  const stockData = new Map<string, DailyBar[]>([
    ["TATAMOTORS", stockA],
    ["DIXON", stockB],
  ]);

  const res = evaluateSwingModeB(stockData, nifty, new Date("2026-11-26T10:15:00Z"));
  assert.equal(res.status, "PICK");
  assert.equal(res.qualifiedCount, 1);
  assert.ok(res.pick);
  assert.equal(res.pick.symbol, "TATAMOTORS");
  assert.equal(res.pick.qty, Math.floor(10_000 / res.pick.referenceEntry));
  assert.ok(res.pick.stopLoss < res.pick.referenceEntry);
  assert.ok(res.pick.target > res.pick.breakevenTrigger);
  assert.ok(res.pick.breakevenTrigger > res.pick.referenceEntry);
});

test("evaluateSwingModeB returns NO_SETUP when no stocks qualify", () => {
  const nifty = makeBars(60, 24000, 50, 1_000_000, 1);
  const flatStock = makeBars(60, 500, 0, 100_000, 1.0);
  const res = evaluateSwingModeB(new Map([["INFY", flatStock]]), nifty);
  assert.equal(res.status, "NO_SETUP");
  assert.equal(res.pick, null);
});
