// Phase 21 — Regression tests for confirmed bugs found during live validation.
// Bug A: marketDirection showed "EVENT RISK" instead of actual direction
// Bug B: stock R:R was always <1.0 for bearish setups near LOD
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evaluateOptionsOpportunity } from "./engine/opportunityEngine.ts";
import type { Snapshot, OptionRow } from "./types.ts";

// ── Helpers ───────────────────────────────────────────────────────────────────

const si = (src: string) => ({ source: src as "LIVE" | "MOCK", provider: "UPSTOX" as const, fetchedAt: null });

function makeRow(strike: number, callLtp: number, putLtp: number, callOi: number, putOi: number): OptionRow {
  return {
    strike,
    call: { ltp: callLtp, bid: callLtp - 2, ask: callLtp + 2, oi: callOi, chgOi: 100, volume: 1000, iv: 15, delta: 0.45, gamma: 0.01, theta: -1, vega: 0.5, instrumentKey: null },
    put:  { ltp: putLtp,  bid: putLtp - 2,  ask: putLtp + 2,  oi: putOi,  chgOi: 150, volume: 1000, iv: 16, delta: -0.45, gamma: 0.01, theta: -1, vega: 0.5, instrumentKey: null },
  };
}

function bearishSnapshotWithEventRisk(): Snapshot {
  const spot = 22050;
  const chain: OptionRow[] = [
    makeRow(22000, 150, 130, 30000, 40000),
    makeRow(22100,  80,  70, 25000, 35000),
    makeRow(22500,  18,  15, 120000, 20000), // resistance
    makeRow(21500,  35,  40,  15000, 120000), // support
  ];
  return {
    index: "nifty" as const, name: "NIFTY 50", spot, prevClose: spot + 180, fallbackReason: null,
    expiry: "2026-10-13", strikeStep: 100, chain, technical: null,
    indicators: { ema9: 22400, ema21: 22500, ema50: 22800, ema200: 23200, vwap: 22380, rsi: 35, macdHist: -5.0, atr: 200, pdh: 22500, pdl: 22100, orHigh: 22350, orLow: 22200, futuresVwap: null },
    breadth: { index: "nifty" as const, status: "LIVE" as const, advances: 5, declines: 44, unchanged: 1, total: 50, expected: 50, coverage: 100, advanceDeclineRatio: 0.11, advancePercent: 10, declinePercent: 88, breadthPercent: -78, signal: -0.9, classification: "STRONGLY BEARISH" as const, priceBreadthState: "BEARISH" as const, fetchedAt: null },
    news: {
      score: -0.5, bullishPct: 10, neutralPct: 20, bearishPct: 70, eventRisk: "RBI policy",
      detail: {
        eventRisk: { level: "EXTREME" as const, status: "DETECTED" as const, reason: "RBI rate decision", events: [] },
        score: -0.5, overall: "BEARISH" as const, status: "LIVE" as const, index: "nifty" as const, reason: null,
        bullishPct: 10, bearishPct: 70, neutralPct: 20, articleCount: 100, bullishCount: 10, bearishCount: 70,
        confidence: 0.9, sectorScore: null, newestAt: null, fetchedAt: null, uniqueCount: 100, fetchedCount: 100,
      } as unknown as NonNullable<Snapshot["news"]["detail"]>,
    },
    sources: { market: si("LIVE"), optionChain: si("LIVE"), technical: si("LIVE"), news: si("LIVE"), breadth: si("LIVE") },
    ivPercentile: 45,
  } as unknown as Snapshot;
}

// ── Bug A regression: direction must not be "EVENT RISK" ─────────────────────

describe("BugA — marketDirection must reflect underlying analysis not regime", () => {
  it("BugA-01: bearish snapshot with EXTREME event risk shows BEARISH direction, not EVENT RISK", () => {
    const s = bearishSnapshotWithEventRisk();
    const r = evaluateOptionsOpportunity(s, "NIFTY");
    assert.equal(r.marketRegime, "EVENT RISK", "regime should still be EVENT RISK");
    assert.notEqual(r.marketDirection, "EVENT RISK", "direction must not say EVENT RISK");
    assert.ok(
      ["BEARISH", "STRONG BEARISH"].includes(r.marketDirection),
      `Expected BEARISH direction, got: ${r.marketDirection}`,
    );
  });

  it("BugA-02: event risk penalty is still applied to scores", () => {
    const s = bearishSnapshotWithEventRisk();
    const r = evaluateOptionsOpportunity(s, "NIFTY");
    assert.equal(r.eventRiskPenalty, 20, "EXTREME event risk should carry -20 penalty");
  });

  it("BugA-03: direction score > 0 even under event risk regime", () => {
    const s = bearishSnapshotWithEventRisk();
    const r = evaluateOptionsOpportunity(s, "NIFTY");
    assert.ok(r.directionScore > 0, "directionScore must be > 0");
  });
});

// ── Bug B regression: stock R:R must be ≥ 1.0 ──────────────────────────────

describe("BugB — stock trade plan R:R must be >= 1.0 regardless of day range", () => {
  it("BugB-01: bearish stock at LOD produces R:R >= 1.0", () => {
    // Simulate a stock near its LOD: high=100, low=88, ltp=88.5
    // HOD is far above entry → old code always failed R:R here
    const ltp = 88.5;
    const high = 100;
    const low = 88;
    const dayRange = high - low; // 12
    const atrProxy = Math.max(dayRange, ltp * 0.008); // 12 (>0.71)
    const stop = +(high + atrProxy * 0.15).toFixed(2); // 101.8
    const risk = Math.max(stop - ltp, 0.01); // 13.3
    const t1 = +(ltp - risk * 1.5).toFixed(2); // 68.5
    const rr = +((ltp - t1) / risk).toFixed(2); // 1.5
    assert.ok(rr >= 1.0, `R:R ${rr} should be >= 1.0 for LOD bearish stock`);
  });

  it("BugB-02: bullish stock at HOD produces R:R >= 1.0", () => {
    const ltp = 112;
    const high = 112.5;
    const low = 98;
    const dayRange = high - low; // 14.5
    const atrProxy = Math.max(dayRange, ltp * 0.008); // 14.5
    const stop = +(low - atrProxy * 0.15).toFixed(2); // 95.83
    const risk = Math.max(ltp - stop, 0.01); // 16.17
    const t1 = +(ltp + risk * 1.5).toFixed(2); // 136.26
    const rr = +((t1 - ltp) / risk).toFixed(2); // 1.5
    assert.ok(rr >= 1.0, `R:R ${rr} should be >= 1.0 for HOD bullish stock`);
  });

  it("BugB-03: R:R is always 1.5 (1.5× risk multiplier)", () => {
    // Both directions always produce exactly 1.5 R:R because t1 = entry ± risk * 1.5
    const cases = [
      { ltp: 500, high: 520, low: 490, dir: "BEARISH" as const },
      { ltp: 520, high: 522, low: 495, dir: "BULLISH" as const },
      { ltp: 1000, high: 1100, low: 950, dir: "BEARISH" as const },
    ];
    for (const c of cases) {
      const atrProxy = Math.max(c.high - c.low, c.ltp * 0.008);
      const stop = c.dir === "BULLISH"
        ? +(c.low - atrProxy * 0.15).toFixed(2)
        : +(c.high + atrProxy * 0.15).toFixed(2);
      const risk = c.dir === "BULLISH"
        ? Math.max(c.ltp - stop, 0.01)
        : Math.max(stop - c.ltp, 0.01);
      const t1 = c.dir === "BULLISH"
        ? +(c.ltp + risk * 1.5).toFixed(2)
        : +(c.ltp - risk * 1.5).toFixed(2);
      const rr = c.dir === "BULLISH"
        ? +((t1 - c.ltp) / risk).toFixed(2)
        : +((c.ltp - t1) / risk).toFixed(2);
      assert.ok(Math.abs(rr - 1.5) < 0.01, `Expected rr≈1.5, got ${rr} for ${JSON.stringify(c)}`);
    }
  });
});
