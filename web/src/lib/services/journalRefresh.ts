// Price resolution for refreshing a journal entry's outcome. Journal outcomes must come only from genuine,
// non-mock market data. A missing price is an error, never silently replaced by the entry price.
import { hasMockInput } from "./mockInputs.ts";

interface SideLike { instrumentKey?: string | null; ltp?: number | null; ask?: number | null }
interface RowLike { strike: number; call: SideLike; put: SideLike }
export interface SnapshotLike {
  chain: RowLike[];
  fallbackReason?: string | null;
  sources: Record<string, { source: string }>;
}
export interface RecLike {
  contract?: { instrumentKey?: string | null; strike: number; optionType: "CE" | "PE" } | null;
}

export type RefreshPrice =
  | { ok: true; price: number }
  | { ok: false; code: "MOCK_INPUT" | "CONTRACT_NOT_IN_CHAIN" | "NO_PRICE"; reason: string };

// Resolve the current price for the recommendation's contract. Refuses MOCK snapshots outright.
export function resolveRefreshPrice(snapshot: SnapshotLike, rec: RecLike): RefreshPrice {
  if (hasMockInput(snapshot as never)) {
    return { ok: false, code: "MOCK_INPUT", reason: "snapshot contains MOCK or fallback data; outcome not recorded" };
  }
  const contract = rec.contract;
  if (!contract) return { ok: false, code: "CONTRACT_NOT_IN_CHAIN", reason: "recommendation has no contract" };

  const row = contract.instrumentKey
    ? snapshot.chain.find((r) => r.call.instrumentKey === contract.instrumentKey || r.put.instrumentKey === contract.instrumentKey)
    : snapshot.chain.find((r) => r.strike === contract.strike);
  if (!row) return { ok: false, code: "CONTRACT_NOT_IN_CHAIN", reason: `contract ${contract.instrumentKey ?? contract.strike} not in current chain` };

  const side = contract.instrumentKey
    ? (row.call.instrumentKey === contract.instrumentKey ? row.call : row.put)
    : (contract.optionType === "CE" ? row.call : row.put);
  const price = [side.ltp, side.ask].find((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);
  if (price === undefined) return { ok: false, code: "NO_PRICE", reason: "no positive last traded or ask price for the contract" };
  return { ok: true, price };
}
