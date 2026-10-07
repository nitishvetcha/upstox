import { allNews, sentimentSummary } from "@/lib/services/newsApi";

// GET /api/news — de-duplicated relevant articles across NIFTY and BANK NIFTY, newest first.
export async function GET() {
  const results = await allNews();
  const byId = new Map<string, Record<string, unknown>>();
  for (const r of results)
    for (const a of r.articles) {
      const prev = byId.get(a.id);
      const rel = { ...((prev?.relevanceByIndex as object) ?? {}), [r.index === "nifty" ? "NIFTY" : "BANKNIFTY"]: a.relevance };
      byId.set(a.id, { ...a, relevance: undefined, relevanceByIndex: rel });
    }
  const articles = [...byId.values()].sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));
  return Response.json({ indices: results.map(sentimentSummary), articleCount: articles.length, articles });
}
