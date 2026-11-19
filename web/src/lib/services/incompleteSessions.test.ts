// Incomplete-session validation on synthetic candles. Rules under test (candleFreshness.ts):
//   - a candle is COMPLETE only when start + interval <= now (a forming candle is never used);
//   - while the market is OPEN the newest completed candle's close may be at most interval + 2 min old;
//   - a CLOSED session makes completed candles END_OF_DAY, never LIVE;
//   - malformed or future-dated newest data blocks the cycle (DATA_QUALITY).
// Nothing is interpolated or filled: missing data must be reported, not replaced.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  completedIntradayCandles, completedDailyCandles, classifyTechnicalSeries, newestRowShape, newestCandleUsable, istDay, maxCompletedCandleAgeMs,
} from "./candleFreshness.ts";
import { validExpiries } from "./optionChainAnalytics.ts";
import { ema, rsi, macd } from "./technicalAnalysis.ts";
import type { Candle } from "../types.ts";

// Candle factory: `ist` is the candle START in IST, written as an ISO string with +05:30.
const c = (ist: string, close = 100): Candle => ({ timestamp: ist, open: close, high: close + 1, low: close - 1, close, volume: null });
const ist = (hhmm: string, day = "2026-11-10") => `${day}T${hhmm}:00+05:30`;
const at = (isoIst: string) => new Date(isoIst);

// ── Completion rule ─────────────────────────────────────────────────────────
test("a 15m candle starting 10:00 IST is NOT complete at 10:14:59 IST", () => {
  const out = completedIntradayCandles([c(ist("10:00"))], "15m", at("2026-11-10T10:14:59+05:30"));
  assert.equal(out.length, 0);
});

test("the same candle IS complete at exactly 10:15:00 IST (interval closed)", () => {
  const out = completedIntradayCandles([c(ist("10:00"))], "15m", at("2026-11-10T10:15:00+05:30"));
  assert.equal(out.length, 1);
});

test("a forming candle at the end of a series is dropped, the previous completed one is kept", () => {
  const series = [c(ist("09:45")), c(ist("10:00")), c(ist("10:15"))];
  const out = completedIntradayCandles(series, "15m", at("2026-11-10T10:20:00+05:30"));
  assert.deepEqual(out.map((x) => x.timestamp), [ist("09:45"), ist("10:00")]);
});

// ── Missing and delayed final candle ────────────────────────────────────────
test("newest completed candle closed 5 min ago while OPEN → LIVE (within 17 min limit)", () => {
  const completed = completedIntradayCandles([c(ist("10:00"))], "15m", at("2026-11-10T10:20:00+05:30"));
  const r = classifyTechnicalSeries({ timeframe: "15m", completed, now: at("2026-11-10T10:20:00+05:30"), market: "OPEN", newestUsable: true });
  assert.equal(r.source, "LIVE");
  assert.equal(r.ageMs, 5 * 60_000);
});

test("delayed candle exactly at the 17 min limit is still LIVE (limit is inclusive)", () => {
  const completed = completedIntradayCandles([c(ist("10:00"))], "15m", at("2026-11-10T10:32:00+05:30"));
  const r = classifyTechnicalSeries({ timeframe: "15m", completed, now: at("2026-11-10T10:32:00+05:30"), market: "OPEN", newestUsable: true });
  assert.equal(r.source, "LIVE");
});

test("missing final candle: newest close is 17.5 min old → STALE, not LIVE", () => {
  const now = at("2026-11-10T10:32:30+05:30");
  const completed = completedIntradayCandles([c(ist("10:00"))], "15m", now);
  const r = classifyTechnicalSeries({ timeframe: "15m", completed, now, market: "OPEN", newestUsable: true });
  assert.equal(r.source, "STALE");
  assert.equal(r.reasonCode, "STALE_CANDLE");
});

test("interval-specific grace: 5m limit is 7 min, not the 15m value", () => {
  assert.equal(maxCompletedCandleAgeMs("5m"), 7 * 60_000);
  assert.equal(maxCompletedCandleAgeMs("15m"), 17 * 60_000);
});

test("delayed fetch: candles fresh but the upstream fetch is 6 min old → STALE_FETCH", () => {
  const now = at("2026-11-10T10:20:00+05:30");
  const completed = completedIntradayCandles([c(ist("10:00"))], "15m", now);
  const r = classifyTechnicalSeries({ timeframe: "15m", completed, now, market: "OPEN", newestUsable: true, fetchAgeMs: 6 * 60_000 });
  assert.equal(r.source, "STALE");
  assert.equal(r.reasonCode, "STALE_FETCH");
});

// ── Early closure, holidays and special sessions ────────────────────────────
test("early closure (market CLOSED at 14:00) turns completed candles into END_OF_DAY, never LIVE", () => {
  const now = at("2026-11-10T14:00:00+05:30");
  const completed = completedIntradayCandles([c(ist("13:45"))], "15m", now);
  const r = classifyTechnicalSeries({ timeframe: "15m", completed, now, market: "CLOSED", newestUsable: true });
  assert.equal(r.source, "END_OF_DAY");
});

test("holiday (market CLOSED on 2026-11-10 during session hours) is END_OF_DAY, not LIVE", () => {
  const now = at("2026-11-10T11:00:00+05:30");
  const completed = completedIntradayCandles([c(ist("10:45"))], "15m", now);
  const r = classifyTechnicalSeries({ timeframe: "15m", completed, now, market: "CLOSED", newestUsable: true });
  assert.notEqual(r.source, "LIVE");
});

test("daily candles are always END_OF_DAY, and today's forming daily candle is excluded", () => {
  const now = at("2026-11-10T11:00:00+05:30");
  const daily = [c("2026-11-09T09:15:00+05:30"), c("2026-11-10T09:15:00+05:30")];
  const complete = completedDailyCandles(daily, now);
  assert.deepEqual(complete.map((x) => x.timestamp), ["2026-11-09T09:15:00+05:30"]);
  const r = classifyTechnicalSeries({ timeframe: "1d", completed: complete, now, market: "OPEN", newestUsable: true });
  assert.equal(r.source, "END_OF_DAY");
});

// ── Interrupted and partial sessions ────────────────────────────────────────
test("interrupted session: market OPEN but only yesterday's candles exist → NO_INTRADAY_CANDLES, not LIVE", () => {
  const now = at("2026-11-10T10:20:00+05:30");
  const yesterday = [c("2026-11-09T15:15:00+05:30")];
  const completed = completedIntradayCandles(yesterday, "15m", now);
  const r = classifyTechnicalSeries({ timeframe: "15m", completed, now, market: "OPEN", newestUsable: true });
  assert.equal(r.source, "UNAVAILABLE");
  assert.equal(r.reasonCode, "NO_INTRADAY_CANDLES");
});

test("pre-open with only yesterday's candles → PRE_OPEN, not LIVE", () => {
  const now = at("2026-11-10T09:05:00+05:30");
  const completed = completedIntradayCandles([c("2026-11-09T15:15:00+05:30")], "15m", now);
  const r = classifyTechnicalSeries({ timeframe: "15m", completed, now, market: "PRE-OPEN", newestUsable: true });
  assert.equal(r.reasonCode, "PRE_OPEN");
});

test("partial session (only 3 of 25 candles of the day) is NOT made LIVE by invention: freshness rule decides, count is not padded", () => {
  const now = at("2026-11-10T10:50:00+05:30");
  const partial = [c(ist("09:15")), c(ist("09:30")), c(ist("09:45"))];
  const completed = completedIntradayCandles(partial, "15m", now);
  assert.equal(completed.length, 3);
  const r = classifyTechnicalSeries({ timeframe: "15m", completed, now, market: "OPEN", newestUsable: true });
  // Newest completed close is 10:00 (candle 09:45); 50 min old → STALE. The partial series is never reported LIVE.
  assert.equal(r.source, "STALE");
});

test("no completed candles at all → NO_CANDLES, never a fabricated value", () => {
  const now = at("2026-11-10T10:05:00+05:30");
  const r = classifyTechnicalSeries({ timeframe: "15m", completed: [], now, market: "OPEN", newestUsable: true });
  assert.equal(r.source, "UNAVAILABLE");
  assert.equal(r.reasonCode, "NO_CANDLES");
});

// ── Malformed, missing and future-dated data ────────────────────────────────
test("missing final candle timestamp (malformed row) → DATA_QUALITY, blocks the cycle", () => {
  const shape = newestRowShape([[null, 1, 2, 3, 4]]);
  assert.equal(shape.wellFormed, false);
  assert.equal(newestCandleUsable(shape, at("2026-11-10T10:20:00+05:30")), false);
});

test("newest candle with a missing OHLC value is malformed, not padded with zero", () => {
  const shape = newestRowShape([["2026-11-10T10:00:00+05:30", 1, null, 3, 4]]);
  assert.equal(shape.wellFormed, false);
});

test("future-dated newest candle beyond the 5 s skew → unusable (DATA_QUALITY)", () => {
  const now = at("2026-11-10T10:00:00+05:30");
  const shape = newestRowShape([["2026-11-10T10:00:30+05:30", 1, 2, 3, 4]]);
  assert.equal(newestCandleUsable(shape, now), false);
});

test("newest candle 4 s ahead is inside the skew tolerance and is usable", () => {
  const now = at("2026-11-10T10:00:00+05:30");
  const shape = newestRowShape([["2026-11-10T10:00:04+05:30", 1, 2, 3, 4]]);
  assert.equal(newestCandleUsable(shape, now), true);
});

// ── UTC / IST boundaries ────────────────────────────────────────────────────
test("a candle at 18:45 UTC is on the NEXT IST day (00:15 IST), and is grouped by IST date", () => {
  assert.equal(istDay(Date.parse("2026-11-09T18:45:00Z")), "2026-11-10");
});

test("a candle at 18:20 UTC is still the previous IST day (23:50 IST)", () => {
  assert.equal(istDay(Date.parse("2026-11-09T18:20:00Z")), "2026-11-09");
});

// ── Insufficient data for indicators ────────────────────────────────────────
test("RSI with fewer than period+1 closes is null, not a guessed value", () => {
  assert.equal(rsi([100, 101, 102], 14), null);
});

test("EMA with fewer values than its period is all null", () => {
  assert.ok(ema([1, 2, 3], 9).every((v) => v === null));
});

test("MACD with insufficient history is null, not a partial reading", () => {
  assert.equal(macd(Array.from({ length: 10 }, (_, i) => 100 + i)), null);
});

// ── Nearest-expiry selection (synthetic contract lists) ─────────────────────
test("nearest expiry before the close is today's expiry (earliest valid date)", () => {
  const exps = ["2026-11-24", "2026-11-17", "2026-11-10", "2026-11-03"];
  assert.equal(validExpiries(exps, at("2026-11-10T09:30:00+05:30"))[0], "2026-11-10");
});

test("after the 15:30 close today's expiry is skipped, so the nearest is the next expiry", () => {
  const exps = ["2026-11-24", "2026-11-17", "2026-11-10"];
  assert.equal(validExpiries(exps, at("2026-11-10T15:31:00+05:30"))[0], "2026-11-17");
});

test("an impossible date in the list is never selected as nearest", () => {
  const exps = ["2026-13-40", "2026-11-17"];
  assert.equal(validExpiries(exps, at("2026-11-10T09:30:00+05:30"))[0], "2026-11-17");
});

test("with no valid future expiry the nearest is undefined, not an invented date", () => {
  assert.equal(validExpiries(["2026-11-03"], at("2026-11-10T09:30:00+05:30"))[0], undefined);
});
