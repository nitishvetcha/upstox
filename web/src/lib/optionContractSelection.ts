// Informational option-contract selection. Pure rules, no I/O, no order placement, no recommendation side effects.
// Every value is read from the chain rows supplied by the backend; nothing is hardcoded or inferred.
export type Side = "CE" | "PE";

export interface QuoteLite {
  ltp: number;
  instrumentKey?: string | null;
}
export interface ChainRowLite {
  strike: number;
  call: QuoteLite;
  put: QuoteLite;
}
export interface Selection {
  strike: number;
  side: Side;
}

export type SelectionResult =
  | { kind: "NONE" }
  | { kind: "MISSING"; reason: string }
  | { kind: "INVALID"; reason: string }
  | {
      kind: "OK";
      details: {
        instrumentKey: string | null;
        underlying: string;
        expiry: string;
        strike: number;
        optionType: Side;
        ltp: number | null;
        lotSize: number | null;
        lots: number;
        quantity: number | null;
      };
      notes: string[];
    };

export const MAX_LOTS_INPUT = 100;

export function resolveSelection(
  rows: ChainRowLite[],
  selection: Selection | null,
  underlying: string,
  expiry: string,
  lotSize: number | null,
  lots: number,
): SelectionResult {
  if (!selection) return { kind: "NONE" };
  if (selection.side !== "CE" && selection.side !== "PE") return { kind: "INVALID", reason: "Option type must be CE or PE." };
  if (!Number.isInteger(lots) || lots < 1 || lots > MAX_LOTS_INPUT) {
    return { kind: "INVALID", reason: `Lots must be a whole number from 1 to ${MAX_LOTS_INPUT}.` };
  }
  const row = rows.find((r) => r.strike === selection.strike);
  if (!row) return { kind: "MISSING", reason: `Strike ${selection.strike} is not in the current chain for ${expiry}.` };
  const quote = selection.side === "CE" ? row.call : row.put;
  const notes: string[] = [];
  const validLot = lotSize !== null && Number.isInteger(lotSize) && lotSize > 0;
  if (!validLot) notes.push("Lot size is unavailable for this contract, so quantity cannot be calculated.");
  if (!quote.instrumentKey) notes.push("Canonical instrument key is not provided by the data source.");
  if (!(quote.ltp > 0)) notes.push("No traded price for this contract; premium is not available.");
  return {
    kind: "OK",
    details: {
      instrumentKey: quote.instrumentKey ?? null,
      underlying,
      expiry,
      strike: row.strike,
      optionType: selection.side,
      ltp: quote.ltp > 0 ? quote.ltp : null,
      lotSize: validLot ? lotSize : null,
      lots,
      quantity: validLot ? lots * (lotSize as number) : null,
    },
    notes,
  };
}

// A selection is valid only for the symbol, expiry and chain it was made on. Any change clears it.
export function selectionStillValid(
  current: { underlying: string; expiry: string } | null,
  next: { underlying: string; expiry: string },
): boolean {
  if (!current) return false;
  return current.underlying === next.underlying && current.expiry === next.expiry;
}
