// Issue 2 / B6 — the dashboard's source freshness follows the age of the data, not the age of the request.
// Offline: fixed clock, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sourceMeta, technicalMeta } from "./market.ts";
import type { SourceInfo } from "../types.ts";

const NOW = new Date("2026-10-05T07:00:00Z");
const ago = (sec: number) => new Date(NOW.getTime() - sec * 1000).toISOString();
const info = (over: Partial<SourceInfo>): SourceInfo => ({ source: "LIVE", provider: "UPSTOX", fetchedAt: ago(5), ...over });

test("FC-1. LIVE source whose trade time is 130 s old is STALE, even though it was fetched 5 s ago", () => {
  const m = sourceMeta(info({ lastTradeTime: ago(130), fetchedAt: ago(5) }), NOW);
  assert.equal(m.freshness, "STALE");
});

test("FC-2. LIVE source whose trade time is 5 s old stays LIVE even when the cached response was fetched 200 s ago", () => {
  const m = sourceMeta(info({ lastTradeTime: ago(5), fetchedAt: ago(200) }), NOW);
  assert.equal(m.freshness, "LIVE", "cache age is not data age");
});

test("FC-3. without a data timestamp, freshness falls back to fetch age (unchanged behaviour)", () => {
  assert.equal(sourceMeta(info({ fetchedAt: ago(5) }), NOW).freshness, "LIVE");
  assert.equal(sourceMeta(info({ fetchedAt: ago(60) }), NOW).freshness, "AGING");
});

test("FC-4. a non-LIVE source is never shown as LIVE or AGING (F2: END_OF_DAY is displayed as END_OF_DAY, not STALE)", () => {
  const m = sourceMeta(info({ source: "END_OF_DAY", lastTradeTime: ago(5) }), NOW);
  assert.equal(m.freshness, "END_OF_DAY");
  assert.notEqual(m.freshness, "LIVE");
  assert.notEqual(m.freshness, "AGING");
});

test("FC-5. technical freshness follows the candle classification and reports the candle age", () => {
  const m = technicalMeta(info({ lastTradeTime: ago(600), fetchedAt: ago(1) }), NOW);
  assert.equal(m.freshness, "LIVE");
  assert.equal(m.candleAgeSeconds, 600);
  assert.equal(m.lastCandleCloseAt, ago(600));
});

test("FC-6. technical STALE and END_OF_DAY labels are passed through unchanged", () => {
  assert.equal(technicalMeta(info({ source: "STALE", lastTradeTime: ago(2000) }), NOW).freshness, "STALE");
  assert.equal(technicalMeta(info({ source: "END_OF_DAY", lastTradeTime: ago(9000) }), NOW).freshness, "END_OF_DAY");
});

test("FC-7. technical UNAVAILABLE carries no freshness label", () => {
  assert.equal(technicalMeta(info({ source: "UNAVAILABLE", fetchedAt: null }), NOW).freshness, null);
});
