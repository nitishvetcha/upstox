// Pure news analysis: normalization, dedupe, relevance, sentiment, aggregation, event risk. No I/O.
import type { Article, IndexId, NewsEvent, NewsSentiment } from "../types.ts";
import {
  AMBIGUOUS, EVENT_RULES, FINANCE_CONTEXT, REVERSERS, STREAK_TERMS, TIMING_WINDOW, EXTREME_MIN_ARTICLES, FRESHNESS, MIN_RELEVANCE, NEGATIVE, NEGATORS, NEUTRALIZERS, POSITIVE, RELEVANCE, RISK_ORDER, type RiskLevel,
} from "./newsConfig.ts";
import { NewsError } from "./errors.ts";

// --- tokenization: whole words only, so "up" never matches "update"/"countdown"/"backup" ---
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9&'\-\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^['-]+|['-]+$/g, ""))
    .filter(Boolean);
}

// Start indices where `phrase` (one or more whole words) occurs in `tokens`.
export function findPhrase(tokens: string[], phrase: string): number[] {
  const p = phrase.split(" ");
  const out: number[] = [];
  for (let i = 0; i + p.length <= tokens.length; i++) if (p.every((w, j) => tokens[i + j] === w)) out.push(i);
  return out;
}
const has = (tokens: string[], phrase: string) => findPhrase(tokens, phrase).length > 0;

// An article as a provider delivers it, before any scoring. Every provider returns this one shape.
export type RawArticle = Omit<Article, "category" | "relevance" | "relevanceLabel" | "sentiment" | "sentimentScore" | "confidence" | "events">;

// --- provider normalization (NewsAPI /v2/everything shape) ---
type Raw = Record<string, unknown>;
export function normalizeNewsApi(body: unknown): RawArticle[] {
  const b = body as { status?: unknown; articles?: unknown } | null;
  if (!b || b.status !== "ok" || !Array.isArray(b.articles)) throw new NewsError("NEWS_BAD_RESPONSE", "news response malformed");
  return (b.articles as Raw[])
    .filter((a) => typeof a?.title === "string" && a.title !== "[Removed]" && typeof a.publishedAt === "string" && !Number.isNaN(Date.parse(a.publishedAt as string)))
    .map((a) => {
      const title = (a.title as string).trim();
      const url = typeof a.url === "string" ? a.url : "";
      return {
        id: url || title,
        title,
        description: typeof a.description === "string" ? a.description.trim() : "",
        source: String((a.source as Raw | undefined)?.name ?? "Unknown"),
        url,
        publishedAt: new Date(a.publishedAt as string).toISOString(),
        provider: "NEWSAPI" as const,
      };
    });
}

// --- duplicates: same normalized title (syndication) or same source + near-identical title ---
// Joined without spaces so "AfterNifty's" and "After Nifty's" (seen live) collapse together.
const titleKey = (t: string) => tokenize(t.replace(/\s[-|–]\s[^-|–]+$/, "")).join(""); // drop " - Publisher" suffix
// Copies collapse to one: newest timestamp kept, longest description kept, the publisher's own (RSS) URL
// preferred, and the other publishers listed — so a syndicated story never counts more than once.
export function dedupe<T extends { title: string; source: string; publishedAt: string; description?: string; url?: string; provider?: string; alsoReportedBy?: string[] }>(articles: T[]): T[] {
  const seen = new Map<string, T>();
  for (const a of [...articles].sort((x, y) => Date.parse(y.publishedAt) - Date.parse(x.publishedAt))) {
    const k = titleKey(a.title);
    if (!k) continue;
    const kept = seen.get(k);
    if (!kept) {
      seen.set(k, a);
      continue;
    }
    const merged = { ...kept };
    if ((a.description ?? "").length > (kept.description ?? "").length) merged.description = a.description;
    if (a.provider === "RSS" && kept.provider !== "RSS" && a.url) merged.url = a.url;
    if (a.source !== kept.source) merged.alsoReportedBy = [...new Set([...(kept.alsoReportedBy ?? []), a.source])];
    seen.set(k, merged);
  }
  return [...seen.values()];
}

// --- relevance per index: strongest matching term, plus a small bonus for corroborating groups ---
export function relevance(text: string, index: IndexId) {
  const tokens = tokenize(text);
  const matched = RELEVANCE[index].flatMap((g) => g.terms).filter(([p]) => has(tokens, p)).map(([p]) => p);
  const corroborated = matched.some((p) => !AMBIGUOUS.has(p)) || FINANCE_CONTEXT.some((w) => has(tokens, w));
  let best = 0;
  let group: Article["category"] = "OTHER";
  let groups = 0;
  for (const g of RELEVANCE[index]) {
    const w = Math.max(0, ...g.terms.filter(([p]) => {
      if (AMBIGUOUS.has(p) && !corroborated) return false;
      if (!has(tokens, p)) return false;
      // "nifty" alone must not count for NIFTY 50 when it is part of "bank nifty" / "nifty bank".
      if (p === "nifty") return findPhrase(tokens, "nifty").some((i) => tokens[i - 1] !== "bank" && tokens[i + 1] !== "bank");
      return true;
    }).map(([, w]) => w));
    if (w > 0) groups++;
    if (w > best) [best, group] = [w, g.group];
  }
  const score = Math.min(1, best + 0.1 * Math.max(0, groups - 1));
  return { score: Math.round(score * 100) / 100, category: score === 0 ? ("OTHER" as const) : group };
}
export const relevanceLabel = (r: number): Article["relevanceLabel"] => (r >= 0.8 ? "HIGH" : r >= MIN_RELEVANCE ? "MEDIUM" : "LOW");

// --- sentiment: lexicon hits, negation flips (within 3 words before), neutralizers dampen ---
export function sentiment(title: string, description = "") {
  let pos = 0;
  let neg = 0;
  let raw = 0;
  let neutral = false;
  for (const [text, weight] of [[title, 1.5], [description, 1]] as const) {
    const tokens = tokenize(text);
    if (NEUTRALIZERS.some((p) => has(tokens, p))) neutral = true;
    for (const [lex, sign] of [[POSITIVE, 1], [NEGATIVE, -1]] as const)
      for (const [phrase, w] of lex)
        for (const i of findPhrase(tokens, phrase)) {
          const before = tokens.slice(Math.max(0, i - 3), i);
          const negated = before.some((t) => NEGATORS.has(t) || t.endsWith("n't"));
          const reversed = sign < 0 && STREAK_TERMS.has(phrase) && before.some((t) => REVERSERS.has(t));
          const s = reversed ? 1 : negated ? -sign * 0.5 : sign; // "not bullish" = mildly bearish; "snaps losing streak" = bullish
          raw += s * w * weight;
          if (s > 0) pos += w * weight;
          else neg += w * weight;
        }
  }
  if (neutral) raw *= 0.5;
  const score = Math.tanh(raw / 3);
  const hits = pos + neg;
  // Confidence: amount of evidence × how one-sided it is (mixed headlines are uncertain).
  const confidence = hits === 0 ? 0 : Math.min(1, hits / 4) * (Math.abs(pos - neg) / hits);
  const label: Article["sentiment"] = score > 0.15 ? "BULLISH" : score < -0.15 ? "BEARISH" : "NEUTRAL";
  return { score: Math.round(score * 100) / 100, confidence: Math.round(confidence * 100) / 100, label };
}

export const freshnessWeight = (publishedAt: string, now: Date) =>
  Math.pow(0.5, Math.max(0, now.getTime() - Date.parse(publishedAt)) / 3_600_000 / FRESHNESS.halfLifeHours);

// --- events: rule hits on relevant articles inside the event window ---
function detectEvents(articles: Article[], index: IndexId, now: Date): NewsSentiment["eventRisk"] {
  const windowMs = FRESHNESS.eventWindowHours * 3_600_000;
  const hits: NewsEvent[] = [];
  for (const a of articles) {
    if (now.getTime() - Date.parse(a.publishedAt) > windowMs) continue;
    const tokens = tokenize(`${a.title} ${a.description}`);
    for (const r of EVENT_RULES) {
      const at = r.any.flatMap((p) => findPhrase(tokens, p));
      if (!at.length || (r.with && !r.with.some((p) => has(tokens, p)))) continue;
      // Timing is only what the text says, and only next to the event phrase ("Stock market today… RBI" is not
      // "RBI today"). No exact event time is invented.
      const near = (word: string) => findPhrase(tokens, word).some((j) => at.some((i) => Math.abs(j - i) <= TIMING_WINDOW));
      const timing = near("today") || near("tonight") ? "TODAY" : near("this week") || near("next week") || near("tomorrow") ? "UPCOMING" : "UNSPECIFIED";
      hits.push({ category: r.category, label: r.label, severity: index === "banknifty" ? r.bank : r.nifty, timing, headline: a.title, publishedAt: a.publishedAt });
    }
  }
  let level: RiskLevel = "NONE";
  const byCat = new Map<string, NewsEvent[]>();
  for (const h of hits) byCat.set(h.category, [...(byCat.get(h.category) ?? []), h]);
  for (const list of byCat.values()) {
    let sev = RISK_ORDER.indexOf(list[0].severity);
    // HIGH → EXTREME only when widely corroborated AND stated as happening today (a scheduled week stays HIGH).
    if (list.length >= EXTREME_MIN_ARTICLES && sev === RISK_ORDER.indexOf("HIGH") && list.some((h) => h.timing === "TODAY")) sev++;
    level = RISK_ORDER[Math.max(RISK_ORDER.indexOf(level), sev)];
  }
  const top = [...byCat.values()].sort((a, b) => RISK_ORDER.indexOf(b[0].severity) - RISK_ORDER.indexOf(a[0].severity) || b.length - a.length)[0];
  return {
    level,
    status: level === "NONE" ? "NONE" : "DETECTED",
    reason: top ? `${top[0].label} detected in ${top.length} article${top.length > 1 ? "s" : ""}${top.some((t) => t.timing === "TODAY") ? " (today)" : top.some((t) => t.timing === "UPCOMING") ? " (upcoming)" : ""}` : null,
    events: hits.slice(0, 20),
  };
}

// --- per-index aggregate ---
export function analyzeNews(pool: RawArticle[], index: IndexId, now: Date, fetchedAt: string): NewsSentiment {
  const scored: Article[] = dedupe(pool).map((a) => {
    const rel = relevance(`${a.title} ${a.description}`, index);
    const s = sentiment(a.title, a.description);
    return { ...a, category: rel.category, relevance: rel.score, relevanceLabel: relevanceLabel(rel.score), sentiment: s.label, sentimentScore: s.score, confidence: s.confidence, events: [] };
  });
  const relevant = scored.filter((a) => a.relevance >= MIN_RELEVANCE).sort((a, b) => b.relevance * freshnessWeight(b.publishedAt, now) - a.relevance * freshnessWeight(a.publishedAt, now));
  const eventRisk = detectEvents(relevant, index, now);
  for (const a of relevant) a.events = eventRisk.events.filter((e) => e.headline === a.title).map((e) => e.category);

  const newest = relevant.reduce<string | null>((m, a) => (!m || a.publishedAt > m ? a.publishedAt : m), null);
  const ageH = newest ? (now.getTime() - Date.parse(newest)) / 3_600_000 : Infinity;
  const status: NewsSentiment["status"] = ageH <= FRESHNESS.liveHours ? "LIVE" : ageH <= FRESHNESS.agingHours ? "AGING" : "STALE";

  // Weighted aggregate. Direction weight = relevance × freshness × confidence; class shares use relevance × freshness.
  let sw = 0, ss = 0, sabs = 0, cw = 0;
  const share = { BULLISH: 0, BEARISH: 0, NEUTRAL: 0 };
  for (const a of relevant) {
    const f = freshnessWeight(a.publishedAt, now);
    const w = a.relevance * f * a.confidence;
    sw += w;
    ss += w * a.sentimentScore;
    sabs += w * Math.abs(a.sentimentScore);
    share[a.sentiment] += a.relevance * f;
    cw += a.relevance * f;
  }
  const score = sw ? ss / sw : 0;
  // Confidence: saturating evidence (≈ 3 strong, fresh, relevant articles → 63%) × consensus among them.
  const confidence = sw ? (1 - Math.exp(-sw / 3)) * (Math.abs(ss) / sabs || 0) : 0;
  const pct = (x: number) => (cw ? Math.round((100 * x) / cw) : 0);
  const sectorShare = index === "banknifty" ? relevant.filter((a) => a.category === "BANKING" || a.category === "INDEX") : [];
  const sector = sectorShare.length ? sectorShare.reduce((t, a) => t + a.sentimentScore * a.confidence, 0) / sectorShare.length : null;

  return {
    index,
    status,
    reason: !relevant.length ? "No relevant articles" : status === "STALE" ? `Newest relevant article is ${Math.round(ageH)} h old` : null,
    score: Math.round(score * 100) / 100,
    overall: score > 0.15 ? "BULLISH" : score < -0.15 ? "BEARISH" : "NEUTRAL",
    bullishPct: pct(share.BULLISH),
    bearishPct: pct(share.BEARISH),
    neutralPct: pct(share.NEUTRAL),
    articleCount: relevant.length,
    bullishCount: relevant.filter((a) => a.sentiment === "BULLISH").length,
    bearishCount: relevant.filter((a) => a.sentiment === "BEARISH").length,
    fetchedCount: pool.length,
    uniqueCount: scored.length,
    confidence: Math.round(confidence * 100) / 100,
    sectorScore: sector === null ? null : Math.round(sector * 100) / 100,
    newestAt: newest,
    fetchedAt,
    eventRisk,
    articles: relevant.slice(0, 25),
  };
}

export function unavailableNews(index: IndexId, reason: string): NewsSentiment {
  return {
    index, status: "UNAVAILABLE", reason, score: 0, overall: "NEUTRAL", bullishPct: 0, bearishPct: 0, neutralPct: 0,
    articleCount: 0, bullishCount: 0, bearishCount: 0, fetchedCount: 0, uniqueCount: 0, confidence: 0, sectorScore: null, newestAt: null, fetchedAt: null,
    eventRisk: { level: "NONE", status: "NONE", reason: null, events: [] }, articles: [],
  };
}
