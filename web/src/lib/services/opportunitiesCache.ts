// Stale-While-Revalidate cache for /opportunities so navigation and auto-refresh respond in <2s
// instead of blocking HTTP requests on 10-underlying snapshots + full equity scans.
import { getCachedSnapshot, getSnapshot } from "./market.ts";
import { ALL_UNDERLYINGS, INDICES, INSTRUMENTS, COMMODITY_IDS, COMMODITIES } from "./instrumentRegistry.ts";
import { evaluateOptionsOpportunity, type OptionsOpportunityResult } from "../engine/opportunityEngine.ts";
import { scanStocks, STOCK_OPPORTUNITY_VERSION, type StockOpportunityResult } from "../engine/stockOpportunityEngine.ts";
import { scanLongTerm, type LongTermResult } from "../engine/longTermEngine.ts";
import { commodityMarketStatus } from "../time.ts";

export interface OpportunitiesDataPayload {
  indexOptions: OptionsOpportunityResult[];
  failedIndices: string[];
  intradayResult: StockOpportunityResult;
  swingResult: StockOpportunityResult;
  ltResult: LongTermResult;
  now: Date;
  warming?: boolean;
}

const OPPS_FRESH_MS = 20_000;
const OPPS_STALE_MS = 10 * 60_000;
const OPPS_COLD_BUDGET_MS = 1_500;

const gOpps = globalThis as typeof globalThis & {
  __warmOpportunities?: { data: OpportunitiesDataPayload; updatedAt: number };
  __refreshingOpportunities?: Promise<OpportunitiesDataPayload> | null;
};

function warmingStockResult(kind: "intraday" | "swing", now: Date): StockOpportunityResult {
  return {
    timestamp: now.toISOString(),
    engineVersion: STOCK_OPPORTUNITY_VERSION,
    kind,
    source: "UNAVAILABLE",
    freshness: "WARMING",
    universe: "NIFTY_50",
    stocksScanned: 0,
    stocksAvailable: 0,
    stocksRejected: 0,
    niftyChange: null,
    topOpportunities: [],
    noOpportunityReason: "Live stock scan warming in background — auto-refreshing shortly.",
  };
}

async function computeOpportunitiesFresh(): Promise<OpportunitiesDataPayload> {
  const now = new Date();
  const activeCommodities = commodityMarketStatus(now) === "OPEN" ? COMMODITY_IDS : [];
  const [snaps, commSnaps, intradayResult, swingResult, ltResult] = await Promise.all([
    Promise.allSettled(INDICES.map((i) => getSnapshot(i))),
    Promise.allSettled(activeCommodities.map((c) => getSnapshot(c))),
    scanStocks("intraday", now),
    scanStocks("swing", now),
    scanLongTerm(),
  ]);
  const allSnaps = [
    ...snaps.map((r, k) => ({ r, sym: INSTRUMENTS[INDICES[k]].symbol })),
    ...commSnaps.map((r, k) => ({ r, sym: COMMODITIES[activeCommodities[k]].symbol })),
  ];
  const indexOptions = allSnaps.flatMap(({ r, sym }) =>
    r.status === "fulfilled" ? [evaluateOptionsOpportunity(r.value, sym, now)] : [],
  );
  const failedIndices = allSnaps.flatMap(({ r, sym }) =>
    r.status === "rejected" ? [`${sym}: ${(r.reason as Error)?.message ?? "failed"}`] : [],
  );
  const payload: OpportunitiesDataPayload = {
    indexOptions,
    failedIndices,
    intradayResult,
    swingResult,
    ltResult,
    now,
    warming: false,
  };
  gOpps.__warmOpportunities = { data: payload, updatedAt: Date.now() };
  return payload;
}

export function triggerOpportunitiesRevalidate(): Promise<OpportunitiesDataPayload> {
  if (gOpps.__refreshingOpportunities) return gOpps.__refreshingOpportunities;
  gOpps.__refreshingOpportunities = computeOpportunitiesFresh().finally(() => {
    gOpps.__refreshingOpportunities = null;
  });
  return gOpps.__refreshingOpportunities;
}

// Counter-direction scenario for one symbol, computed only when a user asks for it.
export async function computeAlternativeScenario(symbol: string): Promise<OptionsOpportunityResult | null> {
  const id = ALL_UNDERLYINGS.find((i) => (i in INSTRUMENTS ? INSTRUMENTS[i as keyof typeof INSTRUMENTS].symbol : COMMODITIES[i as keyof typeof COMMODITIES].symbol) === symbol);
  if (!id) return null;
  const snap = await getSnapshot(id).catch(() => null);
  if (!snap) return null;
  const now = new Date();
  const primary = evaluateOptionsOpportunity(snap, symbol, now);
  const counterType: "CE" | "PE" = primary.marketDirection === "BEARISH" ? "CE" : "PE";
  const counter = evaluateOptionsOpportunity(snap, symbol, now, counterType);
  counter.isAlternativeScenario = true;
  return counter;
}

export async function getOpportunitiesSWR(deps?: {
  scanStocks?: typeof scanStocks;
  scanLongTerm?: typeof scanLongTerm;
}): Promise<OpportunitiesDataPayload> {
  void deps;
  const nowMs = Date.now();
  const cached = gOpps.__warmOpportunities;

  if (cached && nowMs - cached.updatedAt <= OPPS_FRESH_MS) {
    return cached.data;
  }

  if (cached && nowMs - cached.updatedAt <= OPPS_STALE_MS) {
    void triggerOpportunitiesRevalidate().catch(() => {});
    return cached.data;
  }

  const refreshPromise = triggerOpportunitiesRevalidate();
  const completed = await Promise.race<OpportunitiesDataPayload | null>([
    refreshPromise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), OPPS_COLD_BUDGET_MS)),
  ]);

  if (completed) return completed;
  if (gOpps.__warmOpportunities) return gOpps.__warmOpportunities.data;

  // Cold boot beyond 1.5s: render immediately with any already-cached snapshots + fast long-term scan
  const now = new Date();
  const partialSnaps = [
    ...INDICES.map((id) => ({ id, sym: INSTRUMENTS[id].symbol })),
    ...(commodityMarketStatus(now) === "OPEN"
      ? COMMODITY_IDS.map((id) => ({ id, sym: COMMODITIES[id].symbol }))
      : []),
  ]
    .map(({ id, sym }) => ({ snap: getCachedSnapshot(id), sym }))
    .filter((x): x is { snap: NonNullable<ReturnType<typeof getCachedSnapshot>>; sym: string } => x.snap !== null);

  const indexOptions = partialSnaps.map(({ snap, sym }) => evaluateOptionsOpportunity(snap, sym, now));

  const ltResult = await scanLongTerm();
  return {
    indexOptions,
    failedIndices: [],
    intradayResult: warmingStockResult("intraday", now),
    swingResult: warmingStockResult("swing", now),
    ltResult,
    now,
    warming: true,
  };
}
