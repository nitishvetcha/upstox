// Centralised news configuration: queries, relevance terms, sentiment lexicon, event rules, thresholds.
// Everything is deterministic and whole-word/phrase based (no substring matching).
import type { IndexId } from "../types.ts";

// NewsAPI free/developer plans allow ~100 requests/day and delay /everything by ~24 h, so one combined
// query (≤ 500 chars) feeds both indices from a shared article pool, cached for NEWS_CACHE_MINUTES.
export const NEWS_QUERY = [
  '"Nifty"', '"Sensex"', '"NSE"', '"Dalal Street"', '"Indian stocks"', '"Indian market"', '"Indian equities"',
  '"Bank Nifty"', '"Indian banks"', '"banking stocks"', '"PSU banks"',
  '"RBI"', '"repo rate"', '"FPI"', '"FII"', '"rupee"', '"crude oil"', '"Federal Reserve"',
].join(" OR ");
export const NEWS_PAGE_SIZE = 100;
export const newsCacheMs = () => Math.max(2, Number(process.env.NEWS_CACHE_MINUTES ?? 20)) * 60_000;

// Freshness: weight = 0.5 ^ (ageHours / HALF_LIFE_HOURS). Status from the newest relevant article's age.
export const FRESHNESS = { halfLifeHours: 12, liveHours: 6, agingHours: 24, eventWindowHours: 72 };
export const MIN_RELEVANCE = 0.4; // below this an article does not count for an index
// Terms with common non-market meanings ("RBI" = runs batted in in baseball, "Fed" = fed up, ...):
// they count only when another, unambiguous relevance term appears in the same article.
export const AMBIGUOUS = new Set(["rbi", "fed", "mpc", "inr", "cpi", "crude"]);
// Finance context that also confirms an ambiguous term (not relevance terms themselves).
export const FINANCE_CONTEXT = ["market", "markets", "policy", "rate", "rates", "bank", "banks", "inflation", "stocks", "shares", "economy", "repo", "bps", "yields", "investors", "lending", "liquidity", "monetary"];
export const EXTREME_MIN_ARTICLES = 4; // HIGH → EXTREME only with this many articles AND the event stated as today

type Terms = [phrase: string, weight: number][];
const BROAD: Terms = [["nifty 50", 1], ["nifty50", 1], ["sensex", 0.9], ["nse", 0.8], ["dalal street", 0.9], ["indian market", 0.9], ["indian markets", 0.9], ["indian stocks", 0.9], ["indian equities", 0.9], ["indian equity", 0.9], ["domestic market", 0.7], ["benchmark indices", 0.8], ["benchmark index", 0.8], ["stock market", 0.5]];
const BANK_INDEX: Terms = [["bank nifty", 1], ["banknifty", 1], ["nifty bank", 1]];
const BANKING: Terms = [["banking stocks", 0.85], ["bank stocks", 0.85], ["banking sector", 0.85], ["psu banks", 0.85], ["private banks", 0.8], ["private lenders", 0.8], ["lenders", 0.6], ["credit growth", 0.6], ["deposit growth", 0.6], ["npa", 0.6], ["bad loans", 0.6]];
const BANK_NAMES: Terms = [["hdfc bank", 0.7], ["icici bank", 0.7], ["sbi", 0.7], ["state bank of india", 0.7], ["axis bank", 0.7], ["kotak mahindra bank", 0.7], ["kotak bank", 0.7], ["indusind bank", 0.7], ["bank of baroda", 0.7], ["punjab national bank", 0.7], ["pnb", 0.6], ["federal bank", 0.6], ["idfc first bank", 0.6], ["au small finance bank", 0.6], ["canara bank", 0.6]];
const NIFTY_NAMES: Terms = [["reliance industries", 0.6], ["infosys", 0.6], ["tcs", 0.6], ["tata consultancy", 0.6], ["itc", 0.5], ["larsen & toubro", 0.6], ["bharti airtel", 0.6], ["hindustan unilever", 0.6], ["bajaj finance", 0.6], ["maruti suzuki", 0.6], ["tata motors", 0.6], ["mahindra & mahindra", 0.6], ["sun pharma", 0.5], ["wipro", 0.5], ["hcltech", 0.5], ["adani", 0.5]];
const MACRO: Terms = [["rbi", 0.6], ["reserve bank", 0.6], ["repo rate", 0.6], ["monetary policy", 0.6], ["mpc", 0.5], ["inflation", 0.5], ["cpi", 0.5], ["wpi", 0.5], ["gdp", 0.5], ["fii", 0.6], ["fiis", 0.6], ["fpi", 0.6], ["fpis", 0.6], ["dii", 0.5], ["diis", 0.5], ["foreign investors", 0.6], ["rupee", 0.5], ["inr", 0.4], ["crude oil", 0.45], ["crude", 0.4], ["brent", 0.4], ["federal reserve", 0.45], ["fed", 0.4], ["fomc", 0.45], ["us yields", 0.4], ["treasury yields", 0.4]];

// Relevance terms per index. NIFTY: broad market strongest; BANK NIFTY: banking strongest, broad market partial.
export const RELEVANCE: Record<IndexId, { group: "INDEX" | "BANKING" | "MARKET" | "MACRO"; terms: Terms }[]> = {
  nifty: [
    { group: "INDEX", terms: [["nifty", 1], ...BROAD] },
    { group: "MARKET", terms: [...NIFTY_NAMES, ...BANK_NAMES.map(([p]) => [p, 0.5] as [string, number])] },
    { group: "BANKING", terms: [...BANK_INDEX.map(([p]) => [p, 0.6] as [string, number]), ...BANKING.map(([p]) => [p, 0.45] as [string, number])] },
    { group: "MACRO", terms: MACRO },
  ],
  banknifty: [
    { group: "INDEX", terms: BANK_INDEX },
    { group: "BANKING", terms: [...BANKING, ...BANK_NAMES] },
    { group: "MARKET", terms: [["nifty", 0.5], ...BROAD.map(([p]) => [p, 0.5] as [string, number])] },
    { group: "MACRO", terms: MACRO.map(([p, w]) => [p, ["rbi", "reserve bank", "repo rate", "monetary policy", "mpc"].includes(p) ? 0.75 : w * 0.8] as [string, number]) },
  ],
};

// Sentiment lexicon: market-direction words, whole words / phrases only. Weights are per occurrence.
export const POSITIVE: Terms = [
  ["rally", 1], ["rallies", 1], ["rallied", 1], ["surge", 1], ["surges", 1], ["surged", 1], ["soar", 1], ["soars", 1], ["soared", 1],
  ["jump", 0.8], ["jumps", 0.8], ["jumped", 0.8], ["gain", 0.7], ["gains", 0.7], ["gained", 0.7], ["rise", 0.6], ["rises", 0.6], ["rose", 0.6], ["rising", 0.6],
  ["climb", 0.7], ["climbs", 0.7], ["climbed", 0.7], ["advance", 0.5], ["advances", 0.5], ["higher", 0.5], ["record high", 1], ["all-time high", 1], ["up", 0.3],
  ["bullish", 1], ["bulls", 0.7], ["upbeat", 0.8], ["optimism", 0.8], ["optimistic", 0.8], ["rebound", 0.8], ["rebounds", 0.8], ["rebounded", 0.8], ["recovery", 0.6], ["recovers", 0.7],
  ["inflows", 0.7], ["buying", 0.5], ["outperform", 0.6], ["outperforms", 0.6], ["upgrade", 0.6], ["upgraded", 0.6], ["beats estimates", 0.8], ["beat estimates", 0.8], ["strong", 0.4],
  ["rate cut", 0.8], ["rate cuts", 0.8], ["cuts rates", 0.8], ["eases", 0.4], ["cools", 0.5], ["boost", 0.6], ["boosts", 0.6],
];
export const NEGATIVE: Terms = [
  ["fall", 0.8], ["falls", 0.8], ["fell", 0.8], ["falling", 0.8], ["decline", 0.7], ["declines", 0.7], ["declined", 0.7], ["drop", 0.7], ["drops", 0.7], ["dropped", 0.7],
  ["slump", 1], ["slumps", 1], ["slumped", 1], ["plunge", 1], ["plunges", 1], ["plunged", 1], ["crash", 1], ["crashes", 1], ["crashed", 1], ["tumble", 1], ["tumbles", 1], ["tumbled", 1],
  ["slide", 0.7], ["slides", 0.7], ["slid", 0.7], ["sink", 0.8], ["sinks", 0.8], ["sank", 0.8], ["lower", 0.5], ["loss", 0.5], ["losses", 0.6], ["down", 0.3],
  ["bearish", 1], ["bears", 0.7], ["selloff", 1], ["sell-off", 1], ["outflows", 0.7], ["selling", 0.5], ["weak", 0.5], ["weaker", 0.5], ["downgrade", 0.6], ["downgraded", 0.6],
  ["rate hike", 0.8], ["rate hikes", 0.8], ["hikes rates", 0.8], ["misses estimates", 0.8], ["fear", 0.6], ["fears", 0.6], ["concern", 0.4], ["concerns", 0.4], ["worries", 0.5], ["pressure", 0.4], ["record low", 0.9],
  ["short", 0.4], ["volatile", 0.3], ["risks", 0.3], ["weigh", 0.5], ["weighs", 0.5],
  ["losing streak", 1], ["losing", 0.6], ["correction", 0.5], ["fades", 0.6], ["fade", 0.6], ["drag", 0.6], ["drags", 0.6], ["hike", 0.6], ["hikes", 0.6], ["hiked", 0.6], ["raise rates", 0.6], ["increase rates", 0.6],
];
export const NEGATORS = new Set(["not", "no", "never", "without", "neither", "nor", "isn't", "wasn't", "aren't", "don't", "doesn't", "didn't", "won't", "cannot", "unlikely", "fails", "failed", "unable"]);
// "Markets break 8-week losing streak" (seen live) is bullish: these words just before a streak/rout term reverse it.
export const REVERSERS = new Set(["break", "breaks", "broke", "snap", "snaps", "snapped", "end", "ends", "ended", "halt", "halts", "halted"]);
export const STREAK_TERMS = new Set(["losing streak", "losing", "rout", "slide", "slump", "selloff", "sell-off"]);
// Event timing words count only within this many words of the event phrase.
export const TIMING_WINDOW = 10;
export const NEUTRALIZERS = ["unchanged", "flat", "steady", "holds rates", "keeps rates", "maintains", "status quo"]; // dampen, never flip

export type EventCategory =
  | "RBI" | "FED" | "INFLATION" | "GDP" | "EMPLOYMENT" | "BUDGET" | "ELECTIONS" | "GEOPOLITICAL" | "CRUDE" | "CURRENCY" | "BANKING" | "CONSTITUENT";
export type RiskLevel = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
export const RISK_ORDER: RiskLevel[] = ["NONE", "LOW", "MEDIUM", "HIGH", "EXTREME"];

// Event rules: any of `all` phrases must appear (and any of `with`, if given). `bank` = severity for BANK NIFTY.
export const EVENT_RULES: { category: EventCategory; any: string[]; with?: string[]; nifty: RiskLevel; bank: RiskLevel; label: string }[] = [
  // RBI-specific phrases only: generic "monetary policy" also matches Fed stories (seen live).
  { category: "RBI", any: ["rbi policy", "rbi monetary policy", "rbi mpc", "mpc", "repo rate", "rbi meeting", "rbi rate", "rbi governor"], nifty: "HIGH", bank: "HIGH", label: "RBI monetary policy" },
  { category: "FED", any: ["fomc", "federal reserve", "fed meeting", "fed rate", "powell"], nifty: "MEDIUM", bank: "MEDIUM", label: "US Federal Reserve" },
  { category: "INFLATION", any: ["cpi", "wpi", "inflation data", "retail inflation", "wholesale inflation"], nifty: "MEDIUM", bank: "MEDIUM", label: "Inflation data" },
  { category: "GDP", any: ["gdp"], nifty: "MEDIUM", bank: "MEDIUM", label: "GDP data" },
  { category: "EMPLOYMENT", any: ["jobs report", "nonfarm payrolls", "non-farm payrolls", "unemployment rate"], nifty: "LOW", bank: "LOW", label: "Employment data" },
  { category: "BUDGET", any: ["union budget", "budget session", "interim budget"], nifty: "HIGH", bank: "HIGH", label: "Union Budget" },
  { category: "ELECTIONS", any: ["election results", "exit poll", "exit polls", "lok sabha election", "general election"], nifty: "HIGH", bank: "HIGH", label: "Elections" },
  { category: "GEOPOLITICAL", any: ["war", "missile", "airstrike", "air strike", "military conflict", "sanctions", "border tensions", "geopolitical tensions", "geopolitical"], nifty: "MEDIUM", bank: "MEDIUM", label: "Geopolitical tension" },
  { category: "CRUDE", any: ["crude", "brent", "oil prices"], with: ["surge", "surges", "spike", "spikes", "soar", "soars", "plunge", "plunges", "jump", "jumps", "shock"], nifty: "MEDIUM", bank: "LOW", label: "Crude oil shock" },
  { category: "CURRENCY", any: ["rupee"], with: ["record low", "all-time low", "plunge", "plunges", "slump", "slumps", "crash", "weakest"], nifty: "MEDIUM", bank: "MEDIUM", label: "Rupee shock" },
  { category: "BANKING", any: ["bank collapse", "bank failure", "bank default", "moratorium", "rbi penalty", "rbi bars", "rbi restricts", "liquidity crisis"], nifty: "MEDIUM", bank: "HIGH", label: "Banking-sector event" },
  { category: "CONSTITUENT", any: ["q1 results", "q2 results", "q3 results", "q4 results", "earnings", "quarterly results"], nifty: "LOW", bank: "LOW", label: "Major constituent results" },
];

// Real-time RSS feeds (public, publisher-provided; no HTML scraping). Verified live 2026-10-05: all carry
// same-day pubDates. Moneycontrol's public RSS feeds were checked and are frozen at April 2024, so they are
// not configured (they could only ever be STALE). Set NEWS_RSS_FEEDS=none to disable RSS.
export const RSS_FEEDS: { name: string; publisher: string; url: string; categories: string[] }[] = [
  { name: "ET Markets", publisher: "Economic Times", url: "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms", categories: ["market", "india"] },
  { name: "ET Stocks", publisher: "Economic Times", url: "https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms", categories: ["market", "stocks"] },
  { name: "ET Economy", publisher: "Economic Times", url: "https://economictimes.indiatimes.com/news/economy/rssfeeds/1373380680.cms", categories: ["macro"] },
  { name: "BS Markets", publisher: "Business Standard", url: "https://www.business-standard.com/rss/markets-106.rss", categories: ["market", "india"] },
  { name: "BS Economy", publisher: "Business Standard", url: "https://www.business-standard.com/rss/economy-102.rss", categories: ["macro"] },
  { name: "Mint Markets", publisher: "LiveMint", url: "https://www.livemint.com/rss/markets", categories: ["market", "india"] },
  { name: "BusinessLine Markets", publisher: "BusinessLine", url: "https://www.thehindubusinessline.com/markets/feeder/default.rss", categories: ["market", "india"] },
];
export const RSS = { cacheMs: 8 * 60_000, failureBackoffMs: 2 * 60_000, timeoutMs: 8_000, maxItemsPerFeed: 60 };
export const rssFeeds = () => (process.env.NEWS_RSS_FEEDS === "none" ? [] : RSS_FEEDS);
