// Server-only entry point for market data. The UI and API routes call these functions and never
// touch a provider directly. MARKET_DATA_PROVIDER=upstox uses live data when logged in, else mock.
import { cache } from "react";
import { getCachedMcxContract } from "./mcxContractResolver.ts";
import { logEvent } from "../ops/structuredLog.ts";
import type { FallbackReason, IndexId, UnderlyingId, MarketDataProvider, News, Snapshot, SourceInfo } from "../types.ts";
import { getIndexNews } from "./newsProvider.ts";
import { MOCK_NEWS, mockSource } from "./mock.ts";
import { mockProvider } from "./mockMarket.ts";
import { upstoxProvider } from "./upstoxMarket.ts";
import { InvalidRequestError, UpstoxError } from "./errors.ts";
import { getAccessToken, markTokenInvalid, resolveCredential, tokenStatus, type Credential, type CredentialSource, type TokenStatus } from "./upstoxAuth.ts";
import { INDICES, INSTRUMENTS, COMMODITY_IDS, getUnderlyingInstrument, isIndexId } from "./instrumentRegistry.ts";
import { chainMetrics } from "./optionChainAnalytics.ts";
import { chainFreshness } from "./chainFreshness.ts";
import { analyze, recommendationOfTheDay } from "../engine/strategy.ts";
import { freshnessOf, tradeFreshnessOf, commodityMarketStatus } from "../time.ts";
import { quoteManager } from "./streamingQuoteManager.ts";
import { STOCK_OPPORTUNITY_VERSION } from "../engine/stockOpportunityEngine.ts";

export { INDICES };
export type ProviderMode = "mock" | "upstox";

export function providerMode(): ProviderMode {
  return process.env.MARKET_DATA_PROVIDER === "upstox" ? "upstox" : "mock";
}

export interface FallbackDeps {
  mode: ProviderMode;
  getToken: () => Promise<string | null>;
  // Source-aware credential. When absent, a token from getToken is treated as the OAuth token (the previous behaviour).
  getCredential?: () => Promise<Credential | null>;
  // Called after a 401. Only the OAuth file may be invalidated: an analytics-token 401 must not touch it.
  onAuthExpired: (source: CredentialSource) => Promise<void>;
  // Why there is no token: an expired/rejected session must read as UPSTOX_AUTH_EXPIRED, not "never connected".
  tokenStatus?: () => Promise<TokenStatus>;
  now?: () => Date;
}

export const defaultFallbackDeps = (): FallbackDeps => ({
  mode: providerMode(),
  getToken: getAccessToken,
  getCredential: resolveCredential,
  onAuthExpired: async (source) => {
    if (source === "OAUTH") await markTokenInvalid();
  },
  tokenStatus: async () => (await tokenStatus()).status,
});

// Run `call` against Upstox when possible; on any Upstox failure, log it and rerun against mock,
// returning why. A bad request (unknown expiry) is the caller's error and is rethrown, not masked.
export async function withFallback<T>(
  call: (p: MarketDataProvider) => Promise<T>,
  deps: FallbackDeps = defaultFallbackDeps(),
): Promise<{ data: T; fallbackReason: FallbackReason | null }> {
  const mock = () => call(mockProvider(deps.now));
  if (deps.mode === "mock") return { data: await mock(), fallbackReason: null };
  const credential: Credential | null = deps.getCredential
    ? await deps.getCredential()
    : await deps.getToken().then((t) => (t ? { token: t, source: "OAUTH" as const } : null));
  if (!credential) {
    const st = await deps.tokenStatus?.();
    return { data: await mock(), fallbackReason: st === "EXPIRED" || st === "INVALID" ? "UPSTOX_AUTH_EXPIRED" : "UPSTOX_NOT_CONNECTED" };
  }
  try {
    return { data: await call(upstoxProvider(credential.token, deps.now)), fallbackReason: null };
  } catch (e) {
    if (e instanceof InvalidRequestError) throw e;
    const reason: FallbackReason = e instanceof UpstoxError ? e.reason : "UPSTOX_API_ERROR";
    logEvent("warn", "upstox_fallback", { reason, message: (e as Error).message });
    if (reason === "UPSTOX_AUTH_EXPIRED") await deps.onAuthExpired(credential.source); // stop retrying a dead token
    return { data: await mock(), fallbackReason: reason };
  }
}

// Real news alongside real market data; mock news only alongside mock market data. A failed news provider
// yields UNAVAILABLE (the engine then refuses to trade), never mock news.
async function newsFeed(p: MarketDataProvider, index: UnderlyingId, now: Date): Promise<{ news: News; source: SourceInfo }> {
  if (p.name === "MOCK") return { news: { ...MOCK_NEWS }, source: mockSource(new Date(now.getTime() - 240_000).toISOString()) };
  const newsIndex: IndexId = isIndexId(index) ? index : "nifty";
  const d = await getIndexNews(newsIndex, () => now);
  const ok = d.status !== "UNAVAILABLE";
  const eventRisk = d.eventRisk.level === "HIGH" || d.eventRisk.level === "EXTREME" ? d.eventRisk.reason : null;
  return {
    news: {
      score: d.score,
      bullishPct: d.bullishPct,
      neutralPct: d.neutralPct,
      bearishPct: d.bearishPct,
      eventRisk,
      status: d.status,
      confidence: d.confidence,
      detail: d,
    },
    source: ok ? { source: "LIVE", provider: null, fetchedAt: d.fetchedAt } : { source: "UNAVAILABLE", provider: null, fetchedAt: null },
  };
}

export async function buildSnapshot(p: MarketDataProvider, index: UnderlyingId, now = new Date()): Promise<Snapshot> {
  const safeOptionChain = async () => {
    try {
      return await p.getOptionChain(index);
    } catch (e) {
      if (index === "goldm" || index === "silverm") {
        const resolvedExpiry = getCachedMcxContract(index, now)?.expiry ?? "";
        return {
          index,
          expiry: resolvedExpiry,
          spot: 0,
          strikeStep: index === "goldm" ? 100 : 250,
          lotSize: null,
          rows: [],
          optionPriceVerification: undefined,
          source: { source: "UNAVAILABLE" as const, provider: "UPSTOX" as const, fetchedAt: null },
        };
      }
      throw e;
    }
  };

  const [quote, chain, tech, feed, breadth] = await Promise.all([
    p.getMarketSnapshot(index),
    safeOptionChain(),
    p.getTechnicals(index),
    newsFeed(p, index, now),
    p.getBreadth(index),
  ]);
  const breadthSrc = breadth?.source ?? (breadth?.status === "LIVE" || breadth?.status === "PARTIAL" ? quote.source : { source: "UNAVAILABLE", provider: null, fetchedAt: null });
  const inst = getUnderlyingInstrument(index);
  return {
    index,
    name: inst?.name ?? String(index).toUpperCase(),
    spot: quote.spot,
    prevClose: quote.prevClose,
    expiry: chain.expiry,
    strikeStep: chain.strikeStep,
    lotSize: chain.lotSize ?? null,
    indicators: tech.indicators,
    ivPercentile: tech.ivPercentile,
    breadth: breadth,
    news: feed.news,
    chain: chain.rows,
    // Mock analysis exists for the chart route only. The engine input (snapshot.technical) stays null for mock, as before;
    // the technicals cards already read the same snapshot indicators through their fallback.
    technical: tech.source.source === "MOCK" ? null : tech.analysis,
    sources: { market: quote.source, optionChain: chain.source, technical: tech.source, news: feed.source, breadth: breadthSrc },
    technicalReasonCode: tech.reasonCode ?? null,
    technicalReason: tech.unavailableReason ?? null,
    fallbackReason: null,
    optionPriceVerification: chain.optionPriceVerification,
    chainFreshness: chainFreshness(chain.rows, now),
  };
}

const lastLiveSnapshotCache = new Map<UnderlyingId, { snap: Snapshot; cachedAt: number }>();
const inFlightSnapshot = new Map<UnderlyingId, Promise<Snapshot>>();
const SNAPSHOT_TTL_MS = 5_000;
const LIVE_GRACE_MS = 90_000;

export function getCachedSnapshot(index: UnderlyingId): Snapshot | null {
  return lastLiveSnapshotCache.get(index)?.snap ?? null;
}

function syncSnapshotTickToStream(index: UnderlyingId, snap: Snapshot): void {
  if (!snap || snap.spot <= 0 || snap.sources?.market?.source !== "LIVE") return;
  const inst = getUnderlyingInstrument(index);
  if (!inst?.underlyingKey) return;
  const ltt = snap.sources.market.fetchedAt ? Date.parse(snap.sources.market.fetchedAt) : Date.now();
  const existing = quoteManager.getQuote(inst.underlyingKey);
  if (existing && existing.ltt >= ltt) return;
  quoteManager.ingestTick({
    instrumentKey: inst.underlyingKey,
    symbol: inst.symbol,
    ltp: snap.spot,
    ltt: Number.isFinite(ltt) ? ltt : Date.now(),
  });
}

export async function getSnapshot(index: UnderlyingId, deps?: FallbackDeps, now?: Date): Promise<Snapshot> {
  if (!deps) {
    const cached = lastLiveSnapshotCache.get(index);
    if (cached && Date.now() - cached.cachedAt <= SNAPSHOT_TTL_MS) {
      return { ...cached.snap, fallbackReason: null };
    }
    const existing = inFlightSnapshot.get(index);
    if (existing) return existing;
  }

  const run = async (): Promise<Snapshot> => {
    const current = now ?? deps?.now?.();
    const { data, fallbackReason } = await withFallback((p) => buildSnapshot(p, index, current), deps);

    if (!deps && !fallbackReason && data.sources?.market?.source !== "MOCK") {
      const nowMs = Date.now();
      for (const [k, v] of lastLiveSnapshotCache) {
        if (nowMs - v.cachedAt > LIVE_GRACE_MS * 2) lastLiveSnapshotCache.delete(k);
      }
      lastLiveSnapshotCache.set(index, { snap: data, cachedAt: nowMs });
      syncSnapshotTickToStream(index, data);
      return { ...data, fallbackReason: null };
    }

    // If Upstox is connected and a transient API/429 error occurred, serve the last good live snapshot
    // (keeping LIVE within 90s grace window, then STALE) rather than poisoning the UI with MOCK prices.
    if (
      !deps &&
      fallbackReason &&
      fallbackReason !== "UPSTOX_NOT_CONNECTED" &&
      fallbackReason !== "UPSTOX_AUTH_EXPIRED"
    ) {
      const entry = lastLiveSnapshotCache.get(index);
      if (entry) {
        const withinGrace = Date.now() - entry.cachedAt <= LIVE_GRACE_MS;
        return {
          ...entry.snap,
          fallbackReason: null,
          sources: {
            ...entry.snap.sources,
            market: { ...entry.snap.sources.market, source: withinGrace ? entry.snap.sources.market.source : "STALE" },
          },
        };
      }
    }

    // Do not downgrade the entire workspace header to MOCK FALLBACK if a newly added
    // mini commodity (goldm/silverm) has temporary Upstox coverage gaps while Upstox is connected.
    if (
      (index === "goldm" || index === "silverm") &&
      fallbackReason &&
      fallbackReason !== "UPSTOX_NOT_CONNECTED" &&
      fallbackReason !== "UPSTOX_AUTH_EXPIRED"
    ) {
      return {
        ...data,
        fallbackReason: null,
        sources: {
          ...data.sources,
          market: { source: "UNAVAILABLE", provider: "UPSTOX", fetchedAt: null },
          optionChain: { source: "UNAVAILABLE", provider: "UPSTOX", fetchedAt: null },
        },
      };
    }
    return { ...data, fallbackReason };
  };

  if (deps) return run();
  const promise = run().finally(() => inFlightSnapshot.delete(index));
  inFlightSnapshot.set(index, promise);
  return promise;
}

export const getAnalysis = cache(async (index: UnderlyingId) => analyze(await getSnapshot(index)));

export type DashboardData = {
  analyses: ReturnType<typeof analyze>[];
  today: ReturnType<typeof recommendationOfTheDay>;
  generatedAt: string;
  warming?: boolean;
};

const DASHBOARD_FRESH_MS = 20_000;
const DASHBOARD_STALE_MS = 10 * 60_000;
const DASHBOARD_COLD_BUDGET_MS = 1_500;

const gMarket = globalThis as typeof globalThis & {
  __warmDashboard?: { data: DashboardData; updatedAt: number };
  __refreshingDashboard?: Promise<DashboardData> | null;
};

function buildWarmingSnapshot(id: UnderlyingId, now: Date): Snapshot {
  const cachedSnap = lastLiveSnapshotCache.get(id)?.snap;
  if (cachedSnap) return cachedSnap;
  const inst = getUnderlyingInstrument(id);
  const unavail: SourceInfo = { source: "UNAVAILABLE", provider: "UPSTOX", fetchedAt: null };
  return {
    index: id,
    name: inst?.name ?? String(id).toUpperCase(),
    spot: 0,
    prevClose: null,
    expiry: "",
    strikeStep: 50,
    lotSize: null,
    indicators: null,
    ivPercentile: null,
    breadth: null,
    news: {
      score: 0,
      bullishPct: 0,
      neutralPct: 100,
      bearishPct: 0,
      eventRisk: null,
      status: "UNAVAILABLE",
      confidence: 0,
    },
    chain: [],
    technical: null,
    sources: { market: unavail, optionChain: unavail, technical: unavail, news: unavail, breadth: unavail },
    technicalReasonCode: null,
    technicalReason: `Warming live feed (${STOCK_OPPORTUNITY_VERSION})`,
    fallbackReason: null,
  };
}

async function computeDashboardFresh(): Promise<DashboardData> {
  const now = new Date();
  const commActive = commodityMarketStatus(now) === "OPEN";
  const targetUnderlyings = commActive ? [...INDICES, ...COMMODITY_IDS] : INDICES;
  // Stagger in batches of 2 to avoid bursting 80+ simultaneous Upstox requests (HTTP 429)
  const analyses = [];
  for (let i = 0; i < targetUnderlyings.length; i += 2) {
    const batch = targetUnderlyings.slice(i, i + 2);
    const res = await Promise.all(batch.map((id) => getAnalysis(id)));
    analyses.push(...res);
    // Yield to the Node event loop so /api/health?probe=liveness never waits behind synchronous indicator work
    await new Promise((r) => setImmediate(r));
    if (i + 2 < targetUnderlyings.length) {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  const payload: DashboardData = {
    analyses,
    today: recommendationOfTheDay(analyses),
    generatedAt: now.toISOString(),
    warming: false,
  };
  gMarket.__warmDashboard = { data: payload, updatedAt: Date.now() };
  return payload;
}

export function triggerDashboardRevalidate(): Promise<DashboardData> {
  if (gMarket.__refreshingDashboard) return gMarket.__refreshingDashboard;
  gMarket.__refreshingDashboard = computeDashboardFresh().finally(() => {
    gMarket.__refreshingDashboard = null;
  });
  return gMarket.__refreshingDashboard;
}

export function clearDashboardWarmCache(): void {
  gMarket.__warmDashboard = undefined;
  gMarket.__refreshingDashboard = null;
}

// Deduped per request & stale-while-revalidate across renders: Overview / layout respond in <2s instead of blocking on 10-underlying cold fetch.
export const getDashboard = cache(async (): Promise<DashboardData> => {
  const nowMs = Date.now();
  const cachedEntry = gMarket.__warmDashboard;

  if (cachedEntry && nowMs - cachedEntry.updatedAt <= DASHBOARD_FRESH_MS) {
    return cachedEntry.data;
  }

  if (cachedEntry && nowMs - cachedEntry.updatedAt <= DASHBOARD_STALE_MS) {
    void triggerDashboardRevalidate().catch(() => {});
    return cachedEntry.data;
  }

  const refreshPromise = triggerDashboardRevalidate();
  const completed = await Promise.race<DashboardData | null>([
    refreshPromise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), DASHBOARD_COLD_BUDGET_MS)),
  ]);

  if (completed) return completed;

  // Re-check in case another concurrent call just finished
  if (gMarket.__warmDashboard) return gMarket.__warmDashboard.data;

  const now = new Date();
  const commActive = commodityMarketStatus(now) === "OPEN";
  const targetUnderlyings = commActive ? [...INDICES, ...COMMODITY_IDS] : INDICES;
  const analyses = targetUnderlyings.map((id) => analyze(buildWarmingSnapshot(id, now), now));
  return {
    analyses,
    today: recommendationOfTheDay(analyses),
    generatedAt: now.toISOString(),
    warming: true,
  };
});

// --- normalized API shapes (no raw Upstox fields) ---
const r2 = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);

// Technical freshness is judged on the newest COMPLETED candle (B5), never on fetch time. The label is the candle
// classification itself, so the dashboard cannot show LIVE for a stale series or the other way round.
export function technicalMeta(info: SourceInfo, now = new Date()) {
  const closeMs = info.lastTradeTime ? Date.parse(info.lastTradeTime) : NaN;
  const candleAgeSeconds = Number.isFinite(closeMs) ? Math.max(0, Math.round((now.getTime() - closeMs) / 1000)) : null;
  const freshness = info.source === "LIVE" ? ("LIVE" as const)
    : info.source === "STALE" ? ("STALE" as const)
    : info.source === "END_OF_DAY" ? ("END_OF_DAY" as const)
    : null;
  return { source: info.source, provider: info.provider, fetchedAt: info.fetchedAt, lastCandleCloseAt: info.lastTradeTime ?? null, candleAgeSeconds, freshnessSeconds: candleAgeSeconds, freshness };
}

export function sourceMeta(info: SourceInfo, now = new Date(), slow = 1) {
  // B6: when the source carries its own data timestamp (last trade time, or last completed candle close), freshness is
  // the age of THAT timestamp. The fetch time only describes when the request was made; a cache hit can be recent
  // while its data is old, and a fresh response can carry old data. Fetch age is the fallback for sources without one.
  const data = info.lastTradeTime ? tradeFreshnessOf(info.lastTradeTime, now, slow) : null;
  const f = data
    ? { freshnessSeconds: data.freshnessSeconds, freshness: data.freshness === "END_OF_DAY" ? ("STALE" as const) : data.freshness }
    : freshnessOf(info.fetchedAt, now, slow);
  // F2: an END_OF_DAY source stays END_OF_DAY (closed session, not stale). Other non-LIVE sources keep the STALE mapping.
  const freshness = info.source === "END_OF_DAY" ? ("END_OF_DAY" as const)
    : info.source !== "LIVE" && f.freshness !== null ? ("STALE" as const)
    : f.freshness;
  // F3-style: the exchange last-trade time is shown as-is when the source has one; never replaced by fetchedAt.
  return { source: info.source, provider: info.provider, fetchedAt: info.fetchedAt, lastTradeTime: info.lastTradeTime ?? null, freshnessSeconds: f.freshnessSeconds, freshness };
}

// Rank: LIVE > END_OF_DAY > STALE > MOCK > UNAVAILABLE. Top-level source is the worst subsystem.
const SOURCE_RANK: Record<string, number> = { LIVE: 0, END_OF_DAY: 1, STALE: 2, MOCK: 3, UNAVAILABLE: 4 };
function worstSource(infos: SourceInfo[]): SourceInfo {
  return infos.reduce((a, b) => (SOURCE_RANK[b.source] ?? 4) > (SOURCE_RANK[a.source] ?? 4) ? b : a);
}

export function marketSummary(s: Snapshot, now = new Date()) {
  const m = chainMetrics(s, now);
  const change = s.prevClose === null ? null : s.spot - s.prevClose;
  const allSources = Object.values(s.sources) as SourceInfo[];
  const inst = getUnderlyingInstrument(s.index);
  return {
    index: inst?.symbol ?? String(s.index).toUpperCase(),
    name: s.name,
    spot: s.spot,
    change: r2(change),
    changePercent: change === null || !s.prevClose ? null : r2((change / s.prevClose) * 100),
    expiry: s.expiry,
    atmStrike: m.atmStrike,
    pcr: { oi: r2(m.pcrOi), volume: r2(m.pcrVolume) },
    oiSupport: m.support,
    oiResistance: m.resistance,
    oiSupportByChange: m.supportByOiChange,
    oiResistanceByChange: m.resistanceByOiChange,
    maxPain: m.maxPain,
    maxPainDistance: m.maxPainDistance,
    iv: { call: m.atmIv.call, put: m.atmIv.put, average: r2(m.atmIv.average), percentile: s.ivPercentile },
    estimatedExpectedMove: m.expectedMove,
    breadth: s.breadth,
    ...sourceMeta(worstSource(allSources), now),
    subsystems: {
      market: sourceMeta(s.sources.market, now),
      optionChain: sourceMeta(s.sources.optionChain, now),
      technical: technicalMeta(s.sources.technical, now),
      news: sourceMeta(s.sources.news, now, 30),
      breadth: sourceMeta(s.sources.breadth, now),
    },
    fallbackReason: s.fallbackReason,
  };
}
