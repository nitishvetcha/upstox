// Journal outcome refresh, with its data access injected so the complete decision path is testable without live broker data.
// The API route calls this with the real functions. Tests call it with fixtures. Journal writes happen only through deps.updateEntry,
// and only after every provenance check has passed.
import { resolveRefreshPrice, type SnapshotLike, type RecLike } from "./journalRefresh.ts";
import { hasMockInput } from "./mockInputs.ts";

export interface RefreshEntry {
  id: string;
  status: string;
  snapshot: RecLike & { decision: string; execution?: unknown; underlying: string };
  outcome: unknown;
  [k: string]: unknown;
}

export interface RefreshDeps {
  getEntry(id: string): RefreshEntry | null;
  getSnapshot(index: "nifty" | "banknifty"): Promise<SnapshotLike & { sources: Record<string, { source: string }> }>;
  updateEntry(id: string, patch: { status: string; outcome: unknown }): RefreshEntry | null;
  computeOutcome(rec: unknown, price: number, now: Date, prev: unknown): { status: string } & Record<string, unknown>;
  now(): Date;
}

export interface RefreshResult { status: number; body: unknown }

const CLOSED = new Set(["STOPPED_OUT", "TARGET_1_HIT", "TARGET_2_HIT", "EXPIRED", "INVALIDATED", "CANCELLED"]);

export async function refreshJournalOutcome(id: string, deps: RefreshDeps): Promise<RefreshResult> {
  const entry = deps.getEntry(id);
  if (!entry) return { status: 404, body: { error: "Not found" } };

  const rec = entry.snapshot;
  // Non-trade and closed entries are returned unchanged, without any market fetch.
  if (rec.decision !== "TRADE" || !rec.execution) return { status: 200, body: entry };
  if (CLOSED.has(entry.status)) return { status: 200, body: entry };

  const index = rec.underlying === "BANKNIFTY" ? "banknifty" : "nifty";
  const snapshot = await deps.getSnapshot(index);

  // 1. MOCK or fallback input: never recorded.
  if (hasMockInput(snapshot as never)) {
    return { status: 409, body: { error: "MOCK_INPUT", reason: "snapshot contains MOCK or fallback data; outcome not recorded", journalUpdated: false } };
  }
  // 2. Only a LIVE option chain can supply a current price. STALE, END_OF_DAY and UNAVAILABLE are refused, not treated as current.
  const chainSource = snapshot.sources?.optionChain?.source;
  if (chainSource !== "LIVE") {
    return { status: 422, body: { error: "CHAIN_NOT_LIVE", reason: `option chain source is ${chainSource ?? "unknown"}; a current price cannot be established`, journalUpdated: false } };
  }
  // 3. The contract must exist in the chain with a positive price. No entry-price fallback.
  const resolved = resolveRefreshPrice(snapshot, rec);
  if (!resolved.ok) {
    return { status: resolved.code === "MOCK_INPUT" ? 409 : 422, body: { error: resolved.code, reason: resolved.reason, journalUpdated: false } };
  }

  const outcome = deps.computeOutcome(rec, resolved.price, deps.now(), entry.outcome);
  const updated = deps.updateEntry(id, { status: outcome.status, outcome });
  if (!updated) return { status: 500, body: { error: "journal entry disappeared during refresh", journalUpdated: false } };
  return { status: 200, body: updated };
}
