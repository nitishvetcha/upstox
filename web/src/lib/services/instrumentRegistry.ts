// The only place Upstox instrument keys live. Update here if Upstox renames an instrument.
import type { IndexId } from "../types.ts";

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
