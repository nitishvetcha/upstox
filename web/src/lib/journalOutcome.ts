// Phase 11.3 — Outcome calculation: MFE, MAE, P&L, R-multiple.
// All calculations work in option premium space (per unit). Multiplied by quantity for total INR.
import type { RecommendationOutcome, JournalStatus, ExitReason } from "./journalTypes.ts";
import type { RecommendationResponse } from "./recommendationEnricher.ts";

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface PriceObservation {
  price: number;
  timestamp: string;
}

/**
 * Given the stored recommendation snapshot and a fresh current price,
 * compute the updated outcome — without touching the original snapshot fields.
 */
export function computeOutcome(
  rec: RecommendationResponse,
  currentPrice: number,
  now: Date,
  prevOutcome: RecommendationOutcome | null,
): RecommendationOutcome {
  const ex = rec.execution;

  // WAIT / NO_TRADE are never executable — return immediately
  if (rec.decision !== "TRADE" || !ex) {
    return {
      status: "NOT_EXECUTABLE",
      exitPrice: null,
      exitTimestamp: null,
      exitReason: null,
      highestPrice: null,
      lowestPrice: null,
      mfe: null,
      mae: null,
      pnl: null,
      pnlPercent: null,
      rMultiple: null,
      durationMinutes: null,
      target1HitAt: null,
      target2HitAt: null,
      lastRefreshedAt: now.toISOString(),
    };
  }

  const entry = ex.entry;
  const qty = ex.quantity;
  const direction = rec.direction; // BULLISH or BEARISH

  // Carry forward extremes from previous observation
  const prevHigh = prevOutcome?.highestPrice ?? entry;
  const prevLow = prevOutcome?.lowestPrice ?? entry;
  const high = Math.max(prevHigh, currentPrice);
  const low = Math.min(prevLow, currentPrice);

  // MFE / MAE: long option (BULLISH) — favorable means higher price
  let mfe: number;
  let mae: number;
  if (direction === "BEARISH") {
    mfe = r2(entry - low); // bearish profits from falling premium
    mae = r2(high - entry);
  } else {
    mfe = r2(high - entry); // bullish profits from rising premium
    mae = r2(entry - low);
  }

  // Check milestone hits (idempotent — carry forward if already hit)
  const nowIso = now.toISOString();
  const prevStatus: JournalStatus = prevOutcome?.status ?? "MONITORING";
  const alreadyClosed = (
    prevStatus === "STOPPED_OUT" ||
    prevStatus === "TARGET_1_HIT" ||
    prevStatus === "TARGET_2_HIT" ||
    prevStatus === "EXPIRED" ||
    prevStatus === "INVALIDATED" ||
    prevStatus === "CANCELLED"
  );

  if (alreadyClosed) {
    // No further updates to a closed outcome — just refresh timestamp
    return { ...prevOutcome!, lastRefreshedAt: nowIso };
  }

  let status: JournalStatus = prevOutcome?.status ?? "MONITORING";
  let exitPrice: number | null = prevOutcome?.exitPrice ?? null;
  let exitTimestamp: string | null = prevOutcome?.exitTimestamp ?? null;
  let exitReason: ExitReason | null = prevOutcome?.exitReason ?? null;
  const target1HitAt = prevOutcome?.target1HitAt ?? null;
  let target2HitAt = prevOutcome?.target2HitAt ?? null;

  // Check expiry
  const expiryTs = Date.parse(rec.market.expiry + "T15:30:00+05:30");
  const isExpired = now.getTime() >= expiryTs;

  // Detect stop/target transitions — evaluate in order: T2 > T1 > stop > expiry
  if (direction === "BEARISH") {
    // Bearish: entry is the long put premium; profit as price falls, stop if premium rises
    if (currentPrice >= ex.stopLoss && status === "MONITORING") {
      status = "STOPPED_OUT";
      exitPrice = currentPrice;
      exitTimestamp = nowIso;
      exitReason = "STOP_LOSS";
    } else if (currentPrice <= ex.target2 && (prevStatus as string) !== "TARGET_2_HIT") {
      status = "TARGET_2_HIT";
      exitPrice = currentPrice;
      exitTimestamp = nowIso;
      exitReason = "TARGET_2";
      target2HitAt = nowIso;
    } else if (currentPrice <= ex.target1 && !target1HitAt) {
      status = "TARGET_1_HIT";
    }
  } else {
    // Bullish: profit as price rises
    if (currentPrice <= ex.stopLoss && status === "MONITORING") {
      status = "STOPPED_OUT";
      exitPrice = currentPrice;
      exitTimestamp = nowIso;
      exitReason = "STOP_LOSS";
    } else if (currentPrice >= ex.target2 && (prevStatus as string) !== "TARGET_2_HIT") {
      status = "TARGET_2_HIT";
      exitPrice = currentPrice;
      exitTimestamp = nowIso;
      exitReason = "TARGET_2";
      target2HitAt = nowIso;
    } else if (currentPrice >= ex.target1 && !target1HitAt) {
      status = "TARGET_1_HIT";
    }
  }

  if (isExpired && (status === "MONITORING" || status === "TARGET_1_HIT")) {
    status = "EXPIRED";
    exitPrice = currentPrice;
    exitTimestamp = nowIso;
    exitReason = "EXPIRY";
  }

  // P&L (null until exit)
  let pnl: number | null = null;
  let pnlPercent: number | null = null;
  let rMultiple: number | null = null;
  const ep = exitPrice;
  if (ep !== null) {
    const perUnit = direction === "BEARISH" ? entry - ep : ep - entry;
    pnl = r2(perUnit * qty);
    pnlPercent = entry > 0 ? r2((perUnit / entry) * 100) : null;
    rMultiple = ex.plannedRisk > 0 ? r2(pnl / ex.plannedRisk) : null;
  }

  const durationMinutes = exitTimestamp
    ? r2((Date.parse(exitTimestamp) - Date.parse(rec.generatedAt)) / 60_000)
    : null;

  return {
    status,
    exitPrice,
    exitTimestamp,
    exitReason,
    highestPrice: high,
    lowestPrice: low,
    mfe: mfe > 0 ? mfe : 0,
    mae: mae > 0 ? mae : 0,
    pnl,
    pnlPercent,
    rMultiple,
    durationMinutes,
    target1HitAt: prevOutcome?.target1HitAt ?? (status === "TARGET_1_HIT" ? nowIso : null),
    target2HitAt,
    lastRefreshedAt: nowIso,
  };
}

/** Phase 11.4 — journal diagnostic report. */
export interface JournalValidationReport {
  totalEntries: number;
  withVersionInfo: number;
  missingVersionInfo: number;
  strategyVersionCounts: Record<string, number>;
  statusCounts: Record<string, number>;
  oldestEntry: string | null;
  newestEntry: string | null;
  issues: string[];
}

export function validateRecommendationJournal(
  entries: import("./journalTypes.ts").RecommendationJournalEntry[],
): JournalValidationReport {
  const issues: string[] = [];
  const strategyVersionCounts: Record<string, number> = {};
  const statusCounts: Record<string, number> = {};
  let oldest: string | null = null;
  let newest: string | null = null;
  let withVersionInfo = 0;

  for (const e of entries) {
    if (e.versionInfo) {
      withVersionInfo++;
      const sv = e.versionInfo.strategyVersion;
      strategyVersionCounts[sv] = (strategyVersionCounts[sv] ?? 0) + 1;
    } else {
      issues.push(`Entry ${e.id} missing versionInfo (pre-11.4)`);
    }
    statusCounts[e.status] = (statusCounts[e.status] ?? 0) + 1;
    if (!oldest || e.createdAt < oldest) oldest = e.createdAt;
    if (!newest || e.createdAt > newest) newest = e.createdAt;

    // Invariant: TRADE entries must have a snapshot with execution
    if (e.snapshot.decision === "TRADE" && !e.snapshot.execution) {
      issues.push(`Entry ${e.id} is TRADE but snapshot has no execution plan`);
    }
    // Invariant: snapshot id must match entry id
    if (e.snapshot.recommendationId !== e.id) {
      issues.push(`Entry ${e.id} id mismatch with snapshot.recommendationId=${e.snapshot.recommendationId}`);
    }
  }

  return {
    totalEntries: entries.length,
    withVersionInfo,
    missingVersionInfo: entries.length - withVersionInfo,
    strategyVersionCounts,
    statusCounts,
    oldestEntry: oldest,
    newestEntry: newest,
    issues,
  };
}

/** Daily collection summary keyed by YYYY-MM-DD. */
export interface DailyCollectionSummary {
  date: string;
  total: number;
  trades: number;
  waits: number;
  noTrades: number;
}

/** Analytics over a list of outcomes — TRADE recommendations only. */
export interface JournalAnalytics {
  totalTrade: number;
  totalWait: number;
  totalNoTrade: number;
  wins: number;
  losses: number;
  winRate: number | null;
  netPnl: number;
  avgPnl: number | null;
  avgR: number | null;
  profitFactor: number | null;
  avgMfe: number | null;
  avgMae: number | null;
  avgDurationMinutes: number | null;
  target1HitRate: number | null;
  target2HitRate: number | null;
  stopRate: number | null;
  byStrategy: Record<string, { trades: number; wins: number; losses: number; netPnl: number; avgR: number | null }>;
  byUnderlying: Record<string, { trades: number; wins: number; netPnl: number }>;
  byRegime: Record<string, { recommendations: number; trades: number; wins: number; netPnl: number }>;
  blockerFrequency: Record<string, number>;
  dailySummaries: DailyCollectionSummary[];
}

export function computeAnalytics(entries: import("./journalTypes.ts").RecommendationJournalEntry[]): JournalAnalytics {
  const trades = entries.filter((e) => e.snapshot.decision === "TRADE");
  const waits = entries.filter((e) => e.snapshot.decision === "WAIT");
  const noTrades = entries.filter((e) => e.snapshot.decision === "NO_TRADE");

  const closed = trades.filter((e) => e.outcome && e.outcome.pnl !== null);
  const wins = closed.filter((e) => (e.outcome!.pnl ?? 0) > 0);
  const losses = closed.filter((e) => (e.outcome!.pnl ?? 0) <= 0);

  const netPnl = closed.reduce((s, e) => s + (e.outcome!.pnl ?? 0), 0);
  const avgPnl = closed.length ? r2(netPnl / closed.length) : null;
  const rs = closed.map((e) => e.outcome!.rMultiple).filter((r) => r !== null) as number[];
  const avgR = rs.length ? r2(rs.reduce((s, r) => s + r, 0) / rs.length) : null;

  const grossWin = wins.reduce((s, e) => s + (e.outcome!.pnl ?? 0), 0);
  const grossLoss = Math.abs(losses.reduce((s, e) => s + (e.outcome!.pnl ?? 0), 0));
  const profitFactor = grossLoss > 0 ? r2(grossWin / grossLoss) : null;

  const mfes = closed.map((e) => e.outcome!.mfe).filter((v) => v !== null) as number[];
  const maes = closed.map((e) => e.outcome!.mae).filter((v) => v !== null) as number[];
  const durs = closed.map((e) => e.outcome!.durationMinutes).filter((v) => v !== null) as number[];

  const t1Hits = closed.filter((e) => e.outcome?.target1HitAt !== null).length;
  const t2Hits = closed.filter((e) => e.outcome?.status === "TARGET_2_HIT").length;
  const stops = closed.filter((e) => e.outcome?.status === "STOPPED_OUT").length;

  // Aggregates by strategy
  const byStrategy: JournalAnalytics["byStrategy"] = {};
  for (const e of closed) {
    const key = e.snapshot.strategy || "UNKNOWN";
    if (!byStrategy[key]) byStrategy[key] = { trades: 0, wins: 0, losses: 0, netPnl: 0, avgR: null };
    const b = byStrategy[key];
    b.trades++;
    if ((e.outcome!.pnl ?? 0) > 0) b.wins++; else b.losses++;
    b.netPnl = r2(b.netPnl + (e.outcome!.pnl ?? 0));
  }
  for (const key of Object.keys(byStrategy)) {
    const stratRs = closed.filter((e) => e.snapshot.strategy === key).map((e) => e.outcome!.rMultiple).filter((v) => v !== null) as number[];
    byStrategy[key].avgR = stratRs.length ? r2(stratRs.reduce((s, v) => s + v, 0) / stratRs.length) : null;
  }

  const byUnderlying: JournalAnalytics["byUnderlying"] = {};
  for (const e of closed) {
    const key = e.snapshot.underlying;
    if (!byUnderlying[key]) byUnderlying[key] = { trades: 0, wins: 0, netPnl: 0 };
    byUnderlying[key].trades++;
    if ((e.outcome!.pnl ?? 0) > 0) byUnderlying[key].wins++;
    byUnderlying[key].netPnl = r2(byUnderlying[key].netPnl + (e.outcome!.pnl ?? 0));
  }

  const byRegime: JournalAnalytics["byRegime"] = {};
  for (const e of entries) {
    const key = e.snapshot.market.regime || "UNKNOWN";
    if (!byRegime[key]) byRegime[key] = { recommendations: 0, trades: 0, wins: 0, netPnl: 0 };
    byRegime[key].recommendations++;
    if (e.snapshot.decision === "TRADE" && e.outcome?.pnl != null) {
      byRegime[key].trades++;
      if (e.outcome.pnl > 0) byRegime[key].wins++;
      byRegime[key].netPnl = r2(byRegime[key].netPnl + e.outcome.pnl);
    }
  }

  const blockerFrequency: Record<string, number> = {};
  for (const e of entries) {
    for (const b of e.snapshot.blockers) {
      const key = b.split(":")[0].trim();
      blockerFrequency[key] = (blockerFrequency[key] ?? 0) + 1;
    }
  }

  // Daily collection summary
  const dailyMap: Record<string, DailyCollectionSummary> = {};
  for (const e of entries) {
    const date = e.createdAt.slice(0, 10);
    if (!dailyMap[date]) dailyMap[date] = { date, total: 0, trades: 0, waits: 0, noTrades: 0 };
    const d = dailyMap[date];
    d.total++;
    if (e.snapshot.decision === "TRADE") d.trades++;
    else if (e.snapshot.decision === "WAIT") d.waits++;
    else d.noTrades++;
  }
  const dailySummaries = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalTrade: trades.length,
    totalWait: waits.length,
    totalNoTrade: noTrades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: closed.length ? r2((wins.length / closed.length) * 100) : null,
    netPnl: r2(netPnl),
    avgPnl,
    avgR,
    profitFactor,
    avgMfe: mfes.length ? r2(mfes.reduce((s, v) => s + v, 0) / mfes.length) : null,
    avgMae: maes.length ? r2(maes.reduce((s, v) => s + v, 0) / maes.length) : null,
    avgDurationMinutes: durs.length ? r2(durs.reduce((s, v) => s + v, 0) / durs.length) : null,
    target1HitRate: closed.length ? r2((t1Hits / closed.length) * 100) : null,
    target2HitRate: closed.length ? r2((t2Hits / closed.length) * 100) : null,
    stopRate: closed.length ? r2((stops / closed.length) * 100) : null,
    byStrategy,
    byUnderlying,
    byRegime,
    blockerFrequency,
    dailySummaries,
  };
}
