// Regression tests: paper-trade accounting must be immutable, single-close and arithmetically correct.
import { describe, it, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { createPaperOpportunity, evaluatePaperOpportunity } from "./services/paperOpportunityMonitor.ts";
import { savePaperOpportunity, getPaperOpportunity, listPaperOpportunities, isFixture } from "./services/paperOpportunityStore.ts";
import { buildMultiSessionSummary } from "./services/sessionEvidenceStore.ts";
import { runLiveOpportunityCollection } from "./services/liveOpportunityCollector.ts";

const DIR = path.join(process.cwd(), ".test-data", "paper_integrity");
const BEFORE = "2026-10-06T05:00:00.000Z";
const AFTER = "2026-10-20T05:00:00.000Z";

type In = Parameters<typeof createPaperOpportunity>[0];
function opp(o: Partial<In> = {}) {
  const p = createPaperOpportunity({
    instrumentType: "OPTION", underlying: "NIFTY", symbol: null, instrumentKey: `NSE_FO|${Math.random()}`, optionType: "CE",
    strike: 24000, expiry: "2026-10-15T15:30:00.000Z", strategyType: "TEST", direction: "BULLISH",
    entry: 100, stop: 80, target1: 130, target2: 160, spotAtEntry: 24000, score: 80, confidence: 70, grade: "A",
    reasons: [], regime: "BULLISH", strategyVersion: "test", source: "LIVE", ...o,
  } as In);
  savePaperOpportunity(p);
  return p;
}

describe("paper-trade integrity", () => {
  beforeEach(() => {
    fs.rmSync(DIR, { recursive: true, force: true });
    fs.mkdirSync(DIR, { recursive: true });
    process.env.PAPER_OPPORTUNITY_DIR = DIR;
  });
  after(() => fs.rmSync(DIR, { recursive: true, force: true }));

  it("a stale OPEN copy cannot close an already-closed trade again", () => {
    const o = opp();
    evaluatePaperOpportunity(o, { currentPrice: 135, timestamp: BEFORE });
    const closed = getPaperOpportunity(o.id)!;
    // Same OPEN object reused, as a retrying monitor would: price now through the stop.
    const r = evaluatePaperOpportunity(o, { currentPrice: 60, timestamp: BEFORE });
    assert.equal(r.transitioned, false);
    const now = getPaperOpportunity(o.id)!;
    assert.deepEqual(now, closed, "terminal record unchanged byte-for-byte");
    assert.equal(now.events.length, 1);
    assert.equal(now.status, "TARGET1_HIT");
  });

  it("repeated monitor passes never double-count in the summary", () => {
    const o = opp();
    for (let i = 0; i < 5; i++) evaluatePaperOpportunity(o, { currentPrice: 135, timestamp: BEFORE });
    const s = buildMultiSessionSummary([], listPaperOpportunities());
    assert.equal(s.completedTrades, 1);
    assert.equal(s.wins, 1);
  });

  it("expiry is judged at the evaluation time, not the wall clock", () => {
    const a = opp();
    assert.equal(evaluatePaperOpportunity(a, { currentPrice: 101, timestamp: BEFORE }).toStatus, null);
    assert.equal(evaluatePaperOpportunity(a, { currentPrice: 101, timestamp: AFTER }).toStatus, "EXPIRED");
  });

  it("R uses original risk, actual exit, sign preserved (long, gap through stop, short stock)", () => {
    const long = opp({ entry: 100, stop: 80 });
    evaluatePaperOpportunity(long, { currentPrice: 60, timestamp: BEFORE }); // gapped 20 below the stop
    assert.equal(getPaperOpportunity(long.id)!.realizedR, -2);

    const short = opp({ instrumentType: "STOCK", optionType: null, strike: null, expiry: null, symbol: "X", direction: "BEARISH", entry: 100, stop: 105, target1: 90, target2: 80 });
    evaluatePaperOpportunity(short, { currentPrice: 90, timestamp: BEFORE });
    const s = getPaperOpportunity(short.id)!;
    assert.equal(s.status, "TARGET1_HIT");
    assert.equal(s.realizedR, 2);
  });

  it("a stop on the wrong side of entry is rejected at creation", () => {
    assert.throws(() => opp({ entry: 100, stop: 105 }), /Invalid paper trade/);
  });

  it("profit factor: empty and no-loss sets are null, never Infinity", () => {
    assert.equal(buildMultiSessionSummary([], []).profitFactor, null);
    evaluatePaperOpportunity(opp(), { currentPrice: 135, timestamp: BEFORE });
    const s = buildMultiSessionSummary([], listPaperOpportunities());
    assert.equal(s.profitFactor, null);
    assert.equal(s.wins, 1);
    assert.equal(s.losses, 0);
  });

  it("a profitable EXPIRED trade counts as a win, consistent with profit factor", () => {
    evaluatePaperOpportunity(opp(), { currentPrice: 110, timestamp: AFTER }); // +0.5R at expiry
    evaluatePaperOpportunity(opp(), { currentPrice: 75, timestamp: BEFORE }); // −1.25R stop
    const s = buildMultiSessionSummary([], listPaperOpportunities());
    assert.equal(s.wins, 1);
    assert.equal(s.losses, 1);
    assert.equal(s.profitFactor, 0.4); // 0.5 / 1.25
  });

  it("debug/fixture records never enter performance statistics", () => {
    assert.equal(isFixture({ provenance: undefined, createdAt: "2026-10-15T04:00:00.000Z", source: undefined } as never), true, "no provenance, no LIVE source");
    assert.equal(isFixture({ provenance: "LIVE_COLLECTOR", createdAt: "2026-10-15T04:00:00.000Z", source: "LIVE" } as never), false);
    const debug = { ...opp(), id: "test_eod_debug", provenance: undefined, source: undefined } as never;
    savePaperOpportunity(debug);
    evaluatePaperOpportunity(opp(), { currentPrice: 75, timestamp: BEFORE }); // genuine −1.25R
    const s = buildMultiSessionSummary([], listPaperOpportunities());
    assert.equal(s.totalCreated, 2, "two genuine (one open, one stopped); the debug record excluded");
    assert.equal(s.completedTrades, 1);
    assert.equal(s.wins, 0);
    assert.equal(s.losses, 1);
  });

  it("no new entries at or after 14:30 IST — MCX commodity session remains OPEN", async () => {
    const stocks = async () => ({ source: "UPSTOX", freshness: "LIVE", topOpportunities: [{ symbol: "X", freshness: "LIVE", direction: "BULLISH", entry: 100, stop: 95, target1: 110, target2: 120 }] }) as never;
    const none = async () => ({ spot: 1, topOpportunities: [], rejectedContracts: [], dataQuality: { market: "LIVE" } }) as never;
    const r = await runLiveOpportunityCollection(none, none, stocks, new Date("2026-10-06T09:00:00.000Z")); // 14:30 IST
    assert.equal(r.market, "OPEN");
  });
});
