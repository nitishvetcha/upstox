// Phase 25 — Multi-session evidence store and analytics.
// Tracks session records per IST date YYYY-MM-DD to guarantee session-date uniqueness.
// Stores at .data/paper-sessions/session_<date>.json
import * as fs from "node:fs";
import * as path from "node:path";
import type { PaperOpportunity } from "./paperOpportunityStore.ts";
import { listPaperOpportunities, TERMINAL_STATES, sampleSizeLabel, type SampleSizeLabel } from "./paperOpportunityStore.ts";
import type { CollectionResult } from "./liveOpportunityCollector.ts";
import type { PaperMonitorRun } from "./paperTradeMonitorRunner.ts";

function getDir() {
  return (
    process.env.SESSION_EVIDENCE_DIR ??
    path.join(process.cwd(), ".data", "paper-sessions")
  );
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // UTC+05:30

export function getISTDateString(date = new Date()): string {
  const istDate = new Date(date.getTime() + IST_OFFSET_MS);
  return istDate.toISOString().slice(0, 10);
}

export interface MarketSessionRecord {
  sessionDate: string; // IST YYYY-MM-DD
  firstObservationTimestamp: string;
  lastObservationTimestamp: string;
  marketStatus: string;
  upstoxAuthStatus: string;
  collectionCycles: number;
  monitoringCycles: number;
  liveOpportunitiesGenerated: number;
  acceptedOpportunities: number;
  rejectedOpportunities: number;
  paperOpportunitiesCreated: number;
  duplicateOpportunitiesSkipped: number;
  niftyCount: number;
  bankNiftyCount: number;
  stockCount: number;
  quotesSuccessfullyEvaluated: number;
  quoteFailures: number;
  staleDataEvents: number;
  target1Hits: number;
  target2Hits: number;
  stopHits: number;
  expirations: number;
  invalidations: number;
  sessionErrors: string[];
}

function filePath(date: string): string {
  return path.join(getDir(), `session_${date.replace(/[^\w-]/g, "")}.json`);
}

export function saveSessionRecord(record: MarketSessionRecord): void {
  const dir = getDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath(record.sessionDate), JSON.stringify(record, null, 2));
}

export function getSessionRecord(date: string): MarketSessionRecord | null {
  try {
    return JSON.parse(fs.readFileSync(filePath(date), "utf8"));
  } catch {
    return null;
  }
}

export function listSessionRecords(): MarketSessionRecord[] {
  try {
    const dir = getDir();
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((f) => f.startsWith("session_") && f.endsWith(".json"))
      .map((f) => {
        try {
          return JSON.parse(
            fs.readFileSync(path.join(dir, f), "utf8"),
          ) as MarketSessionRecord;
        } catch {
          return null;
        }
      })
      .filter((r): r is MarketSessionRecord => r !== null)
      .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate));
  } catch {
    return [];
  }
}

export function recordCollectionCycle(
  result: CollectionResult,
  authStatus = "UNKNOWN",
  now = new Date(),
): MarketSessionRecord {
  const dateStr = getISTDateString(now);
  const existing = getSessionRecord(dateStr);
  const nowIso = now.toISOString();

  const staleEvents = result.errors.filter((e) => e.includes("non-LIVE")).length;

  const sessionErrors = Array.from(
    new Set([...(existing?.sessionErrors ?? []), ...result.errors]),
  );

  const updated: MarketSessionRecord = {
    sessionDate: dateStr,
    firstObservationTimestamp: existing?.firstObservationTimestamp ?? nowIso,
    lastObservationTimestamp: nowIso,
    marketStatus: result.market,
    upstoxAuthStatus: authStatus,
    collectionCycles: (existing?.collectionCycles ?? 0) + 1,
    monitoringCycles: existing?.monitoringCycles ?? 0,
    liveOpportunitiesGenerated: (existing?.liveOpportunitiesGenerated ?? 0) + result.generated,
    acceptedOpportunities: (existing?.acceptedOpportunities ?? 0) + result.accepted,
    rejectedOpportunities: (existing?.rejectedOpportunities ?? 0) + result.rejected,
    paperOpportunitiesCreated: (existing?.paperOpportunitiesCreated ?? 0) + result.created,
    duplicateOpportunitiesSkipped: (existing?.duplicateOpportunitiesSkipped ?? 0) + result.duplicates,
    niftyCount: (existing?.niftyCount ?? 0) + result.niftyCount,
    bankNiftyCount: (existing?.bankNiftyCount ?? 0) + result.bankNiftyCount,
    stockCount: (existing?.stockCount ?? 0) + result.stockCount,
    quotesSuccessfullyEvaluated: existing?.quotesSuccessfullyEvaluated ?? 0,
    quoteFailures: existing?.quoteFailures ?? 0,
    staleDataEvents: (existing?.staleDataEvents ?? 0) + staleEvents,
    target1Hits: existing?.target1Hits ?? 0,
    target2Hits: existing?.target2Hits ?? 0,
    stopHits: existing?.stopHits ?? 0,
    expirations: existing?.expirations ?? 0,
    invalidations: existing?.invalidations ?? 0,
    sessionErrors,
  };

  saveSessionRecord(updated);
  return updated;
}

export function recordMonitoringCycle(
  run: PaperMonitorRun,
  authStatus = "UNKNOWN",
  now = new Date(),
): MarketSessionRecord {
  const dateStr = getISTDateString(now);
  const existing = getSessionRecord(dateStr);
  const nowIso = now.toISOString();

  const sessionErrors = Array.from(
    new Set([...(existing?.sessionErrors ?? []), ...run.errors]),
  );

  const updated: MarketSessionRecord = {
    sessionDate: dateStr,
    firstObservationTimestamp: existing?.firstObservationTimestamp ?? nowIso,
    lastObservationTimestamp: nowIso,
    marketStatus: existing?.marketStatus ?? "OPEN",
    upstoxAuthStatus: authStatus,
    collectionCycles: existing?.collectionCycles ?? 0,
    monitoringCycles: (existing?.monitoringCycles ?? 0) + 1,
    liveOpportunitiesGenerated: existing?.liveOpportunitiesGenerated ?? 0,
    acceptedOpportunities: existing?.acceptedOpportunities ?? 0,
    rejectedOpportunities: existing?.rejectedOpportunities ?? 0,
    paperOpportunitiesCreated: existing?.paperOpportunitiesCreated ?? 0,
    duplicateOpportunitiesSkipped: existing?.duplicateOpportunitiesSkipped ?? 0,
    niftyCount: existing?.niftyCount ?? 0,
    bankNiftyCount: existing?.bankNiftyCount ?? 0,
    stockCount: existing?.stockCount ?? 0,
    quotesSuccessfullyEvaluated: (existing?.quotesSuccessfullyEvaluated ?? 0) + run.evaluated,
    quoteFailures: (existing?.quoteFailures ?? 0) + run.errors.length,
    staleDataEvents: existing?.staleDataEvents ?? 0,
    target1Hits: (existing?.target1Hits ?? 0) + run.target1Hits,
    target2Hits: (existing?.target2Hits ?? 0) + run.target2Hits,
    stopHits: (existing?.stopHits ?? 0) + run.stopHits,
    expirations: (existing?.expirations ?? 0) + run.expirations,
    invalidations: (existing?.invalidations ?? 0) + run.invalidations,
    sessionErrors,
  };

  saveSessionRecord(updated);
  return updated;
}

export interface MultiSessionSummary {
  distinctSessions: number;
  firstSessionDate: string | null;
  lastSessionDate: string | null;
  totalCollectionCycles: number;
  totalMonitoringCycles: number;
  totalGenerated: number;
  totalAccepted: number;
  totalRejected: number;
  totalCreated: number;
  totalDuplicates: number;
  openTrades: number;
  completedTrades: number;
  target1Hits: number;
  target2Hits: number;
  stopHits: number;
  expirations: number;
  invalidations: number;
  wins: number;
  losses: number;
  sampleSizeLabel: SampleSizeLabel;
  winRate: number | null;
  averageR: number | null;
  expectancyR: number | null;
  profitFactor: number | null;
  maxDrawdownR: number | null;
  averageMfeR: number | null;
  averageMaeR: number | null;
  quoteFailures: number;
  staleDataEvents: number;
  byInstrument: Record<string, { total: number; open: number; completed: number; wins: number; averageR: number | null }>;
  byAssetType: Record<string, { total: number; open: number; completed: number; wins: number; averageR: number | null }>;
  byDirection: Record<string, { total: number; open: number; completed: number; wins: number; averageR: number | null }>;
  byGrade: Record<string, { total: number; open: number; completed: number; wins: number; averageR: number | null }>;
  byRegime: Record<string, { total: number; open: number; completed: number; wins: number; averageR: number | null }>;
  byEventRisk: Record<string, { total: number; open: number; completed: number; wins: number; averageR: number | null }>;
}

export function buildMultiSessionSummary(
  sessionInput?: MarketSessionRecord[],
  oppsInput?: PaperOpportunity[],
): MultiSessionSummary {
  const sessions = sessionInput ?? listSessionRecords();
  const opps = oppsInput ?? listPaperOpportunities();

  const sortedSessions = [...sessions].sort((a, b) => a.sessionDate.localeCompare(b.sessionDate));

  const distinctSessions = sessions.length;
  const firstSessionDate = sortedSessions.length > 0 ? sortedSessions[0].sessionDate : null;
  const lastSessionDate = sortedSessions.length > 0 ? sortedSessions[sortedSessions.length - 1].sessionDate : null;

  const totalCollectionCycles = sessions.reduce((acc, s) => acc + s.collectionCycles, 0);
  const totalMonitoringCycles = sessions.reduce((acc, s) => acc + s.monitoringCycles, 0);
  const totalGenerated = sessions.reduce((acc, s) => acc + s.liveOpportunitiesGenerated, 0);
  const totalAccepted = sessions.reduce((acc, s) => acc + s.acceptedOpportunities, 0);
  const totalRejected = sessions.reduce((acc, s) => acc + s.rejectedOpportunities, 0);
  const totalCreated = opps.length;
  const totalDuplicates = sessions.reduce((acc, s) => acc + s.duplicateOpportunitiesSkipped, 0);
  const quoteFailures = sessions.reduce((acc, s) => acc + s.quoteFailures, 0);
  const staleDataEvents = sessions.reduce((acc, s) => acc + s.staleDataEvents, 0);

  const openTrades = opps.filter((o) => o.status === "OPEN").length;
  // EOD_UNPRICED closed without a price: not a completed trade for statistics.
  const completedOpps = opps.filter((o) => TERMINAL_STATES.includes(o.status) && o.status !== "EOD_UNPRICED");
  const completedTrades = completedOpps.length;

  const target1Hits = opps.filter((o) => o.status === "TARGET1_HIT").length;
  const target2Hits = opps.filter((o) => o.status === "TARGET2_HIT").length;
  const stopHits = opps.filter((o) => o.status === "STOP_HIT").length;
  const expirations = opps.filter((o) => o.status === "EXPIRED").length;
  const invalidations = opps.filter((o) => o.status === "INVALIDATED").length;
  const eodExits = opps.filter((o) => o.status === "EOD_EXIT");
  const eodWins = eodExits.filter((o) => (o.realizedR ?? 0) > 0).length;

  const wins = target1Hits + target2Hits + eodWins;
  const losses = stopHits + expirations + invalidations + (eodExits.length - eodWins);

  const label = sampleSizeLabel(completedTrades);

  const rs = completedOpps.map((o) => o.realizedR).filter((r): r is number => r !== null);
  const avgR = rs.length > 0 ? rs.reduce((a, b) => a + b, 0) / rs.length : null;
  const expectancy = avgR;

  const winRs = completedOpps.filter((o) => (o.realizedR ?? 0) > 0).map((o) => o.realizedR!);
  const lossRs = completedOpps.filter((o) => (o.realizedR ?? 0) <= 0).map((o) => Math.abs(o.realizedR!));
  const grossProfit = winRs.reduce((a, b) => a + b, 0);
  const grossLoss = lossRs.reduce((a, b) => a + b, 0);
  const pf = grossLoss > 0 ? grossProfit / grossLoss : null;

  // Max drawdown calculation (cumulative sequential R)
  let maxDrawdownR: number | null = null;
  if (completedOpps.length > 0) {
    const sortedCompleted = [...completedOpps].sort((a, b) =>
      (a.closedAt ?? a.updatedAt).localeCompare(b.closedAt ?? b.updatedAt),
    );
    let cumulative = 0;
    let peak = 0;
    let maxDd = 0;
    for (const o of sortedCompleted) {
      cumulative += o.realizedR ?? 0;
      if (cumulative > peak) peak = cumulative;
      const dd = peak - cumulative;
      if (dd > maxDd) maxDd = dd;
    }
    maxDrawdownR = Math.round(maxDd * 100) / 100;
  }

  const mfeRs = completedOpps.map((o) => o.mfeR).filter((v): v is number => v !== null);
  const maeRs = completedOpps.map((o) => o.maeR).filter((v): v is number => v !== null);

  function buildGroupStats(
    getGroupKey: (o: PaperOpportunity) => string,
  ): Record<string, { total: number; open: number; completed: number; wins: number; averageR: number | null }> {
    const res: Record<string, { total: number; open: number; completed: number; wins: number; averageR: number | null }> = {};
    for (const o of opps) {
      const key = getGroupKey(o);
      if (!res[key]) {
        res[key] = { total: 0, open: 0, completed: 0, wins: 0, averageR: null };
      }
      res[key].total++;
      if (o.status === "OPEN") res[key].open++;
      if (TERMINAL_STATES.includes(o.status) && o.status !== "EOD_UNPRICED") {
        res[key].completed++;
        if (o.status === "TARGET1_HIT" || o.status === "TARGET2_HIT" || (o.status === "EOD_EXIT" && (o.realizedR ?? 0) > 0)) res[key].wins++;
      }
    }
    for (const key of Object.keys(res)) {
      const groupCompleted = opps.filter(
        (o) => getGroupKey(o) === key && TERMINAL_STATES.includes(o.status) && o.status !== "EOD_UNPRICED",
      );
      const groupRs = groupCompleted.map((o) => o.realizedR).filter((r): r is number => r !== null);
      res[key].averageR = groupRs.length > 0 ? groupRs.reduce((a, b) => a + b, 0) / groupRs.length : null;
    }
    return res;
  }

  return {
    distinctSessions,
    firstSessionDate,
    lastSessionDate,
    totalCollectionCycles,
    totalMonitoringCycles,
    totalGenerated,
    totalAccepted,
    totalRejected,
    totalCreated,
    totalDuplicates,
    openTrades,
    completedTrades,
    target1Hits,
    target2Hits,
    stopHits,
    expirations,
    invalidations,
    wins,
    losses,
    sampleSizeLabel: label,
    winRate: completedTrades > 0 ? wins / completedTrades : null,
    averageR: completedTrades > 0 ? (avgR !== null ? Math.round(avgR * 100) / 100 : null) : null,
    expectancyR: completedTrades > 0 ? (expectancy !== null ? Math.round(expectancy * 100) / 100 : null) : null,
    profitFactor: completedTrades > 0 ? (pf !== null ? Math.round(pf * 100) / 100 : null) : null,
    maxDrawdownR,
    averageMfeR: mfeRs.length > 0 ? Math.round((mfeRs.reduce((a, b) => a + b, 0) / mfeRs.length) * 100) / 100 : null,
    averageMaeR: maeRs.length > 0 ? Math.round((maeRs.reduce((a, b) => a + b, 0) / maeRs.length) * 100) / 100 : null,
    quoteFailures,
    staleDataEvents,
    byInstrument: buildGroupStats((o) => o.underlying),
    byAssetType: buildGroupStats((o) => o.instrumentType),
    byDirection: buildGroupStats((o) => o.direction),
    byGrade: buildGroupStats((o) => o.grade),
    byRegime: buildGroupStats((o) => o.regime),
    byEventRisk: buildGroupStats((o) => o.eventRisk ?? "NONE"),
  };
}
