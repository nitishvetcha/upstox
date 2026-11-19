// Network-gate setup: these tests stub fetch to exercise the live (upstox) code path. Without this the gate refuses.
process.env.MARKET_DATA_PROVIDER = "upstox";
// F2 regression: END_OF_DAY is displayed as END OF DAY (not STALE); LIVE, STALE, MOCK and UNAVAILABLE are unchanged.
// Fixtures only. No broker access. Freshness gates are not modified and are re-checked here.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { sourceMeta } from "./services/market.ts";
import { freshnessDisplayLabel } from "./freshnessLabel.ts";
import { mockSnapshot } from "./services/mock.ts";
import { analyze } from "./engine/strategy.ts";
import { buildRecommendationResponse } from "./recommendationEnricher.ts";
import { evaluateTradeRisk } from "./services/risk/riskService.ts";
import { DEFAULT_RISK_CONFIG } from "./services/risk/riskConfig.ts";
import type { Snapshot, SourceInfo, TradePlan } from "./types.ts";

const NOW = new Date("2026-10-05T07:00:00Z");
const NOW_ISO = NOW.toISOString();
const KEYS = ["market", "optionChain", "technical", "news", "breadth"] as const;
const LAST_TRADE = "2026-10-05T06:59:20.000Z";

const info = (source: SourceInfo["source"], over: Partial<SourceInfo> = {}): SourceInfo =>
  ({ source, provider: source === "MOCK" ? "MOCK" : "UPSTOX", fetchedAt: NOW_ISO, ...over }) as SourceInfo;

describe("sourceMeta freshness mapping (F2)", () => {
  test("FL-1 END_OF_DAY source is END_OF_DAY, not STALE", () => {
    assert.equal(sourceMeta(info("END_OF_DAY"), NOW).freshness, "END_OF_DAY");
  });

  test("FL-2 STALE source remains STALE", () => {
    assert.equal(sourceMeta(info("STALE"), NOW).freshness, "STALE");
  });

  test("FL-3 LIVE source with a current fetch remains LIVE", () => {
    assert.equal(sourceMeta(info("LIVE"), NOW).freshness, "LIVE");
  });

  test("FL-4 MOCK source keeps its existing non-LIVE mapping (STALE), so MOCK is never shown as LIVE", () => {
    const m = sourceMeta(info("MOCK"), NOW);
    assert.equal(m.freshness, "STALE");
    assert.notEqual(m.freshness, "LIVE");
  });

  test("FL-5 UNAVAILABLE with no fetch time keeps a null freshness (unchanged)", () => {
    assert.equal(sourceMeta(info("UNAVAILABLE", { fetchedAt: null }), NOW).freshness, null);
  });

  test("FL-6 the exchange last-trade time is returned as given, and never replaced by fetchedAt", () => {
    assert.equal(sourceMeta(info("END_OF_DAY", { lastTradeTime: LAST_TRADE }), NOW).lastTradeTime, LAST_TRADE);
    assert.equal(sourceMeta(info("END_OF_DAY"), NOW).lastTradeTime, null, "absent, not fabricated from fetchedAt");
  });
});

describe("freshness display labels (F2)", () => {
  test("FD-1 END_OF_DAY displays as END OF DAY", () => {
    assert.equal(freshnessDisplayLabel("END_OF_DAY"), "END OF DAY");
  });

  test("FD-2 the other labels are displayed exactly as before", () => {
    for (const v of ["LIVE", "AGING", "STALE", "MOCK", "UNAVAILABLE"]) assert.equal(freshnessDisplayLabel(v), v);
    assert.equal(freshnessDisplayLabel(null), "null", "null keeps its previous rendering");
  });
});

// Fixtures for the gates: END_OF_DAY data must still never become an executable recommendation.
function labelled(over: (s: Snapshot) => void = () => {}): Snapshot {
  const s = structuredClone(mockSnapshot("nifty", NOW));
  for (const k of KEYS) s.sources[k] = { ...s.sources[k], source: "LIVE", provider: "UPSTOX", fetchedAt: NOW_ISO };
  s.fallbackReason = null;
  s.lotSize = 75;
  over(s);
  return s;
}
const decide = (s: Snapshot) => buildRecommendationResponse(analyze(s, NOW, { accountCapital: 500_000 }, undefined), NOW);
const CFG = { ...DEFAULT_RISK_CONFIG, accountCapital: 500_000 };
function plan(over: Partial<TradePlan> = {}): TradePlan {
  return { strategy: "Long Call", legs: [], credit: false, entry: 10, entryZone: [9.9, 10.1], stop: 8, target1: 15, target2: 20, rr: 2.5, maxLoss: 10, maxProfit: null, breakevens: [], score: 70, rejected: null, ...over } as TradePlan;
}

describe("END_OF_DAY cannot become executable (gates unchanged)", () => {
  test("FG-1 END_OF_DAY market → recommendation is not TRADE, whatever the display label says", () => {
    const rec = decide(labelled((s) => { s.sources.market = { ...s.sources.market, source: "END_OF_DAY" }; }));
    assert.notEqual(rec.decision, "TRADE");
    assert.equal(rec.dataQuality.market, "END_OF_DAY");
  });

  test("FG-2 risk gate rejects END_OF_DAY market data with END_OF_DAY_DATA (not STALE_PRICE)", () => {
    const r = evaluateTradeRisk(plan(), labelled((s) => { s.sources.market = { ...s.sources.market, source: "END_OF_DAY" }; }), undefined, CFG, NOW);
    assert.ok(r.reasons.includes("END_OF_DAY_DATA"));
    assert.ok(!r.reasons.includes("STALE_PRICE"), "END_OF_DAY must not be classified as STALE_PRICE");
    assert.equal(r.allowed, false);
  });

  test("FG-3 journal timestamp fields keep their meaning (fetch time) under the display change", () => {
    const rec = decide(labelled((s) => { s.sources.market = { ...s.sources.market, lastTradeTime: LAST_TRADE }; }));
    assert.equal(rec.marketSnapshotTimestamp, NOW_ISO);
    assert.equal(rec.marketLastTradeTime, LAST_TRADE);
  });
});
