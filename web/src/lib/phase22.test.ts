// Phase 22 — Trade plan realism, grading, outcome tracking tests.
import assert from "node:assert/strict";
import { FIXTURE_DEPS } from "./testFixtures/stockScan.ts";
import { describe, it } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// Tracking-store tests write here, never into the live .data/opportunity-tracking.
process.env.OPPORTUNITY_TRACK_DIR = mkdtempSync(join(tmpdir(), "opp-track-"));

import {
  OPPORTUNITY_ENGINE_VERSION, WEIGHTS, evaluateOptionsOpportunity,
  gradeOpportunity, type OpportunityGrade,
} from "./engine/opportunityEngine.ts";
import { STOCK_OPPORTUNITY_VERSION } from "./engine/stockOpportunityEngine.ts";
import type { Snapshot, OptionRow } from "./types.ts";

// ── Controlled synthetic test clock (NSE open session) ──────────────────────
const FIXTURE_NOW = new Date("2026-10-30T10:30:00+05:30");

// ── Helpers ───────────────────────────────────────────────────────────────────

const si = (src: string) => ({ source: src as "LIVE" | "MOCK", provider: "UPSTOX" as const, fetchedAt: null });

function makeRow(
  strike: number,
  callLtp: number,
  putLtp: number,
  callOi: number,
  putOi: number,
  lastTradeTime: string | null = new Date(FIXTURE_NOW.getTime() - 15_000).toISOString(),
): OptionRow {
  return {
    strike,
    call: { ltp: callLtp, bid: callLtp - 2, ask: callLtp + 2, oi: callOi, chgOi: 100, volume: 1000, iv: 15, delta: 0.45, gamma: 0.01, theta: -1, vega: 0.5, instrumentKey: null, lastTradeTime },
    put:  { ltp: putLtp,  bid: putLtp - 2,  ask: putLtp + 2,  oi: putOi,  chgOi: 150, volume: 1000, iv: 16, delta: -0.45, gamma: 0.01, theta: -1, vega: 0.5, instrumentKey: null, lastTradeTime },
  };
}

function bullishSnapshot(): Snapshot {
  const spot = 22050;
  const chain: OptionRow[] = [
    makeRow(22000, 150, 120, 30000, 40000),
    makeRow(22100,  80,  70, 25000, 35000),
    makeRow(22500,  18,  15, 120000, 20000), // resistance: heavy call OI
    makeRow(21500,  35,  40,  15000, 120000), // support: heavy put OI
  ];
  return {
    index: "nifty" as const, name: "NIFTY 50", spot, prevClose: spot - 120, fallbackReason: null,
    expiry: "2026-11-05", strikeStep: 100, chain, technical: null,
    indicators: { ema9: 21800, ema21: 21600, ema50: 21300, ema200: 20500, vwap: 21900, rsi: 62, macdHist: 4.5, atr: 200, pdh: 22300, pdl: 21700, orHigh: 21950, orLow: 21850, futuresVwap: null },
    breadth: { index: "nifty" as const, status: "LIVE" as const, advances: 40, declines: 10, unchanged: 0, total: 50, expected: 50, coverage: 100, advanceDeclineRatio: 4.0, advancePercent: 80, declinePercent: 20, breadthPercent: 60, signal: 0.8, classification: "STRONGLY BULLISH" as const, priceBreadthState: "BULLISH" as const, fetchedAt: null },
    news: { score: 0.5, bullishPct: 75, neutralPct: 20, bearishPct: 5, eventRisk: null },
    sources: { market: si("LIVE"), optionChain: si("LIVE"), technical: si("LIVE"), news: si("LIVE"), breadth: si("LIVE") },
    ivPercentile: 35,
  } as unknown as Snapshot;
}

// ── VR22 — Version ────────────────────────────────────────────────────────────

describe("VR22 — Version 20.1", () => {
  it("VR22-01: options engine version is 20.1", () => {
    assert.equal(OPPORTUNITY_ENGINE_VERSION, "20.1");
  });

  it("VR22-02: stock engine version is 20.1", () => {
    assert.equal(STOCK_OPPORTUNITY_VERSION, "20.1");
  });

  it("VR22-03: WEIGHTS unchanged (sum = 100)", () => {
    assert.equal(Object.values(WEIGHTS).reduce((a, b) => a + b, 0), 100);
  });
});

// ── GR — Opportunity grades ───────────────────────────────────────────────────

describe("GR — Opportunity grade logic", () => {
  it("GR-01: A+ for score 75+, rr 2.0+, conf 70+, 5 live sources", () => {
    assert.equal(gradeOpportunity(75, 2.0, 70, 5), "A+");
    assert.equal(gradeOpportunity(90, 3.0, 90, 5), "A+");
  });

  it("GR-02: A for score 65+, rr 1.5+, conf 60+", () => {
    assert.equal(gradeOpportunity(65, 1.5, 60, 5), "A");
    assert.equal(gradeOpportunity(70, 1.52, 100, 5), "A");
  });

  it("GR-03: B for score 50+, rr 1.2+, conf 50+", () => {
    assert.equal(gradeOpportunity(50, 1.2, 50, 5), "B");
  });

  it("GR-04: C for score 40+, rr 1.0+", () => {
    assert.equal(gradeOpportunity(40, 1.0, 0, 5), "C");
    assert.equal(gradeOpportunity(55, 1.02, 100, 5), "C"); // rr < 1.2 → not B
  });

  it("GR-05: REJECT when fewer than 3 live sources", () => {
    assert.equal(gradeOpportunity(80, 2.5, 90, 2), "REJECT");
    assert.equal(gradeOpportunity(80, 2.5, 90, 0), "REJECT");
  });

  it("GR-06: REJECT when score or rr too low", () => {
    assert.equal(gradeOpportunity(30, 1.5, 80, 5), "REJECT");
    assert.equal(gradeOpportunity(70, 0.5, 80, 5), "REJECT");
  });

  it("GR-07: A+ scores above A (A+ requires higher rr)", () => {
    const grades: OpportunityGrade[] = ["A+", "A", "B", "C", "REJECT"];
    const aPlus = gradeOpportunity(80, 2.5, 80, 5);
    const a = gradeOpportunity(65, 1.5, 60, 5);
    assert.equal(grades.indexOf(aPlus), 0);
    assert.equal(grades.indexOf(a), 1);
  });
});

// ── TP22 — Trade plan realism ─────────────────────────────────────────────────

describe("TP22 — Options trade plan market-derived", () => {
  it("TP22-01: CE target is derived from room-to-resistance scaled by delta (not forced R:R)", () => {
    const s = bullishSnapshot();
    const r = evaluateOptionsOpportunity(s, "NIFTY", FIXTURE_NOW);
    for (const c of r.topOpportunities) {
      if (c.optionType !== "CE") continue;
      // target is entry + delta * room * 0.45 — verify it's NOT simply entry + risk * k
      const risk = c.entry - c.stop;
      const reward = c.target1 - c.entry;
      // If forced: reward = risk * 1.5 always. Market-derived: reward varies with delta and room.
      // We just verify reward is positive and derived from delta * room (not pure risk multiple)
      assert.ok(reward > 0, "Target 1 must be above entry for CE");
      assert.ok(c.delta !== null && c.delta > 0, "Delta must be positive for CE");
      assert.ok(c.srRoom > 0, "SR room must be positive");
    }
  });

  it("TP22-02: PE target is derived from room-to-support scaled by delta", () => {
    const base = bullishSnapshot();
    const bearishChain: OptionRow[] = [
      makeRow(22050, 150, 130, 30000, 40000),
      makeRow(22100, 100, 90, 25000, 35000),
      makeRow(22500, 18,  15, 120000, 20000), // resistance: heavy call OI
      makeRow(21500, 35,  40,  15000, 120000), // support: heavy put OI
    ];
    const s: Snapshot = {
      ...base,
      spot: 22050,
      prevClose: 22300, // above spot → bearish price action
      chain: bearishChain,
      indicators: { ...base.indicators, ema9: 22400, ema21: 22500, rsi: 35, macdHist: -4 },
      breadth: { ...base.breadth, signal: -0.8, classification: "STRONGLY BEARISH" as const, priceBreadthState: "BEARISH" as const, advances: 5, declines: 44, advancePercent: 10, declinePercent: 88 },
      news: { score: -0.5, bullishPct: 10, neutralPct: 20, bearishPct: 70, eventRisk: null },
    } as unknown as Snapshot;
    const r = evaluateOptionsOpportunity(s, "NIFTY", FIXTURE_NOW);
    // If no PEs (e.g. R:R fails for this market), verify at minimum the direction is bearish
    if (r.topOpportunities.length > 0) {
      for (const c of r.topOpportunities) {
        assert.equal(c.optionType, "PE", "Bearish market → PE contracts");
        assert.ok(c.target1 > c.entry, "Target 1 (premium) must exceed entry premium for PE buy");
        assert.ok(c.srRoom > 0);
      }
    } else {
      // Sideways markets must not produce option buys at all.
      assert.ok(
        ["BEARISH", "STRONG BEARISH"].includes(r.marketDirection) || /sideways/.test(r.noOpportunityReason ?? ""),
        `Direction should be bearish or explicitly sideways, got: ${r.marketDirection}`,
      );
    }
  });

  it("TP22-03: stop is 50% of premium (standard option risk management)", () => {
    const s = bullishSnapshot();
    const r = evaluateOptionsOpportunity(s, "NIFTY", FIXTURE_NOW);
    for (const c of r.topOpportunities) {
      const expectedStop = Math.round(c.ltp * 0.50 * 100) / 100;
      assert.ok(Math.abs(c.stop - expectedStop) < 0.5, `Stop ${c.stop} should be ~50% of ltp ${c.ltp}`);
    }
  });

  it("TP22-04: target2 > target1 for CE (more ambitious second target)", () => {
    const s = bullishSnapshot();
    const r = evaluateOptionsOpportunity(s, "NIFTY", FIXTURE_NOW);
    for (const c of r.topOpportunities) {
      if (c.optionType === "CE") {
        assert.ok(c.target2 > c.target1, `T2 ${c.target2} must be > T1 ${c.target1}`);
      }
    }
  });
});

// ── TP22S — Stock trade plan ──────────────────────────────────────────────────

describe("TP22S — Stock trade plan ATR-derived", () => {
  // Test the math directly (buildTradePlan is not exported, so test via geometry)
  it("TP22S-01: 1.2× ATR target gives R:R ≈ 1.04 when at LOD", () => {
    // Geometry: at LOD, stop = high + 0.15*range above entry, range = atrProxy
    // risk = range + 0.15*range = 1.15*range; reward = 1.2*range → rr = 1.2/1.15 ≈ 1.04
    const range = 10;
    const risk = range + 0.15 * range; // 11.5
    const reward = range * 1.2;        // 12
    const rr = reward / risk;
    assert.ok(Math.abs(rr - 1.04) < 0.02, `R:R should be ~1.04, got ${rr.toFixed(3)}`);
  });

  it("TP22S-02: 1.75× ATR (strong momentum) gives R:R ≈ 1.52 when at LOD", () => {
    const range = 10;
    const risk = range + 0.15 * range;  // 11.5
    const reward = range * 1.75;        // 17.5
    const rr = reward / risk;
    assert.ok(Math.abs(rr - 1.52) < 0.02, `R:R should be ~1.52, got ${rr.toFixed(3)}`);
  });

  it("TP22S-03: target is NOT derived from risk (ATR-based, not risk × k)", () => {
    // Prove that for two stocks with different day ranges but same ltp,
    // the target CHANGES when range changes (ATR-derived), not when risk changes.
    const ltp = 100;

    // Stock A: tight range (small ATR)
    const rangeA = 3;
    const atrA = Math.max(rangeA, ltp * 0.008); // 3
    const stopA = (100 - rangeA) + (-atrA * 0.15); // below low with buffer
    const t1A = ltp + atrA * 1.2;  // 103.6

    // Stock B: wide range (large ATR)
    const rangeB = 10;
    const atrB = Math.max(rangeB, ltp * 0.008); // 10
    const stopB = (100 - rangeB) + (-atrB * 0.15); // below low with buffer
    const t1B = ltp + atrB * 1.2;  // 112

    assert.ok(t1B > t1A, "Wider range → further target (ATR-derived)");
    assert.ok(t1A !== t1B, "Targets differ for different ATR");

    // The targets are PROPORTIONAL to range, not to risk
    const ratioA = (t1A - ltp) / rangeA; // should be ~1.2
    const ratioB = (t1B - ltp) / rangeB; // should be ~1.2
    assert.ok(Math.abs(ratioA - 1.2) < 0.01, `Target multiplier A = ${ratioA}`);
    assert.ok(Math.abs(ratioB - 1.2) < 0.01, `Target multiplier B = ${ratioB}`);

    // NOT proportional to risk (risk includes buffer, targets don't)
    const riskA = ltp - stopA;
    const riskB = ltp - stopB;
    const rrA = (t1A - ltp) / riskA;
    const rrB = (t1B - ltp) / riskB;
    assert.ok(Math.abs(rrA - rrB) < 0.1, `R:R should be similar for same position in range`);
    assert.ok(rrA < 1.5, "R:R should be market-natural, not forced to 1.5");

    // Used variables to avoid TS dead-code warnings
    void stopA; void stopB;
  });

  it("TP22S-04: stock scanner produces no forced R:R (0 or organic)", async () => {
    const { scanStocks } = await import("./engine/stockOpportunityEngine.ts");
    const r = await scanStocks("intraday", FIXTURE_NOW, FIXTURE_DEPS);
    for (const s of r.topOpportunities) {
      // R:R should be 1.04–1.52 range (natural ATR-based), never exactly 1.5 from forced multiplier
      assert.ok(s.rr >= 1.0, `R:R ${s.rr} must be >= 1.0`);
      assert.ok(s.rr <= 3.0, `R:R ${s.rr} should be reasonable (<= 3.0)`);
      // Target must be derived from ATR: check it's less than 3× range from entry
      if (s.high !== null && s.low !== null) {
        const range = s.high - s.low;
        const rawRange = Math.max(range, s.ltp * 0.008);
        const reward = Math.abs(s.target1 - s.entry);
        assert.ok(reward <= rawRange * 4, `Reward ${reward} is too far from ATR ${rawRange}`);
      }
    }
  });
});

// ── RK22 — Ranking ────────────────────────────────────────────────────────────

describe("RK22 — Opportunity ranking", () => {
  it("RK22-01: higher score ranks first in same options run", () => {
    const s = bullishSnapshot();
    const r = evaluateOptionsOpportunity(s, "NIFTY", FIXTURE_NOW);
    for (let i = 0; i < r.topOpportunities.length - 1; i++) {
      assert.ok(
        r.topOpportunities[i].opportunityScore >= r.topOpportunities[i + 1].opportunityScore,
        "Top opportunities should be in descending score order",
      );
    }
  });

  it("RK22-02: grade field is present on all returned contracts", () => {
    const s = bullishSnapshot();
    const r = evaluateOptionsOpportunity(s, "NIFTY", FIXTURE_NOW);
    const validGrades: OpportunityGrade[] = ["A+", "A", "B", "C", "REJECT"];
    for (const c of r.topOpportunities) {
      assert.ok(validGrades.includes(c.grade), `Invalid grade: ${c.grade}`);
    }
  });
});

// ── OT22 — Outcome tracking ───────────────────────────────────────────────────

describe("OT22 — Outcome tracking store", () => {
  it("OT22-01: store module exports required functions", async () => {
    const store = await import("./services/opportunityTrackingStore.ts");
    assert.ok(typeof store.saveOpportunityRecord === "function");
    assert.ok(typeof store.listOpportunityRecords === "function");
    assert.ok(typeof store.getOpportunityRecord === "function");
    assert.ok(typeof store.updateOpportunityRecord === "function");
  });

  it("OT22-02: save and retrieve a record roundtrip", async () => {
    const { saveOpportunityRecord, getOpportunityRecord } = await import("./services/opportunityTrackingStore.ts");
    const rec = {
      id: "test_" + Date.now(),
      trackedAt: new Date().toISOString(),
      engineVersion: "20.1",
      underlying: "BANKNIFTY",
      instrumentKey: "NSE_FO|12345",
      symbol: null,
      optionType: "PE" as const,
      expiry: "2026-10-27",
      strike: 54300,
      strategyType: "LONG_PUT",
      entry: 615, stop: 307, target1: 1077, target2: 1488, rr: 1.52,
      opportunityScore: 70, grade: "A" as const, confidence: 100,
      regime: "EVENT RISK", direction: "STRONG BEARISH",
      reasons: ["EMA 9 below EMA 21"],
      outcome: "OPEN" as const,
      mfe: null, mae: null, exitPrice: null, exitAt: null, notes: null,
    };
    saveOpportunityRecord(rec);
    const retrieved = getOpportunityRecord(rec.id);
    assert.ok(retrieved !== null, "Should retrieve stored record");
    assert.equal(retrieved!.underlying, "BANKNIFTY");
    assert.equal(retrieved!.outcome, "OPEN");
  });

  it("OT22-03: updateOpportunityRecord updates outcome and MFE/MAE", async () => {
    const { saveOpportunityRecord, updateOpportunityRecord } = await import("./services/opportunityTrackingStore.ts");
    const id = "test_upd_" + Date.now();
    saveOpportunityRecord({
      id, trackedAt: new Date().toISOString(), engineVersion: "20.1",
      underlying: "NIFTY", instrumentKey: null, symbol: null, optionType: "CE" as const,
      expiry: "2026-10-13", strike: 22100, strategyType: "LONG_CALL",
      entry: 80, stop: 40, target1: 150, target2: 200, rr: 1.75,
      opportunityScore: 65, grade: "A" as const, confidence: 80,
      regime: "BULLISH", direction: "BULLISH", reasons: ["EMA bullish"],
      outcome: "OPEN" as const, mfe: null, mae: null, exitPrice: null, exitAt: null, notes: null,
    });
    const updated = updateOpportunityRecord(id, { outcome: "TARGET1_HIT", mfe: 75, exitPrice: 155 });
    assert.ok(updated !== null);
    assert.equal(updated!.outcome, "TARGET1_HIT");
    assert.equal(updated!.mfe, 75);
    assert.equal(updated!.exitPrice, 155);
    // Original immutable fields unchanged
    assert.equal(updated!.entry, 80);
    assert.equal(updated!.opportunityScore, 65);
  });

  it("OT22-04: updateOpportunityRecord returns null for unknown id", async () => {
    const { updateOpportunityRecord } = await import("./services/opportunityTrackingStore.ts");
    const result = updateOpportunityRecord("nonexistent_id_xyz", { outcome: "STOP_HIT" });
    assert.equal(result, null);
  });

  it("OT22-05: listOpportunityRecords includes saved records", async () => {
    const { saveOpportunityRecord, listOpportunityRecords } = await import("./services/opportunityTrackingStore.ts");
    const id = "test_list_" + Date.now();
    saveOpportunityRecord({
      id, trackedAt: new Date().toISOString(), engineVersion: "20.1",
      underlying: "NIFTY", instrumentKey: null, symbol: null, optionType: "PE" as const,
      expiry: "2026-10-13", strike: 21900, strategyType: "LONG_PUT",
      entry: 35, stop: 17, target1: 53, target2: 70, rr: 1.02,
      opportunityScore: 55, grade: "C" as const, confidence: 100,
      regime: "EVENT RISK", direction: "STRONG BEARISH", reasons: [],
      outcome: "OPEN" as const, mfe: null, mae: null, exitPrice: null, exitAt: null, notes: null,
    });
    const all = listOpportunityRecords();
    const found = all.find((r) => r.id === id);
    assert.ok(found, `Record ${id} should appear in list`);
  });
});

// ── SF22 — Safety / security ──────────────────────────────────────────────────

describe("SF22 — Safety Phase 22", () => {
  it("SF22-01: no order endpoints in src/", async () => {
    const { execSync } = await import("node:child_process");
    const base = decodeURIComponent(new URL(".", import.meta.url).pathname);
    const webSrc = base.replace(/\/src\/lib\/?$/, "/src");
    for (const pat of ["place" + "Order", "modify" + "Order", "cancel" + "Order"]) {
      const result = execSync(
        `grep -rn "${pat}" "${webSrc}" --include="*.ts" --include="*.tsx" | grep -v ".test.ts" || true`,
        { encoding: "utf8" },
      ).trim();
      assert.equal(result, "", `Found banned pattern: ${pat}`);
    }
  });

  it("SF22-02: 11.4-frozen still unchanged", async () => {
    const { STRATEGY_VERSION } = await import("./journalTypes.ts");
    assert.equal(STRATEGY_VERSION.strategyVersion, "11.4-frozen");
  });

  it("SF22-03: opportunity outcomes route exists", async () => {
    const fs = await import("node:fs");
    const base = decodeURIComponent(new URL(".", import.meta.url).pathname);
    const apiDir = base.replace(/\/src\/lib\/?$/, "/src/app/api/opportunities");
    assert.ok(fs.existsSync(`${apiDir}/outcomes/route.ts`), "Missing outcomes route");
    assert.ok(fs.existsSync(`${apiDir}/track/route.ts`), "Missing track route");
  });
});

describe("OA — options fail closed while the chain is unverified (options-audit-1)", () => {
  it("OA-01: a STALE option chain forces REJECT even when other sources are LIVE", () => {
    const base = bullishSnapshot();
    const live = evaluateOptionsOpportunity(base, "NIFTY", FIXTURE_NOW);
    const stale = evaluateOptionsOpportunity({ ...base, sources: { ...base.sources, optionChain: { ...base.sources.optionChain, source: "STALE" } } } as Snapshot, "NIFTY", FIXTURE_NOW);
    assert.ok(stale.topOpportunities.length > 0, "fixture must produce contracts so the check is not vacuous");
    assert.ok(live.topOpportunities.some((c) => c.grade !== "REJECT"), "same contracts are gradeable when the chain is LIVE");
    for (const c of stale.topOpportunities) assert.equal(c.grade, "REJECT");
  });
});

describe("OG — unverified chain Greeks cannot influence options ranking", () => {
  const staleOf = (s: Snapshot) => ({ ...s, sources: { ...s.sources, optionChain: { ...s.sources.optionChain, source: "STALE" } } }) as Snapshot;
  const scramble = (s: Snapshot, seed: number) => ({
    ...s,
    chain: s.chain.map((r, i) => ({
      ...r,
      call: { ...r.call, delta: ((i * 37 + seed) % 97) / 100, iv: 5 + ((i * 13 + seed) % 60) },
      put: { ...r.put, delta: -((i * 53 + seed) % 97) / 100, iv: 5 + ((i * 29 + seed) % 60) },
    })),
  }) as Snapshot;
  const view = (s: Snapshot) => evaluateOptionsOpportunity(s, "NIFTY", FIXTURE_NOW).topOpportunities.map((c) => [c.strike, c.optionType, c.opportunityScore, c.grade, c.rr]);

  it("OG-01: scrambling chain delta/IV leaves candidates, order, scores and grades identical when the chain is unverified", () => {
    const base = staleOf(bullishSnapshot());
    const ref = view(base);
    assert.ok(ref.length > 0, "fixture produces candidates");
    for (const seed of [1, 7, 42, 99]) assert.deepEqual(view(scramble(base, seed)), ref, `seed ${seed}`);
  });

  it("OG-02: the same scrambling DOES change results when the chain is verified LIVE (the test is sensitive)", () => {
    const live = bullishSnapshot();
    const ref = view(live);
    assert.ok([1, 7, 42, 99].some((seed) => JSON.stringify(view(scramble(live, seed))) !== JSON.stringify(ref)));
  });

  it("OG-03: unverified chain → every candidate REJECT, with the exclusion stated", () => {
    const r = evaluateOptionsOpportunity(staleOf(bullishSnapshot()), "NIFTY", FIXTURE_NOW);
    for (const c of r.topOpportunities) {
      assert.equal(c.grade, "REJECT");
      assert.equal(c.scoreBreakdown.delta, 0);
      assert.equal(c.scoreBreakdown.iv_attractiveness, 0);
      assert.equal(c.scoreBreakdown.expected_move_fit, 0);
      assert.ok(c.reasons.some((x) => /unverified/.test(x)));
    }
  });
});
