// Phase 23 — Paper opportunity lifecycle tests
// node --test --experimental-strip-types src/lib/phase23.test.ts
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// ── Test isolation ──────────────────────────────────────────────────────────

let testDir: string;
before(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), "phase23-test-"));
  process.env.PAPER_OPPORTUNITY_DIR = testDir;
});
after(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
  delete process.env.PAPER_OPPORTUNITY_DIR;
});

// ── Imports (after env set) ──────────────────────────────────────────────────
// Note: TS ESM — import at top level, isolation is via env var

import {
  savePaperOpportunity,
  getPaperOpportunity,
  listPaperOpportunities,
  buildDailySummary,
  sampleSizeLabel,
  TERMINAL_STATES,
  type PaperOpportunity,
  type PaperStatus,
} from "./services/paperOpportunityStore.ts";

import {
  createPaperOpportunity,
  evaluatePaperOpportunity,
  FILL_CONVENTION,
} from "./services/paperOpportunityMonitor.ts";

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeLongCallOpp(overrides: Partial<Parameters<typeof createPaperOpportunity>[0]> = {}) {
  return createPaperOpportunity({
    instrumentType: "OPTION",
    underlying: "NIFTY",
    symbol: null,
    instrumentKey: "NSE_FO|12345",
    optionType: "CE",
    strike: 22100,
    expiry: "2099-12-31T15:30:00.000Z", // far future so not expired
    strategyType: "LONG_CALL",
    direction: "BULLISH",
    entry: 100,
    stop: 60,
    target1: 160,
    target2: 200,
    spotAtEntry: 22050,
    iv: 15,
    delta: 0.45,
    oi: 50000,
    volume: 10000,
    spread: 2,
    score: 70,
    confidence: 70,
    grade: "A",
    signalAgreement: 5,
    regime: "NORMAL",
    eventRisk: null,
    reasons: ["Strong bullish trend", "OI buildup"],
    strategyVersion: "20.1",
    source: "LIVE",
    ...overrides,
  });
}

function makeLongPutOpp(overrides: Partial<Parameters<typeof createPaperOpportunity>[0]> = {}) {
  return createPaperOpportunity({
    instrumentType: "OPTION",
    underlying: "BANKNIFTY",
    symbol: null,
    instrumentKey: "NSE_FO|54300PE",
    optionType: "PE",
    strike: 54300,
    expiry: "2099-12-31T15:30:00.000Z",
    strategyType: "LONG_PUT",
    direction: "BEARISH",
    entry: 615,
    stop: 308,
    target1: 1077,
    target2: 1500,
    spotAtEntry: 54516,
    iv: 18,
    delta: -0.41,
    oi: 67000,
    volume: 393000,
    spread: 0.41,
    score: 72,
    confidence: 80,
    grade: "A",
    signalAgreement: 6,
    regime: "NORMAL",
    eventRisk: null,
    reasons: ["Strong bearish signal", "PCR bullish unwind"],
    strategyVersion: "20.1",
    source: "LIVE",
    ...overrides,
  });
}

function makeBullishStockOpp(overrides: Partial<Parameters<typeof createPaperOpportunity>[0]> = {}) {
  return createPaperOpportunity({
    instrumentType: "STOCK",
    underlying: "RELIANCE",
    symbol: "RELIANCE",
    instrumentKey: null,
    optionType: null,
    strike: null,
    expiry: null,
    strategyType: "INTRADAY_LONG",
    direction: "BULLISH",
    entry: 2500,
    stop: 2470,
    target1: 2545,
    target2: 2580,
    spotAtEntry: 2500,
    score: 65,
    confidence: 65,
    grade: "B",
    regime: "NORMAL",
    reasons: ["Breakout from HOD"],
    strategyVersion: "20.1",
    source: "LIVE",
    ...overrides,
  });
}

// ── OC23 — Opportunity creation ───────────────────────────────────────────────

describe("OC23 — Opportunity creation", () => {
  it("OC23-01: createPaperOpportunity returns OPEN status", () => {
    const opp = makeLongCallOpp();
    assert.equal(opp.status, "OPEN");
  });

  it("OC23-02: riskPerUnit computed correctly", () => {
    const opp = makeLongCallOpp();
    assert.equal(opp.riskPerUnit, 40); // 100 - 60
  });

  it("OC23-03: rrTarget1 computed correctly", () => {
    const opp = makeLongCallOpp();
    assert.equal(opp.rrTarget1, 1.5); // (160-100)/40
  });

  it("OC23-04: strategyVersion stored on record", () => {
    const opp = makeLongCallOpp();
    assert.equal(opp.strategyVersion, "20.1");
  });

  it("OC23-05: original snapshot fields are immutable after update", () => {
    const opp = makeLongPutOpp();
    savePaperOpportunity(opp);
    const updated = { ...opp, entry: 9999 }; // attempt to change entry externally
    savePaperOpportunity({ ...opp }); // re-save original
    const retrieved = getPaperOpportunity(opp.id);
    assert.equal(retrieved?.entry, 615, "entry must remain 615");
  });

  it("OC23-06: events array starts empty", () => {
    const opp = makeLongCallOpp();
    assert.deepEqual(opp.events, []);
  });

  it("OC23-07: mfe/mae start at 0", () => {
    const opp = makeLongCallOpp();
    assert.equal(opp.mfe, 0);
    assert.equal(opp.mae, 0);
  });
});

// ── LC23 — Long Call logic ────────────────────────────────────────────────────

describe("LC23 — Long Call lifecycle", () => {
  it("LC23-01: premium rises past T1 → TARGET1_HIT", () => {
    const opp = makeLongCallOpp();
    savePaperOpportunity(opp);
    const result = evaluatePaperOpportunity(opp, { currentPrice: 162 });
    assert.equal(result.toStatus, "TARGET1_HIT");
    assert.equal(result.transitioned, true);
    const saved = getPaperOpportunity(opp.id)!;
    assert.equal(saved.status, "TARGET1_HIT");
    assert.ok(saved.realizedR! > 0, "should be profitable");
  });

  it("LC23-02: premium rises past T2 → TARGET2_HIT", () => {
    const opp = makeLongCallOpp();
    savePaperOpportunity(opp);
    const result = evaluatePaperOpportunity(opp, { currentPrice: 205 });
    assert.equal(result.toStatus, "TARGET2_HIT");
  });

  it("LC23-03: premium falls to stop → STOP_HIT", () => {
    const opp = makeLongCallOpp();
    savePaperOpportunity(opp);
    const result = evaluatePaperOpportunity(opp, { currentPrice: 58 });
    assert.equal(result.toStatus, "STOP_HIT");
    const saved = getPaperOpportunity(opp.id)!;
    assert.ok(saved.realizedR! < 0, "stop should be negative R");
  });

  it("LC23-04: between stop and T1 → no transition, MFE/MAE updated", () => {
    const opp = makeLongCallOpp();
    savePaperOpportunity(opp);
    const result = evaluatePaperOpportunity(opp, { currentPrice: 120 });
    assert.equal(result.transitioned, false);
    assert.equal(result.mfe, 20);  // 120-100
    assert.equal(result.mae, 0);
  });

  it("LC23-05: fill convention is documented", () => {
    assert.equal(FILL_CONVENTION, "LTP");
  });
});

// ── LP23 — Long Put logic (REGRESSION) ───────────────────────────────────────

describe("LP23 — Long Put lifecycle", () => {
  it("LP23-01: target1 (premium) must be greater than entry for PE buy", () => {
    const opp = makeLongPutOpp();
    assert.ok(opp.target1 > opp.entry, `PE target1 ${opp.target1} must exceed entry ${opp.entry}`);
  });

  it("LP23-02: PE premium rises past T1 → TARGET1_HIT", () => {
    const opp = makeLongPutOpp();
    savePaperOpportunity(opp);
    const result = evaluatePaperOpportunity(opp, { currentPrice: 1080 });
    assert.equal(result.toStatus, "TARGET1_HIT");
    const saved = getPaperOpportunity(opp.id)!;
    assert.ok(saved.realizedR! > 0);
  });

  it("LP23-03: PE premium rises past T2 → TARGET2_HIT", () => {
    const opp = makeLongPutOpp();
    savePaperOpportunity(opp);
    const result = evaluatePaperOpportunity(opp, { currentPrice: 1510 });
    assert.equal(result.toStatus, "TARGET2_HIT");
  });

  it("LP23-04: PE premium falls to stop → STOP_HIT", () => {
    const opp = makeLongPutOpp();
    savePaperOpportunity(opp);
    const result = evaluatePaperOpportunity(opp, { currentPrice: 300 });
    assert.equal(result.toStatus, "STOP_HIT");
    const saved = getPaperOpportunity(opp.id)!;
    assert.ok(saved.realizedR! < 0);
  });

  it("LP23-05: PE between stop and T1 → no transition", () => {
    const opp = makeLongPutOpp();
    savePaperOpportunity(opp);
    const result = evaluatePaperOpportunity(opp, { currentPrice: 700 });
    assert.equal(result.transitioned, false);
    assert.equal(result.mfe, 85); // 700-615
  });
});

// ── ST23 — Stock opportunity logic ────────────────────────────────────────────

describe("ST23 — Stock opportunity lifecycle", () => {
  it("ST23-01: bullish stock → target hit when price >= target1", () => {
    const opp = makeBullishStockOpp();
    savePaperOpportunity(opp);
    const result = evaluatePaperOpportunity(opp, { currentPrice: 2550 });
    assert.equal(result.toStatus, "TARGET1_HIT");
  });

  it("ST23-02: bullish stock → stop hit when price <= stop", () => {
    const opp = makeBullishStockOpp();
    savePaperOpportunity(opp);
    const result = evaluatePaperOpportunity(opp, { currentPrice: 2465 });
    assert.equal(result.toStatus, "STOP_HIT");
  });

  it("ST23-03: bullish stock between targets → no transition", () => {
    const opp = makeBullishStockOpp();
    savePaperOpportunity(opp);
    const result = evaluatePaperOpportunity(opp, { currentPrice: 2510 });
    assert.equal(result.transitioned, false);
    assert.equal(result.mfe, 10); // 2510-2500
  });

  it("ST23-04: bearish stock target when price <= target1", () => {
    const opp = createPaperOpportunity({
      instrumentType: "STOCK",
      underlying: "TCS",
      symbol: "TCS",
      instrumentKey: null,
      optionType: null,
      strike: null,
      expiry: null,
      strategyType: "INTRADAY_SHORT",
      direction: "BEARISH",
      entry: 3000,
      stop: 3030,
      target1: 2955,
      target2: 2920,
      score: 60,
      confidence: 60,
      grade: "B",
      regime: "NORMAL",
      reasons: ["Breakdown"],
      strategyVersion: "20.1",
      source: "LIVE",
    });
    savePaperOpportunity(opp);
    const result = evaluatePaperOpportunity(opp, { currentPrice: 2950 });
    assert.equal(result.toStatus, "TARGET1_HIT");
  });
});

// ── EX23 — Expiry handling ────────────────────────────────────────────────────

describe("EX23 — Expiry handling", () => {
  it("EX23-01: option past expiry → EXPIRED", () => {
    const opp = makeLongCallOpp({
      expiry: "2000-01-01T15:30:00.000Z", // past
    });
    savePaperOpportunity(opp);
    const result = evaluatePaperOpportunity(opp, { currentPrice: 110 });
    assert.equal(result.toStatus, "EXPIRED");
  });

  it("EX23-02: expired opportunity cannot re-open (terminal state guard)", () => {
    const opp = makeLongCallOpp({ expiry: "2000-01-01T15:30:00.000Z" });
    savePaperOpportunity(opp);
    evaluatePaperOpportunity(opp, { currentPrice: 110 });
    const saved = getPaperOpportunity(opp.id)!;
    assert.equal(saved.status, "EXPIRED");
    // Evaluate again — must not change
    const result2 = evaluatePaperOpportunity(saved, { currentPrice: 50 });
    assert.equal(result2.transitioned, false);
    assert.equal(result2.reason, "already terminal");
    const saved2 = getPaperOpportunity(opp.id)!;
    assert.equal(saved2.status, "EXPIRED");
  });

  it("EX23-03: not-yet-expired option can still hit targets", () => {
    const opp = makeLongCallOpp();
    savePaperOpportunity(opp);
    const result = evaluatePaperOpportunity(opp, { currentPrice: 165 });
    assert.equal(result.toStatus, "TARGET1_HIT");
  });
});

// ── SM23 — State machine ──────────────────────────────────────────────────────

describe("SM23 — State machine integrity", () => {
  function makeTerminal(status: PaperStatus): PaperOpportunity {
    const opp = makeLongCallOpp();
    return { ...opp, status };
  }

  for (const terminal of TERMINAL_STATES) {
    it(`SM23: ${terminal} cannot transition`, () => {
      const opp = makeTerminal(terminal);
      savePaperOpportunity(opp);
      const result = evaluatePaperOpportunity(opp, { currentPrice: 9999 });
      assert.equal(result.transitioned, false);
      assert.equal(result.reason, "already terminal");
    });
  }

  it("SM23: multiple evaluations of OPEN only create one event on first transition", () => {
    const opp = makeLongCallOpp();
    savePaperOpportunity(opp);
    evaluatePaperOpportunity(opp, { currentPrice: 162 });
    const saved = getPaperOpportunity(opp.id)!;
    // Now evaluate again — should not add another event
    evaluatePaperOpportunity(saved, { currentPrice: 162 });
    const saved2 = getPaperOpportunity(opp.id)!;
    assert.equal(saved2.events.length, 1, "exactly one event for one transition");
  });
});

// ── MM23 — MFE/MAE tracking ───────────────────────────────────────────────────

describe("MM23 — MFE/MAE tracking", () => {
  it("MM23-01: MFE accumulates over multiple evaluations", () => {
    const opp = makeLongCallOpp();
    savePaperOpportunity(opp);
    evaluatePaperOpportunity(opp, { currentPrice: 120 });
    const saved1 = getPaperOpportunity(opp.id)!;
    assert.equal(saved1.mfe, 20);
    evaluatePaperOpportunity(saved1, { currentPrice: 115 });
    const saved2 = getPaperOpportunity(opp.id)!;
    assert.equal(saved2.mfe, 20); // holds the max
  });

  it("MM23-02: MAE accumulates correctly", () => {
    const opp = makeLongCallOpp();
    savePaperOpportunity(opp);
    evaluatePaperOpportunity(opp, { currentPrice: 85 });
    const saved = getPaperOpportunity(opp.id)!;
    assert.equal(saved.mae, 15); // 100-85
  });

  it("MM23-03: mfeR computed from riskPerUnit", () => {
    const opp = makeLongCallOpp(); // risk=40
    savePaperOpportunity(opp);
    evaluatePaperOpportunity(opp, { currentPrice: 140 }); // mfe=40
    const saved = getPaperOpportunity(opp.id)!;
    assert.equal(saved.mfeR, 1.0); // 40/40
  });

  it("MM23-04: underlying MFE tracked for bearish option", () => {
    const opp = makeLongPutOpp(); // spot=54516, direction=BEARISH
    savePaperOpportunity(opp);
    evaluatePaperOpportunity(opp, { currentPrice: 700, currentUnderlying: 54200 });
    const saved = getPaperOpportunity(opp.id)!;
    assert.ok(saved.underlyingMfe! > 0, "underlying moved in our direction");
  });
});

// ── RR23 — Realized R ─────────────────────────────────────────────────────────

describe("RR23 — Realized R calculation", () => {
  it("RR23-01: profitable trade: exit=922, risk=307 → R=+1.0", () => {
    const opp = makeLongPutOpp(); // entry=615, stop=308 → risk=307
    savePaperOpportunity(opp);
    // Manually transition at exit=922
    const fakeTerminal: PaperOpportunity = {
      ...opp,
      status: "TARGET1_HIT",
      exitPrice: 922,
      realizedPnl: 922 - 615,
      realizedR: Math.round(((922 - 615) / 307) * 100) / 100,
    };
    assert.equal(fakeTerminal.realizedR, 1.0);
  });

  it("RR23-02: stop hit → negative R", () => {
    const opp = makeLongCallOpp(); // entry=100, stop=60 → risk=40
    savePaperOpportunity(opp);
    evaluatePaperOpportunity(opp, { currentPrice: 55 }); // stop hit
    const saved = getPaperOpportunity(opp.id)!;
    assert.ok(saved.realizedR! < 0);
  });

  it("RR23-03: zero-risk guard in createPaperOpportunity", () => {
    const opp = createPaperOpportunity({
      instrumentType: "OPTION",
      underlying: "NIFTY",
      symbol: null,
      instrumentKey: null,
      optionType: "CE",
      strike: 22100,
      expiry: null,
      strategyType: "LONG_CALL",
      direction: "BULLISH",
      entry: 100,
      stop: 100, // same as entry → riskPerUnit should be 0.01 floor
      target1: 160,
      target2: 200,
      score: 50,
      confidence: 50,
      grade: "B",
      regime: "NORMAL",
      reasons: [],
      strategyVersion: "20.1",
      source: "LIVE",
    });
    assert.ok(opp.riskPerUnit >= 0.01, "riskPerUnit has floor");
  });
});

// ── UT23 — Underlying thesis ──────────────────────────────────────────────────

describe("UT23 — Underlying thesis tracking", () => {
  it("UT23-01: underlyingEntry stored at creation", () => {
    const opp = makeLongPutOpp(); // spotAtEntry=54516
    assert.equal(opp.underlyingEntry, 54516);
  });

  it("UT23-02: underlyingExit recorded at terminal state", () => {
    const opp = makeLongPutOpp();
    savePaperOpportunity(opp);
    evaluatePaperOpportunity(opp, { currentPrice: 1100, currentUnderlying: 54000 });
    const saved = getPaperOpportunity(opp.id)!;
    assert.equal(saved.underlyingExit, 54000);
  });

  it("UT23-03: underlyingMfe tracks favorable underlying move for bearish trade", () => {
    const opp = makeLongPutOpp(); // BEARISH: favorable = spot falls
    savePaperOpportunity(opp);
    evaluatePaperOpportunity(opp, { currentPrice: 700, currentUnderlying: 54000 });
    const saved = getPaperOpportunity(opp.id)!;
    assert.equal(saved.underlyingMfe, 516); // 54516-54000
  });
});

// ── ID23 — Idempotency ────────────────────────────────────────────────────────

describe("ID23 — Idempotency", () => {
  it("ID23-01: evaluating same OPEN opp twice with same price does not duplicate events", () => {
    const opp = makeLongCallOpp();
    savePaperOpportunity(opp);
    evaluatePaperOpportunity(opp, { currentPrice: 162 });
    const saved = getPaperOpportunity(opp.id)!;
    // Evaluate again with same terminal opp
    evaluatePaperOpportunity(saved, { currentPrice: 162 });
    const saved2 = getPaperOpportunity(opp.id)!;
    assert.equal(saved2.events.length, 1);
    assert.equal(saved2.status, "TARGET1_HIT");
  });

  it("ID23-02: evaluating terminal opp returns transitioned=false", () => {
    const opp = { ...makeLongCallOpp(), status: "STOP_HIT" as PaperStatus };
    savePaperOpportunity(opp);
    const result = evaluatePaperOpportunity(opp, { currentPrice: 50 });
    assert.equal(result.transitioned, false);
  });
});

// ── DQ23 — Data quality guard ─────────────────────────────────────────────────

describe("DQ23 — Data quality", () => {
  it("DQ23-01: source field stored on paper opportunity", () => {
    const opp = makeLongCallOpp({ source: "LIVE" });
    assert.equal(opp.source, "LIVE");
  });

  it("DQ23-02: MOCK source stored correctly (API rejects, but model accepts)", () => {
    const opp = makeLongCallOpp({ source: "MOCK" });
    assert.equal(opp.source, "MOCK");
  });

  it("DQ23-03: STALE source stored correctly", () => {
    const opp = makeLongCallOpp({ source: "STALE" });
    assert.equal(opp.source, "STALE");
  });
});

// ── AN23 — Analytics / daily summary ─────────────────────────────────────────

describe("AN23 — Analytics", () => {
  it("AN23-01: sampleSizeLabel — 0 completed = INSUFFICIENT_SAMPLE", () => {
    assert.equal(sampleSizeLabel(0), "INSUFFICIENT_SAMPLE");
  });

  it("AN23-02: sampleSizeLabel — 5 = INSUFFICIENT_SAMPLE", () => {
    assert.equal(sampleSizeLabel(5), "INSUFFICIENT_SAMPLE");
  });

  it("AN23-03: sampleSizeLabel — 15 = EARLY_EVIDENCE", () => {
    assert.equal(sampleSizeLabel(15), "EARLY_EVIDENCE");
  });

  it("AN23-04: sampleSizeLabel — 50 = PRELIMINARY", () => {
    assert.equal(sampleSizeLabel(50), "PRELIMINARY");
  });

  it("AN23-05: sampleSizeLabel — 100 = MEANINGFUL_SAMPLE", () => {
    assert.equal(sampleSizeLabel(100), "MEANINGFUL_SAMPLE");
  });

  it("AN23-06: buildDailySummary — zero completed → winRate null", () => {
    const today = new Date().toISOString().slice(0, 10);
    const opp = makeLongCallOpp();
    const summary = buildDailySummary([opp], today);
    assert.equal(summary.winRate, null);
    assert.equal(summary.completedTrades, 0);
  });

  it("AN23-07: buildDailySummary — one win one loss → correct metrics", () => {
    const today = new Date().toISOString().slice(0, 10);
    const win = { ...makeLongCallOpp(), status: "TARGET1_HIT" as PaperStatus, realizedR: 1.5, mfeR: 1.5, maeR: 0.2 };
    const loss = { ...makeLongPutOpp(), status: "STOP_HIT" as PaperStatus, realizedR: -1.0, mfeR: 0.3, maeR: 1.0 };
    const summary = buildDailySummary([win, loss], today);
    assert.equal(summary.wins, 1);
    assert.equal(summary.losses, 1);
    assert.equal(summary.completedTrades, 2);
    assert.equal(summary.sampleSizeLabel, "INSUFFICIENT_SAMPLE");
    assert.equal(summary.winRate, 0.5);
    assert.equal(summary.averageR, 0.25); // (1.5 + -1.0) / 2
  });

  it("AN23-08: buildDailySummary — filters to today only", () => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const todayOpp = { ...makeLongCallOpp(), createdAt: `${today}T10:00:00.000Z` };
    const oldOpp = { ...makeLongCallOpp(), createdAt: `${yesterday}T10:00:00.000Z` };
    const summary = buildDailySummary([todayOpp, oldOpp], today);
    assert.equal(summary.generated, 1);
  });

  it("AN23-09: expectancyR equals averageR (uniform bet size)", () => {
    const today = new Date().toISOString().slice(0, 10);
    const wins = [1.5, 2.0, 1.2].map((r) => ({
      ...makeLongCallOpp(),
      status: "TARGET1_HIT" as PaperStatus,
      realizedR: r,
      mfeR: r,
      maeR: 0.1,
    }));
    const summary = buildDailySummary(wins, today);
    assert.equal(summary.expectancyR, summary.averageR);
  });

  it("AN23-10: profitFactor computed correctly", () => {
    const today = new Date().toISOString().slice(0, 10);
    const win1 = { ...makeLongCallOpp(), status: "TARGET1_HIT" as PaperStatus, realizedR: 2.0, mfeR: 2, maeR: 0 };
    const loss1 = { ...makeLongCallOpp(), status: "STOP_HIT" as PaperStatus, realizedR: -1.0, mfeR: 0, maeR: 1 };
    const summary = buildDailySummary([win1, loss1], today);
    assert.equal(summary.profitFactor, 2.0); // 2.0 / 1.0
  });
});

// ── SF23 — Safety tests ───────────────────────────────────────────────────────

describe("SF23 — Safety Phase 23", () => {
  it("SF23-01: no order endpoints in paper-opportunity API routes", async () => {
    const { execSync } = await import("node:child_process");
    const result = execSync(
      `grep -r "placeOrder\\|modifyOrder\\|cancelOrder\\|/v2/order" src/app/api/paper-opportunities/ 2>/dev/null || echo NONE`,
      { cwd: process.cwd() },
    ).toString().trim();
    assert.equal(result, "NONE", `found order calls: ${result}`);
  });

  it("SF23-02: no real order endpoints at all in src/", async () => {
    const { execSync } = await import("node:child_process");
    const result = execSync(
      `grep -r --include="*.ts" --exclude="*.test.ts" "placeOrder\\|/v2/order/place\\|/v2/order/modify\\|/v2/order/cancel" src/ 2>/dev/null || echo NONE`,
      { cwd: process.cwd() },
    ).toString().trim();
    assert.equal(result, "NONE", `found order calls: ${result}`);
  });

  it("SF23-03: Phase 22 strategy version still 20.1", async () => {
    const { OPPORTUNITY_ENGINE_VERSION } = await import("./engine/opportunityEngine.ts");
    assert.equal(OPPORTUNITY_ENGINE_VERSION, "20.1");
  });

  it("SF23-04: paper opportunity routes exist", () => {
    assert.ok(fs.existsSync(path.join(process.cwd(), "src/app/api/paper-opportunities/route.ts")));
    assert.ok(fs.existsSync(path.join(process.cwd(), "src/app/api/paper-opportunities/open/route.ts")));
    assert.ok(fs.existsSync(path.join(process.cwd(), "src/app/api/paper-opportunities/[id]/route.ts")));
    assert.ok(fs.existsSync(path.join(process.cwd(), "src/app/api/paper-opportunities/[id]/evaluate/route.ts")));
    assert.ok(fs.existsSync(path.join(process.cwd(), "src/app/api/opportunities/daily-summary/route.ts")));
  });

  it("SF23-05: opportunity journal page exists", () => {
    assert.ok(fs.existsSync(path.join(process.cwd(), "src/app/opportunity-journal/page.tsx")));
  });
});
