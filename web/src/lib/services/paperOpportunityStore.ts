// Phase 23 — Paper opportunity lifecycle store.
// Separate from Phase 22 opportunityTrackingStore (that remains for backward compat).
// Stores at .data/paper-opportunities/popp_<id>.json
import * as fs from "node:fs";
import * as path from "node:path";
import type { OpportunityGrade } from "../engine/opportunityEngine.ts";

function getDir() {
  return (
    process.env.PAPER_OPPORTUNITY_DIR ??
    path.join(process.cwd(), ".data", "paper-opportunities")
  );
}

// ── Source data quality ───────────────────────────────────────────────────────

export type DataSourceState = "LIVE" | "MOCK" | "STALE" | "EOD" | "UNAVAILABLE";

// ── State machine ─────────────────────────────────────────────────────────────

export type PaperStatus =
  | "OPEN"
  | "TARGET1_HIT"
  | "TARGET2_HIT"
  | "STOP_HIT"
  | "EXPIRED"
  | "INVALIDATED"
  // Intraday stock closed after the session at the last exchange-verified LIVE price (simulated, not a fill).
  | "EOD_EXIT"
  // Session ended but no verified LIVE price was captured that session: closed WITHOUT a price.
  // Never priced from END_OF_DAY quotes; excluded from win/loss and R statistics.
  | "EOD_UNPRICED";

export const TERMINAL_STATES: PaperStatus[] = [
  "TARGET1_HIT",
  "TARGET2_HIT",
  "STOP_HIT",
  "EXPIRED",
  "INVALIDATED",
  "EOD_EXIT",
  "EOD_UNPRICED",
];

// ── Provenance ────────────────────────────────────────────────────────────────
// All records created before live collection began on 2026-10-15 IST are seed/test fixtures
// (documented in the Phase 30/31 audits). They are preserved untouched but never monitored
// or counted as live evidence. New records carry an explicit `provenance` field.
export const LEGACY_FIXTURE_CUTOFF = "2026-10-14T18:30:00.000Z"; // 2026-10-15 00:00 IST

export function isFixture(opp: Pick<PaperOpportunity, "provenance" | "createdAt">): boolean {
  if (opp.provenance === "FIXTURE") return true;
  if (opp.provenance === "LIVE_COLLECTOR") return false;
  return opp.createdAt < LEGACY_FIXTURE_CUTOFF;
}

// ── Audit event ───────────────────────────────────────────────────────────────

export interface PaperOpportunityEvent {
  id: string;
  opportunityId: string;
  timestamp: string;
  fromStatus: PaperStatus;
  toStatus: PaperStatus;
  price: number | null;          // option/stock price at transition
  underlyingPrice: number | null;
  reason: string;
  source: DataSourceState;
  metadata: Record<string, unknown>;
}

// ── Main model ────────────────────────────────────────────────────────────────

export type InstrumentType = "OPTION" | "STOCK";

export interface PaperOpportunity {
  id: string;
  createdAt: string;
  updatedAt: string;
  source: DataSourceState;        // data quality at creation time

  // Instrument
  instrumentType: InstrumentType;
  underlying: string;
  symbol: string | null;          // stock ticker
  instrumentKey: string | null;
  optionType: "CE" | "PE" | null;
  strike: number | null;
  expiry: string | null;
  strategyType: string;
  direction: "BULLISH" | "BEARISH" | "NEUTRAL";

  // Trade plan (immutable after creation)
  entry: number;
  stop: number;
  target1: number;
  target2: number;
  riskPerUnit: number;            // entry - stop (long premium / long stock)
  rewardToTarget1: number;        // target1 - entry
  rewardToTarget2: number;        // target2 - entry
  rrTarget1: number;
  rrTarget2: number;

  // Snapshot at entry
  spotAtEntry: number | null;
  iv: number | null;
  delta: number | null;
  oi: number | null;
  volume: number | null;
  spread: number | null;          // bid-ask spread %
  atr: number | null;

  // Scoring (immutable snapshot)
  score: number;
  confidence: number;
  grade: OpportunityGrade;
  signalAgreement: number;
  regime: string;
  eventRisk: string | null;
  reasons: string[];
  reasonCodes: string[];

  strategyVersion: string;

  // Lifecycle
  status: PaperStatus;
  openedAt: string;
  closedAt: string | null;

  // Outcome (mutable)
  exitPrice: number | null;
  exitReason: string | null;
  realizedPnl: number | null;
  realizedR: number | null;

  mfe: number | null;             // max favorable excursion (premium / price units)
  mae: number | null;             // max adverse excursion (positive = against us)
  mfeR: number | null;            // mfe / riskPerUnit
  maeR: number | null;            // mae / riskPerUnit

  // Underlying thesis
  underlyingEntry: number | null;
  underlyingExit: number | null;
  underlyingMfe: number | null;
  underlyingMae: number | null;

  durationSeconds: number | null;

  // Last exchange-verified LIVE monitoring price (basis for EOD_EXIT). Absent on legacy records.
  lastLivePrice?: number | null;
  lastLivePriceAt?: string | null;

  // Where the record came from. Absent on legacy records (see isFixture).
  provenance?: "LIVE_COLLECTOR" | "FIXTURE";

  // Audit trail
  events: PaperOpportunityEvent[];
}

// ── File helpers ──────────────────────────────────────────────────────────────

function filePath(id: string) {
  return path.join(getDir(), `popp_${id.replace(/[^\w-]/g, "")}.json`);
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export function savePaperOpportunity(opp: PaperOpportunity): void {
  const dir = getDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath(opp.id), JSON.stringify(opp, null, 2));
}

export function getPaperOpportunity(id: string): PaperOpportunity | null {
  try {
    return JSON.parse(fs.readFileSync(filePath(id), "utf8"));
  } catch {
    return null;
  }
}

export function listPaperOpportunities(): PaperOpportunity[] {
  try {
    const dir = getDir();
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((f) => f.startsWith("popp_") && f.endsWith(".json"))
      .map((f) => {
        try {
          return JSON.parse(
            fs.readFileSync(path.join(dir, f), "utf8"),
          ) as PaperOpportunity;
        } catch {
          return null;
        }
      })
      .filter((r): r is PaperOpportunity => r !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export function updatePaperOpportunity(
  id: string,
  patch: Partial<PaperOpportunity>,
): PaperOpportunity | null {
  const opp = getPaperOpportunity(id);
  if (!opp) return null;
  const updated: PaperOpportunity = {
    ...opp,
    ...patch,
    id: opp.id,
    createdAt: opp.createdAt,
    // Preserve immutable snapshot fields
    entry: opp.entry,
    stop: opp.stop,
    target1: opp.target1,
    target2: opp.target2,
    riskPerUnit: opp.riskPerUnit,
    score: opp.score,
    reasons: opp.reasons,
    strategyVersion: opp.strategyVersion,
    updatedAt: new Date().toISOString(),
  };
  savePaperOpportunity(updated);
  return updated;
}

// ── Analytics helpers ─────────────────────────────────────────────────────────

export type SampleSizeLabel =
  | "INSUFFICIENT_SAMPLE"
  | "EARLY_EVIDENCE"
  | "PRELIMINARY"
  | "MEANINGFUL_SAMPLE";

export function sampleSizeLabel(n: number): SampleSizeLabel {
  if (n < 10) return "INSUFFICIENT_SAMPLE";
  if (n < 30) return "EARLY_EVIDENCE";
  if (n < 100) return "PRELIMINARY";
  return "MEANINGFUL_SAMPLE";
}

export interface DailySummary {
  date: string;
  generated: number;
  accepted: number;
  rejected: number;
  open: number;
  target1Hit: number;
  target2Hit: number;
  stopHit: number;
  expired: number;
  invalidated: number;
  wins: number;
  losses: number;
  completedTrades: number;
  sampleSizeLabel: SampleSizeLabel;
  winRate: number | null;
  averageR: number | null;
  expectancyR: number | null;
  profitFactor: number | null;
  averageMfeR: number | null;
  averageMaeR: number | null;
}

export function buildDailySummary(
  opps: PaperOpportunity[],
  date: string,
): DailySummary {
  const dayOpps = opps.filter((o) => o.createdAt.startsWith(date));
  const open = dayOpps.filter((o) => o.status === "OPEN").length;
  const t1 = dayOpps.filter((o) => o.status === "TARGET1_HIT").length;
  const t2 = dayOpps.filter((o) => o.status === "TARGET2_HIT").length;
  const stop = dayOpps.filter((o) => o.status === "STOP_HIT").length;
  const expired = dayOpps.filter((o) => o.status === "EXPIRED").length;
  const invalidated = dayOpps.filter((o) => o.status === "INVALIDATED").length;
  // EOD_EXIT is a priced simulated exit: win/loss by realized R. EOD_UNPRICED has no price → excluded.
  const eodExits = dayOpps.filter((o) => o.status === "EOD_EXIT");
  const eodWins = eodExits.filter((o) => (o.realizedR ?? 0) > 0).length;

  const wins = t1 + t2 + eodWins;
  const losses = stop + expired + invalidated + (eodExits.length - eodWins);
  const completed = wins + losses;

  const label = sampleSizeLabel(completed);
  const completedOpps = dayOpps.filter((o) =>
    TERMINAL_STATES.includes(o.status) && o.status !== "EOD_UNPRICED",
  );

  const rs = completedOpps
    .map((o) => o.realizedR)
    .filter((r): r is number => r !== null);
  const avgR = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null;
  const expectancy = avgR; // E[R] = avgR when uniform bet size
  const winRs = completedOpps
    .filter((o) => (o.realizedR ?? 0) > 0)
    .map((o) => o.realizedR!);
  const lossRs = completedOpps
    .filter((o) => (o.realizedR ?? 0) <= 0)
    .map((o) => Math.abs(o.realizedR!));
  const grossProfit = winRs.reduce((a, b) => a + b, 0);
  const grossLoss = lossRs.reduce((a, b) => a + b, 0);
  const pf = grossLoss > 0 ? grossProfit / grossLoss : null;

  const mfeRs = completedOpps.map((o) => o.mfeR).filter((v): v is number => v !== null);
  const maeRs = completedOpps.map((o) => o.maeR).filter((v): v is number => v !== null);

  return {
    date,
    generated: dayOpps.length,
    accepted: dayOpps.length,
    rejected: 0,
    open,
    target1Hit: t1,
    target2Hit: t2,
    stopHit: stop,
    expired,
    invalidated,
    wins,
    losses,
    completedTrades: completed,
    sampleSizeLabel: label,
    winRate: completed > 0 ? wins / completed : null,
    averageR: completed > 0 ? avgR : null,
    expectancyR: completed > 0 ? expectancy : null,
    profitFactor: completed > 0 ? pf : null,
    averageMfeR: mfeRs.length > 0 ? mfeRs.reduce((a, b) => a + b, 0) / mfeRs.length : null,
    averageMaeR: maeRs.length > 0 ? maeRs.reduce((a, b) => a + b, 0) / maeRs.length : null,
  };
}
