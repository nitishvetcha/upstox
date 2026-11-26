// The only place Upstox instrument keys live. Update here if Upstox renames an instrument.
// Dynamic MCX contracts are resolved at runtime via mcxContractResolver.ts; the static
// COMMODITIES entries below serve as the synchronous fallback / type source-of-truth.
import type { IndexId, CommodityId, UnderlyingId } from "../types.ts";
import { getCachedMcxContract } from "./mcxContractResolver.ts";

export type { CommodityId, UnderlyingId };

export interface Instrument {
  id: IndexId;
  symbol: string; // our API symbol
  name: string; // display name
  underlyingKey: string; // Upstox instrument_key of the index
}

export const INSTRUMENTS: Record<IndexId, Instrument> = {
  nifty: { id: "nifty", symbol: "NIFTY", name: "NIFTY 50", underlyingKey: "NSE_INDEX|Nifty 50" },
  banknifty: { id: "banknifty", symbol: "BANKNIFTY", name: "BANK NIFTY", underlyingKey: "NSE_INDEX|Nifty Bank" },
  finnifty: { id: "finnifty", symbol: "FINNIFTY", name: "NIFTY FIN SERVICE", underlyingKey: "NSE_INDEX|Nifty Fin Service" },
  midcpnifty: { id: "midcpnifty", symbol: "MIDCPNIFTY", name: "NIFTY MIDCAP SELECT", underlyingKey: "NSE_INDEX|NIFTY MID SELECT" },
  sensex: { id: "sensex", symbol: "SENSEX", name: "SENSEX", underlyingKey: "BSE_INDEX|SENSEX" },
  bankex: { id: "bankex", symbol: "BANKEX", name: "BANKEX", underlyingKey: "BSE_INDEX|BANKEX" },
};

export const INDICES = Object.keys(INSTRUMENTS) as IndexId[];

export function isIndexId(v: string): v is IndexId {
  return v in INSTRUMENTS;
}

// -----------------------------------------------------------------------------
// MCX Commodity Instruments (Crude Oil, Natural Gas)
// -----------------------------------------------------------------------------

export interface CommodityInstrument {
  id: CommodityId;
  symbol: string;
  name: string;
  underlyingKey: string;
  lotSize: number;
  strikeStep: number;
  segment: "COMMODITY";
  exchange: "MCX";
}

export const COMMODITIES: Record<CommodityId, CommodityInstrument> = {
  crudeoil: {
    id: "crudeoil",
    symbol: "CRUDEOIL",
    name: "CRUDE OIL",
    underlyingKey: process.env.MCX_CRUDEOIL_KEY || "MCX_FO|576264", // Active Dec 2026 Crude Oil Futures
    lotSize: 100, // 100 bbl
    strikeStep: 50, // ₹50 step
    segment: "COMMODITY",
    exchange: "MCX",
  },
  naturalgas: {
    id: "naturalgas",
    symbol: "NATURALGAS",
    name: "NATURAL GAS",
    underlyingKey: process.env.MCX_NATURALGAS_KEY || "MCX_FO|578249", // Active Dec 2026 Natural Gas Futures
    lotSize: 1250, // 1,250 mmBtu
    strikeStep: 5, // ₹5 step
    segment: "COMMODITY",
    exchange: "MCX",
  },
};

export const COMMODITY_IDS = Object.keys(COMMODITIES) as CommodityId[];

export function isCommodityId(v: string): v is CommodityId {
  return v in COMMODITIES;
}

export type SupportedUnderlying = UnderlyingId;
export const ALL_UNDERLYINGS: UnderlyingId[] = [...INDICES, ...COMMODITY_IDS];

export function isUnderlyingId(v: string): v is UnderlyingId {
  return isIndexId(v) || isCommodityId(v);
}

export function getUnderlyingInstrument(v: UnderlyingId | string): Instrument | CommodityInstrument | undefined {
  if (isIndexId(v)) return INSTRUMENTS[v];
  if (isCommodityId(v)) {
    // If the MCX resolver has already warmed the cache, return an overlay with the
    // live instrument key so option chains and quotes auto-roll without a restart.
    const cached = getCachedMcxContract(v);
    if (cached) {
      return { ...COMMODITIES[v], underlyingKey: cached.instrumentKey, lotSize: cached.lotSize };
    }
    return COMMODITIES[v];
  }
  return undefined;
}

export function getInstrumentBySymbol(symbol: string): Instrument | CommodityInstrument | undefined {
  const upper = symbol.toUpperCase();
  for (const inst of Object.values(INSTRUMENTS)) {
    if (inst.symbol.toUpperCase() === upper) return inst;
  }
  for (const comm of Object.values(COMMODITIES)) {
    if (comm.symbol.toUpperCase() === upper) return comm;
  }
  return undefined;
}

/**
 * Returns the active Upstox instrument key for a commodity, preferring the
 * dynamically resolved key (if the cache is warm) over the static env/default.
 * For index instruments, this is identical to `getUnderlyingInstrument(v)?.underlyingKey`.
 */
export function getActiveUnderlyingKey(v: UnderlyingId): string | undefined {
  if (isIndexId(v)) return INSTRUMENTS[v].underlyingKey;
  if (isCommodityId(v)) {
    const cached = getCachedMcxContract(v);
    return cached?.instrumentKey ?? COMMODITIES[v].underlyingKey;
  }
  return undefined;
}
