import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateValidationOutcome,
  DECISION_MATRIX_THRESHOLDS,
  type ValidationMetrics,
  type ValidationOutcomeState,
} from "./decisionMatrix.ts";

// Helper creating a baseline valid metric set
function createMetrics(overrides: Partial<ValidationMetrics> = {}): ValidationMetrics {
  return {
    executedTradesCount: 75,
    completedValidSessions: 20,
    poweredSampleSize: 69,
    profitFactor: 1.65,
    winRatePercent: 68.0,
    maxDrawdownPercent: 1.8,
    singleSessionMaxLossPercent: 1.1,
    maxTradeRiskAllocationPercent: 0.75,
    maxTradeLossPercent: 0.75,
    netPnL: 5500,
    feedOutageSecondsTotal: 0,
    hacPValue: 0.02,
    hacRefutationPValue: 0.98,
    bootstrapConfidenceInterval: [0.005, 0.035],
    annualizedSharpe: 1.45,
    dataCorruptionDetected: false,
    ...overrides,
  };
}

test("Rank 1: OPERATIONAL_RISK_STOP takes absolute precedence over all other metrics", () => {
  // Even with stellar win rate, profit factor and statistical significance, risk violations halt execution
  const baseStellar = createMetrics({
    executedTradesCount: 100,
    profitFactor: 3.5,
    winRatePercent: 85.0,
    hacPValue: 0.0001,
    annualizedSharpe: 2.8,
  });

  // 1. Drawdown breach (> 3.00%)
  const ddBreach = evaluateValidationOutcome({ ...baseStellar, maxDrawdownPercent: 3.01 });
  assert.equal(ddBreach.state, "OPERATIONAL_RISK_STOP");
  assert.equal(ddBreach.rank, 1);
  assert.match(ddBreach.reason, /drawdown 3.01% breached limit 3%/);

  // Drawdown exact threshold (3.00% is allowed, 3.001% triggers stop)
  const ddExact = evaluateValidationOutcome({ ...baseStellar, maxDrawdownPercent: 3.00 });
  assert.notEqual(ddExact.state, "OPERATIONAL_RISK_STOP");

  // 2. Single session loss breach (> 2.00%)
  const sdlBreach = evaluateValidationOutcome({ ...baseStellar, singleSessionMaxLossPercent: 2.01 });
  assert.equal(sdlBreach.state, "OPERATIONAL_RISK_STOP");
  assert.equal(sdlBreach.rank, 1);
  assert.match(sdlBreach.reason, /Single session loss 2.01% breached limit 2%/);

  const sdlExact = evaluateValidationOutcome({ ...baseStellar, singleSessionMaxLossPercent: 2.00 });
  assert.notEqual(sdlExact.state, "OPERATIONAL_RISK_STOP");

  // 3. Frozen per-trade risk allocation breach (> 1.00%)
  const mtlBreach = evaluateValidationOutcome({ ...baseStellar, maxTradeRiskAllocationPercent: 1.01 });
  assert.equal(mtlBreach.state, "OPERATIONAL_RISK_STOP");
  assert.equal(mtlBreach.rank, 1);
  assert.match(mtlBreach.reason, /Trade risk allocation 1.01% breached frozen 1.0% limit/);

  // Legacy alias check
  const legacyMtlBreach = evaluateValidationOutcome({
    ...baseStellar,
    maxTradeRiskAllocationPercent: undefined,
    maxTradeLossPercent: 1.01,
  });
  assert.equal(legacyMtlBreach.state, "OPERATIONAL_RISK_STOP");
  assert.equal(legacyMtlBreach.rank, 1);

  const mtlExact = evaluateValidationOutcome({ ...baseStellar, maxTradeRiskAllocationPercent: 1.00 });
  assert.notEqual(mtlExact.state, "OPERATIONAL_RISK_STOP");

  // 4. Outage budget breach (> 180 seconds)
  const outageBreach = evaluateValidationOutcome({ ...baseStellar, feedOutageSecondsTotal: 181 });
  assert.equal(outageBreach.state, "OPERATIONAL_RISK_STOP");
  assert.equal(outageBreach.rank, 1);
  assert.match(outageBreach.reason, /Feed outage 181s breached 180s budget/);

  const outageExact = evaluateValidationOutcome({ ...baseStellar, feedOutageSecondsTotal: 180 });
  assert.notEqual(outageExact.state, "OPERATIONAL_RISK_STOP");

  // 5. Data corruption detected
  const corruption = evaluateValidationOutcome({ ...baseStellar, dataCorruptionDetected: true });
  assert.equal(corruption.state, "OPERATIONAL_RISK_STOP");
  assert.equal(corruption.rank, 1);
  assert.match(corruption.reason, /Unrecoverable market data corruption detected/);
});

test("Rank 5: INSUFFICIENT_SAMPLE_INCONCLUSIVE when N < 30 or T < 20", () => {
  // 1. Trades below minimum evaluable (N = 29, T = 20)
  const resN = evaluateValidationOutcome(createMetrics({
    executedTradesCount: 29,
    completedValidSessions: 20,
  }));
  assert.equal(resN.state, "INSUFFICIENT_SAMPLE_INCONCLUSIVE");
  assert.equal(resN.rank, 5);
  assert.match(resN.reason, /N=29 trades, T=20 sessions/);

  // 2. Sessions below minimum evaluable (N = 50, T = 19)
  const resT = evaluateValidationOutcome(createMetrics({
    executedTradesCount: 50,
    completedValidSessions: 19,
  }));
  assert.equal(resT.state, "INSUFFICIENT_SAMPLE_INCONCLUSIVE");
  assert.equal(resT.rank, 5);
  assert.match(resT.reason, /N=50 trades, T=19 sessions/);

  // 3. Exact threshold boundary (N = 30, T = 20) exits Rank 5
  const resExact = evaluateValidationOutcome(createMetrics({
    executedTradesCount: 30,
    completedValidSessions: 20,
    poweredSampleSize: 69,
  }));
  assert.notEqual(resExact.state, "INSUFFICIENT_SAMPLE_INCONCLUSIVE");
});

test("Underpowered branch (30 <= N < N_powered): Rank 3 vs Rank 4 exhaustive partition", () => {
  const N_p = 69;

  // Case A: Meets nominal benchmarks -> Rank 3 UNDERPOWERED_PRELIMINARY_PASS
  const pass = evaluateValidationOutcome(createMetrics({
    executedTradesCount: 45,
    poweredSampleSize: N_p,
    profitFactor: 1.55,
    winRatePercent: 66.0,
    netPnL: 2500,
  }));
  assert.equal(pass.state, "UNDERPOWERED_PRELIMINARY_PASS");
  assert.equal(pass.rank, 3);
  assert.match(pass.governanceAction, /GATED FROM PRODUCTION/);

  // Boundary on hurdles at underpowered sample (PF=1.50, WR=65.0%, net > 0)
  const exactHurdles = evaluateValidationOutcome(createMetrics({
    executedTradesCount: 45,
    poweredSampleSize: N_p,
    profitFactor: 1.50,
    winRatePercent: 65.0,
    netPnL: 0.01,
  }));
  assert.equal(exactHurdles.state, "UNDERPOWERED_PRELIMINARY_PASS");

  // Case B: Sub-target positive returns -> Rank 4 UNDERPOWERED_SUBTHRESHOLD_INCONCLUSIVE
  const subtarget = evaluateValidationOutcome(createMetrics({
    executedTradesCount: 45,
    poweredSampleSize: N_p,
    profitFactor: 1.49, // Just below 1.50
    winRatePercent: 65.0,
    netPnL: 1200,
  }));
  assert.equal(subtarget.state, "UNDERPOWERED_SUBTHRESHOLD_INCONCLUSIVE");
  assert.equal(subtarget.rank, 4);

  const subtargetWR = evaluateValidationOutcome(createMetrics({
    executedTradesCount: 45,
    poweredSampleSize: N_p,
    profitFactor: 1.55,
    winRatePercent: 64.9, // Just below 65.0%
    netPnL: 1200,
  }));
  assert.equal(subtargetWR.state, "UNDERPOWERED_SUBTHRESHOLD_INCONCLUSIVE");

  const zeroNet = evaluateValidationOutcome(createMetrics({
    executedTradesCount: 45,
    poweredSampleSize: N_p,
    profitFactor: 1.50,
    winRatePercent: 65.0,
    netPnL: 0.00, // Not strictly positive
  }));
  assert.equal(zeroNet.state, "UNDERPOWERED_SUBTHRESHOLD_INCONCLUSIVE");

  // Case C: Negative return without risk stop breach -> Rank 4 UNDERPOWERED_SUBTHRESHOLD_INCONCLUSIVE
  const underpoweredNegative = evaluateValidationOutcome(createMetrics({
    executedTradesCount: 45,
    poweredSampleSize: N_p,
    profitFactor: 0.88,
    winRatePercent: 48.0,
    netPnL: -1800,
    maxDrawdownPercent: 2.1, // Below 3.0% limit
    singleSessionMaxLossPercent: 1.3, // Below 2.0% limit
    maxTradeRiskAllocationPercent: 0.85, // Below 1.0% limit
  }));
  assert.equal(underpoweredNegative.state, "UNDERPOWERED_SUBTHRESHOLD_INCONCLUSIVE");
  assert.equal(underpoweredNegative.rank, 4);
  assert.match(underpoweredNegative.reason, /sub-target or mixed\/negative performance/);
  assert.match(underpoweredNegative.governanceAction, /live trading barred/);
});

test("Adequately Powered branch (N >= N_powered): Rank 2 VALIDATED_POWERED_PASS", () => {
  const N_p = 69;

  // Fully validated pass meeting all criteria
  const res = evaluateValidationOutcome(createMetrics({
    executedTradesCount: 75,
    poweredSampleSize: N_p,
    profitFactor: 1.70,
    winRatePercent: 67.5,
    annualizedSharpe: 1.50,
    hacPValue: 0.025,
    bootstrapConfidenceInterval: [0.004, 0.038],
    netPnL: 6000,
  }));
  assert.equal(res.state, "VALIDATED_POWERED_PASS");
  assert.equal(res.rank, 2);
  assert.match(res.governanceAction, /eligible for owner production review/);

  // Exact boundary tests for Rank 2:
  // Sharpe > 1.00 (1.001 passes, 1.00 fails -> drops to POWERED_EDGE_UNPROVEN)
  const sharpeBorderPass = evaluateValidationOutcome(createMetrics({
    annualizedSharpe: 1.001,
  }));
  assert.equal(sharpeBorderPass.state, "VALIDATED_POWERED_PASS");

  const sharpeBorderFail = evaluateValidationOutcome(createMetrics({
    annualizedSharpe: 1.000,
  }));
  assert.equal(sharpeBorderFail.state, "POWERED_EDGE_UNPROVEN");

  // p-value < 0.05 (0.049 passes, 0.050 fails)
  const pBorderPass = evaluateValidationOutcome(createMetrics({
    hacPValue: 0.049,
  }));
  assert.equal(pBorderPass.state, "VALIDATED_POWERED_PASS");

  const pBorderFail = evaluateValidationOutcome(createMetrics({
    hacPValue: 0.050,
  }));
  assert.equal(pBorderFail.state, "STATISTICALLY_INCONCLUSIVE");

  // CI lower bound > 0 (0.0001 passes, 0.000 fails)
  const ciBorderPass = evaluateValidationOutcome(createMetrics({
    bootstrapConfidenceInterval: [0.0001, 0.03],
  }));
  assert.equal(ciBorderPass.state, "VALIDATED_POWERED_PASS");

  const ciBorderFail = evaluateValidationOutcome(createMetrics({
    bootstrapConfidenceInterval: [0.0000, 0.03],
  }));
  assert.equal(ciBorderFail.state, "STATISTICALLY_INCONCLUSIVE");
});

test("Adequately Powered branch: Rank 7 STATISTICALLY_INCONCLUSIVE", () => {
  // Nominal hurdles pass (PF >= 1.5, WR >= 65%, Net > 0), but high variance fails significance
  const res = evaluateValidationOutcome(createMetrics({
    executedTradesCount: 80,
    profitFactor: 1.60,
    winRatePercent: 66.0,
    netPnL: 3500,
    hacPValue: 0.12, // Fails p < 0.05
    bootstrapConfidenceInterval: [-0.002, 0.045], // Zero in CI
  }));
  assert.equal(res.state, "STATISTICALLY_INCONCLUSIVE");
  assert.equal(res.rank, 7);
  assert.match(res.governanceAction, /STATISTICALLY VOID/);
});

test("Adequately Powered branch: Rank 8 EMPIRICAL_STRATEGY_REFUTATION", () => {
  // Net < 0, and statistically significant negative edge
  // Case A: via HAC refutation p-value < 0.05
  const resHac = evaluateValidationOutcome(createMetrics({
    executedTradesCount: 80,
    profitFactor: 0.72,
    winRatePercent: 42.0,
    netPnL: -4500,
    maxDrawdownPercent: 2.8,
    singleSessionMaxLossPercent: 1.8,
    maxTradeRiskAllocationPercent: 0.95,
    hacRefutationPValue: 0.015,
    bootstrapConfidenceInterval: [-0.06, 0.01],
  }));
  assert.equal(resHac.state, "EMPIRICAL_STRATEGY_REFUTATION");
  assert.equal(resHac.rank, 8);
  assert.match(resHac.reason, /statistically significant negative edge/);
  assert.match(resHac.governanceAction, /FORMAL REFUTATION/);

  // Case B: via Bootstrap CI upper bound < 0
  const resBootstrap = evaluateValidationOutcome(createMetrics({
    executedTradesCount: 80,
    profitFactor: 0.78,
    winRatePercent: 44.0,
    netPnL: -3200,
    maxDrawdownPercent: 2.4,
    singleSessionMaxLossPercent: 1.5,
    maxTradeRiskAllocationPercent: 0.90,
    hacRefutationPValue: 0.08,
    bootstrapConfidenceInterval: [-0.055, -0.002], // Strictly negative upper bound
  }));
  assert.equal(resBootstrap.state, "EMPIRICAL_STRATEGY_REFUTATION");
  assert.equal(resBootstrap.rank, 8);
});

test("Adequately Powered branch: Rank 6 POWERED_EDGE_UNPROVEN", () => {
  // Case A: Modest positive performance that fails nominal hurdles (e.g. PF = 1.30 < 1.50)
  const resPositiveSubtarget = evaluateValidationOutcome(createMetrics({
    executedTradesCount: 75,
    profitFactor: 1.30,
    winRatePercent: 58.0,
    netPnL: 1200,
  }));
  assert.equal(resPositiveSubtarget.state, "POWERED_EDGE_UNPROVEN");
  assert.equal(resPositiveSubtarget.rank, 6);
  assert.match(resPositiveSubtarget.reason, /failed to meet required profitability benchmarks/);
  assert.match(resPositiveSubtarget.governanceAction, /EDGE UNPROVEN/);

  // Case B: Mild negative performance where variance prevents formal refutation at p < 0.05
  const resNegativeInconclusive = evaluateValidationOutcome(createMetrics({
    executedTradesCount: 75,
    profitFactor: 0.92,
    winRatePercent: 49.0,
    netPnL: -900,
    maxDrawdownPercent: 1.9,
    singleSessionMaxLossPercent: 1.2,
    maxTradeRiskAllocationPercent: 0.7,
    hacRefutationPValue: 0.22,
    bootstrapConfidenceInterval: [-0.035, 0.015], // Zero enclosed
  }));
  assert.equal(resNegativeInconclusive.state, "POWERED_EDGE_UNPROVEN");
  assert.equal(resNegativeInconclusive.rank, 6);
});

test("Required Boundary Case: PF=1.50, Win Rate=65%, Sharpe=1.10, Net P&L=-₹100 maps to POWERED_EDGE_UNPROVEN", () => {
  // User boundary specification:
  // PF = 1.50 (meets hurdle)
  // Win rate = 65% (meets hurdle)
  // Sharpe = 1.10 (meets hurdle)
  // Net P&L = -₹100 (FAILS hurdle Net > 0!)
  // No operational risk breach
  // No statistically significant negative result
  const boundaryMetrics = createMetrics({
    executedTradesCount: 75,
    completedValidSessions: 20,
    poweredSampleSize: 69,
    profitFactor: 1.50,
    winRatePercent: 65.0,
    annualizedSharpe: 1.10,
    netPnL: -100, // Negative net P&L
    maxDrawdownPercent: 1.5,
    singleSessionMaxLossPercent: 0.8,
    maxTradeRiskAllocationPercent: 0.6,
    hacPValue: 0.25, // No positive significance
    hacRefutationPValue: 0.40, // No statistically significant negative result (p >= 0.05)
    bootstrapConfidenceInterval: [-0.02, 0.015], // Encloses zero; upper bound > 0
    feedOutageSecondsTotal: 0,
    dataCorruptionDetected: false,
  });

  const res = evaluateValidationOutcome(boundaryMetrics);
  assert.equal(res.state, "POWERED_EDGE_UNPROVEN");
  assert.equal(res.rank, 6);
  assert.match(res.reason, /Net P&L=-100.00 <= 0/);
  assert.equal(res.governanceAction, "EDGE UNPROVEN. Strategy failed to demonstrate a viable statistical edge; live trading prohibited.");
});

test("Formal statistical refutation cannot be swallowed by POWERED_EDGE_UNPROVEN", () => {
  // Scenario 1: Gross PF >= 1.00 (e.g. 1.05), but net P&L is negative (-₹2,500) and refutation p-value < 0.05
  const refutation1 = evaluateValidationOutcome(createMetrics({
    executedTradesCount: 80,
    poweredSampleSize: 69,
    profitFactor: 1.05, // Gross PF slightly > 1.00
    winRatePercent: 52.0,
    netPnL: -2500, // Strictly negative net return
    hacRefutationPValue: 0.02, // Statistically significant negative edge!
    bootstrapConfidenceInterval: [-0.05, 0.005],
  }));
  assert.equal(refutation1.state, "EMPIRICAL_STRATEGY_REFUTATION");
  assert.equal(refutation1.rank, 8);

  // Scenario 2: PF exactly 1.00, net P&L negative (-₹1,200), Bootstrap CI strictly negative (upper bound < 0)
  const refutation2 = evaluateValidationOutcome(createMetrics({
    executedTradesCount: 80,
    poweredSampleSize: 69,
    profitFactor: 1.00,
    winRatePercent: 50.0,
    netPnL: -1200,
    hacRefutationPValue: 0.10,
    bootstrapConfidenceInterval: [-0.045, -0.001], // Upper bound strictly negative!
  }));
  assert.equal(refutation2.state, "EMPIRICAL_STRATEGY_REFUTATION");
  assert.equal(refutation2.rank, 8);
});

test("Operational risk stops always take absolute precedence over statistical refutation and valid pass", () => {
  // Even if strategy is empirically refuted, a risk breach halts as OPERATIONAL_RISK_STOP
  const riskRefute = evaluateValidationOutcome(createMetrics({
    executedTradesCount: 80,
    profitFactor: 0.6,
    netPnL: -5000,
    hacRefutationPValue: 0.001,
    maxDrawdownPercent: 3.2, // Breached!
  }));
  assert.equal(riskRefute.state, "OPERATIONAL_RISK_STOP");
  assert.equal(riskRefute.rank, 1);

  // Ex-ante trade risk allocation breach (> 1.00%) takes precedence over stellar pass
  const riskAllocationBreach = evaluateValidationOutcome(createMetrics({
    executedTradesCount: 100,
    profitFactor: 2.5,
    winRatePercent: 75.0,
    netPnL: 10000,
    hacPValue: 0.001,
    annualizedSharpe: 2.0,
    bootstrapConfidenceInterval: [0.02, 0.08],
    maxTradeRiskAllocationPercent: 1.05, // Ex-ante sizing violation (> 1.00%)
  }));
  assert.equal(riskAllocationBreach.state, "OPERATIONAL_RISK_STOP");
  assert.equal(riskAllocationBreach.rank, 1);
  assert.match(riskAllocationBreach.reason, /Trade risk allocation 1.05% breached frozen 1.0% limit/);
});

test("Exhaustive Decision Table Verification across boundary combinations", () => {
  const reachedStates = new Set<ValidationOutcomeState>();

  const scenarios: ValidationMetrics[] = [
    // 1. Rank 1
    createMetrics({ maxDrawdownPercent: 3.5 }),
    // 2. Rank 2
    createMetrics({ executedTradesCount: 70, profitFactor: 1.6, winRatePercent: 66, annualizedSharpe: 1.2, hacPValue: 0.02, bootstrapConfidenceInterval: [0.01, 0.05] }),
    // 3. Rank 3
    createMetrics({ executedTradesCount: 40, poweredSampleSize: 70, profitFactor: 1.6, winRatePercent: 66, netPnL: 2000 }),
    // 4. Rank 4
    createMetrics({ executedTradesCount: 40, poweredSampleSize: 70, profitFactor: 0.9, winRatePercent: 45, netPnL: -1000 }),
    // 5. Rank 5
    createMetrics({ executedTradesCount: 25, completedValidSessions: 15 }),
    // 6. Rank 6
    createMetrics({ executedTradesCount: 75, profitFactor: 1.2, winRatePercent: 55, netPnL: 500 }),
    // 7. Rank 7
    createMetrics({ executedTradesCount: 75, profitFactor: 1.6, winRatePercent: 66, netPnL: 3000, hacPValue: 0.15 }),
    // 8. Rank 8
    createMetrics({ executedTradesCount: 75, profitFactor: 0.8, winRatePercent: 40, netPnL: -3000, hacRefutationPValue: 0.01 }),
  ];

  for (const s of scenarios) {
    const res = evaluateValidationOutcome(s);
    reachedStates.add(res.state);
  }

  assert.equal(reachedStates.size, 8, "All 8 states must be uniquely reachable");
  assert.ok(reachedStates.has("OPERATIONAL_RISK_STOP"));
  assert.ok(reachedStates.has("VALIDATED_POWERED_PASS"));
  assert.ok(reachedStates.has("UNDERPOWERED_PRELIMINARY_PASS"));
  assert.ok(reachedStates.has("UNDERPOWERED_SUBTHRESHOLD_INCONCLUSIVE"));
  assert.ok(reachedStates.has("INSUFFICIENT_SAMPLE_INCONCLUSIVE"));
  assert.ok(reachedStates.has("POWERED_EDGE_UNPROVEN"));
  assert.ok(reachedStates.has("STATISTICALLY_INCONCLUSIVE"));
  assert.ok(reachedStates.has("EMPIRICAL_STRATEGY_REFUTATION"));
});

test("Missing or null statistical metrics fail closed gracefully", () => {
  const missingHac = evaluateValidationOutcome(createMetrics({
    executedTradesCount: 80,
    hacPValue: null,
  }));
  assert.equal(missingHac.state, "STATISTICALLY_INCONCLUSIVE");

  const missingCI = evaluateValidationOutcome(createMetrics({
    executedTradesCount: 80,
    bootstrapConfidenceInterval: null,
  }));
  assert.equal(missingCI.state, "STATISTICALLY_INCONCLUSIVE");

  const missingSharpe = evaluateValidationOutcome(createMetrics({
    executedTradesCount: 80,
    annualizedSharpe: null,
  }));
  assert.equal(missingSharpe.state, "POWERED_EDGE_UNPROVEN");
});

test("Exhaustive Combinatorial Grid Sweep: Verifies no gaps, no fall-throughs, and single-state mapping", () => {
  // Test combinations across key domain axes:
  const netPnLValues = [5000, 0, -100, -2500];
  const pfValues = [0.8, 1.00, 1.30, 1.50, 1.80];
  const wrValues = [50.0, 65.0, 75.0];
  const sharpeValues = [0.8, 1.00, 1.2, null];
  const sampleSizes = [
    { N: 25, T: 15, N_p: 69, desc: "insufficient" },
    { N: 45, T: 20, N_p: 69, desc: "underpowered" },
    { N: 75, T: 20, N_p: 69, desc: "powered" },
  ];
  const statsVariants = [
    { p: 0.02, p_ref: 0.98, ci: [0.01, 0.04] as [number, number], desc: "sig_pos" },
    { p: 0.15, p_ref: 0.35, ci: [-0.01, 0.03] as [number, number], desc: "insig" },
    { p: 0.95, p_ref: 0.02, ci: [-0.05, -0.01] as [number, number], desc: "sig_neg" },
  ];

  let totalEvaluations = 0;

  for (const net of netPnLValues) {
    for (const pf of pfValues) {
      for (const wr of wrValues) {
        for (const sharpe of sharpeValues) {
          for (const s of sampleSizes) {
            for (const stat of statsVariants) {
              const m: ValidationMetrics = {
                executedTradesCount: s.N,
                completedValidSessions: s.T,
                poweredSampleSize: s.N_p,
                profitFactor: pf,
                winRatePercent: wr,
                netPnL: net,
                annualizedSharpe: sharpe,
                hacPValue: stat.p,
                hacRefutationPValue: stat.p_ref,
                bootstrapConfidenceInterval: stat.ci,
                maxDrawdownPercent: 1.5,
                singleSessionMaxLossPercent: 1.0,
                maxTradeRiskAllocationPercent: 0.7,
                feedOutageSecondsTotal: 0,
                dataCorruptionDetected: false,
              };

              const res = evaluateValidationOutcome(m);
              totalEvaluations++;

              // Verification 1: Must return a valid non-empty state
              assert.ok(res.state, "State must be populated");
              assert.ok(res.rank >= 1 && res.rank <= 8, `Rank must be 1..8, got ${res.rank}`);

              // Verification 2: Check sample insufficiency mapping
              if (s.desc === "insufficient") {
                assert.equal(res.state, "INSUFFICIENT_SAMPLE_INCONCLUSIVE");
                assert.equal(res.rank, 5);
                continue;
              }

              // Verification 3: Check underpowered branch mapping
              if (s.desc === "underpowered") {
                if (pf >= 1.50 && wr >= 65.0 && net > 0) {
                  assert.equal(res.state, "UNDERPOWERED_PRELIMINARY_PASS");
                  assert.equal(res.rank, 3);
                } else {
                  assert.equal(res.state, "UNDERPOWERED_SUBTHRESHOLD_INCONCLUSIVE");
                  assert.equal(res.rank, 4);
                }
                continue;
              }

              // Verification 4: Adequately powered branch
              if (s.desc === "powered") {
                const meetsNominal = pf >= 1.50 && wr >= 65.0 && net > 0;
                const meetsSharpe = sharpe !== null && sharpe > 1.00;
                const meetsSig = stat.p < 0.05 && stat.ci[0] > 0;
                const isRefuted = (net < 0 || pf < 1.00) && (stat.p_ref < 0.05 || stat.ci[1] < 0);

                if (meetsNominal && meetsSharpe && meetsSig) {
                  assert.equal(res.state, "VALIDATED_POWERED_PASS");
                  assert.equal(res.rank, 2);
                } else if (meetsNominal && !meetsSig) {
                  assert.equal(res.state, "STATISTICALLY_INCONCLUSIVE");
                  assert.equal(res.rank, 7);
                } else if (isRefuted) {
                  assert.equal(res.state, "EMPIRICAL_STRATEGY_REFUTATION");
                  assert.equal(res.rank, 8);
                } else {
                  assert.equal(res.state, "POWERED_EDGE_UNPROVEN");
                  assert.equal(res.rank, 6);
                }
              }
            }
          }
        }
      }
    }
  }

  // 4 net * 5 pf * 3 wr * 4 sharpe * 3 sample * 3 stat = 2,160 combinations
  assert.equal(totalEvaluations, 2160, "All 2,160 combinatorial grid scenarios must be evaluated");
});
