// F-R2 regression: actionable levels must never leave the API for WAIT or NO TRADE, and the internal analysis is kept.
// Fixtures: LIVE-labelled mockSnapshot. The opening-window case is the one that returns a plan with status WAIT.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mockSnapshotTradeInputs as mockSnapshot } from "./testFixtures/mockSnapshotTradeInputs.ts";
import { analyze } from "./engine/strategy.ts";
import { toApiAnalysis } from "./analysisResponse.ts";
import { buildRecommendationResponse } from "./recommendationEnricher.ts";
import { DEFAULT_RISK_CONFIG } from "./services/risk/riskConfig.ts";
import { GET as analysisGet } from "../app/api/analysis/[index]/route.ts";
import type { Snapshot } from "./types.ts";

const CFG = { ...DEFAULT_RISK_CONFIG, accountCapital: 500_000 };
const KEYS = ["market", "optionChain", "technical", "news", "breadth"] as const;
const NOON = new Date("2026-10-05T07:00:00Z"); // 12:30 IST
const OPEN = new Date("2026-10-05T03:50:00Z"); // 09:20 IST, opening window

function labelled(now: Date): Snapshot {
  const s = structuredClone(mockSnapshot("nifty", now));
  for (const k of KEYS) s.sources[k] = { ...s.sources[k], source: "LIVE", provider: "UPSTOX", fetchedAt: now.toISOString() } as never;
  s.fallbackReason = null;
  s.lotSize = 75;
  return s;
}
const PRICE_KEYS = ["entry", "stop", "target1", "target2", "rr", "quantity", "lots", "totalRisk", "legs", "maxLoss", "maxProfit"];

test("WAIT: the opening-window plan is removed from the public response, and candidates carry no price levels", () => {
  const a = analyze(labelled(OPEN), OPEN, CFG);
  assert.equal(a.status, "WAIT", "fixture precondition: opening window is WAIT");
  const out: any = toApiAnalysis(a);
  assert.equal(out.plan, null);
  assert.equal(out.actionable, false);
  for (const c of out.candidates) for (const k of PRICE_KEYS) assert.ok(!(k in c), `candidate leaks ${k}`);
});

test("the internal analysis keeps the plan for diagnostics (only the API boundary removes it)", () => {
  const a = analyze(labelled(OPEN), OPEN, CFG);
  assert.ok(a.plan !== null, "internal analysis must still carry the plan");
});

test("TRADE (or any actionable case) keeps the plan and marks it actionable", () => {
  const a = analyze(labelled(NOON), NOON, CFG);
  const out: any = toApiAnalysis(a);
  if (a.status === "TRADE" && a.plan) {
    assert.equal(out.actionable, true);
    assert.equal(out.plan.entry, a.plan.entry);
    assert.equal(out.plan.stop, a.plan.stop);
  } else {
    assert.equal(out.plan, null, "non-TRADE at noon must not expose a plan");
  }
});

test("GET /api/analysis/nifty: non-TRADE responses never contain a plan or a plan-level price", async () => {
  const res = await analysisGet(new Request("http://localhost/api/analysis/nifty"), { params: Promise.resolve({ index: "nifty" }) } as any);
  assert.equal(res.status, 200);
  const body: any = await res.json();
  if (body.status !== "TRADE") {
    assert.equal(body.plan, null, `status ${body.status} exposed a plan`);
    for (const c of body.candidates ?? []) for (const k of PRICE_KEYS) assert.ok(!(k in c), `route candidate leaks ${k}`);
  }
  assert.equal(typeof body.actionable, "boolean");
});

test("recommendation response: WAIT gives no entry detail and no option premium on the contract", () => {
  const s = labelled(OPEN);
  const a = analyze(s, OPEN, CFG);
  const r: any = buildRecommendationResponse(a, OPEN);
  assert.notEqual(r.decision, "TRADE");
  assert.equal(r.entryDetail, null, "entryDetail must be null outside TRADE");
  assert.equal(r.execution, null, "execution levels must be null outside TRADE");
  if (r.contract) {
    assert.equal(r.contract.ltp, null);
    assert.equal(r.contract.bid, null);
    assert.equal(r.contract.ask, null);
  }
});

// F-R2 extension: the dashboard risk panel must not show lot counts, quantities or capital for a non-TRADE candidate.
import { toDashboardView } from "./dashboard.ts";
test("dashboard risk panel hides lots, quantity and capital outside TRADE, but keeps the approval status and reasons", () => {
  const a = analyze(labelled(OPEN), OPEN, CFG);
  const v: any = toDashboardView(a, CFG, OPEN.toISOString(), OPEN);
  assert.notEqual(a.status, "TRADE");
  for (const k of ["lots", "quantity", "totalRisk", "riskPercent", "capitalRequired"]) assert.equal(v.risk[k], null, `risk.${k} must be null outside TRADE`);
  assert.ok(typeof v.risk.approval === "string");
});
