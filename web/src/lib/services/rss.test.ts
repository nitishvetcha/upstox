// Run: npm test   (deterministic fixtures; real feeds are validated live, not here)
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { feedFreshness, fetchRss, parseFeed, clearRssBackoff } from "./rssNewsProvider.ts";
import { getIndexNews } from "./newsProvider.ts";
import { analyzeNews, dedupe, relevance, sentiment, type RawArticle } from "./news.ts";
import { clearUpstoxCache } from "./cache.ts";
import { RSS_FEEDS } from "./newsConfig.ts";
import { mockSnapshot } from "./mock.ts";
import { analyze } from "../engine/strategy.ts";

const NOW = new Date("2026-10-05T07:00:00Z"); // Mon 12:30 IST
const rfc = (hoursAgo: number) => new Date(NOW.getTime() - hoursAgo * 3_600_000).toUTCString().replace("GMT", "+0000");
const item = (title: string, hoursAgo: number | null, extra = "") =>
  `<item><title><![CDATA[${title}]]></title><link>https://pub.test/${encodeURIComponent(title)}</link><description><![CDATA[<p>${title} &amp; more</p>]]></description>${hoursAgo === null ? "" : `<pubDate><![CDATA[${rfc(hoursAgo)}]]></pubDate>`}${extra}</item>`;
const rss = (...items: string[]) => `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Feed</title>${items.join("")}</channel></rss>`;

test("1. valid RSS: CDATA, entities and HTML stripped; publisher kept as source", () => {
  const { articles } = parseFeed(rss(item("Sensex &amp; Nifty rally", 1)), "Economic Times");
  assert.equal(articles.length, 1);
  assert.equal(articles[0].title, "Sensex & Nifty rally");
  assert.equal(articles[0].description, "Sensex & Nifty rally & more");
  assert.equal(articles[0].source, "Economic Times", "publisher, not 'RSS'");
  assert.equal(articles[0].provider, "RSS");
  assert.equal(articles[0].url, "https://pub.test/Sensex%20%26amp%3B%20Nifty%20rally");
});

test("2. valid Atom: <entry>, href links, <updated>", () => {
  const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>RBI holds rates</title><link href="https://a.test/1"/><updated>2026-10-05T12:00:00+05:30</updated><summary>Policy steady</summary></entry></feed>`;
  const { articles } = parseFeed(atom, "Mint");
  assert.equal(articles[0].url, "https://a.test/1");
  assert.equal(articles[0].publishedAt, "2026-10-05T06:30:00.000Z");
  assert.equal(articles[0].description, "Policy steady");
});

test("3. malformed / non-feed XML is rejected", () => {
  assert.throws(() => parseFeed("<html><body>Not a feed</body></html>", "X"));
  assert.throws(() => parseFeed('{"status":"ok"}', "X"));
});

test("4. missing title skipped; missing description → empty; missing URL → no link, still identified", () => {
  const xml = rss(
    "<item><link>https://p.test/a</link><pubDate>" + rfc(1) + "</pubDate></item>",
    "<item><title>Nifty ends higher</title><pubDate>" + rfc(1) + "</pubDate></item>",
  );
  const { articles } = parseFeed(xml, "BusinessLine");
  assert.equal(articles.length, 1);
  assert.equal(articles[0].description, "");
  assert.equal(articles[0].url, "");
  assert.equal(articles[0].id, "BusinessLine:Nifty ends higher");
});

test("5. missing publication date: dropped, never stamped with the fetch time", () => {
  const { articles, undated } = parseFeed(rss(item("Undated story", null), item("Dated story", 2)), "BS");
  assert.equal(undated, 1);
  assert.deepEqual(articles.map((a) => a.title), ["Dated story"]);
});

test("6. timestamps: RFC-822 with +0530 offset, ISO, and freshness bands (1 h LIVE / 8 h AGING / 25 h STALE)", () => {
  const { articles } = parseFeed(rss("<item><title>T</title><pubDate>Mon, 05 Oct 2026 14:52:29 +0530</pubDate></item>"), "ET");
  assert.equal(articles[0].publishedAt, "2026-10-05T09:22:29.000Z", "IST offset honoured");
  const at = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
  assert.equal(feedFreshness(at(1), NOW), "LIVE");
  assert.equal(feedFreshness(at(8), NOW), "AGING");
  assert.equal(feedFreshness(at(25), NOW), "STALE");
  assert.equal(feedFreshness(null, NOW), "STALE");
});

// --- provider-level, fetch stubbed per URL ---
const realFetch = globalThis.fetch;
const realInfo = console.info;
const realWarn = console.warn;
const realKey = process.env.NEWS_API_KEY;
let calls: string[] = [];
type Handler = (url: string) => Response | Promise<Response>;
const stub = (h: Handler) => {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    return h(url);
  }) as typeof fetch;
};
const newsApi = (hoursAgo: number, titles: string[]) =>
  Response.json({ status: "ok", articles: titles.map((t, i) => ({ source: { name: "NewsAPI Pub" }, title: t, description: "", url: `https://n.test/${i}`, publishedAt: new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString() })) });
const feedsOk = (hoursAgo: number, title = "Sensex, Nifty surge as banks rally") => (url: string) =>
  url.includes("newsapi.org") ? newsApi(30, ["Nifty falls as FPIs sell", title]) : new Response(rss(item(`${title}`, hoursAgo), item(`${new URL(url).host} market wrap: Nifty steady`, hoursAgo + 0.5)));

beforeEach(() => {
  clearUpstoxCache();
  clearRssBackoff();
  calls = [];
  process.env.NEWS_API_KEY = "k";
  delete process.env.NEWS_RSS_FEEDS;
  console.info = () => {};
  console.warn = () => {};
});
afterEach(() => {
  globalThis.fetch = realFetch;
  console.info = realInfo;
  console.warn = realWarn;
  if (realKey === undefined) delete process.env.NEWS_API_KEY;
  else process.env.NEWS_API_KEY = realKey;
});

test("7. one feed timing out / HTTP 500 / invalid XML doesn't stop the others", async () => {
  const [a, b, c] = RSS_FEEDS;
  stub((url) => {
    if (url === a.url) return Promise.reject(Object.assign(new Error("aborted"), { name: "TimeoutError" }));
    if (url === b.url) return new Response("oops", { status: 500 });
    if (url === c.url) return new Response("<html>maintenance</html>");
    return new Response(rss(item("Nifty ends higher", 1)));
  });
  const r = await fetchRss(() => NOW);
  const st = Object.fromEntries(r.statuses.map((s) => [s.name, s]));
  assert.equal(st[a.name].status, "FAILED");
  assert.match(st[a.name].error!, /timed out/);
  assert.match(st[b.name].error!, /HTTP 500/);
  assert.match(st[c.name].error!, /not an RSS/);
  assert.equal(r.statuses.filter((s) => s.status === "LIVE").length, RSS_FEEDS.length - 3);
  assert.equal(r.articles.length, RSS_FEEDS.length - 3);
});

test("8. all RSS feeds fail → RSS FAILED, backed off (no retry storm), NewsAPI still used", async () => {
  stub((url) => (url.includes("newsapi.org") ? newsApi(1, ["Nifty 50 rallies to record high"]) : new Response("down", { status: 503 })));
  const n = await getIndexNews("nifty", () => NOW);
  assert.ok(n.providers!.filter((p) => p.provider === "RSS").every((p) => p.status === "FAILED"));
  assert.equal(n.providers!.find((p) => p.provider === "NEWSAPI")!.status, "LIVE");
  assert.equal(n.status, "LIVE");
  const before = calls.length;
  await getIndexNews("banknifty", () => NOW);
  assert.equal(calls.length, before, "failed feeds not re-polled inside the back-off window");
});

test("9. cross-provider duplicates collapse: newest kept, best description, publisher URL, sources listed", () => {
  const api: RawArticle = { id: "n", title: "Sensex jumps 600 points as banks rally", description: "Short.", source: "NewsAPI Pub", url: "https://agg.test/x", publishedAt: "2026-10-05T05:00:00.000Z", provider: "NEWSAPI" };
  const fromRss: RawArticle = { id: "r", title: "Sensex jumps 600 points as banks rally - Economic Times", description: "A much longer description from the publisher feed.", source: "Economic Times", url: "https://et.test/x", publishedAt: "2026-10-05T04:55:00.000Z", provider: "RSS" };
  const out = dedupe([api, fromRss]);
  assert.equal(out.length, 1);
  assert.equal(out[0].publishedAt, "2026-10-05T05:00:00.000Z");
  assert.equal(out[0].description, fromRss.description);
  assert.equal(out[0].url, "https://et.test/x");
  assert.deepEqual(out[0].alsoReportedBy, ["Economic Times"]);
  // Duplicates don't inflate sentiment or confidence.
  const once = analyzeNews([api], "nifty", NOW, "x");
  const twice = analyzeNews([api, fromRss], "nifty", NOW, "x");
  assert.equal(twice.articleCount, 1);
  assert.equal(twice.confidence >= once.confidence - 0.01 && twice.confidence <= once.confidence + 0.2, true);
});

test("10. RSS articles use the same relevance, sentiment and event-risk logic", () => {
  const { articles } = parseFeed(rss(item("Bank Nifty slips as RBI policy looms this week", 1), item("HDFC Bank, ICICI Bank drag PSU banks lower", 2)), "BS");
  const r = analyzeNews(articles, "banknifty", NOW, "x");
  for (const a of r.articles) {
    assert.equal(a.relevance, relevance(`${a.title} ${a.description}`, "banknifty").score);
    assert.equal(a.sentimentScore, sentiment(a.title, a.description).score);
  }
  assert.equal(r.eventRisk.level, "HIGH");
  assert.equal(r.eventRisk.events[0].timing, "UPCOMING");
  assert.ok(relevance("Bank Nifty slips", "nifty").score <= 0.6, "'Nifty' inside 'Bank Nifty' rule holds");
});

test("11. combined status: RSS LIVE + NewsAPI STALE → LIVE (stale never overrides fresh)", async () => {
  stub(feedsOk(1));
  const n = await getIndexNews("nifty", () => NOW);
  assert.equal(n.providers!.find((p) => p.provider === "NEWSAPI")!.status, "STALE");
  assert.ok(n.providers!.filter((p) => p.provider === "RSS").every((p) => p.status === "LIVE"));
  assert.equal(n.status, "LIVE");
  assert.ok(n.articles.some((a) => a.provider === "RSS"));
});

test("12. combined status: RSS FAILED + NewsAPI STALE → STALE; both failed → UNAVAILABLE", async () => {
  stub((url) => (url.includes("newsapi.org") ? newsApi(30, ["Nifty falls"]) : new Response("x", { status: 500 })));
  assert.equal((await getIndexNews("nifty", () => NOW)).status, "STALE");
  clearUpstoxCache();
  clearRssBackoff();
  stub(() => new Response("x", { status: 500 }));
  const n = await getIndexNews("nifty", () => NOW);
  assert.equal(n.status, "UNAVAILABLE");
  assert.match(n.reason!, /HTTP 500/);
});

test("13. old RSS articles stay STALE (successful fetch ≠ fresh news)", async () => {
  stub(feedsOk(25));
  const n = await getIndexNews("nifty", () => NOW);
  assert.ok(n.providers!.filter((p) => p.provider === "RSS").every((p) => p.status === "STALE"));
  assert.equal(n.status, "STALE");
});

test("14. cache: dashboard + all news routes = one fetch cycle (each feed once, NewsAPI once)", async () => {
  stub(feedsOk(1));
  for (let i = 0; i < 4; i++) {
    await getIndexNews("nifty", () => NOW);
    await getIndexNews("banknifty", () => NOW);
  }
  assert.equal(calls.length, RSS_FEEDS.length + 1);
  assert.equal(new Set(calls).size, calls.length, "no URL fetched twice");
});

test("15. safety: stale combined news still blocks a live trade; fresh news makes the factor eligible", async () => {
  stub(feedsOk(25));
  const stale = await getIndexNews("nifty", () => NOW);
  const s = mockSnapshot("nifty", NOW);
  s.news = { score: stale.score, bullishPct: stale.bullishPct, neutralPct: stale.neutralPct, bearishPct: stale.bearishPct, eventRisk: null, status: stale.status, confidence: stale.confidence, detail: stale };
  const a = analyze(s, NOW);
  assert.equal(a.status, "NO TRADE");
  assert.ok(a.blockers.some((b) => b.startsWith("News is stale")));

  clearUpstoxCache();
  stub(feedsOk(1));
  const fresh = await getIndexNews("nifty", () => NOW);
  s.news = { ...s.news, score: fresh.score, status: fresh.status, confidence: fresh.confidence, detail: fresh };
  assert.equal(analyze(s, NOW).factors.find((f) => f.key === "news")!.available, true);
  assert.equal(analyze(s, NOW).factors.find((f) => f.key === "news")!.max, 10, "weight unchanged");
});

test("16. live-validation fixes: streak reversal, 'today' must sit next to the event, breadth gates LIVE", async () => {
  assert.equal(sentiment("Markets break 8-week losing streak as financials lead").label, "BULLISH");
  assert.equal(sentiment("Nifty extends losing streak").label, "BEARISH");
  assert.equal(sentiment("Nifty ends lower").label, "BEARISH", "'ends' only reverses streak terms");
  const far = parseFeed(rss(`<item><title>Stock market today LIVE: Sensex up 500 points as banks gain, HDFC Bank, RIL lead; investors eye crude, rupee and the RBI policy</title><description>Live updates.</description><pubDate>${rfc(1)}</pubDate></item>`), "Mint").articles;
  assert.notEqual(analyzeNews(far, "nifty", NOW, "x").eventRisk.events.find((e) => e.category === "RBI")!.timing, "TODAY");
  const close = parseFeed(rss(item("RBI policy today: repo rate decision at 10 am", 1)), "Mint").articles;
  assert.equal(analyzeNews(close, "nifty", NOW, "x").eventRisk.events.find((e) => e.category === "RBI")!.timing, "TODAY");
  const { dataLabel } = await import("../dataStatus.ts");
  const s = mockSnapshot("nifty", NOW);
  for (const k of ["market", "optionChain", "technical", "news"] as const) s.sources[k] = { source: "LIVE", provider: "UPSTOX", fetchedAt: NOW.toISOString() };
  s.breadth = null;
  assert.equal(dataLabel([s]), "PARTIAL LIVE DATA", "no breadth → not fully live");
});

test("17. a US Fed 'monetary policy' story is not counted as an RBI event", () => {
  const fed = parseFeed(rss(`<item><title>Fed's Hammack says jobs data gives time to assess rate path</title><description>US monetary policy outlook.</description><pubDate>${rfc(1)}</pubDate></item>`), "ET").articles;
  const cats = analyzeNews(fed, "nifty", NOW, "x").eventRisk.events.map((e) => e.category);
  assert.ok(!cats.includes("RBI"));
});
