// Gate 2 Eight-State Outcome Decision Matrix Engine
// Codifies the mutually exclusive, exhaustive quantitative validation decision tree for Strategy 11.4.
// Enforces Rank 1 absolute operational risk precedence.

export type ValidationOutcomeState =
  | "OPERATIONAL_RISK_STOP"
  | "VALIDATED_POWERED_PASS"
  | "UNDERPOWERED_PRELIMINARY_PASS"
  | "UNDERPOWERED_SUBTHRESHOLD_INCONCLUSIVE"
  | "INSUFFICIENT_SAMPLE_INCONCLUSIVE"
  | "POWERED_EDGE_UNPROVEN"
  | "STATISTICALLY_INCONCLUSIVE"
  | "EMPIRICAL_STRATEGY_REFUTATION";

export interface ValidationMetrics {
  executedTradesCount: number;         // N_OOS: executed trades in Out-of-Sample
  completedValidSessions: number;       // T_OOS: valid trading sessions completed
  poweredSampleSize: number;            // N_powered: determined from In-Sample moments (Sessions 1–40)
  profitFactor: number;                 // Gross Gains / Gross Losses (0 if no gains, Infinity if no losses)
  winRatePercent: number;               // 0 to 100
  maxDrawdownPercent: number;           // Peak-to-trough equity decline as % (e.g., 2.5 means 2.5%)
  singleSessionMaxLossPercent: number;  // Worst single-day loss as % of capital (e.g., 1.5 means 1.5%)
  maxTradeRiskAllocationPercent?: number; // Ex-ante trade risk allocation (% of capital; limit: 1.00%)
  maxTradeLossPercent?: number;         // Single trade loss/risk % (legacy alias)
  netPnL: number;                       // Net realized P&L (currency amount or net % return)
  feedOutageSecondsTotal?: number;      // Total transport disconnection seconds
  hacPValue?: number | null;            // 1-tailed p-value testing H0: mu <= 0 (positive edge)
  hacRefutationPValue?: number | null;  // 1-tailed p-value testing H0: mu >= 0 (negative edge)
  bootstrapConfidenceInterval?: [number, number] | null; // 95% CI of mean net return [lower, upper]
  annualizedSharpe?: number | null;     // Annualized daily Sharpe ratio
  dataCorruptionDetected?: boolean;     // Flag indicating unrecoverable data corruption
}

export interface DecisionResult {
  state: ValidationOutcomeState;
  rank: number;
  reason: string;
  governanceAction: string;
  details: {
    N: number;
    T: number;
    N_powered: number;
    profitFactor: number;
    winRate: number;
    maxDrawdown: number;
    netPnL: number;
  };
}

// Frozen threshold constants for Strategy 11.4 Gate 2 Evaluation
export const DECISION_MATRIX_THRESHOLDS = {
  MIN_EVALUABLE_TRADES: 30,             // Lower bound for underpowered analysis
  MIN_OOS_SESSIONS: 20,                 // Standard Out-of-Sample duration (Sessions 41–60)
  MAX_ALLOWED_DRAWDOWN_PCT: 3.00,       // Operational risk stop ceiling
  MAX_ALLOWED_SINGLE_DAY_LOSS_PCT: 2.00,// Operational risk daily stop
  MAX_ALLOWED_TRADE_RISK_PCT: 1.00,     // Inviolable 1.0% per-trade risk limit
  MAX_ALLOWED_FEED_OUTAGE_SEC: 180,     // Outage budget limit
  TARGET_PROFIT_FACTOR: 1.50,           // Hurdle for pass
  TARGET_WIN_RATE_PCT: 65.0,            // Hurdle for pass
  TARGET_ANNUALIZED_SHARPE: 1.00,       // Hurdle for pass
  SIGNIFICANCE_ALPHA: 0.05,             // 5% 1-tailed statistical hurdle
} as const;

/**
 * Evaluates Out-of-Sample validation metrics against the 8-state decision matrix.
 * Evaluates strictly in rank-order precedence (Rank 1 through Rank 8).
 * Guarantees that every admissible outcome maps to exactly one mutually exclusive state.
 */
export function evaluateValidationOutcome(metrics: ValidationMetrics): DecisionResult {
  const t = DECISION_MATRIX_THRESHOLDS;
  const N = metrics.executedTradesCount;
  const T = metrics.completedValidSessions;
  const N_p = metrics.poweredSampleSize;
  const pf = metrics.profitFactor;
  const wr = metrics.winRatePercent;
  const dd = metrics.maxDrawdownPercent;
  const sdl = metrics.singleSessionMaxLossPercent;
  const tradeRisk = metrics.maxTradeRiskAllocationPercent ?? metrics.maxTradeLossPercent ?? 0;
  const net = metrics.netPnL;
  const outage = metrics.feedOutageSecondsTotal ?? 0;
  const corrupt = metrics.dataCorruptionDetected ?? false;

  const baseDetails = {
    N,
    T,
    N_powered: N_p,
    profitFactor: pf,
    winRate: wr,
    maxDrawdown: dd,
    netPnL: net,
  };

  // ───────────────────────────────────────────────────────────────────────────
  // RANK 1: OPERATIONAL RISK STOP (ABSOLUTE PRECEDENCE OVER STATISTICAL METRICS)
  // ───────────────────────────────────────────────────────────────────────────
  if (
    dd > t.MAX_ALLOWED_DRAWDOWN_PCT ||
    sdl > t.MAX_ALLOWED_SINGLE_DAY_LOSS_PCT ||
    tradeRisk > t.MAX_ALLOWED_TRADE_RISK_PCT ||
    outage > t.MAX_ALLOWED_FEED_OUTAGE_SEC ||
    corrupt
  ) {
    const reasons: string[] = [];
    if (dd > t.MAX_ALLOWED_DRAWDOWN_PCT) reasons.push(`Max drawdown ${dd.toFixed(2)}% breached limit ${t.MAX_ALLOWED_DRAWDOWN_PCT}%`);
    if (sdl > t.MAX_ALLOWED_SINGLE_DAY_LOSS_PCT) reasons.push(`Single session loss ${sdl.toFixed(2)}% breached limit ${t.MAX_ALLOWED_SINGLE_DAY_LOSS_PCT}%`);
    if (tradeRisk > t.MAX_ALLOWED_TRADE_RISK_PCT) reasons.push(`Trade risk allocation ${tradeRisk.toFixed(2)}% breached frozen 1.0% limit`);
    if (outage > t.MAX_ALLOWED_FEED_OUTAGE_SEC) reasons.push(`Feed outage ${outage}s breached ${t.MAX_ALLOWED_FEED_OUTAGE_SEC}s budget`);
    if (corrupt) reasons.push(`Unrecoverable market data corruption detected`);

    return {
      state: "OPERATIONAL_RISK_STOP",
      rank: 1,
      reason: reasons.join("; "),
      governanceAction: "IMMEDIATE SHUTDOWN. Halt testing to preserve capital; fail closed; investigate risk breach.",
      details: baseDetails,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // RANK 5: INSUFFICIENT SAMPLE INCONCLUSIVE (Sample Below Evaluable Hurdle)
  // Checked next because statistical benchmarks cannot be calculated below N < 30 or T < 20
  // ───────────────────────────────────────────────────────────────────────────
  if (N < t.MIN_EVALUABLE_TRADES || T < t.MIN_OOS_SESSIONS) {
    return {
      state: "INSUFFICIENT_SAMPLE_INCONCLUSIVE",
      rank: 5,
      reason: `Executed sample (N=${N} trades, T=${T} sessions) is below minimal evaluable thresholds (N>=${t.MIN_EVALUABLE_TRADES}, T>=${t.MIN_OOS_SESSIONS})`,
      governanceAction: "INCONCLUSIVE. Insufficient market trade opportunities observed; extend collection campaign across active market regimes.",
      details: baseDetails,
    };
  }

  // Helper flags for performance benchmarks
  const meetsNominalBenchmarks =
    pf >= t.TARGET_PROFIT_FACTOR &&
    wr >= t.TARGET_WIN_RATE_PCT &&
    net > 0;

  const meetsSharpe =
    metrics.annualizedSharpe !== null &&
    metrics.annualizedSharpe !== undefined &&
    metrics.annualizedSharpe > t.TARGET_ANNUALIZED_SHARPE;

  const meetsHacSignificance =
    metrics.hacPValue !== null &&
    metrics.hacPValue !== undefined &&
    metrics.hacPValue < t.SIGNIFICANCE_ALPHA;

  const meetsBootstrapSignificance =
    metrics.bootstrapConfidenceInterval !== null &&
    metrics.bootstrapConfidenceInterval !== undefined &&
    metrics.bootstrapConfidenceInterval[0] > 0;

  // ───────────────────────────────────────────────────────────────────────────
  // UNDERPOWERED BRANCH: 30 <= N < N_powered (T >= 20, No Risk Breach)
  // ───────────────────────────────────────────────────────────────────────────
  if (N < N_p) {
    if (meetsNominalBenchmarks) {
      return {
        state: "UNDERPOWERED_PRELIMINARY_PASS",
        rank: 3,
        reason: `Promising preliminary performance (PF=${pf.toFixed(2)}, WR=${wr.toFixed(1)}%), but sample size N=${N} is underpowered (< N_powered=${N_p})`,
        governanceAction: "GATED FROM PRODUCTION. Positive preliminary edge; authorize prospective extension to reach N_powered.",
        details: baseDetails,
      };
    }

    // Covers all other underpowered outcomes: sub-target positive returns, flat, or negative returns that did not breach risk stops
    return {
      state: "UNDERPOWERED_SUBTHRESHOLD_INCONCLUSIVE",
      rank: 4,
      reason: `Underpowered sample (N=${N} < N_powered=${N_p}) exhibits sub-target or mixed/negative performance (PF=${pf.toFixed(2)}, Net=${net.toFixed(2)}) without risk breach`,
      governanceAction: "INCONCLUSIVE. Sample size insufficient to confirm or refute edge; live trading barred.",
      details: baseDetails,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // ADEQUATELY POWERED BRANCH: N >= N_powered (T >= 20, No Risk Breach)
  // ───────────────────────────────────────────────────────────────────────────

  // Check Rank 2: Full Validated Powered Pass
  if (
    meetsNominalBenchmarks &&
    meetsSharpe &&
    meetsHacSignificance &&
    meetsBootstrapSignificance
  ) {
    return {
      state: "VALIDATED_POWERED_PASS",
      rank: 2,
      reason: `Strategy satisfies formal statistical power (N=${N}>=${N_p}), performance benchmarks (PF=${pf.toFixed(2)}, WR=${wr.toFixed(1)}%, Sharpe=${metrics.annualizedSharpe?.toFixed(2)}), and p < 0.05`,
      governanceAction: "VALIDATED. Strategy demonstrates statistically sound positive edge; eligible for owner production review.",
      details: baseDetails,
    };
  }

  // Check Rank 7: Statistically Inconclusive (Nominally passes benchmarks, but fails significance)
  if (meetsNominalBenchmarks && (!meetsHacSignificance || !meetsBootstrapSignificance)) {
    return {
      state: "STATISTICALLY_INCONCLUSIVE",
      rank: 7,
      reason: `Performance meets nominal hurdles (PF=${pf.toFixed(2)}, WR=${wr.toFixed(1)}%), but high variance prevents statistical confidence (HAC p=${metrics.hacPValue?.toFixed(3)}, CI=[${metrics.bootstrapConfidenceInterval?.join(", ")}])`,
      governanceAction: "STATISTICALLY VOID. Cannot reject null hypothesis of zero edge at alpha=0.05; gated from production.",
      details: baseDetails,
    };
  }

  // Check Rank 8: Empirical Strategy Refutation (Statistically significant negative edge)
  const isNetNegativeLoss = pf < 1.00 || net < 0;
  const isStatisticallySignificantNegative =
    (metrics.hacRefutationPValue !== null &&
      metrics.hacRefutationPValue !== undefined &&
      metrics.hacRefutationPValue < t.SIGNIFICANCE_ALPHA) ||
    (metrics.bootstrapConfidenceInterval !== null &&
      metrics.bootstrapConfidenceInterval !== undefined &&
      metrics.bootstrapConfidenceInterval[1] < 0);

  if (isNetNegativeLoss && isStatisticallySignificantNegative) {
    return {
      state: "EMPIRICAL_STRATEGY_REFUTATION",
      rank: 8,
      reason: `Adequately powered sample (N=${N}>=${N_p}) proves a statistically significant negative edge (PF=${pf.toFixed(2)}, Net=${net.toFixed(2)}, p_refute < 0.05) under live transaction friction`,
      governanceAction: "FORMAL REFUTATION. Strategy 11.4 rejected permanently on empirical grounds. Strategy closed.",
      details: baseDetails,
    };
  }

  // Check Rank 6: Powered Edge Unproven (All other adequately powered outcomes: sub-target positive returns, or negative returns without statistical refutation)
  const failureReasons: string[] = [];
  if (pf < t.TARGET_PROFIT_FACTOR) failureReasons.push(`PF=${pf.toFixed(2)} < ${t.TARGET_PROFIT_FACTOR.toFixed(2)}`);
  if (wr < t.TARGET_WIN_RATE_PCT) failureReasons.push(`WR=${wr.toFixed(1)}% < ${t.TARGET_WIN_RATE_PCT.toFixed(1)}%`);
  if (net <= 0) failureReasons.push(`Net P&L=${net.toFixed(2)} <= 0`);
  if (metrics.annualizedSharpe !== null && metrics.annualizedSharpe !== undefined && metrics.annualizedSharpe <= t.TARGET_ANNUALIZED_SHARPE) {
    failureReasons.push(`Sharpe=${metrics.annualizedSharpe.toFixed(2)} <= ${t.TARGET_ANNUALIZED_SHARPE.toFixed(2)}`);
  }
  const reasonDesc = failureReasons.length > 0 ? failureReasons.join(", ") : `PF=${pf.toFixed(2)}, WR=${wr.toFixed(1)}%, Net=${net.toFixed(2)}`;

  return {
    state: "POWERED_EDGE_UNPROVEN",
    rank: 6,
    reason: `Adequately powered sample (N=${N}>=${N_p}) failed to meet required profitability benchmarks (${reasonDesc})`,
    governanceAction: "EDGE UNPROVEN. Strategy failed to demonstrate a viable statistical edge; live trading prohibited.",
    details: baseDetails,
  };
}
