// Maps opportunity-card data to a saved pick. Pure: no I/O, no engine imports.
//
// Two separate statuses, never merged:
//   - DATA PROVENANCE (pick.source): where the price came from and whether it is verified live.
//   - STRATEGY VALIDATION (pick.validation): always NOT_VALIDATED from this mapping (the API refuses VALIDATED from users).
//
// A source tag alone is never enough for LIVE. The rules below require explicit evidence and fail closed to RESEARCH.
import type { PickInput, PickSource } from "./savedPicks.ts";

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const isMock = (v: unknown) => typeof v === "string" && v.toUpperCase() === "MOCK";

export interface StockCardInput {
  symbol: string;
  direction: "BULLISH" | "BEARISH";
  entry: number;
  stop: number;
  target1: number;
  target2: number;
  source?: string | null;          // stock quote source tag
  freshness?: string | null;       // derived from exchange last-trade time
  exchangeTimestamp?: string | null;
  fetchedAt?: string | null;
  dataAgeSeconds?: number | null;
  provider?: string | null;        // any MOCK provider marker must block LIVE
}

export interface ContractCardInput {
  underlying: string;
  expiry: string | null;
  strike: number;
  optionType: "CE" | "PE";
  entry: number;
  stop: number;
  target1: number;
  target2: number;
  contractPriceQuality?: string | null;
  ltpConsistent?: boolean | null;
  lastTradeTime?: string | null;
  snapshotSource?: string | null;  // aggregate source of the snapshot the card was built from
  strategyType?: string | null;
  legs?: unknown[];
  isMultiLeg?: boolean | null;
}

export interface Provenance {
  source: PickSource;
  reason: string;
}

// LIVE for a stock requires: UPSTOX tag AND freshness LIVE AND an exchange timestamp AND a fetch time AND an age
// AND no MOCK marker anywhere. Any conflict is reported in `reason`.
export function stockProvenance(s: StockCardInput): Provenance {
  if (isMock(s.provider) || isMock(s.source)) return { source: "RESEARCH", reason: "mock marker present: not live" };
  if (s.source !== "UPSTOX") return { source: "RESEARCH", reason: `quote source "${s.source ?? "none"}" is not UPSTOX` };
  if (s.freshness !== "LIVE") return { source: "RESEARCH", reason: `freshness "${s.freshness ?? "none"}" is not LIVE` };
  if (!s.exchangeTimestamp) return { source: "RESEARCH", reason: "no exchange timestamp" };
  if (!s.fetchedAt) return { source: "RESEARCH", reason: "no fetch time" };
  if (!finite(s.dataAgeSeconds)) return { source: "RESEARCH", reason: "no data age" };
  return { source: "LIVE", reason: `Upstox quote, LTT ${s.exchangeTimestamp}, age ${s.dataAgeSeconds}s` };
}

// LIVE for an option requires: CONTRACT_PRICE_LIVE (the engine's verified quote + last-trade check) AND
// ltp consistent with an independent quote AND a last-trade time AND the snapshot itself LIVE (not a MOCK fallback).
export function contractProvenance(c: ContractCardInput): Provenance {
  if (isMock(c.snapshotSource)) return { source: "RESEARCH", reason: "snapshot is MOCK (fallback): not live" };
  if (c.snapshotSource !== "LIVE") return { source: "RESEARCH", reason: `snapshot source "${c.snapshotSource ?? "none"}" is not LIVE` };
  if (c.contractPriceQuality !== "CONTRACT_PRICE_LIVE") return { source: "RESEARCH", reason: `contract price "${c.contractPriceQuality ?? "none"}"` };
  if (c.ltpConsistent !== true) return { source: "RESEARCH", reason: "contract LTP not consistent with independent quote" };
  if (!c.lastTradeTime) return { source: "RESEARCH", reason: "no last-trade time" };
  return { source: "LIVE", reason: `verified contract quote, LTT ${c.lastTradeTime}` };
}

export function pickFromStock(s: StockCardInput): PickInput {
  const prov = stockProvenance(s);
  return {
    instrument: s.symbol,
    instrumentType: "STOCK",
    direction: s.direction === "BEARISH" ? "SHORT" : "LONG",
    entry: finite(s.entry) ? s.entry : null,
    stopLoss: finite(s.stop) ? s.stop : null,
    targets: [s.target1, s.target2].filter(finite),
    source: prov.source,
    note: `Saved from stock opportunity card. Data: ${prov.source} (${prov.reason}). Not a validated signal.`,
  };
}

export function pickFromContract(c: ContractCardInput): PickInput {
  if (
    c.strategyType === "BEAR_PUT_SPREAD" ||
    c.strategyType === "BULL_CALL_SPREAD" ||
    Boolean(c.isMultiLeg) ||
    (Array.isArray(c.legs) && c.legs.length > 1)
  ) {
    throw new Error(`Multi-leg strategy ${c.strategyType ?? "spread"} is not supported for saved picks`);
  }
  const prov = contractProvenance(c);
  return {
    instrument: [c.underlying, c.expiry, c.strike, c.optionType].filter((x) => x != null && x !== "").join(" "),
    instrumentType: "INDEX_OPTION",
    direction: "LONG", // bought premium (long call or long put); stop and targets are on the option price
    entry: finite(c.entry) ? c.entry : null,
    stopLoss: finite(c.stop) ? c.stop : null,
    targets: [c.target1, c.target2].filter(finite),
    source: prov.source,
    note: `Saved from options opportunity card (${c.optionType === "CE" ? "long call" : "long put"}). Data: ${prov.source} (${prov.reason}). Not a validated signal.`,
  };
}
