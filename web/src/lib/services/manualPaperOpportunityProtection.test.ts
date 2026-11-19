// Phase 2.3.9 — Manual Paper Opportunity Provenance Isolation & Analytics Protection Acceptance Tests
import { describe, it, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { POST } from "../../app/api/paper-opportunities/route.ts";
import {
  isFixture,
  savePaperOpportunity,
  getPaperOpportunity,
  listPaperOpportunities,
  LEGACY_FIXTURE_CUTOFF,
  type PaperOpportunity,
} from "./paperOpportunityStore.ts";
import { createPaperOpportunity } from "./paperOpportunityMonitor.ts";
import { buildMultiSessionSummary } from "./sessionEvidenceStore.ts";

// Operator authentication for the manual POST route (the route requires an operator since the defence-in-depth change).
const TEST_OPERATOR_TOKEN = "test-operator-token-manual-only-0123456789abcdef";
process.env.OPERATOR_TOKEN = TEST_OPERATOR_TOKEN;
const TEST_DIR = path.join(process.cwd(), ".test-data", "manual_opp_protection");

function makeManualInput(overrides: Record<string, unknown> = {}) {
  return {
    instrumentType: "OPTION",
    underlying: "NIFTY",
    optionType: "CE",
    strike: 22000,
    direction: "BULLISH",
    entry: 100,
    stop: 80,
    target1: 140,
    target2: 180,
    dataQuality: { market: "LIVE", optionChain: "LIVE" },
    ...overrides,
  };
}

describe("Phase 2.3.9 — Manual Paper Opportunity Provenance Isolation & Analytics Protection", () => {
  beforeEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DIR, { recursive: true });
    process.env.PAPER_OPPORTUNITY_DIR = TEST_DIR;
  });

  after(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    delete process.env.PAPER_OPPORTUNITY_DIR;
  });

  it("MO-01: Manual POST records receive MANUAL_UI provenance and persist with it", async () => {
    const req = new Request("http://localhost:3123/api/paper-opportunities", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${TEST_OPERATOR_TOKEN}` },
      body: JSON.stringify(makeManualInput()),
    });

    const res = await POST(req);
    assert.equal(res.status, 201, "Route must return HTTP 201 Created");
    const json = await res.json();

    assert.equal(json.record.provenance, "MANUAL_UI", "Returned record must have MANUAL_UI provenance");

    const saved = getPaperOpportunity(json.id);
    assert.ok(saved, "Record must be saved to store");
    assert.equal(saved?.provenance, "MANUAL_UI", "Persisted file must have MANUAL_UI provenance");
  });

  it("MO-02: isFixture() excludes MANUAL_UI records from live performance metrics", () => {
    const nowIso = new Date().toISOString();
    const manualRecord = createPaperOpportunity({
      instrumentType: "OPTION",
      underlying: "NIFTY",
      symbol: null,
      instrumentKey: "NSE_FO|MANUAL_TEST",
      optionType: "CE",
      strike: 22000,
      expiry: "2026-10-30",
      strategyType: "MANUAL",
      direction: "BULLISH",
      entry: 100,
      stop: 80,
      target1: 140,
      target2: 180,
      score: 75,
      confidence: 75,
      grade: "A",
      reasons: ["Manual test"],
      regime: "BULLISH",
      strategyVersion: "20.1",
      source: "LIVE",
      provenance: "MANUAL_UI",
    });

    savePaperOpportunity(manualRecord);

    // 1. isFixture must return true
    assert.equal(isFixture(manualRecord), true, "isFixture must return true for MANUAL_UI");

    // 2. buildMultiSessionSummary must exclude manual record from live performance metrics
    const summary = buildMultiSessionSummary([], listPaperOpportunities());
    assert.equal(summary.totalCreated, 0, "MANUAL_UI trade must not count in live multi-session totalCreated");
    assert.equal(summary.openTrades, 0, "MANUAL_UI trade must not count in live openTrades");
  });

  it("MO-03: Existing LIVE_COLLECTOR records retain their expected classification", () => {
    const liveCollectorRecord = createPaperOpportunity({
      instrumentType: "OPTION",
      underlying: "NIFTY",
      symbol: null,
      instrumentKey: "NSE_FO|LIVE_COLLECTOR_TEST",
      optionType: "CE",
      strike: 22000,
      expiry: "2026-10-30",
      strategyType: "LONG_CALL",
      direction: "BULLISH",
      entry: 100,
      stop: 80,
      target1: 140,
      target2: 180,
      score: 85,
      confidence: 80,
      grade: "A",
      reasons: ["Collector test"],
      regime: "BULLISH",
      strategyVersion: "20.1",
      source: "LIVE",
      provenance: "LIVE_COLLECTOR",
    });

    savePaperOpportunity(liveCollectorRecord);

    // 1. isFixture must return false
    assert.equal(isFixture(liveCollectorRecord), false, "isFixture must return false for LIVE_COLLECTOR");

    // 2. buildMultiSessionSummary must include LIVE_COLLECTOR in live metrics
    const summary = buildMultiSessionSummary([], listPaperOpportunities());
    assert.equal(summary.totalCreated, 1, "LIVE_COLLECTOR trade must be included in live totalCreated");
    assert.equal(summary.openTrades, 1, "LIVE_COLLECTOR trade must be included in live openTrades");
  });

  it("MO-04: Client-supplied dataQuality: LIVE cannot convert a manual record into verified-live evidence", async () => {
    const req = new Request("http://localhost:3123/api/paper-opportunities", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${TEST_OPERATOR_TOKEN}` },
      body: JSON.stringify(makeManualInput({
        dataQuality: {
          market: "LIVE",
          optionChain: "LIVE",
          technical: "LIVE",
          news: "LIVE",
          breadth: "LIVE",
        },
      })),
    });

    const res = await POST(req);
    assert.equal(res.status, 201);
    const json = await res.json();

    // Despite client asserting full LIVE dataQuality, provenance must remain MANUAL_UI
    assert.equal(json.record.provenance, "MANUAL_UI", "Provenance must remain MANUAL_UI despite client claims");
    assert.equal(isFixture(json.record), true, "isFixture must evaluate to true, blocking live inclusion");

    const summary = buildMultiSessionSummary([], listPaperOpportunities());
    assert.equal(summary.totalCreated, 0, "Record must not enter verified-live performance metrics");
  });

  it("MO-05: Manual records cannot enter the automated collector or paper-trading runner", () => {
    // 1. Create a manual record
    const manualOpp = createPaperOpportunity({
      instrumentType: "OPTION",
      underlying: "NIFTY",
      symbol: null,
      instrumentKey: "NSE_FO|MANUAL_FILTER_TEST",
      optionType: "CE",
      strike: 22000,
      expiry: "2026-10-30",
      strategyType: "MANUAL",
      direction: "BULLISH",
      entry: 100,
      stop: 80,
      target1: 140,
      target2: 180,
      score: 70,
      confidence: 70,
      grade: "A",
      reasons: ["Test"],
      regime: "BULLISH",
      strategyVersion: "20.1",
      source: "LIVE",
      provenance: "MANUAL_UI",
    });
    savePaperOpportunity(manualOpp);

    // 2. Paper-trade monitor runner partition logic:
    const allOpen = listPaperOpportunities().filter((o) => o.status === "OPEN");
    const fixtures = allOpen.filter(isFixture);
    const genuineOpps = allOpen.filter((o) => !isFixture(o));

    assert.equal(fixtures.length, 1, "Manual opportunity must be classified as fixture/skipped");
    assert.equal(fixtures[0].id, manualOpp.id);
    assert.equal(genuineOpps.length, 0, "Manual opportunity must NOT be classified as genuine live opportunity");
  });

  it("MO-06: Existing historical records remain unchanged in classification", () => {
    // Pre-cutoff legacy record (fixture)
    assert.equal(
      isFixture({ provenance: undefined, createdAt: "2026-10-10T00:00:00.000Z", source: "LIVE" }),
      true,
      "Pre-cutoff record must be classified as fixture",
    );

    // Post-cutoff non-LIVE record (fixture)
    assert.equal(
      isFixture({ provenance: undefined, createdAt: "2026-10-20T00:00:00.000Z", source: "MOCK" }),
      true,
      "Post-cutoff non-LIVE record must be classified as fixture",
    );

    // Post-cutoff LIVE legacy record without provenance (counted as genuine per legacy contract)
    assert.equal(
      isFixture({ provenance: undefined, createdAt: "2026-10-20T00:00:00.000Z", source: "LIVE" }),
      false,
      "Post-cutoff LIVE legacy record retains genuine classification",
    );

    // Explicit FIXTURE provenance
    assert.equal(
      isFixture({ provenance: "FIXTURE", createdAt: "2026-10-20T00:00:00.000Z", source: "LIVE" }),
      true,
      "Explicit FIXTURE provenance must evaluate as fixture",
    );
  });

  it("MO-07: Hypothetical manual entries are preserved as separate manual records without arbitrary rejections", async () => {
    // Create hypothetical manual trade with custom/incomplete metrics (e.g. wide spread, missing delta)
    const req = new Request("http://localhost:3123/api/paper-opportunities", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${TEST_OPERATOR_TOKEN}` },
      body: JSON.stringify(makeManualInput({
        delta: null, // hypothetical test trade without delta
        spreadPct: 15.0, // wide spread for hypothetical experiment
        grade: "C",
      })),
    });

    const res = await POST(req);
    assert.equal(res.status, 201, "Hypothetical manual entry must be accepted for sandbox tracking");
    const json = await res.json();

    assert.equal(json.record.provenance, "MANUAL_UI", "Record must be tagged MANUAL_UI");
    assert.equal(json.record.delta, null, "Delta must be preserved as submitted");
    assert.equal(json.record.spread, 15.0, "Spread must be preserved as submitted");

    // Strictly segregated from live evidence
    assert.equal(isFixture(json.record), true, "Hypothetical entry must be excluded from live evidence");
    const summary = buildMultiSessionSummary([], listPaperOpportunities());
    assert.equal(summary.totalCreated, 0, "Hypothetical entry must not appear in live evidence totals");
  });
});
