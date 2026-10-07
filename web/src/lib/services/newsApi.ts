// Normalized response builders shared by the news routes (no provider fields, no keys).
import type { IndexId, NewsSentiment } from "../types";
import { INDICES, INSTRUMENTS } from "./instrumentRegistry";
import { getIndexNews } from "./newsProvider";
import { freshnessOf } from "../time";

export const allNews = () => Promise.all(INDICES.map((i) => getIndexNews(i)));

export function sentimentSummary(n: NewsSentiment) {
  const { articles: _articles, eventRisk, ...rest } = n;
  void _articles;
  return { ...rest, index: INSTRUMENTS[n.index].symbol, eventRisk: { level: eventRisk.level, status: eventRisk.status, reason: eventRisk.reason }, fetchAge: freshnessOf(n.fetchedAt, new Date(), 10) };
}

export function eventSummary(n: NewsSentiment) {
  return { index: INSTRUMENTS[n.index].symbol, newsStatus: n.status, ...n.eventRisk, fetchedAt: n.fetchedAt };
}

export async function indexNews(index: IndexId) {
  return getIndexNews(index);
}
