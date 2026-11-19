import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.PAPER_OPPORTUNITY_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "opp-claim-"));
const store = await import("./paperOpportunityStore.ts");

function makeOpp(id: string, extra: Record<string, unknown> = {}) {
  store.savePaperOpportunity({
    id, createdAt: "2026-10-05T07:00:00.000Z", updatedAt: "2026-10-05T07:00:00.000Z", source: "LIVE",
    instrumentType: "OPTION", underlying: "NIFTY", symbol: null, instrumentKey: null, optionType: "CE", strike: 22000,
    expiry: null, strategyType: "X", direction: "BULLISH", entry: 100, stop: 80, target1: 140, target2: 180,
    riskPerUnit: 20, rewardToTarget1: 40, rewardToTarget2: 80, rrTarget1: 2, rrTarget2: 4,
    spotAtEntry: null, iv: null, delta: null, oi: null, volume: null, spread: null, atr: null,
    score: 1, confidence: 1, grade: "C", signalAgreement: 1, regime: "X", eventRisk: null, reasons: [], reasonCodes: [],
    strategyVersion: "v", status: "OPEN", openedAt: "2026-10-05T07:00:00.000Z", closedAt: null,
    exitPrice: null, exitReason: null, realizedPnl: null, realizedR: null, mfe: null, mae: null, mfeR: null, maeR: null,
    underlyingEntry: null, underlyingExit: null, underlyingMfe: null, underlyingMae: null, durationSeconds: null,
    events: [], ...extra,
  } as never);
}

const T0 = new Date("2026-10-05T07:00:00Z");
const at = (sec: number) => new Date(T0.getTime() + sec * 1000);

test("a fresh claim blocks a second claim; releasing lets the next one through", () => {
  makeOpp("a1");
  const first = store.claimOpportunityOpening("a1", T0);
  assert.ok(first, "first claim granted");
  assert.equal(store.claimOpportunityOpening("a1", at(10)), null, "second claim refused while held");
  store.releaseOpportunityOpening("a1", first!);
  assert.ok(store.claimOpportunityOpening("a1", at(11)), "claimable again after release");
});

test("an expired claim (older than 120 s) is recovered", () => {
  makeOpp("a2");
  assert.ok(store.claimOpportunityOpening("a2", T0));
  assert.equal(store.claimOpportunityOpening("a2", at(119)), null, "still held just before expiry");
  assert.ok(store.claimOpportunityOpening("a2", at(121)), "recovered after expiry");
});

test("an already-linked opportunity can never be claimed", () => {
  makeOpp("a3", { openedPaperTradeId: "pt_1" });
  assert.equal(store.claimOpportunityOpening("a3", T0), null);
});

test("a missing opportunity cannot be claimed", () => {
  assert.equal(store.claimOpportunityOpening("does-not-exist", T0), null);
});

test("an expired request cannot release a newer claim; the newer holder can release its own", () => {
  makeOpp("a4");
  const requestA = store.claimOpportunityOpening("a4", T0);            // A takes the claim
  assert.ok(requestA);
  const requestB = store.claimOpportunityOpening("a4", at(121));       // A's claim expired; B takes a new one
  assert.ok(requestB, "B acquires after A's claim expired");
  assert.notEqual(requestB, requestA, "each claim has its own id");

  store.releaseOpportunityOpening("a4", requestA!);                    // A finishes late and tries to release
  assert.equal(store.getPaperOpportunity("a4")!.openingClaimId, requestB, "B's claim survives A's release");
  assert.equal(store.claimOpportunityOpening("a4", at(122)), null, "a third request is still blocked by B");

  store.releaseOpportunityOpening("a4", requestB!);                    // B releases its own
  assert.equal(store.getPaperOpportunity("a4")!.openingClaimId ?? null, null, "B's own release clears the claim");
  assert.ok(store.claimOpportunityOpening("a4", at(123)), "claimable after B releases");
});
