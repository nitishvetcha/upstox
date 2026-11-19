// Network-gate setup: these tests stub fetch to exercise the live (upstox) code path. Without this the gate refuses.
process.env.MARKET_DATA_PROVIDER = "upstox";
// Issue 2 / B6 — the frozen engine's 300 s technical fetch limit is applied upstream, so a LIVE label can never
// coexist with an engine block. Offline: stubbed upstream, injected clock, real classification and engine.
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyTechnicalSeries, TECHNICAL_FETCH_LIMIT_MS } from "./candleFreshness.ts";
import { clearUpstoxCache, upstoxProvider } from "./upstoxMarket.ts";
import { analyze } from "../engine/strategy.ts";
import { mockSnapshot } from "./mock.ts";
import { diagnose } from "../recommendationDiagnostic.ts";
import type { Candle, Snapshot } from "../types.ts";

const TODAY = "2026-10-05";
const ist = (hm: string) => (hm.length === 5 ? `${TODAY}T${hm}:00+05:30` : `${TODAY}T${hm}+05:30`);
const candle = (hm: string): Candle => ({ timestamp: ist(hm), open: 1, high: 2, low: 0, close: 1, volume: null });

test("FG-1. the frozen engine's limit is 300 s", () => {
  assert.equal(TECHNICAL_FETCH_LIMIT_MS, 300_000, "must match strategy.ts: 120 s × 2.5");
});

test("FG-2. classification: fetch age 299 s → LIVE; 301 s → STALE (STALE_FETCH); unknown age → not judged here", () => {
  const now = new Date(ist("12:30:20"));
  const completed = [candle("12:15")];
  assert.equal(classifyTechnicalSeries({ timeframe: "15m", completed, now, market: "OPEN", newestUsable: true, fetchAgeMs: 299_000 }).source, "LIVE");
  const stale = classifyTechnicalSeries({ timeframe: "15m", completed, now, market: "OPEN", newestUsable: true, fetchAgeMs: 301_000 });
  assert.equal(stale.source, "STALE");
  assert.equal(stale.reasonCode, "STALE_FETCH");
  assert.equal(classifyTechnicalSeries({ timeframe: "15m", completed, now, market: "OPEN", newestUsable: true, fetchAgeMs: null }).source, "LIVE");
});

test("FG-3. cache hit with an old fetch but recent candles is STALE through the real loader", async () => {
  clearUpstoxCache();
  const realFetch = globalThis.fetch;
  const realInfo = console.info;
  console.info = () => {};
  const rows = (hms: string[]) => hms.map((hm) => [ist(hm), 1, 2, 0, 1, 1, 0]);
  const history = Array.from({ length: 25 }, (_, k) => [`2026-10-01T${String(9 + Math.floor((15 + 15 * k) / 60)).padStart(2, "0")}:${String((15 + 15 * k) % 60).padStart(2, "0")}:00+05:30`, 1, 2, 0, 1, 1, 0]);
  globalThis.fetch = (async (input: string | URL | Request) => {
    const path = new URL(String(input)).pathname;
    const pick = (r: unknown[]) => Response.json({ status: "success", data: { candles: [...r].reverse() } });
    if (path.includes("/intraday/")) return pick(rows(["09:15", "09:30", "09:45", "10:00", "10:15", "10:30", "10:45", "11:00", "11:15", "11:30", "11:45", "12:00", "12:15"]));
    if (path.includes("/minutes/15/")) return pick(history);
    return Response.json({ status: "success", data: {} });
  }) as typeof fetch;
  try {
    const early = await upstoxProvider("t", () => new Date(ist("12:30:20"))).getTechnicals("nifty");
    assert.equal(early.source.source, "LIVE");
    // Same process, inside the 60 s real-time TTL: the cached payload was fetched 6 min 10 s earlier.
    const late = await upstoxProvider("t", () => new Date(ist("12:36:30"))).getTechnicals("nifty");
    assert.equal(late.source.source, "STALE", "fetch age 370 s exceeds the engine's 300 s limit");
    assert.equal(late.reasonCode, "STALE_FETCH");
    assert.equal(late.analysis !== null, true, "analysis is still computed for display; eligibility is handled by the engine");
  } finally {
    globalThis.fetch = realFetch;
    console.info = realInfo;
    clearUpstoxCache();
  }
});

test("FG-4. the engine and the diagnostic agree when the technical source is STALE: NO TRADE with the freshness reason", () => {
  const now = new Date(ist("12:30:20"));
  const s: Snapshot = structuredClone(mockSnapshot("nifty", now));
  for (const k of Object.keys(s.sources) as (keyof Snapshot["sources"])[]) s.sources[k] = { ...s.sources[k], source: "LIVE", provider: "UPSTOX" };
  s.fallbackReason = null;
  s.sources.technical = { source: "STALE", provider: "UPSTOX", fetchedAt: new Date(now.getTime() - 370_000).toISOString(), lastTradeTime: null };
  s.technicalReasonCode = "STALE_FETCH";
  s.technicalReason = "Technical data was fetched 370 s ago; the limit is 300 s.";
  const a = analyze(s, now, { accountCapital: 500_000 }, undefined);
  assert.notEqual(a.status, "TRADE");
  const d = diagnose(a, now);
  assert.notEqual(d.finalDecision, "TRADE");
  assert.ok(d.blockers.some((b) => b.code === "INSUFFICIENT_FRESHNESS" && b.source === "technical"));
  assert.equal(d.freshness.technicals, "STALE", "the diagnostic reports the same label the engine acts on");
});
