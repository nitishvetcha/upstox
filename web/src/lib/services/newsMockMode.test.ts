// News gate setup: these tests stub fetch to exercise the authorised news path. Both flags are needed; mock-mode tests stay blocked.
process.env.NEWS_EXTERNAL_ENABLED = "true";
// News routes in mock mode: deterministic simulated headlines, zero outbound requests. Live mode is unchanged.
// The four routes (/api/news, /api/news/[index], /api/events, /api/events/[index], /api/sentiment/[index]) all compose
// getIndexNews through newsApi.ts; these tests exercise exactly those builders with a recording fetch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { allNews, eventSummary, indexNews, sentimentSummary } from "./newsApi.ts";
import { getIndexNews } from "./newsProvider.ts";
import { INDICES, INSTRUMENTS } from "./instrumentRegistry.ts";

const NOW = new Date("2026-10-05T07:00:00Z");

function withEnv<T>(value: string | undefined, fn: () => Promise<T>): Promise<T> {
  const saved = process.env.MARKET_DATA_PROVIDER;
  if (value === undefined) delete process.env.MARKET_DATA_PROVIDER; else process.env.MARKET_DATA_PROVIDER = value;
  return fn().finally(() => {
    if (saved === undefined) delete process.env.MARKET_DATA_PROVIDER; else process.env.MARKET_DATA_PROVIDER = saved;
  });
}

// Records every request. In mock mode it must never be called; in live mode it returns a server error so no real
// feed is read and the test stays offline.
function recordingFetch(calls: string[]) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    calls.push(String(input));
    return new Response("upstream unavailable", { status: 500 });
  }) as typeof fetch;
  return () => { globalThis.fetch = realFetch; };
}

test("NM-1. mock mode: the news pipeline makes zero outbound requests for either index", async () => {
  const calls: string[] = [];
  const restore = recordingFetch(calls);
  try {
    await withEnv(undefined, async () => {
      for (const idx of ["nifty", "banknifty"] as const) {
        const n = await getIndexNews(idx, () => NOW);
        assert.equal(n.status, "MOCK");
      }
    });
    assert.equal(calls.length, 0, `no RSS or NewsAPI request in mock mode, saw: ${calls.join(", ")}`);
  } finally { restore(); }
});

test("NM-2. mock mode: all four route builders serve the expected mock responses, with zero outbound requests", async () => {
  const calls: string[] = [];
  const restore = recordingFetch(calls);
  try {
    await withEnv(undefined, async () => {
      // /api/news: every registered index, each labelled MOCK.
      const results = await allNews();
      assert.deepEqual(results.map((r) => r.index), [...INDICES]);
      const summaries = results.map(sentimentSummary);
      assert.deepEqual(summaries.map((s) => s.index), INDICES.map((i) => INSTRUMENTS[i].symbol));
      assert.ok(summaries.every((s) => s.status === "MOCK"));

      // /api/news/[index] and /api/sentiment/[index]
      const one = await indexNews("nifty");
      const sentiment = sentimentSummary(one);
      assert.equal(sentiment.status, "MOCK");
      assert.equal(sentiment.reason, "Simulated news (mock mode). Not live.");
      assert.equal(sentiment.index, "NIFTY");
      assert.equal(one.articles.length, 3);

      // /api/events and /api/events/[index]
      const ev = eventSummary(one);
      assert.equal(ev.newsStatus, "MOCK");
      assert.equal(ev.level, "NONE");
      assert.equal(ev.index, "NIFTY");
    });
    assert.equal(calls.length, 0, `route builders made outbound requests: ${calls.join(", ")}`);
  } finally { restore(); }
});

test("NM-3. mock output is deterministic for a given clock, labelled MOCK on every article, and never LIVE", async () => {
  await withEnv(undefined, async () => {
    const a = await getIndexNews("banknifty", () => NOW);
    const b = await getIndexNews("banknifty", () => NOW);
    assert.deepEqual(a, b, "same clock, same output");
    assert.equal(a.status, "MOCK");
    assert.notEqual(a.status, "LIVE");
    assert.ok(a.articles.every((x) => x.source === "MOCK" && x.title.startsWith("MOCK:")));
    assert.equal(a.articles[0].publishedAt, new Date(NOW.getTime() - 20 * 60_000).toISOString(), "timestamps follow the supplied clock");
  });
});

test("NM-4. live mode: the RSS and NewsAPI providers are still contacted (behaviour unchanged)", async () => {
  const calls: string[] = [];
  const restore = recordingFetch(calls);
  try {
    await withEnv("upstox", async () => {
      const n = await getIndexNews("nifty", () => NOW);
      assert.notEqual(n.status, "MOCK", "live mode never serves simulated news");
    });
    assert.ok(calls.length > 0, "live mode attempts the real feeds");
  } finally { restore(); }
});

test("NM-5. no relevant article is UNAVAILABLE with the absence reason, never STALE (the status still fails the freshness checks)", async () => {
  const { analyzeNews } = await import("./news.ts");
  const n = analyzeNews([], "nifty", NOW, NOW.toISOString());
  assert.equal(n.status, "UNAVAILABLE");
  assert.match(n.reason!, /absence of news, not stale news/);
});
