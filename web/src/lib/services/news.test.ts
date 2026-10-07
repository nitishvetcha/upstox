// Run: npm test   (deterministic fixtures; no news-provider account needed)
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { analyzeNews, dedupe, freshnessWeight, normalizeNewsApi, relevance, sentiment, tokenize } from "./news.ts";
import { getIndexNews } from "./newsProvider.ts";
import { clearUpstoxCache } from "./cache.ts";
import { NewsError } from "./errors.ts";
import { mockSnapshot } from "./mock.ts";
import { analyze } from "../engine/strategy.ts";
import { dataLabel } from "../dataStatus.ts";
import type { News, NewsSentiment, Snapshot } from "../types.ts";

const NOW = new Date("2026-10-05T07:00:00Z"); // Mon 12:30 IST
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const art = (title: string, h = 1, source = "Reuters", description = "") => ({ id: `${source}:${title}`, title, description, source, url: `https://x.test/${encodeURIComponent(title)}`, publishedAt: hoursAgo(h) });

test("1. whole-word sentiment: 'up' as a word counts", () => {
  const s = sentiment("Nifty up 1% as markets rally");
  assert.equal(s.label, "BULLISH");
  assert.deepEqual(tokenize("Nifty's up-move, NSE!"), ["nifty's", "up-move", "nse"]);
});

test("2. substrings never match ('update', 'countdown', 'backup', 'downgrade' ≠ 'down')", () => {
  const s = sentiment("Software update countdown: backup your files", "Uptime upgrades scheduled");
  assert.equal(s.score, 0);
  assert.equal(s.confidence, 0);
  assert.equal(s.label, "NEUTRAL");
});

test("3. bullish article", () => {
  const s = sentiment("Sensex, Nifty surge to record high as FPI inflows jump");
  assert.equal(s.label, "BULLISH");
  assert.ok(s.score > 0.5 && s.confidence > 0.5);
});

test("4. bearish article", () => {
  const s = sentiment("Nifty plunges 2% as banks tumble; rupee hits record low");
  assert.equal(s.label, "BEARISH");
  assert.ok(s.score < -0.5);
});

test("5. neutral article (no direction words, or explicitly unchanged)", () => {
  assert.equal(sentiment("NSE publishes revised trading holiday list").label, "NEUTRAL");
  const held = sentiment("RBI keeps repo rate unchanged");
  assert.equal(held.label, "NEUTRAL");
});

test("6. negation: 'not bullish' is never bullish", () => {
  assert.ok(sentiment("Analysts say market not bullish yet").score < 0);
  assert.ok(sentiment("Nifty fails to rally, shares did not gain").score <= 0);
  assert.ok(sentiment("Market is bullish").score > 0);
});

test("7. relevance scoring: index > market/macro > unrelated", () => {
  assert.ok(relevance("Sensex and Nifty end higher", "nifty").score >= 0.9);
  assert.ok(relevance("RBI holds repo rate", "nifty").score >= 0.5);
  assert.equal(relevance("30 and plan to start investing? What to do first", "nifty").score, 0);
  assert.equal(relevance("Hollywood box office weekend", "nifty").category, "OTHER");
});

test("8. duplicate removal: syndicated copies and publisher suffixes", () => {
  const out = dedupe([
    art("Sensex jumps 500 points as banks rally - Reuters", 2, "Reuters"),
    art("Sensex jumps 500 points as banks rally", 1, "Yahoo"),
    art("Sensex Jumps 500 Points As Banks Rally!", 3, "MSN"),
    art("Nifty falls on profit booking", 1),
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].source, "Yahoo", "newest copy kept");
});

test("9. freshness weighting: half-life 12 h", () => {
  assert.ok(Math.abs(freshnessWeight(hoursAgo(0), NOW) - 1) < 1e-9);
  assert.ok(Math.abs(freshnessWeight(hoursAgo(12), NOW) - 0.5) < 1e-9);
  assert.ok(Math.abs(freshnessWeight(hoursAgo(24), NOW) - 0.25) < 1e-9);
  // A fresh bearish article outweighs an equally strong one-day-old bullish one.
  const r = analyzeNews([art("Nifty surges as markets rally strongly", 24), art("Nifty plunges as markets tumble sharply", 1)], "nifty", NOW, NOW.toISOString());
  assert.ok(r.score < 0);
});

test("10. aggregation: weighted score and class percentages", () => {
  const r = analyzeNews(
    [art("Nifty surges to record high", 1), art("Sensex rallies as FPIs buy", 2), art("Nifty slips on profit booking, falls 0.2%", 3), art("NSE releases circular on lot sizes", 1)],
    "nifty",
    NOW,
    NOW.toISOString(),
  );
  assert.equal(r.articleCount, 4);
  assert.equal(r.bullishCount, 2);
  assert.equal(r.bearishCount, 1);
  assert.equal(r.bullishPct + r.bearishPct + r.neutralPct, 100);
  assert.ok(r.score > 0 && r.overall === "BULLISH");
});

test("11. confidence: more agreeing evidence → higher; mixed → lower; score ≠ confidence", () => {
  const one = analyzeNews([art("Nifty surges to record high", 1)], "nifty", NOW, NOW.toISOString());
  const many = analyzeNews(["Nifty surges", "Sensex rallies higher", "Indian stocks jump", "Nifty climbs to record high", "Dalal Street soars"].map((t, i) => art(t, 1 + i * 0.1)), "nifty", NOW, NOW.toISOString());
  const mixed = analyzeNews([art("Nifty surges to record high", 1), art("Nifty plunges, Sensex tumbles", 1.1)], "nifty", NOW, NOW.toISOString());
  assert.ok(many.confidence > one.confidence, `${many.confidence} > ${one.confidence}`);
  assert.ok(mixed.confidence < one.confidence);
  assert.ok(one.score > 0.5 && one.confidence < 0.5, "strong score, weak confidence");
});

test("12. NIFTY relevance: 'nifty' inside 'Bank Nifty' does not count as NIFTY 50", () => {
  const bankOnly = relevance("Bank Nifty slips 1%", "nifty");
  const broad = relevance("Nifty 50 ends at record", "nifty");
  assert.ok(broad.score > bankOnly.score);
  assert.ok(bankOnly.score <= 0.6);
});

test("13. BANK NIFTY relevance: banking news weighs more for BANK NIFTY than for NIFTY", () => {
  const t = "HDFC Bank, ICICI Bank lead PSU banks higher on credit growth";
  assert.ok(relevance(t, "banknifty").score > relevance(t, "nifty").score);
  assert.equal(relevance(t, "banknifty").category, "BANKING");
  assert.ok(relevance("Nifty 50 ends higher", "banknifty").score < relevance("Nifty 50 ends higher", "nifty").score);
});

test("14. event detection with stated timing only", () => {
  const r = analyzeNews([art("RBI policy, TCS earnings, crude prices to steer markets this week", 2, "BusinessLine")], "nifty", NOW, NOW.toISOString());
  const cats = r.eventRisk.events.map((e) => e.category);
  assert.ok(cats.includes("RBI") && cats.includes("CONSTITUENT"));
  assert.equal(r.eventRisk.events.find((e) => e.category === "RBI")!.timing, "UPCOMING");
  assert.equal(r.eventRisk.status, "DETECTED");
});

test("15. event-risk levels: NONE / sector-specific HIGH / corroborated EXTREME", () => {
  assert.equal(analyzeNews([art("Nifty ends flat", 1)], "nifty", NOW, "x").eventRisk.level, "NONE");
  const bankEvent = [art("RBI restricts lending at a mid-sized private lender; bank stocks fall", 1)];
  assert.equal(analyzeNews(bankEvent, "banknifty", NOW, "x").eventRisk.level, "HIGH");
  assert.equal(analyzeNews(bankEvent, "nifty", NOW, "x").eventRisk.level, "MEDIUM");
  const rbi = ["RBI monetary policy today", "MPC decision on repo rate", "Markets await RBI policy review", "Repo rate decision: what to expect"].map((t, i) => art(t, i + 1));
  assert.equal(analyzeNews(rbi, "nifty", NOW, "x").eventRisk.level, "EXTREME");
  const old = [art("RBI monetary policy today", 100)];
  assert.equal(analyzeNews(old, "nifty", NOW, "x").eventRisk.level, "NONE", "outside the 72 h event window");
});

// --- engine integration helpers ---
const toNews = (d: NewsSentiment): News => ({
  score: d.score, bullishPct: d.bullishPct, neutralPct: d.neutralPct, bearishPct: d.bearishPct,
  eventRisk: d.eventRisk.level === "HIGH" || d.eventRisk.level === "EXTREME" ? d.eventRisk.reason : null, status: d.status, confidence: d.confidence, detail: d,
});
const withNews = (index: "nifty" | "banknifty", over: Partial<NewsSentiment>): Snapshot => {
  const s = mockSnapshot(index, NOW);
  const d: NewsSentiment = { ...analyzeNews([art("Nifty ends flat", 1)], index, NOW, NOW.toISOString()), ...over };
  s.news = toNews(d);
  return s;
};

test("16. stale news (24 h+ delayed feed) is not used as current and blocks a trade", () => {
  const r = analyzeNews([art("Nifty surges to record high", 30)], "nifty", NOW, NOW.toISOString());
  assert.equal(r.status, "STALE");
  assert.match(r.reason!, /30 h old/);
  const a = analyze(withNews("nifty", r), NOW);
  assert.equal(a.status, "NO TRADE");
  assert.ok(a.blockers.some((b) => b.startsWith("News is stale")));
  assert.equal(a.factors.find((f) => f.key === "news")!.available, false);
  assert.equal(dataLabel([withNews("nifty", r)]), "MOCK DATA", "label never LIVE with stale news");
});

let calls = 0;
const realFetch = globalThis.fetch;
const realInfo = console.info;
const realWarn = console.warn;
const realKey = process.env.NEWS_API_KEY;
const stubNews = (res: () => Response) => {
  globalThis.fetch = (async () => {
    calls++;
    return res();
  }) as typeof fetch;
};
const okBody = () =>
  Response.json({
    status: "ok",
    totalResults: 3,
    articles: [
      { source: { name: "ET" }, title: "Nifty 50 surges to record high", description: "", url: "https://e.t/1", publishedAt: hoursAgo(1) },
      { source: { name: "BS" }, title: "HDFC Bank, ICICI Bank drag PSU banks lower", description: "", url: "https://b.s/2", publishedAt: hoursAgo(2) },
      { source: { name: "X" }, title: "[Removed]", description: "", url: "", publishedAt: hoursAgo(1) },
    ],
  });
beforeEach(() => {
  clearUpstoxCache();
  calls = 0;
  process.env.NEWS_API_KEY = "news-secret-key";
  process.env.NEWS_RSS_FEEDS = "none"; // these tests exercise the NewsAPI path alone (RSS has its own tests)
  console.info = () => {};
  console.warn = () => {};
});
afterEach(() => {
  globalThis.fetch = realFetch;
  console.info = realInfo;
  console.warn = realWarn;
  delete process.env.NEWS_RSS_FEEDS;
  if (realKey === undefined) delete process.env.NEWS_API_KEY;
  else process.env.NEWS_API_KEY = realKey;
});

test("17. unavailable news: missing key / network failure → UNAVAILABLE, never mock", async () => {
  delete process.env.NEWS_API_KEY;
  const r = await getIndexNews("nifty", () => NOW);
  assert.equal(r.status, "UNAVAILABLE");
  assert.match(r.reason!, /NEWS_NOT_CONFIGURED/);
  process.env.NEWS_API_KEY = "k";
  globalThis.fetch = (async () => {
    throw new Error("ECONNRESET");
  }) as typeof fetch;
  assert.match((await getIndexNews("nifty", () => NOW)).reason!, /NEWS_NETWORK/);
});

test("18. news cache: one provider call feeds both indices; per-index results stay separate", async () => {
  stubNews(okBody);
  const n = await getIndexNews("nifty", () => NOW);
  const b = await getIndexNews("banknifty", () => NOW);
  await getIndexNews("nifty", () => NOW);
  assert.equal(calls, 1);
  assert.equal(n.fetchedCount, 2, "[Removed] placeholder dropped");
  assert.equal(n.articles[0].title, "Nifty 50 surges to record high");
  assert.equal(b.articles[0].title, "HDFC Bank, ICICI Bank drag PSU banks lower", "banking story leads for BANK NIFTY");
  assert.notEqual(n.score, b.score);
});

test("19. mixed data: live market + unavailable news can never be a LIVE trade", () => {
  const s = mockSnapshot("nifty", NOW);
  for (const k of ["market", "optionChain", "technical"] as const) s.sources[k] = { source: "LIVE", provider: "UPSTOX", fetchedAt: NOW.toISOString() };
  s.sources.news = { source: "UNAVAILABLE", provider: null, fetchedAt: null };
  const a = analyze(s, NOW);
  assert.equal(a.status, "NO TRADE");
  assert.ok(a.blockers.includes("Full confirmation requires live news data"));
  assert.equal(dataLabel([s]), "PARTIAL LIVE DATA");
});

test("20. bullish technicals + strongly bearish confident news → WAIT with conflict reason", () => {
  const TEST_RISK = { accountCapital: 500_000 };
  const base = analyze(mockSnapshot("nifty", NOW), NOW, TEST_RISK);
  assert.equal(base.status, "TRADE", "baseline would trade");
  const a = analyze(withNews("nifty", { score: -0.8, confidence: 0.9, status: "LIVE" }), NOW, TEST_RISK);
  assert.equal(a.status, "WAIT");
  assert.equal(a.plan, null);
  assert.ok(a.blockers.includes("News direction conflicts with market and option-chain signals."));
  assert.ok(a.risks.some((r) => r.includes("contradicts")));
});

test("21. bearish technicals + strongly bullish confident news → conflict flagged", () => {
  const a = analyze(withNews("banknifty", { score: 0.8, confidence: 0.9, status: "LIVE" }), NOW);
  assert.notEqual(a.status, "TRADE");
  assert.ok(a.blockers.includes("News direction conflicts with market and option-chain signals."));
  // Weak-confidence news does not trigger the conflict rule.
  const weak = analyze(withNews("banknifty", { score: 0.8, confidence: 0.3, status: "LIVE" }), NOW);
  assert.ok(!weak.blockers.includes("News direction conflicts with market and option-chain signals."));
});

test("22. news fills the 10-point factor as score × confidence (one headline can't max it)", () => {
  const pts = (score: number, confidence: number) => analyze(withNews("nifty", { score, confidence, status: "LIVE" }), NOW).factors.find((f) => f.key === "news")!;
  const strong = pts(0.7, 0.85);
  const weak = pts(0.7, 0.35);
  assert.equal(strong.max, 10);
  assert.ok(strong.available && strong.score > weak.score);
  assert.ok(weak.score < 7, "low-confidence news earns little");
  const single = analyzeNews([art("Nifty surges to record high", 0.5)], "nifty", NOW, NOW.toISOString());
  assert.ok(analyze(withNews("nifty", single), NOW).factors.find((f) => f.key === "news")!.score < 10);
});

test("23. provider API failure (rate limit) → UNAVAILABLE with reason; key never echoed", async () => {
  stubNews(() => Response.json({ status: "error", code: "rateLimited", message: "Too many requests for key news-secret-key" }, { status: 429 }));
  const r = await getIndexNews("banknifty", () => NOW);
  assert.equal(r.status, "UNAVAILABLE");
  assert.match(r.reason!, /NEWS_RATE_LIMITED/);
  assert.ok(!r.reason!.includes("news-secret-key"));
  stubNews(okBody);
  assert.equal((await getIndexNews("banknifty", () => NOW)).status, "LIVE", "failure was not cached");
});

test("24. malformed provider responses are rejected", async () => {
  assert.throws(() => normalizeNewsApi({ status: "error" }), (e: NewsError) => e.reason === "NEWS_BAD_RESPONSE");
  assert.throws(() => normalizeNewsApi(null), NewsError);
  assert.deepEqual(normalizeNewsApi({ status: "ok", articles: [{ title: "x" }, { title: "y", publishedAt: "nope" }] }), [], "rows without dates dropped");
  stubNews(() => new Response("<html>oops</html>", { status: 200 }));
  const r = await getIndexNews("nifty", () => NOW);
  assert.equal(r.status, "UNAVAILABLE");
  assert.match(r.reason!, /NEWS_BAD_RESPONSE/);
});

test("25. live-inspection fixes: baseball 'RBI', losing streak, rate hike, spaced duplicates, scheduled-week risk", () => {
  assert.equal(relevance("Murakami homers as White Sox win; 3 RBI in the inning", "banknifty").score, 0, "RBI = runs batted in");
  assert.ok(relevance("RBI policy: banks rally", "banknifty").score >= 0.75, "RBI with market context still counts");
  assert.equal(sentiment("After Nifty's longest losing streak in 25 years").label, "BEARISH");
  assert.equal(sentiment("RBI may hike repo rate by 25 bps").label, "BEARISH");
  assert.equal(dedupe([art("AfterNifty's longest losing streak", 1), art("After Nifty's longest losing streak", 2)]).length, 1);
  const week = ["RBI policy this week", "MPC to decide repo rate this week", "Markets await RBI policy review", "Repo rate decision next week"].map((t, i) => art(t, i + 1));
  assert.equal(analyzeNews(week, "nifty", NOW, "x").eventRisk.level, "HIGH", "scheduled week: HIGH, not EXTREME");
});
