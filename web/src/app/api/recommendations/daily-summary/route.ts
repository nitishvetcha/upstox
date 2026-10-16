export const dynamic = "force-dynamic";

import { getAllJournalEntries } from "../../../../lib/services/recommendationStore.ts";

/** One day's evidence summary. Only includes days where at least one evaluation ran. */
interface DaySummary {
  date: string; // YYYY-MM-DD IST
  totalEvaluations: number;
  // ── Semantic classification (Phase 18) ───────────────────────────────────────
  // liveEvaluations = entries where source is genuinely LIVE (any decision)
  liveEvaluations: number;
  liveTradeCount: number;
  liveWaitCount: number;
  liveNoTradeCount: number;
  // nonExecutableSourceCount = entries whose DATA SOURCE was not live (MOCK/END_OF_DAY/STALE/UNAVAILABLE)
  // LIVE+WAIT and LIVE+NO_TRADE are NOT counted here — they are genuine live observations
  nonExecutableSourceCount: number;
  // ── Legacy fields kept for backward compatibility ─────────────────────────────
  /** @deprecated Use liveTradeCount — previously miscounted LIVE WAIT as non-executable */
  tradeCount: number;
  /** @deprecated Use liveWaitCount */
  waitCount: number;
  /** @deprecated Use liveNoTradeCount */
  noTradeCount: number;
  /** @deprecated Use nonExecutableSourceCount */
  nonExecutableCount: number;
  // ── Paper trade outcomes ──────────────────────────────────────────────────────
  openPaperTrades: number;
  closedPaperTrades: number;
  targetsHit: number;
  stopsHit: number;
  expired: number;
  avgScore: number | null;
  avgConfidence: number | null;
  topBlockers: string[];
  niftyEvaluations: number;
  bankNiftyEvaluations: number;
}

function isoToIstDate(iso: string): string {
  const d = new Date(iso);
  const istMs = d.getTime() + (5 * 60 + 30) * 60_000;
  const ist = new Date(istMs);
  return ist.toISOString().slice(0, 10);
}

// Source-based non-executability: data freshness failures only.
// LIVE+WAIT and LIVE+NO_TRADE are genuine live observations, NOT source failures.
const NON_EXEC_SOURCES = new Set(["MOCK", "END_OF_DAY", "STALE", "UNAVAILABLE"]);

const isNonExecSource = (e: ReturnType<typeof getAllJournalEntries>[number]) =>
  NON_EXEC_SOURCES.has(e.snapshot.source ?? "");

const isLive = (e: ReturnType<typeof getAllJournalEntries>[number]) =>
  !isNonExecSource(e);

export async function GET() {
  const entries = getAllJournalEntries();

  // Group by IST date
  const byDate = new Map<string, typeof entries>();
  for (const e of entries) {
    const date = isoToIstDate(e.createdAt);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(e);
  }

  const summaries: DaySummary[] = [];

  for (const [date, dayEntries] of [...byDate.entries()].sort()) {
    const liveEntries = dayEntries.filter(isLive);
    const nonExecEntries = dayEntries.filter(isNonExecSource);

    const liveTrade = liveEntries.filter((e) => e.snapshot.decision === "TRADE");
    const liveWait = liveEntries.filter((e) => e.snapshot.decision === "WAIT");
    const liveNoTrade = liveEntries.filter((e) => e.snapshot.decision === "NO_TRADE");

    const closed = dayEntries.filter((e) =>
      ["STOPPED_OUT", "TARGET_1_HIT", "TARGET_2_HIT", "EXPIRED", "CANCELLED"].includes(e.status)
    );
    const open = dayEntries.filter((e) => e.status === "MONITORING" && e.paperTradeId);

    const scores = dayEntries
      .map((e) => e.snapshot.score?.total)
      .filter((s): s is number => typeof s === "number");
    const confs = dayEntries
      .map((e) => e.snapshot.confidence)
      .filter((c): c is number => typeof c === "number");

    const blockerFreq = new Map<string, number>();
    for (const e of dayEntries) {
      for (const b of e.snapshot.blockers ?? []) {
        blockerFreq.set(b, (blockerFreq.get(b) ?? 0) + 1);
      }
    }
    const topBlockers = [...blockerFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([b]) => b);

    summaries.push({
      date,
      totalEvaluations: dayEntries.length,
      liveEvaluations: liveEntries.length,
      liveTradeCount: liveTrade.length,
      liveWaitCount: liveWait.length,
      liveNoTradeCount: liveNoTrade.length,
      nonExecutableSourceCount: nonExecEntries.length,
      // legacy aliases
      tradeCount: liveTrade.length,
      waitCount: liveWait.length,
      noTradeCount: liveNoTrade.length,
      nonExecutableCount: nonExecEntries.length,
      openPaperTrades: open.length,
      closedPaperTrades: closed.length,
      targetsHit: closed.filter((e) =>
        ["TARGET_1_HIT", "TARGET_2_HIT"].includes(e.status)
      ).length,
      stopsHit: closed.filter((e) => e.status === "STOPPED_OUT").length,
      expired: closed.filter((e) => e.status === "EXPIRED").length,
      avgScore: scores.length
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : null,
      avgConfidence: confs.length
        ? Math.round(confs.reduce((a, b) => a + b, 0) / confs.length)
        : null,
      topBlockers,
      niftyEvaluations: dayEntries.filter((e) => e.snapshot.underlying === "NIFTY").length,
      bankNiftyEvaluations: dayEntries.filter((e) => e.snapshot.underlying === "BANKNIFTY").length,
    });
  }

  return Response.json({ summaries, totalDays: summaries.length });
}
