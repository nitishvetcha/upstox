// Network-gate setup: these tests stub fetch to exercise the live (upstox) code path. Without this the gate refuses.
process.env.MARKET_DATA_PROVIDER = "upstox";
// Issue 2 / B5 — technical candle freshness policy (completed candles, 17-minute limit, fail-closed, sessions).
// Offline and deterministic: every fetch is stubbed, the clock is injected, and each test clears the upstream cache.
// Cache TTLs run on the real clock, so the cache-hit tests make their two calls back-to-back in real time.
import { test } from "node:test";
import assert from "node:assert/strict";
import { clearUpstoxCache, upstoxProvider } from "./upstoxMarket.ts";
import {
  CANDLE_DELIVERY_GRACE_MS, classifyTechnicalSeries, completedIntradayCandles, maxCompletedCandleAgeMs, newestCandleUsable, newestRowShape,
} from "./candleFreshness.ts";
import type { Candle } from "../types.ts";

type Row = [string, number, number, number, number, number, number];
const TODAY = "2026-10-05"; // Monday, trading day
const px = (i: number) => 22000 + 60 * Math.sin(i / 7) + i * 0.4;
const row = (t: string, i: number): Row => [t, px(i), px(i) + 3, px(i) - 3, px(i + 1), 1000, 0];
const ist = (ymd: string, hm: string) => (hm.length === 5 ? `${ymd}T${hm}:00+05:30` : `${ymd}T${hm}+05:30`);
const at = (ymd: string, hm: string) => new Date(ist(ymd, hm));
const SESSION = Array.from({ length: 25 }, (_, k) => {
  const m = 9 * 60 + 15 + 15 * k;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
});
const barsTo = (ymd: string, last: string) => SESSION.slice(0, SESSION.indexOf(last) + 1).map((h, k) => row(ist(ymd, h), 300 + k));
const priorSession = (): Row[] => SESSION.map((h, k) => row(ist("2026-10-01", h), k));
const daily = (): Row[] => [row(ist("2026-10-01", "09:15"), 1), row(ist("2026-09-30", "09:15"), 2)];

function withStub<T>(state: { history: Row[]; intraday: Row[]; daily: Row[] }, run: () => Promise<T>): Promise<T> {
  const realFetch = globalThis.fetch;
  const realInfo = console.info;
  console.info = () => {};
  globalThis.fetch = (async (input: string | URL | Request) => {
    const path = new URL(String(input)).pathname;
    const pick = (rows: Row[]) => Response.json({ status: "success", data: { candles: [...rows].reverse() } });
    if (path.includes("/intraday/")) return pick(state.intraday);
    if (path.includes("/days/")) return pick(state.daily);
    if (path.includes("/minutes/15/")) return pick(state.history);
    return Response.json({ status: "success", data: {} });
  }) as typeof fetch;
  return run().finally(() => {
    globalThis.fetch = realFetch;
    console.info = realInfo;
    clearUpstoxCache();
  });
}
const techAt = (ymd: string, hm: string) => upstoxProvider("t", () => at(ymd, hm)).getTechnicals("nifty");
const seriesAt = (ymd: string, hm: string) => upstoxProvider("t", () => at(ymd, hm)).getCandles("nifty", "15m");

// ── Pure policy ───────────────────────────────────────────────────────────────
test("POL-1. the 15m limit is exactly 17 minutes (15 min interval + 2 min grace); other timeframes use their own interval", () => {
  assert.equal(CANDLE_DELIVERY_GRACE_MS, 120_000);
  assert.equal(maxCompletedCandleAgeMs("15m"), 17 * 60_000);
  assert.equal(maxCompletedCandleAgeMs("5m"), 7 * 60_000);
  assert.equal(maxCompletedCandleAgeMs("30m"), 32 * 60_000);
  assert.equal(maxCompletedCandleAgeMs("1h"), 62 * 60_000);
  assert.equal(maxCompletedCandleAgeMs("1d"), null, "daily candles are end-of-day, not aged");
});

test("POL-2. a candle is completed only when its interval has closed (start + interval <= now)", () => {
  const cs: Candle[] = [{ timestamp: ist(TODAY, "12:15"), open: 1, high: 2, low: 0, close: 1, volume: null }];
  assert.equal(completedIntradayCandles(cs, "15m", at(TODAY, "12:29:59")).length, 0, "one second before close: still forming");
  assert.equal(completedIntradayCandles(cs, "15m", at(TODAY, "12:30:00")).length, 1, "at close: completed");
});

test("POL-3. newest-row shape: malformed, missing timestamp and future beyond 5 s are not usable; 4 s ahead is", () => {
  const now = at(TODAY, "12:30:00");
  assert.equal(newestCandleUsable(newestRowShape([["garbage", 1, 2, 0, 1]]), now), false);
  assert.equal(newestCandleUsable(newestRowShape([[undefined, 1, 2, 0, 1]]), now), false);
  assert.equal(newestCandleUsable(newestRowShape([[ist(TODAY, "12:30:04"), 1, 2, 0, 1]]), now), true);
  assert.equal(newestCandleUsable(newestRowShape([[ist(TODAY, "12:30:06"), 1, 2, 0, 1]]), now), false);
  assert.equal(newestCandleUsable(newestRowShape([]), now), true, "empty is handled as NO_CANDLES, not as malformed");
});

// ── Boundary: 17 minutes after the newest completed candle's close ───────────
const SEVENTEEN_BOUNDARY_CANDLE = (): Candle[] => [{ timestamp: ist(TODAY, "12:00"), open: 1, high: 2, low: 0, close: 1, volume: null }];
test("B-1. candle closed exactly 17 min ago → LIVE (boundary inclusive)", () => {
  const c = classifyTechnicalSeries({ timeframe: "15m", completed: SEVENTEEN_BOUNDARY_CANDLE(), now: at(TODAY, "12:32:00"), market: "OPEN", newestUsable: true });
  assert.equal(c.source, "LIVE");
  assert.equal(c.ageMs, 17 * 60_000);
});
test("B-2. candle closed 17 min 1 s ago → STALE", () => {
  const c = classifyTechnicalSeries({ timeframe: "15m", completed: SEVENTEEN_BOUNDARY_CANDLE(), now: at(TODAY, "12:32:01"), market: "OPEN", newestUsable: true });
  assert.equal(c.source, "STALE");
  assert.equal(c.reasonCode, "STALE_CANDLE");
});

// ── Integrated scenarios through the real loader ──────────────────────────────
test("B-3. fresh completed candle during OPEN → LIVE; the forming candle is not used", async () => {
  clearUpstoxCache();
  await withStub({ history: priorSession(), intraday: barsTo(TODAY, "12:30"), daily: daily() }, async () => {
    const s = await seriesAt(TODAY, "12:30:20");
    assert.equal(s.source.source, "LIVE");
    assert.equal(s.candles.at(-1)!.timestamp, ist(TODAY, "12:15"), "the 12:30 candle is still forming and must not be used");
    assert.equal(s.source.lastTradeTime, "2026-10-05T07:00:00.000Z", "lastTradeTime = close (12:30 IST) of the newest completed candle");
  });
});

test("B-4. stale completed candle during OPEN (bars stop 10:00) → STALE, not LIVE, with a reason", async () => {
  clearUpstoxCache();
  await withStub({ history: priorSession(), intraday: barsTo(TODAY, "10:00"), daily: daily() }, async () => {
    const t = await techAt(TODAY, "12:30:20");
    assert.equal(t.source.source, "STALE");
    assert.equal(t.reasonCode, "STALE_CANDLE");
    assert.match(t.unavailableReason ?? "", /closed 135 min ago/);
  });
});

test("B-5. future-dated newest candle → UNAVAILABLE (DATA_QUALITY): the cycle is blocked", async () => {
  clearUpstoxCache();
  await withStub({ history: priorSession(), intraday: [...barsTo(TODAY, "12:15"), row(ist(TODAY, "13:30"), 999)], daily: daily() }, async () => {
    const t = await techAt(TODAY, "12:30:20");
    assert.equal(t.source.source, "UNAVAILABLE");
    assert.equal(t.reasonCode, "DATA_QUALITY");
    assert.equal(t.indicators, null);
  });
});

test("B-6. malformed newest candle → UNAVAILABLE (DATA_QUALITY); older valid bars are not used to continue", async () => {
  clearUpstoxCache();
  const malformed: Row = ["not-a-date", 1, 2, 0, 1, 1, 0];
  await withStub({ history: priorSession(), intraday: [...barsTo(TODAY, "12:15"), malformed], daily: daily() }, async () => {
    const t = await techAt(TODAY, "12:30:20");
    assert.equal(t.source.source, "UNAVAILABLE");
    assert.equal(t.reasonCode, "DATA_QUALITY");
    assert.match(t.unavailableReason ?? "", /malformed/);
  });
});

test("B-7. malformed newest candle with missing OHLC → UNAVAILABLE (DATA_QUALITY)", async () => {
  clearUpstoxCache();
  const badOhlc = [ist(TODAY, "12:15"), null, 2, 0, 1, 1, 0] as unknown as Row;
  await withStub({ history: priorSession(), intraday: [badOhlc], daily: daily() }, async () => {
    const t = await techAt(TODAY, "12:30:20");
    assert.equal(t.reasonCode, "DATA_QUALITY");
  });
});

test("B-8. empty series → UNAVAILABLE (NO_CANDLES), not a market-closed message", async () => {
  clearUpstoxCache();
  await withStub({ history: [], intraday: [], daily: [] }, async () => {
    const t = await techAt(TODAY, "12:30:20");
    assert.equal(t.source.source, "UNAVAILABLE");
    assert.equal(t.reasonCode, "NO_CANDLES");
    assert.doesNotMatch(t.unavailableReason ?? "", /MARKET CLOSED/);
  });
});

test("B-9. pre-open (09:05), only previous-session candles → UNAVAILABLE (PRE_OPEN); not END_OF_DAY, not LIVE", async () => {
  clearUpstoxCache();
  await withStub({ history: priorSession(), intraday: [], daily: daily() }, async () => {
    const t = await techAt(TODAY, "09:05");
    assert.equal(t.source.source, "UNAVAILABLE");
    assert.equal(t.reasonCode, "PRE_OPEN");
    assert.match(t.unavailableReason ?? "", /Pre-open/);
  });
});

test("B-10. opening window (09:20), only the forming first candle → NO_INTRADAY_CANDLES; previous session is not used for a TRADE", async () => {
  clearUpstoxCache();
  await withStub({ history: priorSession(), intraday: [row(ist(TODAY, "09:15"), 300)], daily: daily() }, async () => {
    const t = await techAt(TODAY, "09:20");
    assert.equal(t.source.source, "UNAVAILABLE");
    assert.equal(t.reasonCode, "NO_INTRADAY_CANDLES");
    assert.equal(t.analysis, null, "no indicators from the previous session");
  });
});

test("B-11. first completed candle at 09:31 → LIVE again (normal evaluation resumes)", async () => {
  clearUpstoxCache();
  await withStub({ history: priorSession(), intraday: [row(ist(TODAY, "09:15"), 300)], daily: daily() }, async () => {
    const s = await seriesAt(TODAY, "09:31");
    assert.equal(s.source.source, "LIVE");
    assert.equal(s.candles.at(-1)!.timestamp, ist(TODAY, "09:15"));
  });
});

test("B-12. closed market (16:51), today's bars → END_OF_DAY, never LIVE", async () => {
  clearUpstoxCache();
  await withStub({ history: priorSession(), intraday: barsTo(TODAY, "15:15"), daily: daily() }, async () => {
    const s = await seriesAt(TODAY, "16:51");
    assert.equal(s.source.source, "END_OF_DAY");
  });
});

test("B-13. weekend (Saturday 12:30), previous-session candles → END_OF_DAY, never LIVE", async () => {
  clearUpstoxCache();
  await withStub({ history: priorSession(), intraday: [], daily: daily() }, async () => {
    const s = await seriesAt("2026-10-03", "12:30");
    assert.equal(s.source.source, "END_OF_DAY");
  });
});

test("B-14. holiday (Friday 2026-10-02, NSE holiday), previous-session candles → END_OF_DAY, never LIVE", async () => {
  clearUpstoxCache();
  await withStub({ history: priorSession(), intraday: [], daily: daily() }, async () => {
    const s = await seriesAt("2026-10-02", "12:30");
    assert.equal(s.source.source, "END_OF_DAY");
  });
});

test("B-15. intraday cache hit is re-judged at request time: the same payload is LIVE at 12:30 and STALE at 12:50", async () => {
  clearUpstoxCache();
  await withStub({ history: priorSession(), intraday: barsTo(TODAY, "12:15"), daily: daily() }, async () => {
    const early = await seriesAt(TODAY, "12:30:20");
    const late = await seriesAt(TODAY, "12:50:00"); // same process, inside the real 60 s TTL: served from cache
    assert.equal(early.source.source, "LIVE");
    assert.equal(late.source.source, "STALE", "cache age is not candle age: the 12:15 candle closed 35 min before 12:50");
    assert.equal(late.source.fetchedAt, early.source.fetchedAt, "the cached payload keeps its original fetch time");
  });
});

test("B-16. daily cache hit is END_OF_DAY and keeps the history fetch time", async () => {
  clearUpstoxCache();
  await withStub({ history: priorSession(), intraday: [], daily: daily() }, async () => {
    const first = await upstoxProvider("t", () => at(TODAY, "09:20")).getCandles("nifty", "1d");
    const later = await upstoxProvider("t", () => at(TODAY, "09:35")).getCandles("nifty", "1d");
    assert.equal(first.source.source, "END_OF_DAY");
    assert.equal(later.source.fetchedAt, first.source.fetchedAt);
  });
});

test("B-17. completed-only: the 15m series at 12:30:20 never contains a candle whose interval has not closed", async () => {
  clearUpstoxCache();
  await withStub({ history: priorSession(), intraday: barsTo(TODAY, "12:30"), daily: daily() }, async () => {
    const s = await seriesAt(TODAY, "12:30:20");
    const now = at(TODAY, "12:30:20").getTime();
    assert.ok(s.candles.every((c) => Date.parse(c.timestamp) + 15 * 60_000 <= now));
  });
});

test("B-6b. newest candle with a missing timestamp → UNAVAILABLE (DATA_QUALITY) through the real loader", async () => {
  clearUpstoxCache();
  const missingTs: Row = ["", 1, 2, 0, 1, 1, 0];
  await withStub({ history: priorSession(), intraday: [...barsTo(TODAY, "12:15"), missingTs], daily: daily() }, async () => {
    const t = await techAt(TODAY, "12:30:20");
    assert.equal(t.source.source, "UNAVAILABLE");
    assert.equal(t.reasonCode, "DATA_QUALITY");
  });
});
