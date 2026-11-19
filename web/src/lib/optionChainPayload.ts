// Pure mapping from a provider option chain to the /api/option-chain response body.
// Passes instrumentKey and lotSize through exactly as the provider supplied them; never constructs or infers them.
import { atmStrike, sliceAroundAtm } from "./services/optionChainAnalytics.ts";
import type { OptionChain, Quote } from "./types.ts";

export interface ChainSideBody {
  ltp: number | null;
  bid: number | null;
  ask: number | null;
  volume: number | null;
  oi: number | null;
  changeOi: number | null;
  iv: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  instrumentKey: string | null;
}

export function sideBody(q: Quote): ChainSideBody {
  return {
    ltp: q.ltp,
    bid: q.bid,
    ask: q.ask,
    volume: q.volume,
    oi: q.oi,
    changeOi: q.chgOi,
    iv: q.iv,
    delta: q.delta,
    gamma: q.gamma ?? null,
    theta: q.theta ?? null,
    vega: q.vega ?? null,
    instrumentKey: q.instrumentKey ?? null,
  };
}

export function chainStrikes(data: Pick<OptionChain, "rows" | "spot">, range: number) {
  return sliceAroundAtm(data.rows, data.spot, range).map((r) => ({ strike: r.strike, call: sideBody(r.call), put: sideBody(r.put) }));
}

export function atmFor(data: Pick<OptionChain, "rows" | "spot">): number | null {
  return data.rows.length ? atmStrike(data.rows, data.spot) : null;
}

// The chain-level lot size, only when the provider supplied a positive whole number; otherwise null.
export function chainLotSize(data: Pick<OptionChain, "lotSize">): number | null {
  const v = data.lotSize;
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null;
}
