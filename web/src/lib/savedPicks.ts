// Saved picks: user-selected recommendations kept for review. Separate from the recommendation journal.
// A pick is NEVER a validated signal unless its validation status says so. Mock data cannot be saved as LIVE.
import * as fs from "node:fs";
import * as path from "node:path";

export type PickSource = "MOCK" | "LIVE" | "RESEARCH";
export type ValidationStatus = "NOT_VALIDATED" | "RESEARCH_ONLY" | "VALIDATED";

export interface SavedPick {
  id: string;
  savedAt: string;            // ISO timestamp
  instrument: string;         // symbol or contract label
  instrumentType: "INDEX" | "STOCK" | "INDEX_OPTION" | "STOCK_OPTION" | "OTHER";
  direction: "LONG" | "SHORT";
  entry?: number | null;
  stopLoss?: number | null;
  targets?: number[];
  source: PickSource;         // where the price data came from
  note?: string;
  validation: ValidationStatus;
}

export interface PickInput extends Omit<SavedPick, "id" | "savedAt" | "validation"> {
  validation?: ValidationStatus;
}

const SOURCES: PickSource[] = ["MOCK", "LIVE", "RESEARCH"];

// Display label for any pick. Unvalidated picks are always labelled NOT VALIDATED.
export function statusLabel(p: Pick<SavedPick, "validation" | "source">): string {
  if (p.source === "MOCK") return "MOCK DATA: NOT VALIDATED";
  if (p.validation === "VALIDATED") return "VALIDATED (historical evidence only, not a profit claim)";
  if (p.validation === "RESEARCH_ONLY") return "RESEARCH ONLY: NOT VALIDATED";
  return "NOT VALIDATED";
}

export function validatePick(input: PickInput): string[] {
  const errs: string[] = [];
  if (typeof input.instrument !== "string" || input.instrument.trim().length < 2) errs.push("instrument required");
  if (!SOURCES.includes(input.source)) errs.push("source must be MOCK, LIVE or RESEARCH");
  if (input.direction !== "LONG" && input.direction !== "SHORT") errs.push("direction must be LONG or SHORT");
  if (input.entry != null && !(input.entry > 0)) errs.push("entry must be positive");
  if (input.stopLoss != null && !(input.stopLoss > 0)) errs.push("stopLoss must be positive");
  if (input.entry != null && input.stopLoss != null) {
    if (input.direction === "LONG" && input.stopLoss >= input.entry) errs.push("LONG stop must be below entry");
    if (input.direction === "SHORT" && input.stopLoss <= input.entry) errs.push("SHORT stop must be above entry");
  }
  if (input.validation === "VALIDATED") errs.push("a pick cannot be saved as VALIDATED by a user; validation is set by a registered protocol only");
  return errs;
}

// Persistence: a single JSON file, written atomically. The path is supplied by the caller (never the journal path).
export function loadPicks(file: string): SavedPick[] {
  try {
    const raw = fs.readFileSync(file, "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? (data as SavedPick[]) : [];
  } catch {
    return [];
  }
}

// IST calendar day of an instant, used for duplicate detection (one identical card per day).
export function istDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

// Identity of a saved card: the same instrument, direction, levels and source saved on the same IST day is a duplicate.
export function duplicateKey(p: Pick<SavedPick, "instrument" | "instrumentType" | "direction" | "entry" | "stopLoss" | "targets" | "source">, savedAt: string): string {
  return [p.instrument.trim().toUpperCase(), p.instrumentType, p.direction, p.entry ?? "", p.stopLoss ?? "", (p.targets ?? []).join("|"), p.source, istDay(new Date(savedAt))].join("#");
}

export type SaveResult =
  | { ok: true; pick: SavedPick }
  | { ok: false; errors: string[] }
  | { ok: false; duplicate: true; existing: SavedPick };

export function savePick(file: string, input: PickInput, now = new Date()): SaveResult {
  const errors = validatePick(input);
  if (errors.length) return { ok: false, errors };
  const savedAt = now.toISOString();
  const all = loadPicks(file);
  const key = duplicateKey(input, savedAt);
  const existing = all.find((p) => duplicateKey(p, p.savedAt) === key);
  if (existing) return { ok: false, duplicate: true, existing };
  const pick: SavedPick = {
    ...input,
    validation: input.validation ?? "NOT_VALIDATED",
    id: `pick-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt,
  };
  all.push(pick);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(all, null, 2));
  fs.renameSync(tmp, file);
  return { ok: true, pick };
}

export function removePick(file: string, id: string): boolean {
  const all = loadPicks(file);
  const next = all.filter((p) => p.id !== id);
  if (next.length === all.length) return false;
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
  fs.renameSync(tmp, file);
  return true;
}
