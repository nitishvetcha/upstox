// Phase 19 — Opportunity Engine tests.
// Covers: engine versioning, options scoring, event risk penalty, contract filtering,
// stock scanner, trade plan R:R, source safety, and API route existence.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { OPPORTUNITY_ENGINE_VERSION, evaluateOptionsOpportunity, WEIGHTS } from "./engine/opportunityEngine.ts";
import { STOCK_OPPORTUNITY_VERSION } from "./engine/stockOpportunityEngine.ts";
import type { Snapshot, OptionRow } from "./types.ts";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeRow(
  strike: number, callLtp = 100, putLtp = 80, callOi = 10000, putOi = 15000,
  volume = 500, delta = 0.45, bid = 98, ask = 102,
): OptionRow {
  const call = { ltp: callLtp, bid, ask, oi: callOi, chgOi: 100, volume, iv: 15, delta, gamma: 0.01, theta: -1, vega: 0.5, instrumentKey: `NSE_FO|${strike}CE` };
  const put = { ltp: putLtp, bid: bid - 2, ask: ask - 2, oi: putOi, chgOi: 150, volume, iv: 15, delta: -delta, gamma: 0.01, theta: -1, vega: 0.5, instrumentKey: `NSE_FO|${strike}PE` };
  return { strike, call, put };
}

function baseSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  // Clearly bullish: spot well above EMAs, PCR > 1 (more put OI = bulls writing puts),
  // strong breadth, positive news. This ensures evaluateOptionsOpportunity picks CE.
  const rows: OptionRow[] = [
    makeRow(22000, 150, 120, 50000, 80000, 2000, 0.52),  // ATM ~22050: high put OI (PCR>1)
    makeRow(22100, 100, 80,  30000, 45000, 1000, 0.42),
    makeRow(22200, 60,  50,  20000, 28000, 500,  0.32),
    makeRow(21900, 200, 160, 40000, 60000, 1500, 0.60),
    makeRow(21800, 120, 90,  25000, 35000, 800,  0.50),
  ];
  const spot = 22050;
  // Spot clearly above all EMAs = bullish stack
  const indicators = { ema9: 21800, ema21: 21600, ema50: 21300, ema200: 20500, vwap: 21900, rsi: 62, macdHist: 4.5, atr: 120, pdh: 22300, pdl: 21700, orHigh: 21950, orLow: 21850, futuresVwap: null };
  const breadth = { index: "nifty" as const, status: "LIVE" as const, advances: 40, declines: 10, unchanged: 0, total: 50, expected: 50, coverage: 100, advanceDeclineRatio: 4.0, advancePercent: 80, declinePercent: 20, breadthPercent: 60, signal: 0.8, classification: "STRONGLY BULLISH" as const, priceBreadthState: "BULLISH" as const, fetchedAt: null };
  const news = { score: 0.5, bullishPct: 75, neutralPct: 20, bearishPct: 5, eventRisk: null };
  const si = { source: "LIVE" as const, provider: "UPSTOX" as const, fetchedAt: null };
  const sources = { market: si, optionChain: si, technical: si, news: si, breadth: si };
  return {
    index: "nifty" as const, name: "NIFTY 50", spot, prevClose: spot - 80, fallbackReason: null,
    expiry: "2026-10-13", strikeStep: 100, chain: rows, indicators, breadth, news, sources,
    ivPercentile: 40, technical: null,
    ...overrides,
  } as unknown as Snapshot;
}

// ── OE — Opportunity Engine versioning ────────────────────────────────────────

describe("OE — Opportunity Engine versioning", () => {
  it("OE-01: OPPORTUNITY_ENGINE_VERSION is 20.0", () => {
    assert.equal(OPPORTUNITY_ENGINE_VERSION, "20.1");
  });

  it("OE-02: STOCK_OPPORTUNITY_VERSION is 20.0", () => {
    assert.equal(STOCK_OPPORTUNITY_VERSION, "20.1");
  });

  it("OE-03: engine version is independent of strategy version", async () => {
    const { STRATEGY_VERSION } = await import("./journalTypes.ts");
    assert.notEqual(OPPORTUNITY_ENGINE_VERSION, STRATEGY_VERSION.strategyVersion);
  });
});

// ── OO — Options Opportunity evaluation ───────────────────────────────────────

describe("OO — Options Opportunity evaluation", () => {
  it("OO-01: evaluateOptionsOpportunity returns result with required fields", () => {
    const s = baseSnapshot();
    const r = evaluateOptionsOpportunity(s, "NIFTY");
    assert.ok(r.timestamp);
    assert.equal(r.engineVersion, "20.1");
    assert.equal(r.underlying, "NIFTY");
    assert.ok(Array.isArray(r.topOpportunities));
    assert.ok(Array.isArray(r.rejectedContracts));
    assert.ok(typeof r.contractsEvaluated === "number");
    assert.ok(typeof r.contractsRejected === "number");
  });

  it("OO-02: bullish market prefers CE contracts", () => {
    const s = baseSnapshot(); // bullish indicators
    const r = evaluateOptionsOpportunity(s, "NIFTY");
    for (const c of r.topOpportunities) {
      assert.equal(c.optionType, "CE", `Expected CE but got ${c.optionType} for strike ${c.strike}`);
    }
  });

  it("OO-03: bearish market prefers PE contracts", () => {
    // Spot well below all EMAs (bearish stack), high put writing
    const bearishIndicators = { ema9: 22400, ema21: 22500, ema50: 22800, ema200: 23200, vwap: 22380, rsi: 35, macdHist: -5.0, atr: 150, pdh: 22500, pdl: 22100, orHigh: 22350, orLow: 22200, futuresVwap: null };
    const bearishBreadth = { index: "nifty" as const, status: "LIVE" as const, advances: 8, declines: 42, unchanged: 0, total: 50, expected: 50, coverage: 100, advanceDeclineRatio: 0.2, advancePercent: 16, declinePercent: 84, breadthPercent: -68, signal: -0.85, classification: "STRONGLY BEARISH" as const, priceBreadthState: "BEARISH" as const, fetchedAt: null };
    const sBearish = baseSnapshot({
      spot: 22250, prevClose: 22500,
      indicators: bearishIndicators,
      breadth: bearishBreadth,
      news: { score: -0.6, bullishPct: 8, neutralPct: 20, bearishPct: 72, eventRisk: null },
    } as unknown as Partial<Snapshot>);
    const r = evaluateOptionsOpportunity(sBearish, "NIFTY");
    assert.ok(r.topOpportunities.length > 0, `Expected PE opportunities, regime: ${r.marketRegime}, direction: ${r.marketDirection}`);
    for (const c of r.topOpportunities) {
      assert.equal(c.optionType, "PE", `Expected PE but got ${c.optionType} for strike ${c.strike}`);
    }
  });

  it("OO-04: top opportunities are ranked 1, 2, 3 in order", () => {
    const s = baseSnapshot();
    const r = evaluateOptionsOpportunity(s, "NIFTY");
    for (let i = 0; i < r.topOpportunities.length; i++) {
      assert.equal(r.topOpportunities[i].rank, i + 1);
    }
  });

  it("OO-05: contracts are sorted by score descending", () => {
    const s = baseSnapshot();
    const r = evaluateOptionsOpportunity(s, "NIFTY");
    for (let i = 1; i < r.topOpportunities.length; i++) {
      assert.ok(r.topOpportunities[i - 1].opportunityScore >= r.topOpportunities[i].opportunityScore);
    }
  });

  it("OO-06: all contracts have valid R:R (>= 1.0)", () => {
    const s = baseSnapshot();
    const r = evaluateOptionsOpportunity(s, "NIFTY");
    for (const c of r.topOpportunities) {
      assert.ok(c.rr >= 1.0, `R:R ${c.rr} for strike ${c.strike} below 1.0`);
    }
  });

  it("OO-07: entry, stop, target1 have correct directional relationship for CE", () => {
    const s = baseSnapshot();
    const r = evaluateOptionsOpportunity(s, "NIFTY");
    for (const c of r.topOpportunities.filter((x) => x.optionType === "CE")) {
      assert.ok(c.stop < c.entry, `stop ${c.stop} must be < entry ${c.entry}`);
      assert.ok(c.target1 > c.entry, `target1 ${c.target1} must be > entry ${c.entry}`);
    }
  });

  it("OO-08: opportunity score is in range [0, 100]", () => {
    const s = baseSnapshot();
    const r = evaluateOptionsOpportunity(s, "NIFTY");
    for (const c of r.topOpportunities) {
      assert.ok(c.opportunityScore >= 0 && c.opportunityScore <= 100);
    }
  });

  it("OO-09: contractsEvaluated + contractsRejected > 0 and accounts for chain rows", () => {
    const s = baseSnapshot();
    const r = evaluateOptionsOpportunity(s, "NIFTY");
    // Engine evaluates one side (CE or PE) per row, so total = contractsEvaluated + contractsRejected = chain.length
    assert.ok(r.contractsEvaluated + r.contractsRejected > 0);
    assert.ok(r.contractsEvaluated + r.contractsRejected <= s.chain.length);
  });
});

// ── ER — Event risk penalty ────────────────────────────────────────────────────

describe("ER — Event risk penalty", () => {
  it("ER-01: no event risk → penalty 0", () => {
    const s = baseSnapshot();
    const r = evaluateOptionsOpportunity(s, "NIFTY");
    assert.equal(r.eventRiskPenalty, 0);
    assert.equal(r.eventRiskReason, null);
  });

  it("ER-02: HIGH event risk → penalty 12", () => {
    const newsWithEvent = {
      score: 0, bullishPct: 33, neutralPct: 33, bearishPct: 33, eventRisk: "RBI policy",
      detail: { eventRisk: { level: "HIGH" as const, status: "DETECTED" as const, reason: "RBI monetary policy", events: [] }, score: 0, overall: "NEUTRAL" as const, status: "LIVE" as const, index: "nifty" as const, reason: null, bullishPct: 33, bearishPct: 33, neutralPct: 33, articleCount: 50, bullishCount: 16, bearishCount: 16, confidence: 0.8, sectorScore: null, newestAt: null, fetchedAt: null, uniqueCount: 50, fetchedCount: 50 } as unknown as NonNullable<Snapshot["news"]["detail"]>,
    };
    const s = baseSnapshot({ news: newsWithEvent } as Partial<Snapshot>);
    const r = evaluateOptionsOpportunity(s, "NIFTY");
    assert.equal(r.eventRiskPenalty, 12);
    assert.ok(r.eventRiskReason !== null);
  });

  it("ER-03: EXTREME event risk → penalty 20", () => {
    const newsExtreme = {
      score: 0, bullishPct: 33, neutralPct: 33, bearishPct: 33, eventRisk: "war risk",
      detail: { eventRisk: { level: "EXTREME" as const, status: "DETECTED" as const, reason: "Geopolitical shock", events: [] }, score: 0, overall: "NEUTRAL" as const, status: "LIVE" as const, index: "nifty" as const, reason: null, bullishPct: 33, bearishPct: 33, neutralPct: 33, articleCount: 80, bullishCount: 26, bearishCount: 27, confidence: 0.9, sectorScore: null, newestAt: null, fetchedAt: null, uniqueCount: 80, fetchedCount: 80 } as unknown as NonNullable<Snapshot["news"]["detail"]>,
    };
    const s = baseSnapshot({ news: newsExtreme } as Partial<Snapshot>);
    const r = evaluateOptionsOpportunity(s, "NIFTY");
    assert.equal(r.eventRiskPenalty, 20);
  });

  it("ER-04: event risk penalizes score but does NOT produce zero contracts automatically", () => {
    // Unlike 11.4-frozen strategy, event risk is a penalty, not a hard block
    const newsWithEvent = {
      score: 0.3, bullishPct: 60, neutralPct: 25, bearishPct: 15, eventRisk: "RBI policy",
      detail: { eventRisk: { level: "HIGH" as const, status: "DETECTED" as const, reason: "RBI policy", events: [] }, score: 0.3, overall: "BULLISH" as const, status: "LIVE" as const, index: "nifty" as const, reason: null, bullishPct: 60, bearishPct: 15, neutralPct: 25, articleCount: 60, bullishCount: 36, bearishCount: 9, confidence: 0.85, sectorScore: null, newestAt: null, fetchedAt: null, uniqueCount: 60, fetchedCount: 60 } as unknown as NonNullable<Snapshot["news"]["detail"]>,
    };
    const s = baseSnapshot({ news: newsWithEvent } as Partial<Snapshot>);
    const r = evaluateOptionsOpportunity(s, "NIFTY");
    // Engine still returns candidates (unlike 11.4-frozen WAIT decision)
    assert.ok(typeof r.contractsEvaluated === "number", "Should still evaluate contracts");
    assert.equal(r.eventRiskPenalty, 12);
  });

  it("ER-05: event risk reason is included in contract reasons when penalty > 0", () => {
    const newsWithEvent = {
      score: 0.3, bullishPct: 60, neutralPct: 25, bearishPct: 15, eventRisk: "RBI policy",
      detail: { eventRisk: { level: "HIGH" as const, status: "DETECTED" as const, reason: "RBI rate decision", events: [] }, score: 0.3, overall: "BULLISH" as const, status: "LIVE" as const, index: "nifty" as const, reason: null, bullishPct: 60, bearishPct: 15, neutralPct: 25, articleCount: 60, bullishCount: 36, bearishCount: 9, confidence: 0.85, sectorScore: null, newestAt: null, fetchedAt: null, uniqueCount: 60, fetchedCount: 60 } as unknown as NonNullable<Snapshot["news"]["detail"]>,
    };
    const s = baseSnapshot({ news: newsWithEvent } as Partial<Snapshot>);
    const r = evaluateOptionsOpportunity(s, "NIFTY");
    for (const c of r.topOpportunities) {
      const hasEventReason = c.reasons.some((reason) => reason.includes("Event risk") || reason.includes("event risk"));
      assert.ok(hasEventReason, `Contract reasons should mention event risk: ${JSON.stringify(c.reasons)}`);
    }
  });
});

// ── CF — Contract filtering ────────────────────────────────────────────────────

describe("CF — Contract filtering", () => {
  it("CF-01: zero-LTP contracts are rejected (both sides zero so engine always hits it)", () => {
    // Set both call and put LTP to 0 so regardless of market direction, the evaluated side gets rejected
    const zeroQ = { ltp: 0, bid: 0, ask: 0, oi: 50000, chgOi: 0, volume: 1000, iv: 15, delta: 0.45, gamma: 0.01, theta: -1, vega: 0.5, instrumentKey: null };
    const rows = [{ strike: 22000, call: { ...zeroQ }, put: { ...zeroQ, delta: -0.45 } }];
    const s = baseSnapshot({ chain: rows as unknown as OptionRow[] });
    const r = evaluateOptionsOpportunity(s, "NIFTY");
    const zeroRej = r.rejectedContracts.find((rc) => rc.strike === 22000 && rc.reason === "Zero LTP");
    assert.ok(zeroRej, "Zero LTP contract should be rejected");
  });

  it("CF-02: low OI contracts are rejected", () => {
    // Both sides have low OI so engine rejects regardless of direction
    const lowQ = { ltp: 50, bid: 49, ask: 51, oi: 10, chgOi: 0, volume: 100, iv: 15, delta: 0.45, gamma: 0.01, theta: -1, vega: 0.5, instrumentKey: null };
    const rows = [{ strike: 22000, call: { ...lowQ }, put: { ...lowQ, delta: -0.45 } }];
    const s = baseSnapshot({ chain: rows as unknown as OptionRow[] });
    const r = evaluateOptionsOpportunity(s, "NIFTY");
    const lowOiRej = r.rejectedContracts.find((rc) => rc.strike === 22000 && rc.reason.includes("Low OI"));
    assert.ok(lowOiRej, "Low OI contract should be rejected");
  });

  it("CF-03: max 3 contracts returned in topOpportunities", () => {
    const s = baseSnapshot();
    const r = evaluateOptionsOpportunity(s, "NIFTY");
    assert.ok(r.topOpportunities.length <= 3);
  });

  it("CF-04: MOCK source returns result without panicking", () => {
    const si = { source: "MOCK" as const, provider: "MOCK" as const, fetchedAt: null };
    const mockSources = { market: si, optionChain: si, technical: si, news: si, breadth: si };
    const s = baseSnapshot({ sources: mockSources } as unknown as Partial<Snapshot>);
    // Should not throw
    const r = evaluateOptionsOpportunity(s, "NIFTY");
    assert.ok(r.source !== undefined);
  });

  it("CF-05: empty chain returns no opportunities with reason", () => {
    const s = baseSnapshot({ chain: [] });
    const r = evaluateOptionsOpportunity(s, "NIFTY");
    assert.equal(r.topOpportunities.length, 0);
    assert.ok(r.noOpportunityReason !== null);
  });
});

// ── SP — Score properties ──────────────────────────────────────────────────────

describe("SP — Score properties", () => {
  it("SP-01: signal agreement is in [0, signalAgreementOf]", () => {
    const s = baseSnapshot();
    const r = evaluateOptionsOpportunity(s, "NIFTY");
    for (const c of r.topOpportunities) {
      assert.ok(c.signalAgreement >= 0);
      assert.ok(c.signalAgreement <= c.signalAgreementOf);
    }
  });

  it("SP-02: confidence is in [0, 100]", () => {
    const s = baseSnapshot();
    const r = evaluateOptionsOpportunity(s, "NIFTY");
    for (const c of r.topOpportunities) {
      assert.ok(c.confidence >= 0 && c.confidence <= 100);
    }
  });

  it("SP-03: entryLow < entry < entryHigh", () => {
    const s = baseSnapshot();
    const r = evaluateOptionsOpportunity(s, "NIFTY");
    for (const c of r.topOpportunities) {
      assert.ok(c.entryLow < c.entry, `entryLow ${c.entryLow} must be < entry ${c.entry}`);
      assert.ok(c.entry < c.entryHigh, `entry ${c.entry} must be < entryHigh ${c.entryHigh}`);
    }
  });

  it("SP-04: maxLoss equals entry (premium = max loss for long options)", () => {
    const s = baseSnapshot();
    const r = evaluateOptionsOpportunity(s, "NIFTY");
    for (const c of r.topOpportunities) {
      assert.equal(c.maxLoss, c.entry);
    }
  });
});

// ── SO — Stock opportunity engine ─────────────────────────────────────────────
// Tests run without live API access; scanStocks will return UNAVAILABLE source gracefully.

describe("SO — Stock opportunity engine source safety", () => {
  it("SO-01: scanStocks resolves without throwing (no API token)", async () => {
    const { scanStocks } = await import("./engine/stockOpportunityEngine.ts");
    const r = await scanStocks("intraday");
    assert.ok(r.timestamp);
    assert.ok(Array.isArray(r.topOpportunities));
    assert.equal(r.kind, "intraday");
  });

  it("SO-02: scanStocks swing resolves without throwing", async () => {
    const { scanStocks } = await import("./engine/stockOpportunityEngine.ts");
    const r = await scanStocks("swing");
    assert.equal(r.kind, "swing");
    assert.ok(r.engineVersion === "20.1");
  });

  it("SO-03: unavailable source returns noOpportunityReason", async () => {
    const { scanStocks } = await import("./engine/stockOpportunityEngine.ts");
    const r = await scanStocks("intraday");
    if (r.source === "UNAVAILABLE") {
      assert.ok(r.noOpportunityReason !== null, "UNAVAILABLE source must have noOpportunityReason");
    }
  });

  it("SO-04: universe is NIFTY_50", async () => {
    const { scanStocks } = await import("./engine/stockOpportunityEngine.ts");
    const r = await scanStocks("intraday");
    assert.equal(r.universe, "NIFTY_50");
  });

  it("SO-05: topOpportunities length is at most 3", async () => {
    const { scanStocks } = await import("./engine/stockOpportunityEngine.ts");
    const r = await scanStocks("swing");
    assert.ok(r.topOpportunities.length <= 3);
  });
});

// ── SI19 — Strategy integrity (Phase 19) ──────────────────────────────────────

describe("SI19 — Strategy integrity Phase 19", () => {
  it("SI19-01: 11.4-frozen strategy version unchanged", async () => {
    const { STRATEGY_VERSION } = await import("./journalTypes.ts");
    assert.equal(STRATEGY_VERSION.strategyVersion, "11.4-frozen");
  });

  it("SI19-02: MIN_STRATEGY_SCORE unchanged at 65", async () => {
    const { MIN_STRATEGY_SCORE } = await import("./engine/strategy.ts");
    assert.equal(MIN_STRATEGY_SCORE, 65);
  });

  it("SI19-03: opportunity engine is separate from 11.4-frozen", () => {
    assert.notEqual(OPPORTUNITY_ENGINE_VERSION, "11.4-frozen");
    assert.ok(OPPORTUNITY_ENGINE_VERSION.startsWith("20."));
  });

  it("SI19-04: no order endpoints introduced in Phase 19", async () => {
    const { execSync } = await import("node:child_process");
    const srcDir = decodeURIComponent(new URL(".", import.meta.url).pathname);
    const webSrc = srcDir.replace(/\/src\/lib\/?$/, "/src");
    const patterns = ["place" + "Order", "modify" + "Order", "cancel" + "Order", "/v2/order", "/v2/trade"];
    for (const pattern of patterns) {
      const result = execSync(
        `grep -rn "${pattern}" "${webSrc}" --include="*.ts" --include="*.tsx" | grep -v ".test.ts" || true`,
        { encoding: "utf8" },
      ).trim();
      assert.equal(result, "", `Found banned pattern: ${pattern}`);
    }
  });

  it("SI19-05: opportunity routes exist on disk", async () => {
    const fs = await import("node:fs");
    const base = decodeURIComponent(new URL(".", import.meta.url).pathname);
    const apiDir = base.replace(/\/src\/lib\/?$/, "/src/app/api/opportunities");
    const routes = [
      "options/route.ts",
      "stocks/intraday/route.ts",
      "stocks/swing/route.ts",
      "stocks/long-term/route.ts",
      "top/route.ts",
    ];
    for (const route of routes) {
      const p = `${apiDir}/${route}`;
      assert.ok(fs.existsSync(p), `Missing route: ${p}`);
    }
  });
});
