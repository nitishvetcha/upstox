import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildInstrumentSummaries,
  scoreBandAccuracy,
  type PaperOpportunity,
  type InstrumentSummary,
} from "./paperOpportunityStore.ts";

function makeOpp(overrides: Partial<PaperOpportunity>): PaperOpportunity {
  return {
    id: "test-1",
    createdAt: "2026-10-15T05:00:00.000Z",
    updatedAt: "2026-10-15T05:00:00.000Z",
    source: "LIVE",
    instrumentType: "OPTION",
    underlying: "NIFTY",
    symbol: null,
    instrumentKey: null,
    optionType: "CE",
    strike: 24000,
    expiry: "2026-10-30",
    strategyType: "LONG_CALL",
    direction: "BULLISH",
    entry: 100,
    stop: 80,
    target1: 130,
    target2: 150,
    riskPerUnit: 20,
    rewardToTarget1: 30,
    rewardToTarget2: 50,
    rrTarget1: 1.5,
    rrTarget2: 2.5,
    spotAtEntry: 24000,
    iv: 15,
    delta: 0.5,
    oi: 1000,
    volume: 500,
    spread: 0.5,
    atr: 100,
    score: 70,
    confidence: 0.7,
    grade: "B",
    signalAgreement: 2,
    regime: "TRENDING",
    eventRisk: null,
    reasons: ["signal"],
    reasonCodes: ["RSI"],
    strategyVersion: "11.4",
    status: "TARGET1_HIT",
    openedAt: "2026-10-15T05:30:00.000Z",
    openedPaperTradeId: "trade-1",
    closedAt: "2026-10-15T07:00:00.000Z",
    exitPrice: 130,
    exitReason: "TARGET1_HIT",
    realizedPnl: 30,
    realizedR: 1.5,
    mfe: 35,
    mae: 5,
    mfeR: 1.75,
    maeR: 0.25,
    underlyingEntry: 24000,
    underlyingExit: 24300,
    underlyingMfe: 24400,
    underlyingMae: 23900,
    durationSeconds: 5400,
    provenance: "LIVE_COLLECTOR",
    events: [],
    ...overrides,
  };
}

describe("buildInstrumentSummaries", () => {
  it("groups by instrument+underlying+optionType and computes stats", () => {
    const opps = [
      makeOpp({ id: "a", realizedR: 1.5, status: "TARGET1_HIT", exitReason: "TARGET1_HIT" }),
      makeOpp({ id: "b", realizedR: -1, status: "STOP_HIT", exitReason: "STOP_HIT" }),
      makeOpp({ id: "c", realizedR: 2, underlying: "BANKNIFTY", status: "TARGET2_HIT", exitReason: "TARGET2_HIT" }),
    ];
    const summaries = buildInstrumentSummaries(opps);
    assert.equal(summaries.length, 2);
    const nifty = summaries.find((s) => s.underlying === "NIFTY")!;
    assert.equal(nifty.completedTrades, 2);
    assert.equal(nifty.winRate, 0.5);
    assert.equal(nifty.sampleSizeLabel, "INSUFFICIENT_SAMPLE");
    assert.deepEqual(nifty.byExitReason, { TARGET1_HIT: 1, STOP_HIT: 1 });
  });

  it("excludes fixtures and EOD_UNPRICED trades", () => {
    const opps = [
      makeOpp({ id: "live", realizedR: 1, status: "TARGET1_HIT", provenance: "LIVE_COLLECTOR" }),
      makeOpp({ id: "fixture", realizedR: 1, status: "TARGET1_HIT", provenance: "FIXTURE" }),
      makeOpp({ id: "unpriced", status: "EOD_UNPRICED", realizedR: null }),
    ];
    const summaries = buildInstrumentSummaries(opps);
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].completedTrades, 1);
  });

  it("sorts by completedTrades descending", () => {
    const opps = [
      makeOpp({ id: "b1", underlying: "BANKNIFTY", realizedR: 1, status: "TARGET1_HIT" }),
      makeOpp({ id: "n1", underlying: "NIFTY", realizedR: 1, status: "TARGET1_HIT" }),
      makeOpp({ id: "n2", underlying: "NIFTY", realizedR: -1, status: "STOP_HIT" }),
    ];
    const summaries = buildInstrumentSummaries(opps);
    assert.equal(summaries[0].underlying, "NIFTY");
    assert.equal(summaries[1].underlying, "BANKNIFTY");
  });

  it("returns empty array when no completed live trades exist", () => {
    assert.deepEqual(buildInstrumentSummaries([]), []);
  });

  it("computes profitFactor null when no losses", () => {
    const opps = [makeOpp({ id: "win", realizedR: 2, status: "TARGET2_HIT" })];
    const [s] = buildInstrumentSummaries(opps);
    assert.equal(s.profitFactor, null);
    assert.equal(s.winRate, 1);
  });
});

describe("scoreBandAccuracy", () => {
  it("marks hasSufficientSample false when trade count < 10, true when >= 10", () => {
    const opps = [
      ...Array.from({ length: 4 }, (_, i) => makeOpp({ id: `a${i}`, score: 75, realizedR: 1.5, status: "TARGET1_HIT" })),
      ...Array.from({ length: 11 }, (_, i) => makeOpp({ id: `b${i}`, score: 65, realizedR: -1, status: "STOP_HIT" })),
    ];
    const bands = scoreBandAccuracy(opps);
    const band70_100 = bands.find((b) => b.band === "70–100")!;
    assert.equal(band70_100.total, 4);
    assert.equal(band70_100.hasSufficientSample, false);

    const band60_70 = bands.find((b) => b.band === "60–70")!;
    assert.equal(band60_70.total, 11);
    assert.equal(band60_70.hasSufficientSample, true);
    assert.equal(band60_70.wins, 0);
    assert.equal(band60_70.winRate, 0);
  });
});
