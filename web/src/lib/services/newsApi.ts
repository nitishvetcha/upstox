// Normalized response builders shared by the news routes (no provider fields, no keys).
import type { IndexId, NewsSentiment } from "../types.ts";
import { INDICES, INSTRUMENTS, getUnderlyingInstrument } from "./instrumentRegistry.ts";
import { getIndexNews } from "./newsProvider.ts";
import { freshnessOf } from "../time.ts";

export const allNews = () => Promise.all(INDICES.map((i) => getIndexNews(i)));

export function sentimentSummary(n: NewsSentiment) {
  const { articles: _articles, eventRisk, ...rest } = n;
  void _articles;
  const symbol = getUnderlyingInstrument(n.index)?.symbol ?? INSTRUMENTS[n.index as IndexId]?.symbol ?? String(n.index).toUpperCase();
  return { ...rest, index: symbol, eventRisk: { level: eventRisk.level, status: eventRisk.status, reason: eventRisk.reason }, fetchAge: freshnessOf(n.fetchedAt, new Date(), 10) };
}

export function eventSummary(n: NewsSentiment) {
  const symbol = getUnderlyingInstrument(n.index)?.symbol ?? INSTRUMENTS[n.index as IndexId]?.symbol ?? String(n.index).toUpperCase();
  return { index: symbol, newsStatus: n.status, ...n.eventRisk, fetchedAt: n.fetchedAt };
}

export async function indexNews(index: IndexId) {
  return getIndexNews(index);
}
