// News providers (server-only). Every provider returns raw normalized articles + its own status; the articles
// are merged into ONE pool and go through the single Phase 4 pipeline (dedupe → relevance → sentiment →
// freshness → event risk). Providers are never scored or averaged separately.
//   RSS      – real-time publisher feeds (primary freshness), cached per feed (~8 min)
//   NEWSAPI  – one combined query, cached NEWS_CACHE_MINUTES (its plan delays articles ~24 h)
// The NewsAPI key is sent as a header and never logged or returned.
import type { IndexId, NewsProviderStatus, NewsSentiment } from "../types.ts";
import { cached } from "./cache.ts";
import { NewsError } from "./errors.ts";
import { analyzeNews, normalizeNewsApi, unavailableNews, type RawArticle } from "./news.ts";
import { NEWS_PAGE_SIZE, NEWS_QUERY, newsCacheMs } from "./newsConfig.ts";
import { feedFreshness, fetchRss } from "./rssNewsProvider.ts";
import { INSTRUMENTS } from "./instrumentRegistry.ts";

export interface NewsProvider {
  name: NewsProviderStatus["provider"];
  fetchNews(now: () => Date): Promise<{ articles: RawArticle[]; statuses: NewsProviderStatus[] }>;
}

const ENDPOINT = "https://newsapi.org/v2/everything";

export function fetchNewsPool(now = () => new Date()) {
  return cached("news-pool", newsCacheMs(), async () => {
    const key = process.env.NEWS_API_KEY;
    if (!key) throw new NewsError("NEWS_NOT_CONFIGURED", "NEWS_API_KEY not set");
    const t0 = Date.now();
    const log = (status: number | null, ok: boolean, extra: object = {}) =>
      console[ok ? "info" : "warn"](JSON.stringify({ evt: "news_request", endpoint: "newsapi/everything", status, durationMs: Date.now() - t0, ok, ...extra }));
    let status: number | null = null;
    try {
      const q = new URLSearchParams({ q: NEWS_QUERY, language: "en", sortBy: "publishedAt", pageSize: String(NEWS_PAGE_SIZE) });
      const res = await fetch(`${ENDPOINT}?${q}`, { headers: { "X-Api-Key": key }, signal: AbortSignal.timeout(10_000), cache: "no-store" });
      status = res.status;
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const reason = status === 401 ? "NEWS_AUTH" : status === 429 ? "NEWS_RATE_LIMITED" : "NEWS_API_ERROR";
        throw new NewsError(reason, String(body?.message ?? `HTTP ${status}`).replace(key, "***"));
      }
      const articles = normalizeNewsApi(body);
      log(status, true, { articles: articles.length });
      return { articles, fetchedAt: now().toISOString() };
    } catch (e) {
      const err = e instanceof NewsError ? e : (e as Error).name === "TimeoutError" ? new NewsError("NEWS_TIMEOUT", "news request timed out") : new NewsError("NEWS_NETWORK", (e as Error).message);
      log(status, false, { reason: err.reason, message: err.message });
      throw err;
    }
  });
}

export const newsApiProvider: NewsProvider = {
  name: "NEWSAPI",
  async fetchNews(now) {
    try {
      const pool = await fetchNewsPool(now);
      const newestAt = pool.articles.reduce<string | null>((m, a) => (!m || a.publishedAt > m ? a.publishedAt : m), null);
      return {
        articles: pool.articles,
        statuses: [{ provider: "NEWSAPI", name: "NewsAPI", status: feedFreshness(newestAt, now()), articles: pool.articles.length, newestAt, fetchedAt: pool.fetchedAt, error: null }],
      };
    } catch (e) {
      const err = e instanceof NewsError ? `${e.reason}: ${e.message}` : "NewsAPI failed";
      const disabled = e instanceof NewsError && e.reason === "NEWS_NOT_CONFIGURED";
      return { articles: [], statuses: [{ provider: "NEWSAPI", name: "NewsAPI", status: disabled ? "DISABLED" : "FAILED", articles: 0, newestAt: null, fetchedAt: null, error: err }] };
    }
  },
};

export const rssProvider: NewsProvider = { name: "RSS", fetchNews: fetchRss };

export const NEWS_PROVIDERS: NewsProvider[] = [rssProvider, newsApiProvider];

// Never throws. Combined status comes from the merged pool's newest relevant article, so a fresh RSS story
// makes news LIVE while stale NewsAPI copies only add (down-weighted) context. All providers failed → UNAVAILABLE.
export async function getIndexNews(index: IndexId, now = () => new Date()): Promise<NewsSentiment> {
  const results = await Promise.all(NEWS_PROVIDERS.map((p) => p.fetchNews(now)));
  const providers = results.flatMap((r) => r.statuses);
  const working = providers.filter((p) => p.status !== "FAILED" && p.status !== "DISABLED");
  if (!working.length) {
    const reason = providers.map((p) => p.error).filter(Boolean).join("; ") || "No news provider configured";
    return { ...unavailableNews(index, reason), providers };
  }
  const fetchedAt = working.map((p) => p.fetchedAt!).sort().at(-1)!;
  const signature = working.map((p) => `${p.name}@${p.fetchedAt}`).join("|");
  try {
    const analysis = await cached(`news:${INSTRUMENTS[index].symbol}:${signature}`, newsCacheMs(), async () =>
      analyzeNews(results.flatMap((r) => r.articles), index, now(), fetchedAt),
    );
    return { ...analysis, providers };
  } catch {
    return { ...unavailableNews(index, "News analysis failed"), providers };
  }
}
