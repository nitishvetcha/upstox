// Read-only view of the latest STORED options research round per index. These are historical collection samples,
// not live data. Freshness is judged against the current clock, so a stored round is reported as stale rather than live.
import * as fs from "node:fs";
import * as path from "node:path";
import type { ChainRow, QuoteSide, UnderlyingState } from "./recommend.ts";

export const RESEARCH_FILE = path.join(process.cwd(), ".data/options-audit-research/rounds-research.jsonl");
export const INDEX_IDS = ["nifty", "banknifty", "finnifty", "midcpnifty", "sensex", "bankex"] as const;

interface Sample {
  key: string;
  strike: number;
  type: "CE" | "PE";
  expiry: string;
  chainLtp: number | null;
  quoteLtp: number | null;
  quoteBestBid: number | null;
  quoteBestAsk: number | null;
  quoteLastTradeTime: string | null;
  chainIv: number | null;
  recomputedIv: number | null;
  liquid: boolean;
  timeToExpiryYears: number | null;
}
interface Round {
  index: string;
  at: string;
  spot: number;
  expiry: string;
  marketState: string | null;
  exchangeStatus: string | null;
  samples: Sample[];
  error?: string;
}

export interface StoredSnapshot {
  index: string;
  label: string;
  storedAt: string;
  spot: number;
  expiry: string;
  marketState: string | null;
  exchangeStatus: string | null;
  underlying: UnderlyingState;
  chain: ChainRow[];
  samples: number;
  liquidSamples: number;
  withQuote: number;
  withBidAsk: number;
  withChainIv: number;
}

function loadRounds(): Round[] {
  try {
    return fs
      .readFileSync(RESEARCH_FILE, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Round);
  } catch {
    return [];
  }
}

// Latest round per index, by capture time, excluding rounds that recorded an error.
export function latestStoredRounds(): Map<string, Round> {
  const latest = new Map<string, Round>();
  for (const r of loadRounds()) {
    if (r.error || !r.samples?.length) continue;
    const prev = latest.get(r.index);
    if (!prev || r.at > prev.at) latest.set(r.index, r);
  }
  return latest;
}

function side(s: Sample | undefined): QuoteSide | null {
  if (!s) return null;
  return {
    ltp: s.quoteLtp ?? 0,
    bid: s.quoteBestBid,
    ask: s.quoteBestAsk,
    oi: null, // not recorded in the research samples
    volume: null, // not recorded in the research samples
    lastTradeTime: s.quoteLastTradeTime,
    instrumentKey: s.key,
  };
}

export function snapshotFromRound(r: Round): StoredSnapshot {
  const byStrike = new Map<number, { call?: Sample; put?: Sample; expiry: string }>();
  for (const s of r.samples) {
    const e = byStrike.get(s.strike) ?? { expiry: s.expiry };
    if (s.type === "CE") e.call = s;
    else e.put = s;
    byStrike.set(s.strike, e);
  }
  const chain: ChainRow[] = [...byStrike.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([strike, e]) => ({ strike, expiry: e.expiry, lotSize: null, call: side(e.call), put: side(e.put) }));
  const underlying: UnderlyingState = {
    index: r.index,
    spot: r.spot,
    asOf: r.at,
    marketState: r.marketState,
    trend: "NONE", // the research samples carry no trend or VWAP inputs
    vwap: null,
    swingLow: null,
    swingHigh: null,
    target: null,
    eventRisk: null, // no event-risk history is stored
    chainTimestamp: r.at, // local collection time; the chain has no exchange generation time
  };
  return {
    index: r.index,
    label: r.index.toUpperCase(),
    storedAt: r.at,
    spot: r.spot,
    expiry: r.expiry,
    marketState: r.marketState,
    exchangeStatus: r.exchangeStatus,
    underlying,
    chain,
    samples: r.samples.length,
    liquidSamples: r.samples.filter((s) => s.liquid).length,
    withQuote: r.samples.filter((s) => s.quoteLtp !== null).length,
    withBidAsk: r.samples.filter((s) => s.quoteBestBid !== null && s.quoteBestAsk !== null).length,
    withChainIv: r.samples.filter((s) => s.chainIv !== null).length,
  };
}

export function storedSnapshots(): StoredSnapshot[] {
  const latest = latestStoredRounds();
  return INDEX_IDS.filter((ix) => latest.has(ix)).map((ix) => snapshotFromRound(latest.get(ix)!));
}
