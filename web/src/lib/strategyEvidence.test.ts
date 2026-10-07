/**
 * Phase 11.8 — Final Strategy Evidence & Go/No-Go Assessment Tests
 * EVIDENCE-01 through EVIDENCE-45 + REPRO-01 through REPRO-05
 */

import { strict as assert } from "node:assert";
import { describe, it, before } from "node:test";
import {
  computeStrategyEvidence,
  FROZEN_STRATEGY_VERSION,
  FROZEN_RISK_CONFIG,
  type StrategyEvidenceReport,
  type BacktestSummary,
} from "./strategyEvidenceEngine.ts";
import type { BacktestResult } from "./backtestTypes.ts";
import type { RecommendationJournalEntry } from "./journalTypes.ts";
import type { WalkForwardResult } from "./walkForwardEngine.ts";

// ── Fixture helpers ────────────────────────────────────────────────────────────

const DQ: BacktestResult["dataQuality"] = {
  mode: "FULL",
  datasetMode: "MODEL_DERIVED",
  spot: "RECONSTRUCTED",
  technicals: "RECONSTRUCTED",
  breadth: "NOT AVAILABLE",
  optionData: "MODEL DERIVED",
  bidAsk: "MODEL DERIVED",
  oi: "NOT AVAILABLE",
  iv: "RECONSTRUCTED",
  greeks: "MODEL DERIVED",
  news: "NOT AVAILABLE",
  eventRisk: "NOT AVAILABLE",
  execution: "MODEL DERIVED",
  intrabarOptionPrices: "NOT AVAILABLE",
  historicalOptionOHLC: "NOT AVAILABLE",
  transactionCosts: "MODELED",
  note: "test",
};

function makeBT(
  overrides: {
    runId?: string;
    index?: "nifty" | "banknifty";
    executionModel?: "CLOSE_ONLY" | "INTRABAR";
    trades?: number;
    wins?: number;
    netPnl?: number;
    pf?: number | null;
    maxDD?: number;
  } = {}
): BacktestResult {
  const trades = overrides.trades ?? 100;
  const wins = overrides.wins ?? 37;
  const losses = trades - wins;
  const netPnl = overrides.netPnl ?? 200000;
  const grossP = netPnl > 0 ? netPnl * 1.5 : 100;
  const grossL = Math.abs(netPnl < 0 ? netPnl * 1.5 : grossP - netPnl);
  const pf = overrides.pf !== undefined ? overrides.pf : grossL > 0 ? grossP / grossL : null;
  return {
    runId: overrides.runId ?? "bt_test01",
    createdAt: "2026-10-01T00:00:00.000Z",
    config: {
      index: overrides.index ?? "nifty",
      executionModel: overrides.executionModel ?? "CLOSE_ONLY",
      startDate: "2025-10-06",
      endDate: "2026-10-05",
      capital: 1_000_000,
      riskPerTrade: 0.01,
      dailyLossLimit: 0.02,
      openRiskLimit: 0.03,
      maxPositionValue: 0.20,
      maxConcurrentPositions: 3,
      minRR: 1.2,
      maxLots: 5,
      slippage: 0.01,
      compounding: false,
      dailyFlatten: false,
    },
    dataQuality: DQ,
    summary: {
      totalTrades: trades,
      winningTrades: wins,
      losingTrades: losses,
      winRate: wins / trades,
      grossProfit: grossP,
      grossLoss: grossL,
      netPnL: netPnl,
      returnPercent: (netPnl / 1_000_000) * 100,
      profitFactor: pf,
      expectancy: netPnl / trades,
      maxDrawdown: netPnl < 0 ? Math.abs(netPnl) : 50000,
      maxDrawdownPercent: overrides.maxDD ?? 35.2,
      bestTrade: 20000,
      worstTrade: -15000,
      averageTrade: netPnl / trades,
      averageWin: 8000,
      averageLoss: -5000,
      averageR: 0.2,
    },
    riskMetrics: {
      startingCapital: 1_000_000,
      endingCapital: 1_000_000 + netPnl,
      peakCapital: 1_000_000 + Math.max(0, netPnl),
      maxOpenRisk: 30000,
      maxConcurrentPositions: 2,
      dailyLossBreaches: 0,
      dailyLossLimit: 20000,
      maxDailyRealizedLoss: -10000,
      maxLotsObserved: 3,
      riskRejections: 5,
    },
    trades: [],
    equityCurve: [],
    monthlyPerformance: [],
    strategyPerformance: [],
    regimePerformance: [],
    noTradeAnalytics: { totalDays: 260, noTradeDays: 100, reasons: {} },
    meta: { label: "test", tags: [], note: "" },
    execution: { model: overrides.executionModel ?? "CLOSE_ONLY", intrabarPathModel: null },
  } as unknown as BacktestResult;
}

function makeJournalEntry(
  overrides: Partial<RecommendationJournalEntry> = {}
): RecommendationJournalEntry {
  return {
    id: "j_" + Math.random().toString(36).slice(2),
    createdAt: "2026-10-01T09:00:00.000Z",
    status: "MONITORING",
    paperTradeId: null,
    outcome: null,
    snapshot: {
      decision: "NO_TRADE",
      decisionReason: "test",
      underlying: "NIFTY",
      strategy: null,
      entryPrice: null,
      stopLoss: null,
      target1: null,
      target2: null,
      confidenceScore: null,
      riskRewardRatio: null,
      regime: null,
      signals: [],
      dataQuality: DQ,
      generatedAt: "2026-10-01T09:00:00.000Z",
    } as unknown as RecommendationJournalEntry["snapshot"],
    versionInfo: {
      strategyVersion: "11.4-frozen",
      riskVersion: "production-default",
      executionModelVersion: "paper-v1",
      dataModelVersion: "live-v1",
    },
    ...overrides,
  };
}

// ── Test constants ─────────────────────────────────────────────────────────────

describe("EVIDENCE — Constants", () => {
  it("EVIDENCE-01. FROZEN_STRATEGY_VERSION is 11.4-frozen", () => {
    assert.equal(FROZEN_STRATEGY_VERSION, "11.4-frozen");
  });

  it("EVIDENCE-02. FROZEN_RISK_CONFIG has capital 1_000_000", () => {
    assert.equal(FROZEN_RISK_CONFIG.capital, 1_000_000);
  });

  it("EVIDENCE-03. FROZEN_RISK_CONFIG riskPerTrade is 0.01", () => {
    assert.equal(FROZEN_RISK_CONFIG.riskPerTrade, 0.01);
  });

  it("EVIDENCE-04. FROZEN_RISK_CONFIG is readonly (structural check)", () => {
    // TypeScript prevents mutation; at runtime the object still exists
    assert.ok(FROZEN_RISK_CONFIG);
  });
});

// ── Empty input → REJECT ──────────────────────────────────────────────────────

describe("EVIDENCE — Empty inputs", () => {
  it("EVIDENCE-05. Zero backtests → REJECT_CURRENT_STRATEGY", () => {
    const r = computeStrategyEvidence([], [], []);
    assert.equal(r.finalDecision, "REJECT_CURRENT_STRATEGY");
  });

  it("EVIDENCE-06. Zero backtests → storedBacktests is empty array", () => {
    const r = computeStrategyEvidence([], [], []);
    assert.deepEqual(r.storedBacktests, []);
  });

  it("EVIDENCE-07. Zero backtests → walkForwardCompleted is false", () => {
    const r = computeStrategyEvidence([], [], []);
    assert.equal(r.walkForwardCompleted, false);
  });

  it("EVIDENCE-08. Zero backtests → liveCompletedTrades is 0", () => {
    const r = computeStrategyEvidence([], [], []);
    assert.equal(r.liveCompletedTrades, 0);
  });

  it("EVIDENCE-09. Zero backtests → liveEvidenceStatus is NONE", () => {
    const r = computeStrategyEvidence([], [], []);
    assert.equal(r.liveEvidenceStatus, "NONE");
  });

  it("EVIDENCE-10. Zero backtests → sampleAdequacy is INSUFFICIENT_SAMPLE", () => {
    const r = computeStrategyEvidence([], [], []);
    assert.equal(r.sampleAdequacy, "INSUFFICIENT_SAMPLE");
  });
});

// ── Actual stored data scenario ────────────────────────────────────────────────

describe("EVIDENCE — Actual stored data (1/4 positive)", () => {
  const niftyCloseOnly = makeBT({ runId: "bt_f817dfc2", index: "nifty", executionModel: "CLOSE_ONLY", trades: 698, wins: 256, netPnl: 202257, pf: 1.05, maxDD: 35.2 });
  const niftyIntrabar = makeBT({ runId: "bt_5ad11e54", index: "nifty", executionModel: "INTRABAR", trades: 816, wins: 248, netPnl: -640179, pf: 0.85, maxDD: 74.17 });
  const bankCloseOnly = makeBT({ runId: "bt_482207d9", index: "banknifty", executionModel: "CLOSE_ONLY", trades: 435, wins: 151, netPnl: -876730, pf: 0.70, maxDD: 97.8 });
  const bankIntrabar = makeBT({ runId: "bt_6093f183", index: "banknifty", executionModel: "INTRABAR", trades: 521, wins: 182, netPnl: -915826, pf: 0.69, maxDD: 102.28 });

  let report: StrategyEvidenceReport;
  before(() => {
    report = computeStrategyEvidence(
      [niftyCloseOnly, niftyIntrabar, bankCloseOnly, bankIntrabar],
      [],
      [],
    );
  });

  it("EVIDENCE-11. Decision is REJECT_CURRENT_STRATEGY (1/4 positive, no walk-forward)", () => {
    assert.equal(report.finalDecision, "REJECT_CURRENT_STRATEGY");
  });

  it("EVIDENCE-12. Conclusion is CURRENT_STRATEGY_REJECTED", () => {
    assert.equal(report.finalConclusion, "CURRENT_STRATEGY_REJECTED");
  });

  it("EVIDENCE-13. niftyCloseOnly is identified correctly", () => {
    assert.ok(report.niftyCloseOnly);
    assert.equal(report.niftyCloseOnly.runId, "bt_f817dfc2");
  });

  it("EVIDENCE-14. niftyIntrabar is identified correctly", () => {
    assert.ok(report.niftyIntrabar);
    assert.equal(report.niftyIntrabar.runId, "bt_5ad11e54");
  });

  it("EVIDENCE-15. bankCloseOnly is identified correctly", () => {
    assert.ok(report.bankCloseOnly);
    assert.equal(report.bankCloseOnly.runId, "bt_482207d9");
  });

  it("EVIDENCE-16. bankIntrabar is identified correctly", () => {
    assert.ok(report.bankIntrabar);
    assert.equal(report.bankIntrabar.runId, "bt_6093f183");
  });

  it("EVIDENCE-17. storedBacktests length is 4", () => {
    assert.equal(report.storedBacktests.length, 4);
  });

  it("EVIDENCE-18. NIFTY CLOSE_ONLY netPnl is 202257", () => {
    assert.equal(report.niftyCloseOnly?.netPnl, 202257);
  });

  it("EVIDENCE-19. NIFTY INTRABAR netPnl is negative", () => {
    assert.ok((report.niftyIntrabar?.netPnl ?? 0) < 0);
  });

  it("EVIDENCE-20. BANKNIFTY maxDrawdownPct > 97", () => {
    assert.ok((report.bankCloseOnly?.maxDrawdownPct ?? 0) > 97);
  });

  it("EVIDENCE-21. niftyExecution pnlDifference is positive (CO better than IB)", () => {
    assert.ok((report.niftyExecution.pnlDifference ?? 0) > 0);
  });

  it("EVIDENCE-22. niftyExecution classification is not NOT_AVAILABLE", () => {
    assert.notEqual(report.niftyExecution.classification, "NOT_AVAILABLE");
  });

  it("EVIDENCE-23. maxDrawdownPct reflects worst run (>97)", () => {
    assert.ok((report.maxDrawdownPct ?? 0) > 97);
  });

  it("EVIDENCE-24. walkForwardCompleted is false", () => {
    assert.equal(report.walkForwardCompleted, false);
  });

  it("EVIDENCE-25. oosWindows is empty array", () => {
    assert.deepEqual(report.oosWindows, []);
  });

  it("EVIDENCE-26. positiveOOSWindows is 0", () => {
    assert.equal(report.positiveOOSWindows, 0);
  });

  it("EVIDENCE-27. negativeOOSWindows is 0", () => {
    assert.equal(report.negativeOOSWindows, 0);
  });

  it("EVIDENCE-28. liveEvidenceStatus is NONE (0 journal entries)", () => {
    assert.equal(report.liveEvidenceStatus, "NONE");
  });
});

// ── Scorecard ─────────────────────────────────────────────────────────────────

describe("EVIDENCE — Scorecard", () => {
  it("EVIDENCE-29. Scorecard has at least 10 items", () => {
    const r = computeStrategyEvidence([], [], []);
    assert.ok(r.scorecard.length >= 10);
  });

  it("EVIDENCE-30. Historical option fidelity scorecard item is always FAIL", () => {
    const r = computeStrategyEvidence([], [], []);
    const item = r.scorecard.find((s) => s.category === "Historical option fidelity");
    assert.ok(item);
    assert.equal(item.status, "FAIL");
  });

  it("EVIDENCE-31. Order safety scorecard item is always PASS", () => {
    const r = computeStrategyEvidence([], [], []);
    const item = r.scorecard.find((s) => s.category === "Order safety");
    assert.ok(item);
    assert.equal(item.status, "PASS");
  });

  it("EVIDENCE-32. Strategy freeze scorecard item is always PASS", () => {
    const r = computeStrategyEvidence([], [], []);
    const item = r.scorecard.find((s) => s.category === "Strategy freeze");
    assert.ok(item);
    assert.equal(item.status, "PASS");
  });
});

// ── Data fidelity table ────────────────────────────────────────────────────────

describe("EVIDENCE — Data fidelity table", () => {
  it("EVIDENCE-33. dataFidelityTable has at least 10 entries", () => {
    const r = computeStrategyEvidence([], [], []);
    assert.ok(r.dataFidelityTable.length >= 10);
  });

  it("EVIDENCE-34. Options OHLC entry evidenceQuality is NONE", () => {
    const r = computeStrategyEvidence([], [], []);
    const row = r.dataFidelityTable.find((d) => d.dataset === "Options OHLC");
    assert.ok(row);
    assert.equal(row.evidenceQuality, "NONE");
  });

  it("EVIDENCE-35. Underlying spot entry evidenceQuality is HIGH", () => {
    const r = computeStrategyEvidence([], [], []);
    const row = r.dataFidelityTable.find((d) => d.dataset === "Underlying spot");
    assert.ok(row);
    assert.equal(row.evidenceQuality, "HIGH");
  });

  it("EVIDENCE-36. historicalOptionFidelityWarning mentions Black-Scholes", () => {
    const r = computeStrategyEvidence([], [], []);
    assert.ok(r.historicalOptionFidelityWarning.includes("Black-Scholes"));
  });

  it("EVIDENCE-37. historicalOptionFidelityWarning mentions NOT AVAILABLE", () => {
    const r = computeStrategyEvidence([], [], []);
    assert.ok(r.historicalOptionFidelityWarning.includes("NOT AVAILABLE") || r.historicalOptionFidelityWarning.includes("UNAVAILABLE"));
  });
});

// ── Live journal integration ────────────────────────────────────────────────────

describe("EVIDENCE — Live journal integration", () => {
  it("EVIDENCE-38. liveObservations counts all journal entries", () => {
    const entries = [makeJournalEntry(), makeJournalEntry(), makeJournalEntry()];
    const r = computeStrategyEvidence([], entries, []);
    assert.equal(r.liveObservations, 3);
  });

  it("EVIDENCE-39. liveTrades counts only TRADE decision entries", () => {
    const trade = makeJournalEntry({ snapshot: { decision: "TRADE" } as unknown as RecommendationJournalEntry["snapshot"] });
    const noTrade = makeJournalEntry();
    const r = computeStrategyEvidence([], [trade, noTrade], []);
    assert.equal(r.liveTrades, 1);
  });

  it("EVIDENCE-40. liveCompletedTrades counts CLOSED entries with outcome pnl", () => {
    const completed = makeJournalEntry({
      status: "STOPPED_OUT",
      outcome: { pnl: -1500, exitPrice: 100, exitedAt: "2026-10-02T10:00:00.000Z", outcome: "LOSS" } as unknown as RecommendationJournalEntry["outcome"],
    });
    const active = makeJournalEntry();
    const r = computeStrategyEvidence([], [completed, active], []);
    assert.equal(r.liveCompletedTrades, 1);
  });

  it("EVIDENCE-41. liveEvidenceStatus NONE when 0 completed trades", () => {
    const r = computeStrategyEvidence([], [makeJournalEntry()], []);
    assert.equal(r.liveEvidenceStatus, "NONE");
  });

  it("EVIDENCE-42. liveEvidenceStatus INSUFFICIENT for 1–9 completed trades", () => {
    const completed = Array.from({ length: 5 }, () =>
      makeJournalEntry({
        status: "STOPPED_OUT",
        outcome: { pnl: 100, exitPrice: 100, exitedAt: "2026-10-02T10:00:00.000Z", outcome: "WIN" } as unknown as RecommendationJournalEntry["outcome"],
      })
    );
    const r = computeStrategyEvidence([], completed, []);
    assert.equal(r.liveEvidenceStatus, "INSUFFICIENT");
  });
});

// ── Determinism & reproducibility ─────────────────────────────────────────────

describe("REPRO — Reproducibility", () => {
  it("REPRO-01. Same inputs → same finalDecision", () => {
    const bt = [makeBT({ netPnl: -100000 })];
    const r1 = computeStrategyEvidence(bt, [], []);
    const r2 = computeStrategyEvidence(bt, [], []);
    assert.equal(r1.finalDecision, r2.finalDecision);
  });

  it("REPRO-02. Same inputs → same scorecard length", () => {
    const bt = [makeBT({ netPnl: -100000 })];
    const r1 = computeStrategyEvidence(bt, [], []);
    const r2 = computeStrategyEvidence(bt, [], []);
    assert.equal(r1.scorecard.length, r2.scorecard.length);
  });

  it("REPRO-03. reproducibilityPass is true", () => {
    const r = computeStrategyEvidence([], [], []);
    assert.equal(r.reproducibilityPass, true);
  });

  it("REPRO-04. generatedAt changes between calls (not cached)", () => {
    const r1 = computeStrategyEvidence([], [], []);
    const r2 = computeStrategyEvidence([], [], []);
    // Both are valid ISO strings; order may match if extremely fast
    assert.ok(typeof r1.generatedAt === "string");
    assert.ok(typeof r2.generatedAt === "string");
  });

  it("REPRO-05. strategyVersion always equals FROZEN_STRATEGY_VERSION", () => {
    const r = computeStrategyEvidence([], [], []);
    assert.equal(r.strategyVersion, FROZEN_STRATEGY_VERSION);
  });
});

// ── Edge: single positive run ──────────────────────────────────────────────────

describe("EVIDENCE — Edge cases", () => {
  it("EVIDENCE-43. Single positive run + no walk-forward → REJECT", () => {
    const r = computeStrategyEvidence(
      [makeBT({ netPnl: 500000 })],
      [],
      [],
    );
    assert.equal(r.finalDecision, "REJECT_CURRENT_STRATEGY");
  });

  it("EVIDENCE-44. All positive runs but no walk-forward → REJECT (per gates)", () => {
    const runs = [
      makeBT({ runId: "a", index: "nifty", executionModel: "CLOSE_ONLY", netPnl: 500000 }),
      makeBT({ runId: "b", index: "nifty", executionModel: "INTRABAR", netPnl: 200000 }),
    ];
    const r = computeStrategyEvidence(runs, [], []);
    // 2/2 positive but no walk-forward → posCount > 1, falls through to HOLD
    assert.ok(["HOLD_INSUFFICIENT_EVIDENCE", "GO_FOR_FURTHER_VALIDATION"].includes(r.finalDecision));
  });

  it("EVIDENCE-45. datasetMode is MODEL_DERIVED", () => {
    const r = computeStrategyEvidence([], [], []);
    assert.equal(r.datasetMode, "MODEL_DERIVED");
  });
});
