// Opening rules for stored paper opportunities. Pure decision tests.
import test from "node:test";
import assert from "node:assert/strict";
import { decideOpen, type OpenFacts } from "./paperOpportunityOpen.ts";

const OK_PROV = { ok: true, labels: {}, reasons: [], capturedAt: "2026-11-13T05:00:00.000Z" };
const base = (over: Partial<OpenFacts> = {}): OpenFacts => ({
  opp: { status: "OPEN", openedPaperTradeId: null, instrumentType: "OPTION" },
  provenance: OK_PROV, hasPlan: true, planRejected: null,
  engine: { created: true, reason: "", tradeId: "T1" }, ...over,
});

test("successful opening when every gate passes", () => {
  const d = decideOpen(base());
  assert.equal(d.code, "OPENED");
  assert.equal(d.ok, true);
  assert.equal(d.status, 201);
});

test("missing opportunity is not found", () => {
  assert.equal(decideOpen(base({ opp: null })).code, "NOT_FOUND");
});

test("duplicate open is refused with 409 and the existing trade id", () => {
  const d = decideOpen(base({ opp: { status: "OPEN", openedPaperTradeId: "T0", instrumentType: "OPTION" } }));
  assert.equal(d.code, "ALREADY_OPENED");
  assert.equal(d.status, 409);
  assert.match(d.reasons[0], /T0/);
});

test("an opportunity that is no longer OPEN cannot be opened", () => {
  assert.equal(decideOpen(base({ opp: { status: "TARGET1_HIT", instrumentType: "OPTION" } })).code, "NOT_OPEN");
});

test("stock opportunities cannot be opened from the index snapshot", () => {
  assert.equal(decideOpen(base({ opp: { status: "OPEN", instrumentType: "STOCK" } })).code, "UNSUPPORTED");
});

test("mock, stale or unavailable evidence is refused with the provenance reasons", () => {
  const prov = { ok: false, labels: { market: "MOCK" }, reasons: ["market is MOCK (must be verified LIVE)"], capturedAt: null };
  const d = decideOpen(base({ provenance: prov }));
  assert.equal(d.code, "PROVENANCE");
  assert.match(d.reasons.join(" "), /MOCK/);
});

test("no server snapshot at all is refused (no spoofed LIVE)", () => {
  assert.equal(decideOpen(base({ provenance: null })).code, "PROVENANCE");
});

test("no trade plan from the fresh analysis is refused", () => {
  assert.equal(decideOpen(base({ hasPlan: false })).code, "NO_PLAN");
});

test("a plan rejected by the strategy's own checks is refused with its reason", () => {
  const d = decideOpen(base({ planRejected: "Bid-ask spread too wide on 25000 CE (7.1%)" }));
  assert.equal(d.code, "PLAN_REJECTED");
  assert.match(d.reasons[0], /spread/);
});

test("paper-engine risk or sizing refusal is returned as the engine reason, never as an opened trade", () => {
  const d = decideOpen(base({ engine: { created: false, reason: "RISK_REJECTED: exceeds 1% limit", tradeId: null } }));
  assert.equal(d.code, "ENGINE_REJECTED");
  assert.equal(d.ok, false);
  assert.match(d.reasons[0], /1% limit/);
});

test("an engine that was not consulted cannot open a trade", () => {
  assert.equal(decideOpen(base({ engine: null })).code, "ENGINE_REJECTED");
});
