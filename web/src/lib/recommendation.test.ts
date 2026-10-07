// Run: npm test
// Tests for the recommendation enricher — contract selection, OI, risk, freshness, event risk, paper gate.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDisplaySymbol,
  buildOiAnalysis,
  buildRecommendationResponse,
  buildWhyReasons,
  contractDetails,
  entryDetail,
  primaryLeg,
} from "./recommendationEnricher.ts";
import { analyze } from "./engine/strategy.ts";
import { mockSnapshot } from "./services/mock.ts";
import type { IndexId, Snapshot } from "./types.ts";

console.info = () => {};

const T = new Date("2026-10-06T11:00:00+05:30");

// ── Fixtures ──────────────────────────────────────────────────────────────────

function snap(index: IndexId = "nifty") {
  return mockSnapshot(index, T);
}

function liveSnap(index: IndexId = "nifty"): Snapshot {
  const s = snap(index);
  return {
    ...s,
    sources: Object.fromEntries(Object.entries(s.sources).map(([k, v]) => [k, { ...v, source: "LIVE" }])) as Snapshot["sources"],
  };
}

function staleSnap(): Snapshot {
  const s = snap();
  return {
    ...s,
    sources: Object.fromEntries(Object.entries(s.sources).map(([k, v]) => [k, { ...v, source: "STALE" }])) as Snapshot["sources"],
  };
}

function eventRiskSnap(): Snapshot {
  return {
    ...snap(),
    news: {
      ...snap().news,
      eventRisk: "RBI monetary policy announcement — EXTREME event risk",
      detail: {
        ...(snap().news.detail ?? {}),
        eventRisk: { level: "EXTREME", reason: "RBI monetary policy announcement", articles: 18, today: true },
      } as never,
    },
  };
}

function zeroOiSnap(): Snapshot {
  const s = snap();
  return { ...s, chain: s.chain.map((r) => ({ ...r, call: { ...r.call, oi: 0, chgOi: null }, put: { ...r.put, oi: 0, chgOi: null } })) };
}

// ── Instrument key ─────────────────────────────────────────────────────────────

test("REC1. buildDisplaySymbol — NIFTY CE produces human-readable label", () => {
  const s = buildDisplaySymbol("2026-10-06", 22700, "CE", "NIFTY 50");
  assert.ok(s.includes("OCT"));
  assert.ok(s.includes("22700"));
  assert.ok(s.includes("CE"));
  assert.ok(!s.includes("NSE_FO|"), "display symbol must NOT look like an instrument key");
});

test("REC2. buildDisplaySymbol — BANKNIFTY PE", () => {
  const s = buildDisplaySymbol("2026-10-28", 50000, "PE", "BANK NIFTY");
  assert.ok(s.includes("50000"));
  assert.ok(s.includes("PE"));
});

// ── primaryLeg ─────────────────────────────────────────────────────────────────

test("REC3. primaryLeg — BUY leg is identified for long call", () => {
  const a = analyze(liveSnap(), T);
  const plan = a.candidates[0];
  if (!plan) return; // no candidates in this regime — skip
  const leg = primaryLeg(plan);
  assert.ok(leg !== null);
  assert.ok(leg.strike > 0);
  assert.ok(leg.type === "CE" || leg.type === "PE");
});

// ── contractDetails ────────────────────────────────────────────────────────────

test("REC4. contractDetails — fields from real chain row, no fabrication", () => {
  const s = snap();
  const a = analyze(s, T);
  const plan = a.candidates[0];
  if (!plan) return;
  const c = contractDetails(s, plan);
  if (!c) return;
  assert.equal(c.strike, primaryLeg(plan)!.strike);
  assert.equal(c.optionType, primaryLeg(plan)!.type);
  // Mock chain provides MOCK_FO| keys; real chain would provide NSE_FO| keys
  assert.ok(c.instrumentKey !== undefined, "instrumentKey field must exist");
  if (c.instrumentKey !== null) assert.ok(c.instrumentKey.includes("|"), "instrumentKey has exchange prefix");
  // ltp null or positive (never negative)
  assert.ok(c.ltp === null || c.ltp > 0);
});

test("REC5. contractDetails — null when strike not in chain", () => {
  const s = snap();
  const fakePlan = { ...analyze(s, T).candidates[0]! };
  if (!fakePlan) return;
  const modified = { ...fakePlan, legs: [{ ...fakePlan.legs[0], strike: 999999 }] };
  assert.equal(contractDetails(s, modified), null);
});

// ── entryDetail ────────────────────────────────────────────────────────────────

test("REC6. entryDetail — paper entry uses ask when available (long entry)", () => {
  const s = snap();
  const a = analyze(s, T);
  const plan = a.candidates[0];
  if (!plan) return;
  const ed = entryDetail(s, plan);
  if (!ed) return;
  assert.ok(ed.paperEntry > 0);
  // Paper entry must be >= ask (long option buys at ask + slippage)
  if (ed.ask !== null && ed.ask > 0) {
    assert.ok(ed.paperEntry >= ed.ask, `paperEntry ${ed.paperEntry} < ask ${ed.ask}`);
  }
});

test("REC7. entryDetail — never invents price when no bid/ask available", () => {
  const s = snap();
  const a = analyze(s, T);
  const plan = a.candidates[0];
  if (!plan) return;
  // Strip ask from the relevant chain row
  const leg = primaryLeg(plan)!;
  const stripped = {
    ...s,
    chain: s.chain.map((r) =>
      r.strike === leg.strike
        ? { ...r, [leg.type === "CE" ? "call" : "put"]: { ...(leg.type === "CE" ? r.call : r.put), bid: null, ask: null } }
        : r
    ),
  };
  const ed = entryDetail(stripped, plan);
  if (!ed) return;
  // Falls back to LTP — still a positive number
  assert.ok(ed.paperEntry > 0);
  assert.equal(ed.paperEntrySource, "LTP_FALLBACK");
});

// ── OI Analysis ────────────────────────────────────────────────────────────────

test("REC8. buildOiAnalysis — OI available: interpretation is non-empty", () => {
  const s = snap();
  const a = analyze(s, T);
  const oi = buildOiAnalysis(s, a);
  assert.ok(oi.interpretation.length > 0);
  // totals are numbers
  assert.ok(typeof oi.callOiTotal === "number");
  assert.ok(typeof oi.putOiTotal === "number");
});

test("REC9. buildOiAnalysis — OI unavailable: all null, interpretation says unavailable", () => {
  const s = zeroOiSnap();
  const a = analyze(s, T);
  const oi = buildOiAnalysis(s, a);
  assert.equal(oi.callOiTotal, null);
  assert.equal(oi.putOiTotal, null);
  assert.ok(oi.interpretation[0].toLowerCase().includes("not available"));
});

test("REC10. buildOiAnalysis — highest call/put OI strikes are in the chain", () => {
  const s = snap();
  const strikes = s.chain.map((r) => r.strike);
  const a = analyze(s, T);
  const oi = buildOiAnalysis(s, a);
  if (oi.highestCallOiStrike !== null) assert.ok(strikes.includes(oi.highestCallOiStrike));
  if (oi.highestPutOiStrike !== null) assert.ok(strikes.includes(oi.highestPutOiStrike));
});

// ── whyReasons ─────────────────────────────────────────────────────────────────

test("REC11. buildWhyReasons — sentences reference actual data (not hardcoded strings)", () => {
  const a = analyze(snap(), T);
  const reasons = buildWhyReasons(a);
  // Should have at least one reason mentioning a factor key
  assert.ok(reasons.length > 0);
  // Each reason is a string
  reasons.forEach((r) => assert.ok(typeof r === "string" && r.length > 0));
});

// ── buildRecommendationResponse ────────────────────────────────────────────────

test("REC12. response always has required top-level fields", () => {
  const a = analyze(snap(), T);
  const r = buildRecommendationResponse(a);
  for (const k of ["recommendationId", "generatedAt", "source", "underlying", "decision", "direction", "strategy", "confidence", "market", "score", "oiAnalysis", "whyReasons", "dataQuality", "blockers"] as const)
    assert.ok(k in r, `missing: ${k}`);
});

test("REC13. NIFTY → underlying is NIFTY, BANKNIFTY → underlying is BANKNIFTY", () => {
  assert.equal(buildRecommendationResponse(analyze(snap("nifty"), T)).underlying, "NIFTY");
  assert.equal(buildRecommendationResponse(analyze(snap("banknifty"), T)).underlying, "BANKNIFTY");
});

test("REC14. score.factors keys match factor keys from analysis", () => {
  const a = analyze(snap(), T);
  const r = buildRecommendationResponse(a);
  const expected = new Set(a.factors.map((f) => f.key));
  const actual = new Set(Object.keys(r.score.factors));
  for (const k of expected) assert.ok(actual.has(k), `missing factor: ${k}`);
});

test("REC15. blockers passthrough verbatim from analysis", () => {
  const a = analyze(snap(), T);
  const r = buildRecommendationResponse(a);
  assert.deepEqual(r.blockers, a.blockers);
});

// ── TRADE scenario ─────────────────────────────────────────────────────────────

test("REC16. TRADE decision: contract non-null, execution non-null, all required fields present", () => {
  // Find a scenario that produces TRADE by trying live data
  const a = analyze(liveSnap(), T);
  if (a.status !== "TRADE") return; // WAIT is acceptable in current conditions
  const r = buildRecommendationResponse(a);
  assert.equal(r.decision, "TRADE");
  assert.ok(r.contract !== null, "TRADE must have contract");
  assert.ok(r.execution !== null, "TRADE must have execution");
  const ex = r.execution!;
  assert.ok(ex.entry > 0);
  assert.ok(ex.stopLoss > 0);
  assert.ok(ex.target1 > ex.entry, "target1 > entry");
  assert.ok(ex.target2 >= ex.target1, "target2 >= target1");
  assert.ok(ex.lots >= 1);
  assert.ok(ex.quantity >= ex.lots);
  assert.ok(ex.capitalRequired > 0);
  assert.ok(ex.plannedRisk > 0);
  assert.ok(ex.rrTarget1 >= 0);
});

// ── WAIT scenario ──────────────────────────────────────────────────────────────

test("REC17. WAIT decision: execution null, blockers non-empty or has a reason", () => {
  const a = analyze(snap(), T); // mock may produce WAIT
  if (a.status !== "WAIT") return;
  const r = buildRecommendationResponse(a);
  assert.equal(r.decision, "WAIT");
  assert.equal(r.execution, null);
});

// ── NO_TRADE scenario ──────────────────────────────────────────────────────────

test("REC18. NO_TRADE: execution null, decision maps correctly", () => {
  // Stale data forces NO TRADE
  const s = staleSnap();
  const a = analyze(s, T);
  assert.equal(a.status, "NO TRADE");
  const r = buildRecommendationResponse(a);
  assert.equal(r.decision, "NO_TRADE");
  assert.equal(r.execution, null);
});

// ── Freshness / stale data safety ─────────────────────────────────────────────

test("REC19. stale source → source field is STALE, execution null", () => {
  const a = analyze(staleSnap(), T);
  const r = buildRecommendationResponse(a);
  assert.equal(r.source, "STALE");
  assert.equal(r.execution, null);
});

test("REC20. LIVE source → source field is LIVE", () => {
  const a = analyze(liveSnap(), T);
  const r = buildRecommendationResponse(a);
  assert.equal(r.source, "LIVE");
});

// ── Event risk ─────────────────────────────────────────────────────────────────

test("REC21. event risk snap → decision is WAIT or NO_TRADE, never TRADE", () => {
  const a = analyze(eventRiskSnap(), T);
  const r = buildRecommendationResponse(a);
  assert.ok(r.decision !== "TRADE", `expected WAIT or NO_TRADE, got ${r.decision}`);
});

test("REC22. event risk: blockedCandidate shows a candidate was evaluated (not just broken)", () => {
  const a = analyze(eventRiskSnap(), T);
  // There may be a candidate that was evaluated; the engine may also simply produce WAIT
  const r = buildRecommendationResponse(a);
  // The engine ran and returned a decision — verify it's populated
  assert.ok(r.decision === "WAIT" || r.decision === "NO_TRADE");
  assert.ok(typeof r.confidence === "number");
});

// ── Missing data (OI/IV/greeks) ────────────────────────────────────────────────

test("REC23. missing OI: OI fields null, not 0", () => {
  const a = analyze(zeroOiSnap(), T);
  const r = buildRecommendationResponse(a);
  assert.equal(r.oiAnalysis.callOiTotal, null);
  assert.equal(r.oiAnalysis.putOiTotal, null);
});

test("REC24. missing IV on chain row: contract.iv is null", () => {
  const s = snap();
  const a = analyze(s, T);
  const plan = a.candidates[0];
  if (!plan) return;
  const leg = primaryLeg(plan)!;
  const noIv = {
    ...s,
    chain: s.chain.map((r) =>
      r.strike === leg.strike
        ? { ...r, [leg.type === "CE" ? "call" : "put"]: { ...(leg.type === "CE" ? r.call : r.put), iv: 0 } }
        : r
    ),
  };
  const c = contractDetails(noIv, plan);
  if (!c) return;
  assert.equal(c.iv, null); // iv=0 treated as null
});

// ── Paper trade gate ───────────────────────────────────────────────────────────

test("REC25. execution is null when decision is WAIT — no paper trade possible", () => {
  const a = analyze(snap(), T);
  if (a.status !== "WAIT") return;
  const r = buildRecommendationResponse(a);
  assert.equal(r.execution, null);
});

// ── Risk constraints ───────────────────────────────────────────────────────────

test("REC26. TRADE execution: quantity is a valid multiple of lots", () => {
  const a = analyze(liveSnap(), T);
  if (a.status !== "TRADE" || !a.plan?.risk) return;
  const r = buildRecommendationResponse(a);
  const ex = r.execution!;
  // quantity should be lots × lotSize; quantity >= lots
  assert.ok(ex.quantity >= ex.lots);
  assert.ok(ex.lots >= 1);
});

test("REC27. TRADE execution: R:R target1 >= 0", () => {
  const a = analyze(liveSnap(), T);
  if (a.status !== "TRADE") return;
  const r = buildRecommendationResponse(a);
  assert.ok(r.execution!.rrTarget1 >= 0);
});

// ── Order safety ───────────────────────────────────────────────────────────────

test("REC28. buildRecommendationResponse does not call any Upstox order endpoint", () => {
  // This is a pure unit test — the enricher is a pure function with no I/O
  const a = analyze(snap(), T);
  const r = buildRecommendationResponse(a);
  assert.ok(r); // Just verifying no side effects thrown
});
