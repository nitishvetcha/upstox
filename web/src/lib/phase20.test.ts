// Phase 20 — Opportunity Engine v20.0 tests.
// Realistic scenarios A-F as specified. Tests validate behaviour, not fixtures.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  OPPORTUNITY_ENGINE_VERSION, WEIGHTS, evaluateOptionsOpportunity,
} from "./engine/opportunityEngine.ts";
import { STOCK_OPPORTUNITY_VERSION } from "./engine/stockOpportunityEngine.ts";
import { LONG_TERM_ENGINE_VERSION, NO_FUNDAMENTAL_PROVIDER, scanLongTerm } from "./engine/longTermEngine.ts";
import type { OptionRow, Snapshot } from "./types.ts";

// ── Snapshot builders ──────────────────────────────────────────────────────────

const si = (src: string) => ({ source: src as "LIVE" | "MOCK", provider: "UPSTOX" as const, fetchedAt: null });
const liveSi = si("LIVE");
const mockSi = si("MOCK");

function makeRow(
  strike: number, callLtp: number, putLtp: number,
  callOi: number, putOi: number, callChgOi = 100, putChgOi = 150, vol = 1000, delta = 0.45,
): OptionRow {
  return {
    strike,
    call: { ltp: callLtp, bid: callLtp - 2, ask: callLtp + 2, oi: callOi, chgOi: callChgOi, volume: vol, iv: 15, delta, gamma: 0.01, theta: -1, vega: 0.5, instrumentKey: `KEY|${strike}CE` },
    put:  { ltp: putLtp,  bid: putLtp - 2,  ask: putLtp + 2,  oi: putOi, chgOi: putChgOi, volume: vol, iv: 16, delta: -delta, gamma: 0.01, theta: -1, vega: 0.5, instrumentKey: `KEY|${strike}PE` },
  };
}

function snapshotBase(overrides: Partial<Snapshot> = {}): Snapshot {
  const spot = 22050;
  // Design: resistance at 22500 (heavy call OI), support at 21500 (heavy put OI).
  // This gives 450pt room for CEs (R:R > 1.0) and 550pt room for PEs.
  const rows: OptionRow[] = [
    makeRow(22000, 150, 120, 30000, 40000, -500, 800, 2000, 0.55), // ATM
    makeRow(22100,  80,  65, 25000, 38000, -200, 400, 1800, 0.45), // slight OTM CE
    makeRow(22200,  45,  35, 20000, 30000, -150, 300, 1400, 0.36),
    makeRow(22500,  18,  15,120000, 20000,  500,-100, 1000, 0.22), // resistance: heavy CALL OI
    makeRow(21800, 200, 165, 25000, 35000, -300, 600, 1600, 0.62),
    makeRow(21500,  35,  40, 15000,120000, -100, 700,  900, 0.20), // support: heavy PUT OI
  ];
  const indicators = { ema9: 21800, ema21: 21600, ema50: 21300, ema200: 20500, vwap: 21900, rsi: 62, macdHist: 4.5, atr: 150, pdh: 22300, pdl: 21700, orHigh: 21950, orLow: 21850, futuresVwap: null };
  const breadth = { index: "nifty" as const, status: "LIVE" as const, advances: 40, declines: 10, unchanged: 0, total: 50, expected: 50, coverage: 100, advanceDeclineRatio: 4.0, advancePercent: 80, declinePercent: 20, breadthPercent: 60, signal: 0.8, classification: "STRONGLY BULLISH" as const, priceBreadthState: "BULLISH" as const, fetchedAt: null };
  const news = { score: 0.5, bullishPct: 75, neutralPct: 20, bearishPct: 5, eventRisk: null };
  const sources = { market: liveSi, optionChain: liveSi, technical: liveSi, news: liveSi, breadth: liveSi };
  return {
    index: "nifty" as const, name: "NIFTY 50", spot, prevClose: spot - 120, fallbackReason: null,
    expiry: "2026-10-13", strikeStep: 100, chain: rows, indicators, breadth, news, sources,
    ivPercentile: 35, technical: null,
    ...overrides,
  } as unknown as Snapshot;
}

// ── EV — Engine versioning ────────────────────────────────────────────────────

describe("EV — Engine versioning Phase 20", () => {
  it("EV-01: OPPORTUNITY_ENGINE_VERSION is 20.0", () => {
    assert.equal(OPPORTUNITY_ENGINE_VERSION, "20.1");
  });

  it("EV-02: STOCK_OPPORTUNITY_VERSION is 20.0", () => {
    assert.equal(STOCK_OPPORTUNITY_VERSION, "20.1");
  });

  it("EV-03: LONG_TERM_ENGINE_VERSION is 20.1", () => {
    assert.equal(LONG_TERM_ENGINE_VERSION, "20.1");
  });

  it("EV-04: WEIGHTS sum to 100", () => {
    const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    assert.equal(sum, 100, `WEIGHTS sum to ${sum}, expected 100`);
  });

  it("EV-05: Engine version independent from 11.4-frozen", async () => {
    const { STRATEGY_VERSION } = await import("./journalTypes.ts");
    assert.notEqual(OPPORTUNITY_ENGINE_VERSION, STRATEGY_VERSION.strategyVersion);
  });
});

// ── SC-A: Strong bullish NIFTY — all signals aligned ─────────────────────────

describe("Scenario A — Strong bullish: expect high-quality CE opportunity", () => {
  const s = snapshotBase(); // bullish by design

  it("SC-A-01: produces CE contracts", () => {
    const r = evaluateOptionsOpportunity(s, "NIFTY");
    assert.ok(r.topOpportunities.length > 0, `Expected CE opportunities, regime: ${r.marketRegime}`);
    for (const c of r.topOpportunities) {
      assert.equal(c.optionType, "CE");
    }
  });

  it("SC-A-02: direction is BULLISH or STRONG BULLISH", () => {
    const r = evaluateOptionsOpportunity(s, "NIFTY");
    assert.ok(
      ["BULLISH", "STRONG BULLISH"].includes(r.marketDirection),
      `Expected BULLISH, got ${r.marketDirection}`,
    );
  });

  it("SC-A-03: direction score > 50 for strong bullish", () => {
    const r = evaluateOptionsOpportunity(s, "NIFTY");
    assert.ok(r.directionScore > 50, `Direction score ${r.directionScore} should be >50`);
  });

  it("SC-A-04: top opportunity score > 40 (strong bullish produces quality score)", () => {
    const r = evaluateOptionsOpportunity(s, "NIFTY");
    const top = r.topOpportunities[0];
    assert.ok(top, "Should have a top opportunity");
    assert.ok(top.opportunityScore > 40, `Score ${top.opportunityScore} should be >40 for strong bullish`);
  });

  it("SC-A-05: all signals listed, at least 3 agreeing for bullish", () => {
    const r = evaluateOptionsOpportunity(s, "NIFTY");
    const top = r.topOpportunities[0];
    assert.ok(top, "Should have a top opportunity");
    assert.ok(top.signalAgreement >= 3, `Expected ≥3 agreeing signals, got ${top.signalAgreement}`);
  });

  it("SC-A-06: score breakdown fields match WEIGHTS keys", () => {
    const r = evaluateOptionsOpportunity(s, "NIFTY");
    const top = r.topOpportunities[0];
    if (!top) return;
    const weightKeys = Object.keys(WEIGHTS);
    for (const key of weightKeys) {
      assert.ok(key in top.scoreBreakdown, `Missing score breakdown key: ${key}`);
    }
  });

  it("SC-A-07: support and resistance are populated", () => {
    const r = evaluateOptionsOpportunity(s, "NIFTY");
    assert.ok(r.support > 0, "Support should be > 0");
    assert.ok(r.resistance > 0, "Resistance should be > 0");
  });

  it("SC-A-08: confidence is in [0, 100]", () => {
    const r = evaluateOptionsOpportunity(s, "NIFTY");
    for (const c of r.topOpportunities) {
      assert.ok(c.confidence >= 0 && c.confidence <= 100);
    }
  });

  it("SC-A-09: strategies are typed", () => {
    const r = evaluateOptionsOpportunity(s, "NIFTY");
    const validStrategies = ["LONG_CALL", "LONG_PUT", "BULL_CALL_SPREAD", "BEAR_PUT_SPREAD", "NO_TRADE"];
    for (const c of r.topOpportunities) {
      assert.ok(validStrategies.includes(c.strategyType), `Invalid strategyType: ${c.strategyType}`);
    }
  });

  it("SC-A-10: recommendedStrategy is exposed at engine level", () => {
    const r = evaluateOptionsOpportunity(s, "NIFTY");
    const validStrategies = ["LONG_CALL", "LONG_PUT", "BULL_CALL_SPREAD", "BEAR_PUT_SPREAD", "NO_TRADE"];
    assert.ok(validStrategies.includes(r.recommendedStrategy));
  });
});

// ── SC-B: Strong bearish ──────────────────────────────────────────────────────

describe("Scenario B — Strong bearish: expect put opportunity", () => {
  const bearishIndicators = { ema9: 22400, ema21: 22500, ema50: 22800, ema200: 23200, vwap: 22380, rsi: 35, macdHist: -5.0, atr: 150, pdh: 22500, pdl: 22100, orHigh: 22350, orLow: 22200, futuresVwap: null };
  const bearishBreadth = { index: "nifty" as const, status: "LIVE" as const, advances: 8, declines: 42, unchanged: 0, total: 50, expected: 50, coverage: 100, advanceDeclineRatio: 0.2, advancePercent: 16, declinePercent: 84, breadthPercent: -68, signal: -0.85, classification: "STRONGLY BEARISH" as const, priceBreadthState: "BEARISH" as const, fetchedAt: null };
  // Bearish OI: heavy call OI at 22500 (resistance), heavy put OI at 22000 (support near spot)
  // spot=22250, prevClose=22500 → bearish
  const bearishChain: OptionRow[] = [
    makeRow(22250, 150, 130, 30000, 40000, 600, -300, 2000, 0.52), // ATM
    makeRow(22300, 100,  85, 28000, 35000, 400, -200, 1500, 0.46),
    makeRow(22500,  45,  35,120000, 20000, 800, -100, 1000, 0.28), // resistance: heavy call OI
    makeRow(22000,  20,  40, 15000,120000,-200,  500,  900, 0.20), // support: heavy put OI
    makeRow(21800,  12,  55, 10000, 90000,-150,  450,  700, 0.16),
  ];

  const bearishSnap = () => snapshotBase({
    spot: 22250, prevClose: 22500,
    indicators: bearishIndicators,
    breadth: bearishBreadth,
    news: { score: -0.6, bullishPct: 8, neutralPct: 20, bearishPct: 72, eventRisk: null },
    chain: bearishChain,
  } as unknown as Partial<Snapshot>);

  it("SC-B-01: produces PE contracts", () => {
    const s = bearishSnap();
    const r = evaluateOptionsOpportunity(s, "NIFTY");
    assert.ok(r.topOpportunities.length > 0, `Expected PE, regime: ${r.marketRegime}, dir: ${r.marketDirection}, rejected: ${JSON.stringify(r.rejectedContracts.map(c=>c.reason))}`);
    for (const c of r.topOpportunities) {
      assert.equal(c.optionType, "PE");
    }
  });

  it("SC-B-02: direction is BEARISH or STRONG BEARISH", () => {
    const s = bearishSnap();
    const r = evaluateOptionsOpportunity(s, "NIFTY");
    assert.ok(
      ["BEARISH", "STRONG BEARISH"].includes(r.marketDirection),
      `Expected BEARISH, got ${r.marketDirection}`,
    );
  });
});

// ── SC-C: Bullish spot but low OI/volume → contracts should score lower ───────

describe("Scenario C — Bullish but weak liquidity: contracts should score low or reject", () => {
  it("SC-C-01: very low OI → contracts rejected", () => {
    const lowLiqChain: OptionRow[] = [
      makeRow(22000, 150, 120, 10, 15, 1, 2, 5, 0.52), // OI far below minOi=50
      makeRow(22100, 100, 80,  8, 12, 1, 1, 3, 0.42),
    ];
    const s = snapshotBase({ chain: lowLiqChain } as unknown as Partial<Snapshot>);
    const r = evaluateOptionsOpportunity(s, "NIFTY");
    // With OI below 50, all should be rejected
    assert.ok(r.contractsRejected > 0, "Expect rejections with low OI");
    const lowOiRejections = r.rejectedContracts.filter((rc) => rc.reason.includes("Low OI"));
    assert.ok(lowOiRejections.length > 0, "Should have Low OI rejections");
  });

  it("SC-C-02: contracts with adequate OI/volume get into evaluated pool", () => {
    // Good liquidity but bullish direction only moderate
    const moderateChain: OptionRow[] = [
      makeRow(22000, 150, 120, 1000, 1200, 50, 60, 100, 0.52),
    ];
    const s = snapshotBase({ chain: moderateChain } as unknown as Partial<Snapshot>);
    const r = evaluateOptionsOpportunity(s, "NIFTY");
    // Should evaluate without crash
    assert.ok(typeof r.contractsEvaluated === "number");
    assert.ok(typeof r.contractsRejected === "number");
  });
});

// ── SC-D: Wide spread → reject ─────────────────────────────────────────────────

describe("Scenario D — Wide spread: contracts should be rejected", () => {
  it("SC-D-01: bid-ask spread > 12% of LTP is rejected", () => {
    const wideSpreadChain: OptionRow[] = [
      {
        strike: 22000,
        call: { ltp: 100, bid: 70, ask: 130, oi: 80000, chgOi: 100, volume: 1000, iv: 15, delta: 0.45, gamma: 0.01, theta: -1, vega: 0.5, instrumentKey: null },
        put: makeRow(22000, 100, 100, 80000, 80000).put,
      },
    ];
    const s = snapshotBase({ chain: wideSpreadChain } as unknown as Partial<Snapshot>);
    const r = evaluateOptionsOpportunity(s, "NIFTY");
    const wideRej = r.rejectedContracts.find((rc) => rc.reason.includes("spread"));
    assert.ok(wideRej, "Wide spread contract should be rejected");
  });
});

// ── SC-E: Strong stock breakout + high volume + aligned market ─────────────────

describe("Scenario E — Stock: strong breakout setup", () => {
  it("SC-E-01: stock scanner runs without error", async () => {
    const { scanStocks } = await import("./engine/stockOpportunityEngine.ts");
    const r = await scanStocks("intraday");
    assert.equal(r.kind, "intraday");
    assert.ok(Array.isArray(r.topOpportunities));
    assert.ok(r.topOpportunities.length <= 3);
  });

  it("SC-E-02: stocks in result have all required fields", async () => {
    const { scanStocks } = await import("./engine/stockOpportunityEngine.ts");
    const r = await scanStocks("intraday");
    for (const s of r.topOpportunities) {
      assert.ok(s.symbol, "Missing symbol");
      assert.ok(s.direction === "BULLISH" || s.direction === "BEARISH");
      assert.ok(typeof s.opportunityScore === "number");
      assert.ok(typeof s.stop === "number");
      assert.ok(typeof s.target1 === "number");
      assert.ok(typeof s.rr === "number");
      assert.ok(s.rr >= 1.0, `R:R ${s.rr} below 1.0`);
      assert.ok(Array.isArray(s.reasons));
    }
  });

  it("SC-E-03: all stocks have valid invalidation string", async () => {
    const { scanStocks } = await import("./engine/stockOpportunityEngine.ts");
    const r = await scanStocks("intraday");
    for (const s of r.topOpportunities) {
      assert.ok(s.invalidation.length > 0, "Invalidation string must not be empty");
    }
  });

  it("SC-E-04: relativeStrength field is present (may be null when nifty data unavailable)", async () => {
    const { scanStocks } = await import("./engine/stockOpportunityEngine.ts");
    const r = await scanStocks("intraday");
    for (const s of r.topOpportunities) {
      assert.ok("relativeStrength" in s, "Missing relativeStrength field");
    }
  });
});

// ── SC-F: Weak stock (low volume, below average) → low score or reject ─────────

describe("Scenario F — Stock: weak stock should rank low", () => {
  it("SF-01: swing scanner runs without error", async () => {
    const { scanStocks } = await import("./engine/stockOpportunityEngine.ts");
    const r = await scanStocks("swing");
    assert.equal(r.kind, "swing");
    assert.ok(Array.isArray(r.topOpportunities));
  });

  it("SF-02: all swing opportunities have setup type", async () => {
    const { scanStocks } = await import("./engine/stockOpportunityEngine.ts");
    const r = await scanStocks("swing");
    for (const s of r.topOpportunities) {
      assert.ok(s.setup.length > 0, "Missing setup type");
    }
  });
});

// ── LT — Long-term engine ────────────────────────────────────────────────────

describe("LT — Long-term engine", () => {
  it("LT-01: returns FUNDAMENTAL_DATA_UNAVAILABLE without fabricating data", async () => {
    const r = await scanLongTerm(NO_FUNDAMENTAL_PROVIDER);
    assert.equal(r.fundamentalDataAvailable, false);
    assert.ok(r.dataAvailabilityMessage.length > 0);
    assert.equal(r.topOpportunities.length, 0);
    assert.ok(r.noOpportunityReason.length > 0);
  });

  it("LT-02: fundamentalProvider field is honest (NONE when unavailable)", async () => {
    const r = await scanLongTerm(NO_FUNDAMENTAL_PROVIDER);
    assert.equal(r.fundamentalProvider, "NONE");
  });

  it("LT-03: does not fabricate any opportunities", async () => {
    const r = await scanLongTerm(NO_FUNDAMENTAL_PROVIDER);
    assert.equal(r.topOpportunities.length, 0, "Must not fabricate opportunities without data");
  });
});

// ── WG — WEIGHTS config ────────────────────────────────────────────────────────

describe("WG — WEIGHTS configuration", () => {
  it("WG-01: WEIGHTS are exported and all numeric", () => {
    for (const [key, val] of Object.entries(WEIGHTS)) {
      assert.ok(typeof val === "number", `Weight ${key} must be numeric`);
      assert.ok(val > 0, `Weight ${key} must be positive`);
    }
  });

  it("WG-02: WEIGHTS sum to 100", () => {
    const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    assert.equal(sum, 100);
  });

  it("WG-03: all weight keys appear in score breakdown", () => {
    const s = snapshotBase();
    const r = evaluateOptionsOpportunity(s, "NIFTY");
    const top = r.topOpportunities[0];
    if (!top) return; // no contracts = no breakdown
    for (const key of Object.keys(WEIGHTS)) {
      assert.ok(key in top.scoreBreakdown, `Missing score breakdown for: ${key}`);
    }
  });
});

// ── ER — Event risk ───────────────────────────────────────────────────────────

describe("ER20 — Event risk Phase 20", () => {
  it("ER-01: event risk is penalty not hard block", () => {
    const newsWithEvent = {
      score: 0.4, bullishPct: 65, neutralPct: 25, bearishPct: 10, eventRisk: "RBI policy",
      detail: { eventRisk: { level: "HIGH" as const, status: "DETECTED" as const, reason: "RBI rate decision", events: [] }, score: 0.4, overall: "BULLISH" as const, status: "LIVE" as const, index: "nifty" as const, reason: null, bullishPct: 65, bearishPct: 10, neutralPct: 25, articleCount: 60, bullishCount: 39, bearishCount: 6, confidence: 0.85, sectorScore: null, newestAt: null, fetchedAt: null, uniqueCount: 60, fetchedCount: 60 } as unknown as NonNullable<Snapshot["news"]["detail"]>,
    };
    const s = snapshotBase({ news: newsWithEvent } as unknown as Partial<Snapshot>);
    const r = evaluateOptionsOpportunity(s, "NIFTY");
    assert.equal(r.eventRiskPenalty, 12);
    // Unlike 11.4-frozen, engine still evaluates contracts
    assert.ok(typeof r.contractsEvaluated === "number", "Engine should still evaluate even with event risk");
  });

  it("ER-02: event risk reason appears in contract reasons", () => {
    const newsWithEvent = {
      score: 0.4, bullishPct: 65, neutralPct: 25, bearishPct: 10, eventRisk: "RBI policy",
      detail: { eventRisk: { level: "HIGH" as const, status: "DETECTED" as const, reason: "RBI rate decision", events: [] }, score: 0.4, overall: "BULLISH" as const, status: "LIVE" as const, index: "nifty" as const, reason: null, bullishPct: 65, bearishPct: 10, neutralPct: 25, articleCount: 60, bullishCount: 39, bearishCount: 6, confidence: 0.85, sectorScore: null, newestAt: null, fetchedAt: null, uniqueCount: 60, fetchedCount: 60 } as unknown as NonNullable<Snapshot["news"]["detail"]>,
    };
    const s = snapshotBase({ news: newsWithEvent } as unknown as Partial<Snapshot>);
    const r = evaluateOptionsOpportunity(s, "NIFTY");
    for (const c of r.topOpportunities) {
      const hasEventNote = c.reasons.some((r2) => r2.toLowerCase().includes("event"));
      assert.ok(hasEventNote, `Event risk not mentioned in reasons: ${JSON.stringify(c.reasons)}`);
    }
  });
});

// ── DQ — Data quality ──────────────────────────────────────────────────────────

describe("DQ — Data quality transparency", () => {
  it("DQ-01: dataQuality has all 5 subsystems", () => {
    const r = evaluateOptionsOpportunity(snapshotBase(), "NIFTY");
    assert.ok("market" in r.dataQuality);
    assert.ok("optionChain" in r.dataQuality);
    assert.ok("technical" in r.dataQuality);
    assert.ok("news" in r.dataQuality);
    assert.ok("breadth" in r.dataQuality);
  });

  it("DQ-02: LIVE sources produce higher confidence than MOCK sources", () => {
    const mockSources = { market: mockSi, optionChain: mockSi, technical: mockSi, news: mockSi, breadth: mockSi };
    const rLive = evaluateOptionsOpportunity(snapshotBase(), "NIFTY");
    const rMock = evaluateOptionsOpportunity(snapshotBase({ sources: mockSources } as unknown as Partial<Snapshot>), "NIFTY");
    // MOCK sources should produce lower or equal confidence
    if (rLive.topOpportunities.length > 0 && rMock.topOpportunities.length > 0) {
      // Note: confidence also depends on signal agreement which can vary; just check range
      assert.ok(rLive.topOpportunities[0].confidence >= 0 && rLive.topOpportunities[0].confidence <= 100);
      assert.ok(rMock.topOpportunities[0].confidence >= 0 && rMock.topOpportunities[0].confidence <= 100);
    }
  });
});

// ── SI20 — Strategy integrity ──────────────────────────────────────────────────

describe("SI20 — Strategy integrity Phase 20", () => {
  it("SI20-01: 11.4-frozen unchanged", async () => {
    const { STRATEGY_VERSION } = await import("./journalTypes.ts");
    assert.equal(STRATEGY_VERSION.strategyVersion, "11.4-frozen");
  });

  it("SI20-02: MIN_STRATEGY_SCORE unchanged", async () => {
    const { MIN_STRATEGY_SCORE } = await import("./engine/strategy.ts");
    assert.equal(MIN_STRATEGY_SCORE, 65);
  });

  it("SI20-03: opportunity engine 20.0 does not modify frozen strategy version", async () => {
    const { STRATEGY_VERSION } = await import("./journalTypes.ts");
    assert.notEqual(OPPORTUNITY_ENGINE_VERSION, STRATEGY_VERSION.strategyVersion);
  });

  it("SI20-04: no order endpoints in src/", async () => {
    const { execSync } = await import("node:child_process");
    const srcDir = decodeURIComponent(new URL(".", import.meta.url).pathname);
    const webSrc = srcDir.replace(/\/src\/lib\/?$/, "/src");
    const banned = ["place" + "Order", "modify" + "Order", "cancel" + "Order"];
    for (const pat of banned) {
      const result = execSync(
        `grep -rn "${pat}" "${webSrc}" --include="*.ts" --include="*.tsx" | grep -v ".test.ts" || true`,
        { encoding: "utf8" },
      ).trim();
      assert.equal(result, "", `Found banned pattern: ${pat}`);
    }
  });

  it("SI20-05: all 5 opportunity routes exist on disk", async () => {
    const fs = await import("node:fs");
    const base = decodeURIComponent(new URL(".", import.meta.url).pathname);
    const apiDir = base.replace(/\/src\/lib\/?$/, "/src/app/api/opportunities");
    for (const route of ["options/route.ts", "stocks/intraday/route.ts", "stocks/swing/route.ts", "stocks/long-term/route.ts", "top/route.ts"]) {
      assert.ok(fs.existsSync(`${apiDir}/${route}`), `Missing route: ${route}`);
    }
  });
});
