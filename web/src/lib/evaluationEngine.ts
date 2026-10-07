// Phase 11.5 — Statistical evaluation layer over the genuine recommendation journal.
// PURPOSE: measure, not optimize. Every metric is descriptive; small-sample guards prevent false confidence.
import type { RecommendationJournalEntry } from "./journalTypes.ts";

const r2 = (n: number) => Math.round(n * 100) / 100;

// ── Types ─────────────────────────────────────────────────────────────────────

export type SampleAdequacy =
  | "INSUFFICIENT_SAMPLE"   // 0–9 completed trades
  | "EARLY_SAMPLE"          // 10–29
  | "DEVELOPING_SAMPLE"     // 30–49
  | "MEANINGFUL_SAMPLE"     // 50–99
  | "STRONGER_SAMPLE";      // 100+

export type EvidenceClassification =
  | "INSUFFICIENT_SAMPLE"
  | "DESCRIPTIVE_ONLY"
  | "EARLY_EVIDENCE"
  | "DEVELOPING_EVIDENCE"
  | "MIXED_EVIDENCE"
  | "NEGATIVE_EVIDENCE"
  | "POSITIVE_BUT_UNSTABLE"
  | "PRELIMINARY_SUPPORT";

export interface EvaluationFilters {
  strategyVersion?: string;  // default "11.4-frozen"
  underlying?: string;
  strategy?: string;
  decision?: string;
  regime?: string;
  startDate?: string;
  endDate?: string;
  confidenceMin?: number;
  confidenceMax?: number;
}

export interface DataQualityReport {
  totalRecords: number;
  tradeDecisions: number;
  waitDecisions: number;
  noTradeDecisions: number;
  completedTrades: number;
  openTrades: number;
  expiredTrades: number;
  invalidRecords: number;
  excludedByVersion: number;
  excludedByFilter: number;
  strategyVersionCounts: Record<string, number>;
  oldestTimestamp: string | null;
  newestTimestamp: string | null;
}

export interface BootstrapResult {
  estimate: number;
  ci95Lower: number;
  ci95Upper: number;
}

export interface WilsonCI {
  lower: number;
  upper: number;
  label: "HIGH_UNCERTAINTY" | "MODERATE_UNCERTAINTY" | "REASONABLE";
}

export interface BreakdownSlice {
  observations: number;
  completedTrades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  avgR: number | null;
  netPnl: number | null;
  profitFactor: number | null;
  sampleAdequacy: SampleAdequacy;
}

export interface DrawdownMetrics {
  peakEquity: number | null;
  currentEquity: number | null;
  drawdown: number | null;
  maxDrawdown: number | null;
  maxDrawdownPct: number | null;
  label: "LIVE JOURNAL EQUITY";
}

export interface PerformanceMetrics {
  n: number;
  wins: number;
  losses: number;
  winRate: number | null;
  lossRate: number | null;
  winRateCI: WilsonCI | null;
  winRateBootstrap: BootstrapResult | null;
  grossProfit: number | null;
  grossLoss: number | null;
  netPnl: number | null;
  profitFactor: number | null;
  expectancyPnl: number | null;    // ₹ expectancy
  expectancyR: number | null;      // R expectancy
  avgWin: number | null;
  avgLoss: number | null;
  medianWin: number | null;
  medianLoss: number | null;
  largestWin: number | null;
  largestLoss: number | null;
  winLossRatio: number | null;
  avgR: number | null;
  medianR: number | null;
  minR: number | null;
  maxR: number | null;
  stdR: number | null;
  rGtZero: number;
  rEqZero: number;
  rLtZero: number;
  rLeNeg1: number;
  rGePos1: number;
  avgRBootstrap: BootstrapResult | null;
  expectancyBootstrap: BootstrapResult | null;
  sharpe: number | null;
  sortino: number | null;
  calmar: number | null;
  sharpeLabel: string | null;
  sortinoLabel: string | null;
  calmarLabel: string | null;
  drawdown: DrawdownMetrics;
  maxConsecLosses: number;
  maxConsecWins: number;
  outlierContributionLargestWin: number | null;   // % of net P&L
  outlierContributionLargestLoss: number | null;
  netPnlExLargestWin: number | null;
  netPnlExLargestLoss: number | null;
}

export interface EvaluationReport {
  generatedAt: string;
  status: SampleAdequacy;
  evidenceClassification: EvidenceClassification;
  evidenceReason: string;
  strategyVersion: string;
  filters: EvaluationFilters;
  dataQuality: DataQualityReport;
  performance: PerformanceMetrics;
  byUnderlying: Record<string, BreakdownSlice>;
  byOptionType: Record<string, BreakdownSlice>;
  byStrategy: Record<string, BreakdownSlice>;
  byRegime: Record<string, BreakdownSlice>;
  byConfidenceBucket: Record<string, BreakdownSlice>;
  byRRBucket: Record<string, BreakdownSlice>;
  byWeekday: Record<string, BreakdownSlice>;
  byMonth: Record<string, BreakdownSlice>;
  byEventRisk: { present: BreakdownSlice; absent: BreakdownSlice };
  recentVsEarlier: { earlier: BreakdownSlice | null; recent: BreakdownSlice | null; note: string };
}

// ── Pure math helpers ─────────────────────────────────────────────────────────

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function bootstrap(values: number[], fn: (v: number[]) => number, iterations = 1000, seed = 42): BootstrapResult {
  const rng = lcg(seed);
  const n = values.length;
  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const s = Array.from({ length: n }, () => values[Math.floor(rng() * n)]);
    samples.push(fn(s));
  }
  samples.sort((a, b) => a - b);
  return {
    estimate: fn(values),
    ci95Lower: r2(samples[Math.floor(0.025 * iterations)]),
    ci95Upper: r2(samples[Math.floor(0.975 * iterations)]),
  };
}

function wilsonCI(wins: number, n: number): WilsonCI {
  const z = 1.96;
  const p = wins / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  const lower = r2(Math.max(0, center - margin) * 100);
  const upper = r2(Math.min(1, center + margin) * 100);
  const width = upper - lower;
  const label: WilsonCI["label"] = n < 15 ? "HIGH_UNCERTAINTY" : width > 30 ? "MODERATE_UNCERTAINTY" : "REASONABLE";
  return { lower, upper, label };
}

function median(arr: number[]): number | null {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? r2((s[m - 1] + s[m]) / 2) : r2(s[m]);
}

function mean(arr: number[]): number | null {
  if (!arr.length) return null;
  return r2(arr.reduce((s, v) => s + v, 0) / arr.length);
}

function stddev(arr: number[]): number | null {
  if (arr.length < 2) return null;
  const m = arr.reduce((s, v) => s + v, 0) / arr.length;
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1);
  return r2(Math.sqrt(variance));
}

// ── Sample adequacy & evidence classification ─────────────────────────────────

export function classifySampleAdequacy(completedTrades: number): SampleAdequacy {
  if (completedTrades < 10) return "INSUFFICIENT_SAMPLE";
  if (completedTrades < 30) return "EARLY_SAMPLE";
  if (completedTrades < 50) return "DEVELOPING_SAMPLE";
  if (completedTrades < 100) return "MEANINGFUL_SAMPLE";
  return "STRONGER_SAMPLE";
}

function classifyEvidence(
  completedTrades: number,
  winRate: number | null,
  netPnl: number | null,
  avgR: number | null,
  profitFactor: number | null,
): { classification: EvidenceClassification; reason: string } {
  if (completedTrades < 10) return { classification: "INSUFFICIENT_SAMPLE", reason: "Fewer than 10 completed trades" };
  if (completedTrades < 30) {
    // Max EARLY_EVIDENCE at this range
    if (netPnl !== null && netPnl < 0) return { classification: "EARLY_EVIDENCE", reason: "Early sample; net P&L negative but insufficient for verdict" };
    return { classification: "EARLY_EVIDENCE", reason: "10–29 completed trades — descriptive only, no strategy verdict possible" };
  }
  if (completedTrades < 50) {
    if (netPnl !== null && netPnl < 0 && profitFactor !== null && profitFactor < 0.8) {
      return { classification: "NEGATIVE_EVIDENCE", reason: "Developing sample; net P&L negative with low profit factor" };
    }
    return { classification: "DEVELOPING_EVIDENCE", reason: "30–49 completed trades — developing sample, not final validation" };
  }
  if (completedTrades < 100) {
    if (netPnl !== null && netPnl < 0) return { classification: "NEGATIVE_EVIDENCE", reason: "50–99 trades; net P&L negative" };
    if (winRate !== null && winRate < 30 && avgR !== null && avgR < 0) return { classification: "NEGATIVE_EVIDENCE", reason: "Low win rate and negative average R" };
    if (winRate !== null && winRate > 50 && avgR !== null && avgR > 0 && profitFactor !== null && profitFactor > 1.2) {
      return { classification: "PRELIMINARY_SUPPORT", reason: "50–99 trades with positive metrics — preliminary support only, not a live-trading verdict" };
    }
    if (winRate !== null && avgR !== null && ((winRate > 40 && avgR < 0) || (winRate < 50 && avgR > 0))) {
      return { classification: "MIXED_EVIDENCE", reason: "Conflicting win rate and R metrics" };
    }
    return { classification: "DESCRIPTIVE_ONLY", reason: "50–99 trades — insufficient stability evidence" };
  }
  // 100+
  if (netPnl !== null && netPnl < 0) return { classification: "NEGATIVE_EVIDENCE", reason: "100+ trades; net P&L negative" };
  if (winRate !== null && avgR !== null && profitFactor !== null && winRate > 45 && avgR > 0.2 && profitFactor > 1.3) {
    return { classification: "PRELIMINARY_SUPPORT", reason: "100+ trades with consistently positive metrics — preliminary support" };
  }
  return { classification: "DEVELOPING_EVIDENCE", reason: "100+ trades but stability criteria not fully met" };
}

// ── Eligibility ───────────────────────────────────────────────────────────────

const CLOSED_STATUSES = new Set(["STOPPED_OUT", "TARGET_1_HIT", "TARGET_2_HIT", "EXPIRED", "CANCELLED", "INVALIDATED"]);

export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
}

export function checkEligibility(entry: RecommendationJournalEntry, targetVersion: string): EligibilityResult {
  if (entry.snapshot.decision !== "TRADE") return { eligible: false, reason: "NOT_TRADE" };
  const ex = entry.snapshot.execution;
  if (!ex) return { eligible: false, reason: "MISSING_EXECUTION" };
  if (!ex.entry || ex.entry <= 0) return { eligible: false, reason: "INVALID_ENTRY" };
  if (!ex.plannedRisk || ex.plannedRisk <= 0) return { eligible: false, reason: "INVALID_PLANNED_RISK" };
  if (!CLOSED_STATUSES.has(entry.status)) return { eligible: false, reason: "NOT_COMPLETED" };
  if (!entry.versionInfo) return { eligible: false, reason: "MISSING_VERSION_INFO" };
  if (entry.versionInfo.strategyVersion !== targetVersion) return { eligible: false, reason: `WRONG_VERSION:${entry.versionInfo.strategyVersion}` };
  if (!entry.outcome) return { eligible: false, reason: "MISSING_OUTCOME" };
  if (entry.outcome.pnl === null) return { eligible: false, reason: "NULL_PNL" };
  if (entry.outcome.exitPrice === null) return { eligible: false, reason: "NULL_EXIT_PRICE" };
  if (!entry.createdAt) return { eligible: false, reason: "MISSING_TIMESTAMP" };
  return { eligible: true };
}

// ── Drawdown ──────────────────────────────────────────────────────────────────

function computeDrawdown(pnlSeries: number[]): DrawdownMetrics {
  if (!pnlSeries.length) {
    return { peakEquity: null, currentEquity: null, drawdown: null, maxDrawdown: null, maxDrawdownPct: null, label: "LIVE JOURNAL EQUITY" };
  }
  let equity = 0;
  let peak = 0;
  let maxDD = 0;
  let maxDDPct = 0;
  for (const pnl of pnlSeries) {
    equity += pnl;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDD) {
      maxDD = dd;
      maxDDPct = peak > 0 ? r2((dd / peak) * 100) : 0;
    }
  }
  return {
    peakEquity: r2(peak),
    currentEquity: r2(equity),
    drawdown: r2(peak - equity),
    maxDrawdown: r2(maxDD),
    maxDrawdownPct: maxDDPct,
    label: "LIVE JOURNAL EQUITY",
  };
}

// ── Streak analysis ───────────────────────────────────────────────────────────

function computeStreaks(pnls: number[]): { maxConsecWins: number; maxConsecLosses: number } {
  let maxW = 0, maxL = 0, curW = 0, curL = 0;
  for (const p of pnls) {
    if (p > 0) { curW++; curL = 0; maxW = Math.max(maxW, curW); }
    else { curL++; curW = 0; maxL = Math.max(maxL, curL); }
  }
  return { maxConsecWins: maxW, maxConsecLosses: maxL };
}

// ── Breakdown builder ─────────────────────────────────────────────────────────

function breakdownSlice(
  observations: number,
  eligible: Array<{ pnl: number; rMultiple: number | null }>,
): BreakdownSlice {
  const completed = eligible.length;
  const wins = eligible.filter((e) => e.pnl > 0);
  const losses = eligible.filter((e) => e.pnl <= 0);
  const winRate = completed ? r2((wins.length / completed) * 100) : null;
  const rs = eligible.map((e) => e.rMultiple).filter((r) => r !== null) as number[];
  const avgR = rs.length ? mean(rs) : null;
  const netPnl = completed ? r2(eligible.reduce((s, e) => s + e.pnl, 0)) : null;
  const grossProfit = wins.reduce((s, e) => s + e.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, e) => s + e.pnl, 0));
  const profitFactor = grossLoss > 0 ? r2(grossProfit / grossLoss) : null;
  return {
    observations,
    completedTrades: completed,
    wins: wins.length,
    losses: losses.length,
    winRate,
    avgR,
    netPnl,
    profitFactor,
    sampleAdequacy: classifySampleAdequacy(completed),
  };
}

// ── Confidence bucket ─────────────────────────────────────────────────────────

function confidenceBucket(score: number): string {
  if (score < 50) return "0-49";
  if (score < 60) return "50-59";
  if (score < 70) return "60-69";
  if (score < 80) return "70-79";
  if (score < 90) return "80-89";
  return "90-100";
}

// ── R:R bucket ────────────────────────────────────────────────────────────────

function rrBucket(rr: number): string {
  if (rr < 1.5) return "<1.5";
  if (rr < 2.0) return "1.5-2.0";
  if (rr < 3.0) return "2.0-3.0";
  return ">3.0";
}

// ── Empty breakdown placeholder ────────────────────────────────────────────────

function emptySlice(): BreakdownSlice {
  return { observations: 0, completedTrades: 0, wins: 0, losses: 0, winRate: null, avgR: null, netPnl: null, profitFactor: null, sampleAdequacy: "INSUFFICIENT_SAMPLE" };
}

// ── Main evaluation ───────────────────────────────────────────────────────────

export function computeEvaluation(entries: RecommendationJournalEntry[], filters: EvaluationFilters = {}): EvaluationReport {
  const targetVersion = filters.strategyVersion ?? "11.4-frozen";
  const now = new Date().toISOString();

  // 1. Apply date/underlying/etc filters to full observation set
  const filtered = entries.filter((e) => {
    if (filters.startDate && e.createdAt < filters.startDate) return false;
    if (filters.endDate && e.createdAt > filters.endDate) return false;
    if (filters.underlying && e.snapshot.underlying !== filters.underlying) return false;
    if (filters.decision && e.snapshot.decision !== filters.decision) return false;
    if (filters.regime && e.snapshot.market.regime !== filters.regime) return false;
    if (filters.strategy && e.snapshot.strategy !== filters.strategy) return false;
    if (filters.confidenceMin !== undefined && e.snapshot.confidence < filters.confidenceMin) return false;
    if (filters.confidenceMax !== undefined && e.snapshot.confidence > filters.confidenceMax) return false;
    return true;
  });

  // 2. Data quality report
  const versionCounts: Record<string, number> = {};
  let tradeCount = 0, waitCount = 0, noTradeCount = 0;
  let completedCount = 0, openCount = 0, expiredCount = 0;
  let invalidCount = 0, excludedByVersion = 0, excludedByFilter = 0;
  let oldest: string | null = null, newest: string | null = null;

  for (const e of filtered) {
    const sv = e.versionInfo?.strategyVersion ?? "unknown";
    versionCounts[sv] = (versionCounts[sv] ?? 0) + 1;
    if (!oldest || e.createdAt < oldest) oldest = e.createdAt;
    if (!newest || e.createdAt > newest) newest = e.createdAt;

    if (e.snapshot.decision === "TRADE") tradeCount++;
    else if (e.snapshot.decision === "WAIT") waitCount++;
    else noTradeCount++;

    if (e.snapshot.decision === "TRADE") {
      const elig = checkEligibility(e, targetVersion);
      if (elig.eligible) {
        completedCount++;
        if (e.status === "EXPIRED") expiredCount++;
      } else if (elig.reason === "NOT_COMPLETED") {
        openCount++;
      } else if (elig.reason?.startsWith("WRONG_VERSION") || elig.reason === "MISSING_VERSION_INFO") {
        excludedByVersion++;
      } else if (elig.reason === "NOT_TRADE") {
        // won't happen here
      } else {
        invalidCount++;
      }
    }
  }

  // Excluded by filter = entries in full set minus filtered (approximate)
  excludedByFilter = entries.length - filtered.length;

  const dataQuality: DataQualityReport = {
    totalRecords: filtered.length,
    tradeDecisions: tradeCount,
    waitDecisions: waitCount,
    noTradeDecisions: noTradeCount,
    completedTrades: completedCount,
    openTrades: openCount,
    expiredTrades: expiredCount,
    invalidRecords: invalidCount,
    excludedByVersion,
    excludedByFilter,
    strategyVersionCounts: versionCounts,
    oldestTimestamp: oldest,
    newestTimestamp: newest,
  };

  // 3. Collect eligible completed trade data (chronological)
  const eligibleEntries = filtered
    .filter((e) => checkEligibility(e, targetVersion).eligible)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const pnls = eligibleEntries.map((e) => e.outcome!.pnl!);
  const rMults = eligibleEntries.map((e) => e.outcome!.rMultiple);
  const rMulValid = rMults.filter((r) => r !== null) as number[];

  const n = eligibleEntries.length;
  const sampleAdequacy = classifySampleAdequacy(n);

  // 4. Performance metrics (guard with null for insufficient data)
  let perf: PerformanceMetrics;

  if (n === 0) {
    perf = {
      n: 0, wins: 0, losses: 0,
      winRate: null, lossRate: null, winRateCI: null, winRateBootstrap: null,
      grossProfit: null, grossLoss: null, netPnl: null, profitFactor: null,
      expectancyPnl: null, expectancyR: null,
      avgWin: null, avgLoss: null, medianWin: null, medianLoss: null,
      largestWin: null, largestLoss: null, winLossRatio: null,
      avgR: null, medianR: null, minR: null, maxR: null, stdR: null,
      rGtZero: 0, rEqZero: 0, rLtZero: 0, rLeNeg1: 0, rGePos1: 0,
      avgRBootstrap: null, expectancyBootstrap: null,
      sharpe: null, sortino: null, calmar: null,
      sharpeLabel: "INSUFFICIENT_SAMPLE", sortinoLabel: "INSUFFICIENT_SAMPLE", calmarLabel: "NOT_AVAILABLE",
      drawdown: computeDrawdown([]),
      maxConsecLosses: 0, maxConsecWins: 0,
      outlierContributionLargestWin: null, outlierContributionLargestLoss: null,
      netPnlExLargestWin: null, netPnlExLargestLoss: null,
    };
  } else {
    const wins = pnls.filter((p) => p > 0);
    const losses = pnls.filter((p) => p <= 0);
    const winCount = wins.length;
    const lossCount = losses.length;
    const winRate = r2((winCount / n) * 100);
    const lossRate = r2((lossCount / n) * 100);
    const grossProfit = r2(wins.reduce((s, v) => s + v, 0));
    const grossLoss = r2(Math.abs(losses.reduce((s, v) => s + v, 0)));
    const netPnl = r2(grossProfit - grossLoss);
    const profitFactor = grossLoss > 0 ? r2(grossProfit / grossLoss) : null;
    const expectancyPnl = mean(pnls);
    const expectancyR = rMulValid.length ? mean(rMulValid) : null;
    const avgWin = wins.length ? mean(wins) : null;
    const avgLoss = losses.length ? mean(losses) : null;
    const medianWin = wins.length ? median(wins) : null;
    const medianLoss = losses.length ? median(losses) : null;
    const largestWin = wins.length ? Math.max(...wins) : null;
    const largestLoss = losses.length ? Math.min(...losses) : null;  // most negative
    const winLossRatio = avgWin !== null && avgLoss !== null && avgLoss !== 0 ? r2(Math.abs(avgWin / avgLoss)) : null;
    const avgR = rMulValid.length ? mean(rMulValid) : null;
    const medianR = rMulValid.length ? median(rMulValid) : null;
    const minR = rMulValid.length ? r2(Math.min(...rMulValid)) : null;
    const maxR = rMulValid.length ? r2(Math.max(...rMulValid)) : null;
    const stdR = rMulValid.length >= 2 ? stddev(rMulValid) : null;
    const rGtZero = rMulValid.filter((r) => r > 0).length;
    const rEqZero = rMulValid.filter((r) => r === 0).length;
    const rLtZero = rMulValid.filter((r) => r < 0).length;
    const rLeNeg1 = rMulValid.filter((r) => r <= -1).length;
    const rGePos1 = rMulValid.filter((r) => r >= 1).length;

    const winRateCI = n >= 1 ? wilsonCI(winCount, n) : null;
    const winRateBootstrap = n >= 5
      ? bootstrap(pnls, (s) => r2((s.filter((v) => v > 0).length / s.length) * 100))
      : null;
    const avgRBootstrap = rMulValid.length >= 5
      ? bootstrap(rMulValid, (s) => r2(s.reduce((a, v) => a + v, 0) / s.length))
      : null;
    const expectancyBootstrap = pnls.length >= 5
      ? bootstrap(pnls, (s) => r2(s.reduce((a, v) => a + v, 0) / s.length))
      : null;

    // Sharpe/Sortino: min 30 trades, per-trade R-Sharpe
    let sharpe: number | null = null;
    let sortino: number | null = null;
    let sharpeLabel = "INSUFFICIENT_SAMPLE";
    let sortinoLabel = "INSUFFICIENT_SAMPLE";
    if (n >= 30 && rMulValid.length >= 30) {
      const m = rMulValid.reduce((s, v) => s + v, 0) / rMulValid.length;
      const sd = stddev(rMulValid);
      if (sd !== null && sd > 0) { sharpe = r2(m / sd); sharpeLabel = "per-trade R-Sharpe (not annualised)"; }
      const downside = rMulValid.filter((r) => r < 0);
      if (downside.length >= 2) {
        const dsMean = downside.reduce((s, v) => s + v, 0) / downside.length;
        const dsVar = downside.reduce((s, v) => s + (v - dsMean) ** 2, 0) / (downside.length - 1);
        const dsSd = Math.sqrt(dsVar);
        if (dsSd > 0) { sortino = r2(m / dsSd); sortinoLabel = "per-trade R-Sortino (not annualised)"; }
      }
    }

    // Calmar: requires capital baseline — not available
    const calmar: number | null = null;
    const calmarLabel = "NOT_AVAILABLE — no capital baseline";

    const drawdown = computeDrawdown(pnls);
    const { maxConsecWins, maxConsecLosses } = computeStreaks(pnls);

    // Outlier contribution
    const outlierContributionLargestWin = largestWin !== null && netPnl !== 0
      ? r2((largestWin / netPnl) * 100) : null;
    const outlierContributionLargestLoss = largestLoss !== null && netPnl !== 0
      ? r2((largestLoss / netPnl) * 100) : null;
    const netPnlExLargestWin = largestWin !== null ? r2(netPnl - largestWin) : null;
    const netPnlExLargestLoss = largestLoss !== null ? r2(netPnl - largestLoss) : null;

    perf = {
      n, wins: winCount, losses: lossCount,
      winRate, lossRate, winRateCI, winRateBootstrap,
      grossProfit, grossLoss, netPnl, profitFactor,
      expectancyPnl, expectancyR,
      avgWin, avgLoss, medianWin, medianLoss, largestWin, largestLoss, winLossRatio,
      avgR, medianR, minR, maxR, stdR,
      rGtZero, rEqZero, rLtZero, rLeNeg1, rGePos1,
      avgRBootstrap, expectancyBootstrap,
      sharpe, sortino, calmar,
      sharpeLabel, sortinoLabel, calmarLabel,
      drawdown,
      maxConsecLosses, maxConsecWins,
      outlierContributionLargestWin, outlierContributionLargestLoss,
      netPnlExLargestWin, netPnlExLargestLoss,
    } as PerformanceMetrics;
  }

  // 5. Evidence classification
  const { classification: evidenceClassification, reason: evidenceReason } = classifyEvidence(
    n, perf.winRate, perf.netPnl, perf.avgR, perf.profitFactor,
  );

  // 6. Breakdown helper
  function sliceFor(subset: RecommendationJournalEntry[], obsCount: number): BreakdownSlice {
    const elig = subset
      .filter((e) => checkEligibility(e, targetVersion).eligible)
      .map((e) => ({ pnl: e.outcome!.pnl!, rMultiple: e.outcome!.rMultiple }));
    return breakdownSlice(obsCount, elig);
  }

  // 7. Per-underlying
  const byUnderlying: Record<string, BreakdownSlice> = {};
  const underlyings = new Set(filtered.map((e) => e.snapshot.underlying));
  for (const u of underlyings) {
    const sub = filtered.filter((e) => e.snapshot.underlying === u);
    byUnderlying[u] = sliceFor(sub, sub.length);
  }

  // 8. Call vs Put
  const byOptionType: Record<string, BreakdownSlice> = {};
  for (const ot of ["CE", "PE"]) {
    const sub = eligibleEntries.filter((e) => e.snapshot.contract?.optionType === ot);
    const obs = filtered.filter((e) => e.snapshot.contract?.optionType === ot).length;
    byOptionType[ot] = breakdownSlice(obs, sub.map((e) => ({ pnl: e.outcome!.pnl!, rMultiple: e.outcome!.rMultiple })));
  }

  // 9. Strategy breakdown
  const byStrategy: Record<string, BreakdownSlice> = {};
  const strategies = new Set(filtered.filter((e) => e.snapshot.decision === "TRADE").map((e) => e.snapshot.strategy));
  for (const s of strategies) {
    const sub = filtered.filter((e) => e.snapshot.strategy === s);
    byStrategy[s] = sliceFor(sub, sub.length);
  }

  // 10. Regime breakdown
  const byRegime: Record<string, BreakdownSlice> = {};
  const regimes = new Set(filtered.map((e) => e.snapshot.market.regime).filter(Boolean));
  for (const reg of regimes) {
    const sub = filtered.filter((e) => e.snapshot.market.regime === reg);
    byRegime[reg] = sliceFor(sub, sub.length);
  }

  // 11. Confidence bucket
  const byConfidenceBucket: Record<string, BreakdownSlice> = {};
  for (const e of filtered) {
    const bucket = confidenceBucket(e.snapshot.confidence);
    if (!byConfidenceBucket[bucket]) byConfidenceBucket[bucket] = emptySlice();
    byConfidenceBucket[bucket].observations++;
    if (checkEligibility(e, targetVersion).eligible) {
      const b = byConfidenceBucket[bucket];
      const pnl = e.outcome!.pnl!;
      const rm = e.outcome!.rMultiple;
      b.completedTrades++;
      if (pnl > 0) b.wins++; else b.losses++;
      b.netPnl = r2((b.netPnl ?? 0) + pnl);
      if (b.completedTrades > 0) b.winRate = r2((b.wins / b.completedTrades) * 100);
      b.sampleAdequacy = classifySampleAdequacy(b.completedTrades);
      if (rm !== null) {
        const prevRs = [...Array(b.completedTrades - 1)].map(() => 0); // placeholder for avgR recompute below
        void prevRs;
      }
    }
  }
  // Recompute avgR for confidence buckets
  for (const bucket of Object.keys(byConfidenceBucket)) {
    const sub = eligibleEntries.filter((e) => confidenceBucket(e.snapshot.confidence) === bucket);
    const rs = sub.map((e) => e.outcome!.rMultiple).filter((r) => r !== null) as number[];
    byConfidenceBucket[bucket].avgR = rs.length ? mean(rs) : null;
    const gross = sub.filter((e) => e.outcome!.pnl! > 0).reduce((s, e) => s + e.outcome!.pnl!, 0);
    const loss = Math.abs(sub.filter((e) => e.outcome!.pnl! <= 0).reduce((s, e) => s + e.outcome!.pnl!, 0));
    byConfidenceBucket[bucket].profitFactor = loss > 0 ? r2(gross / loss) : null;
  }

  // 12. R:R bucket
  const byRRBucket: Record<string, BreakdownSlice> = {};
  for (const e of filtered) {
    const rr = e.snapshot.execution?.rrTarget2 ?? e.snapshot.execution?.rrTarget1 ?? 0;
    const bucket = rrBucket(rr);
    if (!byRRBucket[bucket]) byRRBucket[bucket] = emptySlice();
    byRRBucket[bucket].observations++;
    if (checkEligibility(e, targetVersion).eligible) {
      const b = byRRBucket[bucket];
      const pnl = e.outcome!.pnl!;
      b.completedTrades++;
      if (pnl > 0) b.wins++; else b.losses++;
      b.netPnl = r2((b.netPnl ?? 0) + pnl);
      b.winRate = r2((b.wins / b.completedTrades) * 100);
      b.sampleAdequacy = classifySampleAdequacy(b.completedTrades);
    }
  }
  for (const bucket of Object.keys(byRRBucket)) {
    const sub = eligibleEntries.filter((e) => rrBucket(e.snapshot.execution?.rrTarget2 ?? e.snapshot.execution?.rrTarget1 ?? 0) === bucket);
    const rs = sub.map((e) => e.outcome!.rMultiple).filter((r) => r !== null) as number[];
    byRRBucket[bucket].avgR = rs.length ? mean(rs) : null;
    const gross = sub.filter((e) => e.outcome!.pnl! > 0).reduce((s, e) => s + e.outcome!.pnl!, 0);
    const loss = Math.abs(sub.filter((e) => e.outcome!.pnl! <= 0).reduce((s, e) => s + e.outcome!.pnl!, 0));
    byRRBucket[bucket].profitFactor = loss > 0 ? r2(gross / loss) : null;
  }

  // 13. Weekday breakdown
  const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const byWeekday: Record<string, BreakdownSlice> = {};
  for (const e of filtered) {
    const day = WEEKDAYS[new Date(e.createdAt).getDay()];
    if (!byWeekday[day]) byWeekday[day] = emptySlice();
    byWeekday[day].observations++;
    if (checkEligibility(e, targetVersion).eligible) {
      const b = byWeekday[day];
      const pnl = e.outcome!.pnl!;
      b.completedTrades++;
      if (pnl > 0) b.wins++; else b.losses++;
      b.netPnl = r2((b.netPnl ?? 0) + pnl);
      b.winRate = r2((b.wins / b.completedTrades) * 100);
      b.sampleAdequacy = classifySampleAdequacy(b.completedTrades);
    }
  }
  for (const day of Object.keys(byWeekday)) {
    const sub = eligibleEntries.filter((e) => WEEKDAYS[new Date(e.createdAt).getDay()] === day);
    const rs = sub.map((e) => e.outcome!.rMultiple).filter((r) => r !== null) as number[];
    byWeekday[day].avgR = rs.length ? mean(rs) : null;
  }

  // 14. Monthly breakdown
  const byMonth: Record<string, BreakdownSlice> = {};
  for (const e of filtered) {
    const month = e.createdAt.slice(0, 7); // YYYY-MM
    if (!byMonth[month]) byMonth[month] = emptySlice();
    byMonth[month].observations++;
    if (checkEligibility(e, targetVersion).eligible) {
      const b = byMonth[month];
      const pnl = e.outcome!.pnl!;
      b.completedTrades++;
      if (pnl > 0) b.wins++; else b.losses++;
      b.netPnl = r2((b.netPnl ?? 0) + pnl);
      b.winRate = r2((b.wins / b.completedTrades) * 100);
      b.sampleAdequacy = classifySampleAdequacy(b.completedTrades);
    }
  }
  for (const month of Object.keys(byMonth)) {
    const sub = eligibleEntries.filter((e) => e.createdAt.slice(0, 7) === month);
    const rs = sub.map((e) => e.outcome!.rMultiple).filter((r) => r !== null) as number[];
    byMonth[month].avgR = rs.length ? mean(rs) : null;
  }

  // 15. Event risk breakdown
  const evPresent = filtered.filter((e) => e.snapshot.blockers.some((b) => b.toLowerCase().includes("event")));
  const evAbsent = filtered.filter((e) => !e.snapshot.blockers.some((b) => b.toLowerCase().includes("event")));
  const byEventRisk = {
    present: sliceFor(evPresent, evPresent.length),
    absent: sliceFor(evAbsent, evAbsent.length),
  };

  // 16. Recent vs earlier (split at midpoint chronologically)
  let recentVsEarlier: EvaluationReport["recentVsEarlier"];
  if (eligibleEntries.length >= 20) {
    const mid = Math.floor(eligibleEntries.length / 2);
    const earlier = eligibleEntries.slice(0, mid);
    const recent = eligibleEntries.slice(mid);
    recentVsEarlier = {
      earlier: breakdownSlice(earlier.length, earlier.map((e) => ({ pnl: e.outcome!.pnl!, rMultiple: e.outcome!.rMultiple }))),
      recent: breakdownSlice(recent.length, recent.map((e) => ({ pnl: e.outcome!.pnl!, rMultiple: e.outcome!.rMultiple }))),
      note: "Chronological split at midpoint for stability check — descriptive only",
    };
  } else {
    recentVsEarlier = { earlier: null, recent: null, note: "Insufficient completed trades for period comparison (need 20+)" };
  }

  return {
    generatedAt: now,
    status: sampleAdequacy,
    evidenceClassification,
    evidenceReason,
    strategyVersion: targetVersion,
    filters,
    dataQuality,
    performance: perf,
    byUnderlying,
    byOptionType,
    byStrategy,
    byRegime,
    byConfidenceBucket,
    byRRBucket,
    byWeekday,
    byMonth,
    byEventRisk,
    recentVsEarlier,
  };
}
