// Issue 2 / B3–B7 — candidate window, window-level verification, and the per-leg guard, including multi-leg plans.
// Offline and deterministic: fixed clock, fixture chain (spot 24000, 21 strikes at 50-point steps), stubbed quotes.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { candidateWindow, CANDIDATE_MAX_STRIKES_ATM } from "./optionCandidateWindow.ts";
import { verifyEvaluationOptionPrices } from "./optionPriceVerification.ts";
import { checkPlanLegs, type PlanLeg } from "./optionLegGuard.ts";
import { atmStrike } from "./optionChainAnalytics.ts";
import { analyze } from "../engine/strategy.ts";
import { mockSnapshotTradeInputs as mockSnapshot } from "../testFixtures/mockSnapshotTradeInputs.ts";
import { buildRecommendationResponse } from "../recommendationEnricher.ts";
import { diagnose } from "../recommendationDiagnostic.ts";
import type { OptionRow, Snapshot } from "../types.ts";
import type { OptionPriceVerificationSummary } from "./optionPriceVerification.ts";

const NOW = new Date("2026-10-05T07:00:00Z");
const SPOT = 24000;
const STRIKES = Array.from({ length: 21 }, (_, i) => 23500 + i * 50); // 23500 … 24500; ATM index 10
const WINDOW_LOW = 23650, WINDOW_HIGH = 24350; // ATM ±7 strikes

const ltpOf = (key: string) => 50 + Math.max(0, 24000 - Number(key.slice(-5))) / 20; // deterministic, positive
function chain(): OptionRow[] {
  return STRIKES.map((k) => {
    const quote = (side: "C" | "P") => ({
      ltp: +(50 + Math.abs(k - SPOT) / 20).toFixed(2), bid: null as number | null, ask: null as number | null,
      oi: 5000, chgOi: 100, volume: 2000, iv: 15, delta: side === "C" ? 0.5 : -0.5,
      instrumentKey: `NSE_FO|${side}${k}`,
    });
    const call = quote("C"), put = quote("P");
    return { strike: k, call: { ...call, bid: call.ltp - 0.5, ask: call.ltp + 0.5 }, put: { ...put, bid: put.ltp - 0.5, ask: put.ltp + 0.5 } } as OptionRow;
  });
}
// Quote fetcher: independent LTP equals the chain LTP; overrides make chosen keys stale or mismatched.
function fetcher(opts: { stale?: string[]; mismatch?: string[] } = {}) {
  return async (keys: string[]) => {
    const out: Record<string, Record<string, unknown>> = {};
    for (const key of keys) {
      const chainLtp = chainLtpByKey.get(key) ?? 100;
      const last_price = opts.mismatch?.includes(key) ? chainLtp * 1.5 : chainLtp;
      const last_trade_time = opts.stale?.includes(key) ? NOW.getTime() - 600_000 : NOW.getTime() - 5_000;
      out[key] = { instrument_token: key, last_price, last_trade_time };
    }
    return out;
  };
}
const chainLtpByKey = new Map<string, number>();
for (const r of chain()) { chainLtpByKey.set(r.call.instrumentKey!, r.call.ltp); chainLtpByKey.set(r.put.instrumentKey!, r.put.ltp); }
void ltpOf;

// Snapshot whose chain rows carry a verified LIVE quote for every contract (what the live path produces).
function verifiedSnapshot(rows: OptionRow[] = chain()): Snapshot {
  const s = structuredClone(mockSnapshot("nifty", NOW));
  s.spot = SPOT;
  s.chain = rows.map((r) => ({
    ...r,
    call: { ...r.call, contractPriceQuality: "CONTRACT_PRICE_LIVE", ltpConsistent: true, lastTradeTime: new Date(NOW.getTime() - 5_000).toISOString() },
    put: { ...r.put, contractPriceQuality: "CONTRACT_PRICE_LIVE", ltpConsistent: true, lastTradeTime: new Date(NOW.getTime() - 5_000).toISOString() },
  })) as OptionRow[];
  s.optionPriceVerification = { state: "CONTRACT_PRICE_LIVE", chainAnalytics: "CHAIN_ANALYTICS_UNVERIFIED" } as unknown as OptionPriceVerificationSummary;
  return s;
}

// The mock snapshot as the phase-13 tests use it (every subsystem LIVE, its own chain), with the REAL verifier run over
// its chain: each contract's independent quote equals its chain LTP, so the summary and rows are what the live path produces.
async function liveMockSnapshot(): Promise<Snapshot> {
  const s = structuredClone(mockSnapshot("nifty", NOW));
  for (const k of Object.keys(s.sources) as (keyof Snapshot["sources"])[]) s.sources[k] = { ...s.sources[k], source: "LIVE", provider: "UPSTOX" };
  s.fallbackReason = null;
  s.news = { ...s.news, status: "LIVE" };
  for (const r of s.chain) {
    r.call.instrumentKey = `NSE_FO|T${r.strike}CE`;
    r.put.instrumentKey = `NSE_FO|T${r.strike}PE`;
  }
  const ltpByKey = new Map<string, number>();
  for (const r of s.chain) { ltpByKey.set(r.call.instrumentKey!, r.call.ltp); ltpByKey.set(r.put.instrumentKey!, r.put.ltp); }
  const fetchSame = async (keys: string[]) => Object.fromEntries(keys.map((k) => [k, { instrument_token: k, last_price: ltpByKey.get(k) ?? 1, last_trade_time: NOW.getTime() - 5_000 }]));
  const v = await verifyEvaluationOptionPrices(s.chain, s.spot, "nifty", NOW, fetchSame, CANDIDATE_MAX_STRIKES_ATM);
  s.chain = v.rows;
  s.optionPriceVerification = v.summary;
  return s;
}
const leg = (side: "BUY" | "SELL", type: "CE" | "PE", strike: number): PlanLeg => ({ side, type, strike });

describe("B3/B7 — candidate window (shared definition)", () => {
  it("W-1. the window is ATM ±7 listed strikes: 23650 … 24350 around a 24000 spot", () => {
    const w = candidateWindow(chain(), SPOT);
    assert.equal(CANDIDATE_MAX_STRIKES_ATM, 7);
    assert.equal(w.atmStrike, 24000);
    assert.equal(w.strikes.length, 15);
    assert.equal(w.strikes[0], WINDOW_LOW);
    assert.equal(w.strikes.at(-1), WINDOW_HIGH);
    assert.ok(!w.strikeSet.has(23600), "8 strikes below ATM is outside");
    assert.ok(!w.strikeSet.has(24400), "8 strikes above ATM is outside");
  });

  it("W-2. the ATM is the engine's own atmStrike (no second definition)", () => {
    const rows = chain();
    for (const spot of [23990, 24024, 24025, 24026, 24400]) {
      assert.equal(candidateWindow(rows, spot).atmStrike, atmStrike(rows, spot), `spot ${spot}`);
    }
  });

  it("W-3. a chain shorter than the window contains every strike", () => {
    const w = candidateWindow(chain().slice(8, 13), SPOT);
    assert.equal(w.strikes.length, 5);
  });

  it("W-4. empty chain → empty window", () => {
    assert.equal(candidateWindow([], SPOT).strikes.length, 0);
  });

  it("W-5. the engine's candidate set is inside the same window", async () => {
    const { evaluateOptionsOpportunity } = await import("../engine/opportunityEngine.ts");
    const s = verifiedSnapshot();
    const r = evaluateOptionsOpportunity(s, "NIFTY", NOW);
    const window = candidateWindow(s.chain, s.spot).strikeSet;
    for (const x of r.rejectedContracts) assert.ok(window.has(x.strike), `rejected ${x.strike} must be in the window`);
    for (const c of r.topOpportunities) assert.ok(window.has(c.strike), `candidate ${c.strike} must be in the window`);
  });
});

describe("B3/B7 — window-level verification summary", () => {
  it("V-1. all window contracts LIVE → verified and eligible counts are the window's 30 contracts, none rejected", async () => {
    const r = await verifyEvaluationOptionPrices(chain(), SPOT, "nifty", NOW, fetcher(), CANDIDATE_MAX_STRIKES_ATM);
    assert.ok(r.summary.window);
    assert.equal(r.summary.window!.verifiedContracts, 30);
    assert.equal(r.summary.window!.eligibleContracts, 30);
    assert.equal(r.summary.window!.rejectedContracts, 0);
    assert.equal(r.summary.window!.outsideWindowContracts, 12, "12 strikes × 2 sides outside the window");
    assert.equal(r.summary.window!.atmStrike, 24000);
  });

  it("V-2. a stale contract inside the window is counted as rejected with its reason", async () => {
    const r = await verifyEvaluationOptionPrices(chain(), SPOT, "nifty", NOW, fetcher({ stale: ["NSE_FO|C24000"] }), CANDIDATE_MAX_STRIKES_ATM);
    assert.equal(r.summary.window!.rejectedContracts, 1);
    assert.deepEqual(r.summary.window!.rejectionReasons, { CONTRACT_PRICE_STALE: 1 });
  });

  it("V-3. a stale contract outside the window does not change the window result, and is reported as outside", async () => {
    const r = await verifyEvaluationOptionPrices(chain(), SPOT, "nifty", NOW, fetcher({ stale: ["NSE_FO|C23500"] }), CANDIDATE_MAX_STRIKES_ATM);
    assert.equal(r.summary.window!.rejectedContracts, 0);
    assert.equal(r.summary.window!.eligibleContracts, 30);
    // Residual, documented: the full-chain gate still requires every contract (PCR/OI/volume are full-chain inputs).
    assert.notEqual(r.summary.state, "CONTRACT_PRICE_LIVE");
  });

  it("V-4. an independent-price mismatch inside the window is reported as CONTRACT_PRICE_MISMATCH", async () => {
    const r = await verifyEvaluationOptionPrices(chain(), SPOT, "nifty", NOW, fetcher({ mismatch: ["NSE_FO|P24100"] }), CANDIDATE_MAX_STRIKES_ATM);
    assert.deepEqual(r.summary.window!.rejectionReasons, { CONTRACT_PRICE_MISMATCH: 1 });
  });
});

describe("B3/B7 — per-leg guard (single and multi-leg plans)", () => {
  it("G-1. a long call at ATM is verified", () => {
    const g = checkPlanLegs(verifiedSnapshot(), [leg("BUY", "CE", 24000)]);
    assert.equal(g.applicable, true);
    assert.deepEqual(g.blockers, []);
    assert.equal(g.verdicts[0].ok, true);
  });

  it("G-2. a bull call spread inside the window is verified leg by leg", () => {
    const g = checkPlanLegs(verifiedSnapshot(), [leg("BUY", "CE", 24000), leg("SELL", "CE", 24100)]);
    assert.deepEqual(g.blockers, []);
  });

  it("G-3. a spread whose short leg is outside the window is blocked with a clear reason", () => {
    const g = checkPlanLegs(verifiedSnapshot(), [leg("BUY", "CE", 24000), leg("SELL", "CE", 24500)]);
    assert.equal(g.blockers.length, 1);
    assert.match(g.blockers[0], /^NO_VALID_OPTION: SELL CE 24500 leg rejected — strike 24500 is outside the verified ATM ±7 window/);
  });

  it("G-4. an iron condor: the two outer wings are outside the window; the inner short legs pass", () => {
    const legs = [leg("SELL", "CE", 24300), leg("BUY", "CE", 24400), leg("SELL", "PE", 23700), leg("BUY", "PE", 23400)];
    const g = checkPlanLegs(verifiedSnapshot(), legs);
    assert.equal(g.blockers.length, 2, "both BUY wings are outside 23650–24350");
    assert.ok(g.verdicts[0].ok && g.verdicts[2].ok, "inner short legs are inside the window and verified");
    assert.match(g.blockers[0], /BUY CE 24400/);
    assert.match(g.blockers[1], /BUY PE 23400/);
  });

  it("G-5. a leg whose own quote is stale is blocked", () => {
    const rows = chain();
    const s = verifiedSnapshot(rows);
    s.chain = s.chain.map((r) => (r.strike === 24000 ? { ...r, call: { ...r.call, contractPriceQuality: "CONTRACT_PRICE_STALE" } } : r)) as OptionRow[];
    const g = checkPlanLegs(s, [leg("BUY", "CE", 24000)]);
    assert.match(g.blockers[0], /contract quote is CONTRACT_PRICE_STALE/);
  });

  it("G-6. a leg whose independent LTP check failed is blocked", () => {
    const s = verifiedSnapshot();
    s.chain = s.chain.map((r) => (r.strike === 24000 ? { ...r, put: { ...r.put, ltpConsistent: false } } : r)) as OptionRow[];
    const g = checkPlanLegs(s, [leg("BUY", "PE", 24000)]);
    assert.match(g.blockers[0], /independent LTP check did not confirm/);
  });

  it("G-7. a leg without a canonical instrument key is blocked", () => {
    const s = verifiedSnapshot();
    s.chain = s.chain.map((r) => (r.strike === 24000 ? { ...r, call: { ...r.call, instrumentKey: null } } : r)) as OptionRow[];
    const g = checkPlanLegs(s, [leg("BUY", "CE", 24000)]);
    assert.match(g.blockers[0], /canonical instrument key is missing/);
  });

  it("G-8. a strike that is not in the chain is blocked", () => {
    const g = checkPlanLegs(verifiedSnapshot(), [leg("BUY", "CE", 25000)]);
    assert.match(g.blockers[0], /strike 25000 is not in the option chain/);
  });

  it("G-9. without live verification the guard is not applicable and blocks nothing (mock or fixture data)", () => {
    const s = structuredClone(mockSnapshot("nifty", NOW));
    s.optionPriceVerification = undefined;
    const g = checkPlanLegs(s, [leg("BUY", "CE", 24000), leg("SELL", "CE", 24500)]);
    assert.equal(g.applicable, false);
    assert.deepEqual(g.blockers, []);
  });

  it("G-10. every rejected leg produces its own line", () => {
    const g = checkPlanLegs(verifiedSnapshot(), [leg("BUY", "CE", 23500), leg("SELL", "CE", 24500)]);
    assert.equal(g.blockers.length, 2);
  });
});

describe("B3/B7 — recommendation and diagnostic integration (real frozen engine)", () => {
  it("R-1. a TRADE whose plan has a leg outside the window is not a TRADE; the diagnostic names the leg", async () => {
    const s = await liveMockSnapshot();
    const now = NOW;
    const a = analyze(s, now, { accountCapital: 500_000 }, undefined);
    if (a.status !== "TRADE" || !a.plan) {
      // The frozen engine must produce a TRADE on this snapshot for this test to be meaningful.
      assert.fail(`fixture did not produce a TRADE (status ${a.status}); adjust the fixture, not the guard`);
    }
    const window = candidateWindow(s.chain, s.spot);
    const farStrike = Math.max(...s.chain.map((r) => r.strike)); // outermost listed strike
    assert.ok(!window.strikeSet.has(farStrike), "the chosen far strike must be outside the window");
    const tampered = { ...a, plan: { ...a.plan!, legs: [...a.plan!.legs, { side: "SELL" as const, type: "CE" as const, strike: farStrike, ltp: 5 }] } };
    const rec = buildRecommendationResponse(tampered, now);
    assert.equal(rec.decision, "NO_TRADE");
    assert.ok(rec.blockers.some((b) => b.startsWith(`NO_VALID_OPTION: SELL CE ${farStrike}`)));
    const d = diagnose(tampered, now);
    assert.equal(d.finalDecision, "NO_TRADE");
    assert.ok(d.blockers.some((b) => b.code === "NO_VALID_OPTION"));
    assert.equal(d.optionVerification.window?.atmStrike, window.atmStrike);
    assert.equal(d.optionVerification.window?.strikes.length, 15);
    assert.equal(d.optionVerification.legGuardApplicable, true);
    assert.ok(d.optionVerification.legChecks.some((v) => !v.ok && v.strike === farStrike));
  });

  it("R-2. the same TRADE with every leg inside the window is unchanged by the guard", async () => {
    const s = await liveMockSnapshot();
    const now = NOW;
    const a = analyze(s, now, { accountCapital: 500_000 }, undefined);
    assert.equal(a.status, "TRADE");
    const rec = buildRecommendationResponse(a, now);
    assert.equal(rec.decision, "TRADE");
    assert.ok(!rec.blockers.some((b) => b.startsWith("NO_VALID_OPTION")));
  });
});
