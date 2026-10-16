// Phase 24 — Paper trade monitor runner.
// runOnce() is safe to call at any time: idempotent, never creates duplicate events.
// Uses existing Phase 23 evaluatePaperOpportunity().
import * as fs from "node:fs";
import * as path from "node:path";
import {
  listPaperOpportunities,
  getPaperOpportunity,
  isFixture,
} from "./paperOpportunityStore.ts";
import { evaluatePaperOpportunity, applyEndOfDay } from "./paperOpportunityMonitor.ts";
import type { EvalInput } from "./paperOpportunityMonitor.ts";
import type { PaperOpportunity } from "./paperOpportunityStore.ts";

// ── Monitor audit ─────────────────────────────────────────────────────────────

export interface PaperMonitorRun {
  id: string;
  timestamp: string;
  openBefore: number;
  fixturesSkipped?: number;
  examined?: number;
  evaluated: number;
  updated: number;
  skipped?: number;
  skippedReasons?: Record<string, number>;
  target1Hits: number;
  target2Hits: number;
  stopHits: number;
  eodExits?: number;
  eodUnpriced?: number;
  invalidations: number;
  expirations: number;
  errors: string[];
  durationMs: number;
}

function getMonitorLogDir(): string {
  return process.env.MONITOR_LOG_DIR ?? path.join(process.cwd(), ".data", "monitor-logs");
}

export function saveMonitorRun(run: PaperMonitorRun): void {
  const dir = getMonitorLogDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `mon_${run.id}.json`),
    JSON.stringify(run, null, 2),
  );
}

export function listMonitorRuns(): PaperMonitorRun[] {
  try {
    const dir = getMonitorLogDir();
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        try { return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as PaperMonitorRun; }
        catch { return null; }
      })
      .filter((r): r is PaperMonitorRun => r !== null)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  } catch { return []; }
}

// ── Price input type ──────────────────────────────────────────────────────────

export type PriceFetcher = (opp: PaperOpportunity) => Promise<EvalInput | null>;

// ── runOnce ───────────────────────────────────────────────────────────────────

export async function runOnce(
  getPriceInput: PriceFetcher,
  now = new Date(),
): Promise<PaperMonitorRun> {
  const start = Date.now();
  const id = `${start}_${Math.random().toString(36).slice(2, 5)}`;
  const run: PaperMonitorRun = {
    id, timestamp: now.toISOString(),
    openBefore: 0,
    fixturesSkipped: 0,
    examined: 0,
    evaluated: 0,
    updated: 0,
    skipped: 0,
    skippedReasons: {},
    target1Hits: 0,
    target2Hits: 0,
    stopHits: 0,
    eodExits: 0,
    eodUnpriced: 0,
    invalidations: 0,
    expirations: 0,
    errors: [],
    durationMs: 0,
  };

  const trackSkip = (reason: string) => {
    run.skipped = (run.skipped ?? 0) + 1;
    run.skippedReasons![reason] = (run.skippedReasons![reason] ?? 0) + 1;
  };

  const allOpen = listPaperOpportunities().filter((o) => o.status === "OPEN");
  run.openBefore = allOpen.length;

  // Decision 3: Exclude seed/test fixtures from monitoring
  const fixtures = allOpen.filter(isFixture);
  run.fixturesSkipped = fixtures.length;
  const genuineOpps = allOpen.filter((o) => !isFixture(o));
  run.examined = genuineOpps.length;

  for (const opp of genuineOpps) {
    try {
      // Decision 1: Apply end-of-day handling for intraday stock positions whose session has closed
      if (opp.instrumentType === "STOCK") {
        const eodResult = applyEndOfDay(opp, now);
        if (eodResult && eodResult.transitioned) {
          run.updated++;
          if (eodResult.toStatus === "EOD_EXIT") run.eodExits = (run.eodExits ?? 0) + 1;
          else if (eodResult.toStatus === "EOD_UNPRICED") run.eodUnpriced = (run.eodUnpriced ?? 0) + 1;
          continue; // Successfully transitioned to terminal EOD state
        }
      }

      const input = await getPriceInput(opp);
      if (!input) {
        trackSkip("price_unavailable");
        continue;
      }

      // Validate price
      if (!isFinite(input.currentPrice) || input.currentPrice <= 0) {
        run.errors.push(`${opp.id}: invalid price ${input.currentPrice}`);
        trackSkip("invalid_price");
        continue;
      }
      if (input.source && input.source !== "LIVE") {
        run.errors.push(`${opp.id}: non-LIVE source ${input.source}`);
        trackSkip(`non_live_source_${input.source}`);
        continue;
      }

      // Re-fetch from store to get latest state (may have been updated by concurrent call)
      const fresh = getPaperOpportunity(opp.id) ?? opp;
      if (fresh.status !== "OPEN") {
        trackSkip("already_terminal");
        continue;
      }

      run.evaluated++;
      const result = evaluatePaperOpportunity(fresh, input);
      if (result.transitioned) {
        run.updated++;
        if (result.toStatus === "TARGET1_HIT") run.target1Hits++;
        else if (result.toStatus === "TARGET2_HIT") run.target2Hits++;
        else if (result.toStatus === "STOP_HIT") run.stopHits++;
        else if (result.toStatus === "INVALIDATED") run.invalidations++;
        else if (result.toStatus === "EXPIRED") run.expirations++;
      }
    } catch (e) {
      run.errors.push(`${opp.id}: ${(e as Error).message}`);
    }
  }

  run.durationMs = Date.now() - start;
  saveMonitorRun(run);

  // Record session evidence
  try {
    const { tokenStatus } = await import("./upstoxAuth.ts");
    const { recordMonitoringCycle } = await import("./sessionEvidenceStore.ts");
    const st = await tokenStatus();
    const authStatus = st.status === "VALID" ? "CONNECTED" : st.status === "EXPIRED" || st.status === "INVALID" ? "EXPIRED" : "NOT_CONNECTED";
    recordMonitoringCycle(run, authStatus, new Date());
  } catch {
    try {
      const { recordMonitoringCycle } = await import("./sessionEvidenceStore.ts");
      recordMonitoringCycle(run, "UNKNOWN", new Date());
    } catch {
      // Ignore session store errors if unwriteable in isolated tests
    }
  }

  return run;
}
