// Real-time RSS news (public publisher feeds). Lightweight, safe extraction of RSS 2.0 <item> / Atom <entry>:
// no code evaluation, no external entity resolution, no HTML scraping. Each feed is fetched and cached
// independently; a failing feed is skipped (and backed off) while the others continue.
import type { NewsProviderStatus } from "../types.ts";
import type { RawArticle } from "./news.ts";
import { FRESHNESS, RSS, rssFeeds } from "./newsConfig.ts";
import { cached } from "./cache.ts";
import { NewsError } from "./errors.ts";

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);

// Text of the first <tag>…</tag> (CDATA unwrapped, entities decoded, HTML stripped from the result).
function tagText(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
  if (!m) return null;
  const raw = m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  return decode(raw.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}
const atomHref = (block: string) => block.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\/?>/i)?.[1] ?? null;

// Publication time only from the feed's own metadata (pubDate / published / updated / dc:date).
// Items without one are dropped: the fetch time is never used as a publication time.
function itemDate(block: string): string | null {
  for (const tag of ["pubDate", "published", "updated", "dc:date"]) {
    const t = tagText(block, tag);
    if (t && !Number.isNaN(Date.parse(t))) return new Date(t).toISOString();
  }
  return null;
}

export function parseFeed(xml: string, publisher: string): { articles: RawArticle[]; undated: number } {
  if (typeof xml !== "string" || !/<(rss|feed|rdf:RDF)\b/i.test(xml)) throw new NewsError("NEWS_BAD_RESPONSE", "not an RSS/Atom document");
  const blocks = [...xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map((m) => m[0]);
  let undated = 0;
  const articles: RawArticle[] = [];
  for (const b of blocks.slice(0, RSS.maxItemsPerFeed)) {
    const title = tagText(b, "title");
    if (!title) continue;
    const publishedAt = itemDate(b);
    if (!publishedAt) {
      undated++;
      continue;
    }
    const link = tagText(b, "link") || atomHref(b) || tagText(b, "guid") || "";
    const url = /^https?:\/\//.test(link) ? link : "";
    articles.push({
      id: url || `${publisher}:${title}`,
      title,
      description: tagText(b, "description") ?? tagText(b, "summary") ?? tagText(b, "content") ?? "",
      source: publisher,
      url,
      publishedAt,
      provider: "RSS",
    });
  }
  return { articles, undated };
}

// Freshness of a provider/feed = age of its newest item (same thresholds as the news status).
export function feedFreshness(newestAt: string | null, now: Date): NewsProviderStatus["status"] {
  if (!newestAt) return "STALE";
  const h = (now.getTime() - Date.parse(newestAt)) / 3_600_000;
  return h <= FRESHNESS.liveHours ? "LIVE" : h <= FRESHNESS.agingHours ? "AGING" : "STALE";
}

type FeedResult = { articles: RawArticle[]; fetchedAt: string; error: string | null };
const g = globalThis as typeof globalThis & { __rssFailures?: Map<string, { until: number; result: FeedResult }> };
const failures = (g.__rssFailures ??= new Map());

export function clearRssBackoff() {
  failures.clear();
}

async function fetchFeed(feed: { name: string; publisher: string; url: string }, now: () => Date): Promise<FeedResult> {
  const backoff = failures.get(feed.name);
  if (backoff && backoff.until > Date.now()) return backoff.result; // no retry storm on a broken feed
  try {
    return await cached(`rss:${feed.name}`, RSS.cacheMs, async () => {
      const t0 = Date.now();
      let status: number | null = null;
      try {
        const res = await fetch(feed.url, {
          headers: { "User-Agent": "OptionsAnalyzer/1.0 (RSS reader)", Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
          signal: AbortSignal.timeout(RSS.timeoutMs),
          cache: "no-store",
        });
        status = res.status;
        if (!res.ok) throw new NewsError("NEWS_API_ERROR", `HTTP ${status}`);
        const { articles, undated } = parseFeed(await res.text(), feed.publisher);
        console.info(JSON.stringify({ evt: "news_request", endpoint: `rss/${feed.name}`, status, durationMs: Date.now() - t0, ok: true, articles: articles.length, undated }));
        return { articles, fetchedAt: now().toISOString(), error: null };
      } catch (e) {
        const msg = e instanceof NewsError ? e.message : (e as Error).name === "TimeoutError" ? `timed out after ${RSS.timeoutMs} ms` : (e as Error).message;
        console.warn(JSON.stringify({ evt: "news_request", endpoint: `rss/${feed.name}`, status, durationMs: Date.now() - t0, ok: false, message: msg }));
        throw new NewsError("NEWS_API_ERROR", msg);
      }
    });
  } catch (e) {
    const result = { articles: [], fetchedAt: now().toISOString(), error: (e as Error).message };
    failures.set(feed.name, { until: Date.now() + RSS.failureBackoffMs, result });
    return result;
  }
}

// All configured feeds in parallel; never throws. Per-feed status is reported for diagnostics.
export async function fetchRss(now = () => new Date()): Promise<{ articles: RawArticle[]; statuses: NewsProviderStatus[] }> {
  const feeds = rssFeeds();
  const results = await Promise.all(feeds.map((f) => fetchFeed(f, now)));
  const statuses = feeds.map((f, i): NewsProviderStatus => {
    const r = results[i];
    const newestAt = r.articles.reduce<string | null>((m, a) => (!m || a.publishedAt > m ? a.publishedAt : m), null);
    return { provider: "RSS", name: f.name, status: r.error ? "FAILED" : feedFreshness(newestAt, now()), articles: r.articles.length, newestAt, fetchedAt: r.fetchedAt, error: r.error };
  });
  return { articles: results.flatMap((r) => r.articles), statuses };
}
