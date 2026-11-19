// Network-gate setup: these tests stub fetch to exercise the live (upstox) code path. Without this the gate refuses.
process.env.MARKET_DATA_PROVIDER = "upstox";
// Issue 2 / B5 Group A — candle fetch-time attribution, cache-hit reporting, and impossible future bars.
// Offline and deterministic: every fetch is stubbed, the clock is injected, and each test clears the upstream cache.
// Cache TTLs use the real clock (cache.ts), so each test's two calls are made back-to-back in real time.
import { test } from "node:test";
import assert from "node:assert/strict";
import { clearUpstoxCache, upstoxProvider } from "./upstoxMarket.ts";

type Row = [string, number, number, number, number, number, number];
const TODAY = "2026-10-05"; // Monday, a trading day
const px = (i: number) => 22000 + 60 * Math.sin(i / 7) + i * 0.4;
const bar = (t: string, i: number): Row => [t, px(i), px(i) + 3, px(i) - 3, px(i + 1), 1000, 0];
const ist = (ymd: string, hm: string) => (hm.length === 5 ? `${ymd}T${hm}:00+05:30` : `${ymd}T${hm}+05:30`);
const SESSION = Array.from({ length: 25 }, (_, k) => {
  const m = 9 * 60 + 15 + 15 * k;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
});
const upto = (hm: string) => SESSION.slice(0, SESSION.indexOf(hm) + 1).map((h, k) => bar(ist(TODAY, h), 300 + k));
const priorSession = (): Row[] => SESSION.map((h, k) => bar(ist("2026-10-01", h), k));
const priorDaily = (): Row[] => [bar(ist("2026-10-01", "09:15"), 1), bar(ist("2026-09-30", "09:15"), 2)];

// Stub the three upstream candle endpoints. Responses are newest-first, as Upstox returns them.
function withStub<T>(state: { history: Row[]; intraday: Row[]; daily: Row[] }, run: (calls: string[]) => Promise<T>): Promise<T> {
  const realFetch = globalThis.fetch;
  const realInfo = console.info;
  console.info = () => {};
  const calls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const path = new URL(String(input)).pathname;
    const pick = (rows: Row[]) => Response.json({ status: "success", data: { candles: [...rows].reverse() } });
    if (path.includes("/intraday/")) { calls.push("intraday"); return pick(state.intraday); }
    if (path.includes("/days/")) { calls.push("daily"); return pick(state.daily); }
    if (path.includes("/minutes/15/")) { calls.push("history"); return pick(state.history); }
    return Response.json({ status: "success", data: {} });
  }) as typeof fetch;
  return run(calls).finally(() => {
    globalThis.fetch = realFetch;
    console.info = realInfo;
    clearUpstoxCache();
  });
}
const at = (ymd: string, hm: string) => new Date(hm.length === 5 ? `${ymd}T${hm}:00+05:30` : `${ymd}T${hm}+05:30`);

test("CA-1. 15m series reports the intraday fetch time, not the call time of the history", async () => {
  clearUpstoxCache();
  await withStub({ history: priorSession(), intraday: upto("12:15"), daily: priorDaily() }, async () => {
    const s = await upstoxProvider("t", () => at(TODAY, "12:30:20")).getCandles("nifty", "15m");
    assert.equal(s.source.fetchedAt, "2026-10-05T07:00:20.000Z");
    assert.equal(s.candles.at(-1)!.timestamp, ist(TODAY, "12:15"));
  });
});

test("CA-2. 1d series reports the history fetch time (was: the call time, on a cache hit)", async () => {
  clearUpstoxCache();
  await withStub({ history: priorSession(), intraday: [], daily: priorDaily() }, async (calls) => {
    const provider = upstoxProvider("t", () => at(TODAY, "09:20"));
    const first = await provider.getCandles("nifty", "1d");
    assert.equal(first.source.fetchedAt, "2026-10-05T03:50:00.000Z");

    // Same key, 15 minutes later, inside the daily TTL: served from cache, so no new upstream request.
    const later = await upstoxProvider("t", () => at(TODAY, "09:35")).getCandles("nifty", "1d");
    assert.equal(later.source.fetchedAt, "2026-10-05T03:50:00.000Z", "a cache hit reports when the data was fetched");
    assert.equal(calls.filter((c) => c === "daily").length, 1, "the second call must not refetch");
  });
});

test("CA-3. intraday cache hit keeps the original fetch time and does not refetch within the TTL", async () => {
  clearUpstoxCache();
  const state = { history: priorSession(), intraday: upto("12:15"), daily: priorDaily() };
  await withStub(state, async (calls) => {
    const first = await upstoxProvider("t", () => at(TODAY, "12:29:30")).getCandles("nifty", "15m");
    state.intraday = upto("12:30"); // upstream now has the 12:30 bar, but the 60 s TTL has not expired
    const second = await upstoxProvider("t", () => at(TODAY, "12:30:20")).getCandles("nifty", "15m");
    assert.equal(first.source.fetchedAt, "2026-10-05T06:59:30.000Z");
    assert.equal(second.source.fetchedAt, "2026-10-05T06:59:30.000Z", "cache hit reports the original intraday fetch time");
    assert.equal(second.candles.at(-1)!.timestamp, ist(TODAY, "12:15"), "cache hit returns the cached payload");
    assert.equal(calls.filter((c) => c === "intraday").length, 1);
  });
});

test("CA-4. 15m series with an empty intraday response reports the intraday fetch time (no history-based claim)", async () => {
  clearUpstoxCache();
  await withStub({ history: priorSession(), intraday: [], daily: priorDaily() }, async () => {
    const s = await upstoxProvider("t", () => at(TODAY, "12:30:20")).getCandles("nifty", "15m");
    assert.equal(s.source.fetchedAt, "2026-10-05T07:00:20.000Z", "the intraday request was made at 12:30:20, even though it returned nothing");
    assert.equal(s.candles.at(-1)!.timestamp, ist("2026-10-01", "15:15"), "history only: previous session's last bar");
  });
});

test("CA-5. a bar starting more than 5 s after now is dropped (future-dated)", async () => {
  clearUpstoxCache();
  await withStub({ history: priorSession(), intraday: [...upto("12:15"), bar(ist(TODAY, "13:30"), 999)], daily: priorDaily() }, async () => {
    const s = await upstoxProvider("t", () => at(TODAY, "12:30:20")).getCandles("nifty", "15m");
    assert.equal(s.candles.at(-1)!.timestamp, ist(TODAY, "12:15"), "13:30 is one hour ahead of 12:30:20 and must not be kept");
  });
});

test("CA-6. a bar 4 s ahead of now passes the 5 s skew but is still forming, so it is not a completed candle", async () => {
  clearUpstoxCache();
  await withStub({ history: priorSession(), intraday: [...upto("12:15"), bar(ist(TODAY, "12:30:04"), 999)], daily: priorDaily() }, async () => {
    const s = await upstoxProvider("t", () => at(TODAY, "12:30:00")).getCandles("nifty", "15m");
    assert.equal(s.candles.at(-1)!.timestamp, ist(TODAY, "12:15"), "the 12:30:04 candle is forming at 12:30:00");
    assert.equal(s.source.source, "LIVE");
  });
});

test("CA-7. a bar 6 s ahead of now is beyond the 5 s skew and is dropped", async () => {
  clearUpstoxCache();
  await withStub({ history: priorSession(), intraday: [...upto("12:15"), bar(ist(TODAY, "12:30:06"), 999)], daily: priorDaily() }, async () => {
    const s = await upstoxProvider("t", () => at(TODAY, "12:30:00")).getCandles("nifty", "15m");
    assert.equal(s.candles.at(-1)!.timestamp, ist(TODAY, "12:15"));
  });
});

test("CA-8. a future-dated newest candle blocks the cycle (DATA_QUALITY), it is not silently skipped", async () => {
  clearUpstoxCache();
  await withStub({ history: priorSession(), intraday: [bar(ist(TODAY, "13:30"), 999)], daily: priorDaily() }, async () => {
    const s = await upstoxProvider("t", () => at(TODAY, "12:30:20")).getCandles("nifty", "15m");
    assert.equal(s.source.source, "UNAVAILABLE");
    assert.equal(s.reasonCode, "DATA_QUALITY");
  });
});

// Former pending items CA-P1..P3 are implemented in candleFreshnessPolicy.test.ts (B-3, B-4, B-6).
