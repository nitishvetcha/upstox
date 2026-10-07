// Server-only entry point for market data. The UI and API routes call these functions and never
// touch a provider directly. MARKET_DATA_PROVIDER=upstox uses live data when logged in, else mock.
import { cache } from "react";
import type { FallbackReason, IndexId, MarketDataProvider, News, Snapshot, SourceInfo } from "../types.ts";
import { getIndexNews } from "./newsProvider.ts";
import { MOCK_NEWS, mockSource } from "./mock.ts";
import { mockProvider } from "./mockMarket.ts";
import { upstoxProvider } from "./upstoxMarket.ts";
import { InvalidRequestError, UpstoxError } from "./errors.ts";
import { getAccessToken, markTokenInvalid, tokenStatus, type TokenStatus } from "./upstoxAuth.ts";
import { INDICES, INSTRUMENTS } from "./instrumentRegistry.ts";
import { chainMetrics } from "./optionChainAnalytics.ts";
import { analyze, recommendationOfTheDay } from "../engine/strategy.ts";
import { freshnessOf } from "../time.ts";

export { INDICES };
export type ProviderMode = "mock" | "upstox";

export function providerMode(): ProviderMode {
  return process.env.MARKET_DATA_PROVIDER === "upstox" ? "upstox" : "mock";
}

export interface FallbackDeps {
  mode: ProviderMode;
  getToken: () => Promise<string | null>;
  onAuthExpired: () => Promise<void>;
  // Why there is no token: an expired/rejected session must read as UPSTOX_AUTH_EXPIRED, not "never connected".
  tokenStatus?: () => Promise<TokenStatus>;
  now?: () => Date;
}

const defaultDeps = (): FallbackDeps => ({
  mode: providerMode(),
  getToken: getAccessToken,
  onAuthExpired: () => markTokenInvalid(),
  tokenStatus: async () => (await tokenStatus()).status,
});

// Run `call` against Upstox when possible; on any Upstox failure, log it and rerun against mock,
// returning why. A bad request (unknown expiry) is the caller's error and is rethrown, not masked.
export async function withFallback<T>(
  call: (p: MarketDataProvider) => Promise<T>,
  deps: FallbackDeps = defaultDeps(),
): Promise<{ data: T; fallbackReason: FallbackReason | null }> {
  const mock = () => call(mockProvider(deps.now));
  if (deps.mode === "mock") return { data: await mock(), fallbackReason: null };
  const token = await deps.getToken();
  if (!token) {
    const st = await deps.tokenStatus?.();
    return { data: await mock(), fallbackReason: st === "EXPIRED" || st === "INVALID" ? "UPSTOX_AUTH_EXPIRED" : "UPSTOX_NOT_CONNECTED" };
  }
  try {
    return { data: await call(upstoxProvider(token, deps.now)), fallbackReason: null };
  } catch (e) {
    if (e instanceof InvalidRequestError) throw e;
    const reason: FallbackReason = e instanceof UpstoxError ? e.reason : "UPSTOX_API_ERROR";
    console.warn(JSON.stringify({ evt: "upstox_fallback", reason, message: (e as Error).message }));
    if (reason === "UPSTOX_AUTH_EXPIRED") await deps.onAuthExpired(); // stop retrying a dead token
    return { data: await mock(), fallbackReason: reason };
  }
}

// Real news alongside real market data; mock news only alongside mock market data. A failed news provider
// yields UNAVAILABLE (the engine then refuses to trade), never mock news.
async function newsFeed(p: MarketDataProvider, index: IndexId, now: Date): Promise<{ news: News; source: SourceInfo }> {
  if (p.name === "MOCK") return { news: { ...MOCK_NEWS }, source: mockSource(new Date(now.getTime() - 240_000).toISOString()) };
  const d = await getIndexNews(index, () => now);
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

export async function buildSnapshot(p: MarketDataProvider, index: IndexId, now = new Date()): Promise<Snapshot> {
  const [quote, chain, tech, feed, breadth] = await Promise.all([
    p.getMarketSnapshot(index),
    p.getOptionChain(index),
    p.getTechnicals(index),
    newsFeed(p, index, now),
    p.getBreadth(index),
  ]);
  const breadthSrc = breadth.source ?? (breadth.status === "LIVE" || breadth.status === "PARTIAL" ? quote.source : { source: "UNAVAILABLE", provider: null, fetchedAt: null });
  return {
    index,
    name: INSTRUMENTS[index].name,
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
    technical: tech.analysis,
    sources: { market: quote.source, optionChain: chain.source, technical: tech.source, news: feed.source, breadth: breadthSrc },
    fallbackReason: null,
  };
}

export async function getSnapshot(index: IndexId, deps?: FallbackDeps, now?: Date): Promise<Snapshot> {
  const current = now ?? deps?.now?.();
  const { data, fallbackReason } = await withFallback((p) => buildSnapshot(p, index, current), deps);
  return { ...data, fallbackReason };
}

export const getAnalysis = cache(async (index: IndexId) => analyze(await getSnapshot(index)));

// Deduped per request: the layout's top bar and the dashboard page share one fetch.
export const getDashboard = cache(async () => {
  const analyses = await Promise.all(INDICES.map(getAnalysis));
  return { analyses, today: recommendationOfTheDay(analyses), generatedAt: new Date().toISOString() };
});

// --- normalized API shapes (no raw Upstox fields) ---
const r2 = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);

export function sourceMeta(info: SourceInfo, now = new Date(), slow = 1) {
  return { source: info.source, provider: info.provider, fetchedAt: info.fetchedAt, ...freshnessOf(info.fetchedAt, now, slow) };
}

export function marketSummary(s: Snapshot, now = new Date()) {
  const m = chainMetrics(s, now);
  const change = s.prevClose === null ? null : s.spot - s.prevClose;
  return {
    index: INSTRUMENTS[s.index].symbol,
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
    ...sourceMeta(s.sources.market, now),
    subsystems: {
      market: sourceMeta(s.sources.market, now),
      optionChain: sourceMeta(s.sources.optionChain, now),
      technical: sourceMeta(s.sources.technical, now),
      news: sourceMeta(s.sources.news, now, 30),
      breadth: sourceMeta(s.sources.breadth, now),
    },
    fallbackReason: s.fallbackReason,
  };
}
