// End-to-end, offline: snapshot → strategy analysis → recommendation diagnostic → paper engine → ledger report.
// Deterministic: fixed clocks, in-memory engines, no network, no files. The "LIVE" inputs here are LABELS on synthetic
// prices. They prove the plumbing, not that any live data was observed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mockSnapshotTradeInputs as mockSnapshot } from "./testFixtures/mockSnapshotTradeInputs.ts";
import { analyze } from "./engine/strategy.ts";
import { diagnose } from "./recommendationDiagnostic.ts";
import { PaperTradingEngine } from "./paperEngine.ts";
import { buildPaperLedgerReport, reconcileLedger } from "./paperReport.ts";
import { tradeFreshnessOf } from "./time.ts";
import type { Snapshot } from "./types.ts";

const CAPITAL = 500_000;
const NOW = new Date("2026-10-05T07:00:00Z"); // Mon 12:30 IST
const WED = new Date("2026-10-28T04:00:00Z"); // Wed 09:30 IST

function labelled(index: "nifty" | "banknifty", now: Date, source: "LIVE" | "MOCK"): Snapshot {
  const s = structuredClone(mockSnapshot(index, now));
  if (source === "MOCK") return s;
  const lastTradeTime = new Date(now.getTime() - 5_000).toISOString();
  const info = { source: tradeFreshnessOf(lastTradeTime, now).source, provider: "UPSTOX" as const, fetchedAt: now.toISOString(), lastTradeTime };
  s.sources = { market: { ...info }, optionChain: { ...info }, technical: { ...info }, news: { ...info }, breadth: { ...info } };
  s.fallbackReason = null;
  return s;
}

test("E2E-1. MOCK inputs: the chain fails closed — no executable decision, the paper engine refuses, the label stays MOCK", () => {
  const a = analyze(mockSnapshot("nifty", NOW), NOW, { accountCapital: CAPITAL }, undefined);
  const d = diagnose(a, NOW);
  assert.equal(d.finalDecision, "NO_TRADE");
  assert.equal(d.freshness.overall, "MOCK");
  const engine = new PaperTradingEngine({ accountCapital: CAPITAL }, { allowMock: false });
  const r = engine.processRecommendation(a, NOW);
  assert.equal(r.created, false);
  assert.match(r.reason, /FRESHNESS_BLOCKED: Market data source is MOCK/);
  assert.equal(engine.getTrades().length, 0, "nothing is recorded for a refused mock signal");
});

test("E2E-2. labelled-LIVE inputs: diagnostic and paper engine agree, the position is sized on the net basis, and the ledger reconciles", () => {
  const snap = labelled("nifty", NOW, "LIVE");
  const a = analyze(snap, NOW, { accountCapital: CAPITAL }, undefined);
  assert.equal(a.status, "TRADE");
  const d = diagnose(a, NOW);
  assert.equal(d.finalDecision, "TRADE", "no blocker stands between a TRADE and an executable diagnostic");
  assert.equal(d.freshness.overall, "LIVE");

  const engine = new PaperTradingEngine({ accountCapital: CAPITAL }, { allowMock: false });
  const r = engine.processRecommendation(a, NOW);
  assert.equal(r.created, true, r.reason);
  const t = r.trade!;
  assert.equal(t.riskAssessmentSnapshot.fixedCostsInr, 70.8, "per-trade brokerage and GST, paid once (Plus research fallback)");
  assert.ok(t.riskAmount <= 0.01 * CAPITAL + 1, `risk ${t.riskAmount} within the 1% trade limit`);
  assert.ok(engine.getEvents(t.id).some((e) => e.event === "PAPER_TRADE_OPENED"));
  const report = buildPaperLedgerReport(engine.getTrades());
  assert.equal(report.counts.open, 1);
  assert.deepEqual(reconcileLedger(engine.getTrades(), engine.getEvents()).issues, []);
});

test("E2E-3. the net reward-to-risk gate reaches the operator: a gross-passing candidate is refused, and the diagnostic names the reason", () => {
  const snap = labelled("banknifty", WED, "LIVE");
  const a = analyze(snap, WED);
  const d = diagnose(a, WED);
  assert.notEqual(d.finalDecision, "TRADE");
  const reasons = d.blockers.map((b) => b.message).join(" | ");
  assert.match(reasons, /Net risk\/reward after slippage and charge/, "the net ratio is visible to the operator");
});
