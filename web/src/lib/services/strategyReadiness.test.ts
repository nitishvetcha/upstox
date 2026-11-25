import test from "node:test";
import assert from "node:assert/strict";
import { createPaperOpportunity } from "./paperOpportunityMonitor.ts";
import { buildStrategyReadiness, PAPER_READINESS_REQUIREMENTS } from "./strategyReadiness.ts";
import type { PaperOpportunity } from "./paperOpportunityStore.ts";

function completed(input: { underlying: string; instrumentType?: "OPTION" | "STOCK"; r: number; regime?: string; provenance?: "LIVE_COLLECTOR" | "FIXTURE"; source?: "LIVE" | "MOCK" }): PaperOpportunity {
  const option = input.instrumentType !== "STOCK";
  return {
    ...createPaperOpportunity({
      instrumentType: input.instrumentType ?? "OPTION", underlying: input.underlying, symbol: option ? null : input.underlying,
      instrumentKey: "TEST", optionType: option ? "CE" : null, strike: option ? 100 : null, expiry: option ? "2099-01-01" : null,
      strategyType: "TEST", direction: "BULLISH", entry: 100, stop: 90, target1: 115, target2: 120,
      score: 80, confidence: 80, grade: "A", regime: input.regime ?? "TEST", reasons: [], strategyVersion: "test",
      source: input.source ?? "LIVE", provenance: input.provenance ?? "LIVE_COLLECTOR",
    }),
    status: "TARGET2_HIT", realizedR: input.r, closedAt: new Date(1_000 + Math.random() * 1_000).toISOString(),
  };
}

test("readiness separates assets and excludes non-live-paper records", () => {
  const report = buildStrategyReadiness([
    completed({ underlying: "NIFTY", r: 1 }),
    completed({ underlying: "CRUDEOIL", r: 1 }),
    completed({ underlying: "CRUDEOIL", r: 10, provenance: "FIXTURE" }),
    completed({ underlying: "NATURALGAS", r: 10, source: "MOCK" }),
    completed({ underlying: "RELIANCE", instrumentType: "STOCK", r: -1 }),
  ]);
  assert.equal(report.find((r) => r.strategy === "INDEX_OPTIONS")?.completedTrades, 0);
  assert.equal(report.find((r) => r.strategy === "INDEX_OPTIONS")?.quarantinedTrades, 1);
  assert.equal(report.find((r) => r.strategy === "MCX_CRUDEOIL")?.completedTrades, 0);
  assert.equal(report.find((r) => r.strategy === "MCX_CRUDEOIL")?.quarantinedTrades, 1);
  assert.equal(report.find((r) => r.strategy === "MCX_CRUDEOIL")?.excludedRecords, 1);
  assert.equal(report.find((r) => r.strategy === "MCX_NATURALGAS")?.completedTrades, 0);
  assert.equal(report.find((r) => r.strategy === "EQUITY_STOCKS")?.completedTrades, 0);
  assert.equal(report.find((r) => r.strategy === "INDEX_OPTIONS")?.setups[0]?.setup, "TEST");
});

test("a new setup remains quarantined until it has thirty verified outcomes", () => {
  const records = Array.from({ length: PAPER_READINESS_REQUIREMENTS.setupQuarantineTrades - 1 }, () => completed({ underlying: "NIFTY", r: 1 }));
  const index = buildStrategyReadiness(records).find((r) => r.strategy === "INDEX_OPTIONS")!;
  assert.equal(index.completedTrades, 0);
  assert.equal(index.quarantinedTrades, PAPER_READINESS_REQUIREMENTS.setupQuarantineTrades - 1);
  assert.equal(index.setups[0]?.status, "INSUFFICIENT_SAMPLE");
});

test("paper evidence is never real-money approval, even after every paper gate passes", () => {
  const regimes = ["BULLISH", "BEARISH", "RANGE"];
  const records = [
    ...Array.from({ length: PAPER_READINESS_REQUIREMENTS.minimumCompletedTrades - 10 }, (_, index) => completed({ underlying: "NIFTY", r: 1, regime: regimes[index % regimes.length] })),
    ...Array.from({ length: 10 }, () => completed({ underlying: "NIFTY", r: -0.5 })),
  ];
  const index = buildStrategyReadiness(records).find((r) => r.strategy === "INDEX_OPTIONS")!;
  assert.equal(index.verdict, "PAPER_EVIDENCE_SUFFICIENT");
  assert.equal(index.realMoneyEligible, false);
});
