// Decision rules for opening a stored paper opportunity. Pure: the caller supplies the facts.
// An opportunity is opened only when every server-side gate passes. Otherwise an explicit reason is returned.
import type { ServerProvenance } from "./paperOpportunityProvenance.ts";

export type OpenCode =
  | "NOT_FOUND" | "ALREADY_OPENED" | "NOT_OPEN" | "UNSUPPORTED" | "PROVENANCE"
  | "CIRCUIT_BREAKER_TRIPPED" | "NO_PLAN" | "PLAN_REJECTED" | "ENGINE_REJECTED" | "OPENED";

export interface OpenFacts {
  opp: { status: string; openedPaperTradeId?: string | null; instrumentType: string } | null;
  provenance: ServerProvenance | null;
  circuitBreakerRejected?: string | null;
  hasPlan: boolean;
  planRejected: string | null;
  engine: { created: boolean; reason: string; tradeId: string | null } | null;
  detail?: string[]; // explicit no-trade reasons from the fresh analysis (blockers, candidate rejections)
}

export interface OpenDecision { code: OpenCode; ok: boolean; status: number; reasons: string[] }

// Operator-facing text for an engine refusal. A ledger write failure never exposes the filesystem path or exception text:
// the full error is written to the redacted server log (paper_ledger_save_failed) instead.
export function publicEngineReason(reason: string): string {
  if (reason.startsWith("LEDGER_WRITE_FAILED")) return "LEDGER_WRITE_FAILED: the paper ledger could not be saved; no trade was opened";
  return reason;
}

export function decideOpen(f: OpenFacts): OpenDecision {
  const deny = (code: OpenCode, status: number, reasons: string[]): OpenDecision => ({ code, ok: false, status, reasons });
  if (!f.opp) return deny("NOT_FOUND", 404, ["opportunity not found"]);
  if (f.opp.openedPaperTradeId) return deny("ALREADY_OPENED", 409, [`already opened as ${f.opp.openedPaperTradeId}`]);
  if (f.opp.status !== "OPEN") return deny("NOT_OPEN", 422, [`opportunity status is ${f.opp.status}`]);
  if (f.opp.instrumentType !== "OPTION") return deny("UNSUPPORTED", 422, ["only index option opportunities can be opened"]);
  if (!f.provenance || !f.provenance.ok) return deny("PROVENANCE", 422, f.provenance?.reasons ?? ["no server snapshot"]);
  if (f.circuitBreakerRejected) return deny("CIRCUIT_BREAKER_TRIPPED", 422, [f.circuitBreakerRejected]);
  if (!f.hasPlan) return deny("NO_PLAN", 422, ["fresh analysis produced no trade plan", ...(f.detail ?? [])]);
  if (f.planRejected) return deny("PLAN_REJECTED", 422, [f.planRejected]);
  if (!f.engine) return deny("ENGINE_REJECTED", 422, ["paper engine was not consulted"]);
  if (!f.engine.created || !f.engine.tradeId) return deny("ENGINE_REJECTED", 422, [f.engine.reason || "paper engine refused the trade"]);
  return { code: "OPENED", ok: true, status: 201, reasons: [] };
}
