// Outcome tracking for opportunity-engine recommendations.
// Stores initial recommendation snapshot (immutable) + mutable outcome fields.
// Does NOT create real orders. Paper-trade only.
import * as fs from "node:fs";
import * as path from "node:path";
import type { OpportunityGrade } from "../engine/opportunityEngine.ts";

const DIR = process.env.OPPORTUNITY_TRACK_DIR
  ?? path.join(process.cwd(), ".data", "opportunity-tracking");

export type OutcomeState = "OPEN" | "TARGET1_HIT" | "TARGET2_HIT" | "STOP_HIT" | "EXPIRED" | "INVALIDATED";

export interface OpportunityRecord {
  id: string;
  trackedAt: string;
  engineVersion: string;
  // Immutable recommendation snapshot
  underlying: string;
  instrumentKey: string | null;
  symbol: string | null;          // stocks only
  optionType: "CE" | "PE" | null; // options only
  expiry: string | null;
  strike: number | null;
  strategyType: string;
  entry: number;
  stop: number;
  target1: number;
  target2: number;
  rr: number;
  opportunityScore: number;
  grade: OpportunityGrade;
  confidence: number;
  regime: string;
  direction: string;
  reasons: string[];
  // Mutable outcome
  outcome: OutcomeState;
  mfe: number | null;   // max favorable excursion from entry (positive = in our direction)
  mae: number | null;   // max adverse excursion from entry (positive = against us)
  exitPrice: number | null;
  exitAt: string | null;
  notes: string | null;
}

function filePath(id: string) {
  return path.join(DIR, `opp_${id.replace(/[^\w-]/g, "")}.json`);
}

export function listOpportunityRecords(): OpportunityRecord[] {
  try {
    if (!fs.existsSync(DIR)) return [];
    return fs.readdirSync(DIR)
      .filter((f) => f.startsWith("opp_") && f.endsWith(".json"))
      .map((f) => {
        try { return JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) as OpportunityRecord; }
        catch { return null; }
      })
      .filter((r): r is OpportunityRecord => r !== null)
      .sort((a, b) => b.trackedAt.localeCompare(a.trackedAt));
  } catch { return []; }
}

export function saveOpportunityRecord(rec: OpportunityRecord): void {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(filePath(rec.id), JSON.stringify(rec, null, 2));
}

export function getOpportunityRecord(id: string): OpportunityRecord | null {
  try { return JSON.parse(fs.readFileSync(filePath(id), "utf8")); }
  catch { return null; }
}

export function updateOpportunityRecord(
  id: string,
  patch: Partial<Pick<OpportunityRecord, "outcome" | "mfe" | "mae" | "exitPrice" | "exitAt" | "notes">>,
): OpportunityRecord | null {
  const rec = getOpportunityRecord(id);
  if (!rec) return null;
  const updated = { ...rec, ...patch };
  saveOpportunityRecord(updated);
  return updated;
}
