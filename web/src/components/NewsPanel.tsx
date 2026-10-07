import { ExternalLink, TriangleAlert } from "lucide-react";
import type { Analysis, NewsProviderStatus, NewsSentiment } from "@/lib/types";
import { fmtIst } from "@/lib/time";
import { Badge, Card, Stat, signed } from "./ui";

const ago = (iso: string, now: Date) => {
  const m = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 60_000));
  return m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
const tone = (s: string) => (s === "BULLISH" ? "bull" : s === "BEARISH" ? "bear" : "neutral") as "bull" | "bear" | "neutral";
const riskTone = (l: string) => (l === "HIGH" || l === "EXTREME" ? "bear" : l === "MEDIUM" ? "warn" : "neutral") as "bear" | "warn" | "neutral";

function IndexNews({ name, d, now }: { name: string; d: NewsSentiment; now: Date }) {
  const usable = d.status === "LIVE" || d.status === "AGING";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-zinc-200">{name}</span>
        <Badge tone={d.status === "LIVE" ? "neutral" : "warn"}>NEWS {d.status}</Badge>
        {d.reason && <span className="text-xs text-amber-400">{d.reason}</span>}
      </div>

      <div className="grid grid-cols-3 gap-x-4 gap-y-2">
        <Stat label="Score" value={d.status === "UNAVAILABLE" ? "N/A" : signed(d.score)} tone={usable ? (d.score > 0.15 ? "bull" : d.score < -0.15 ? "bear" : undefined) : undefined} />
        <Stat label="Confidence" value={d.status === "UNAVAILABLE" ? "N/A" : `${Math.round(d.confidence * 100)}%`} />
        <Stat label="Articles" value={`${d.articleCount} of ${d.uniqueCount}`} />
        <Stat label="Bull / neutral / bear" value={`${d.bullishPct}% / ${d.neutralPct}% / ${d.bearishPct}%`} />
        <Stat label="Newest" value={d.newestAt ? ago(d.newestAt, now) : "N/A"} tone={d.status === "STALE" ? "warn" : undefined} />
        <Stat label="Fetched" value={d.fetchedAt ? `${fmtIst(d.fetchedAt, false)} IST` : "N/A"} />
      </div>

      <div className={`rounded border px-3 py-2 text-sm ${d.eventRisk.level === "NONE" ? "border-zinc-800" : "border-amber-500/40 bg-amber-500/5"}`}>
        <div className="flex items-center gap-2">
          {d.eventRisk.level !== "NONE" && <TriangleAlert size={14} className="text-amber-400" aria-hidden />}
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Event risk</span>
          <Badge tone={riskTone(d.eventRisk.level)}>{d.eventRisk.level}</Badge>
        </div>
        {d.eventRisk.reason && <p className="mt-1 text-zinc-300">Reason: {d.eventRisk.reason}. Exact event time not known from news.</p>}
      </div>

      <ul className="divide-y divide-zinc-800">
        {d.articles.slice(0, 8).map((a) => (
          <li key={a.id} className="py-2">
            <a href={a.url} target="_blank" rel="noopener noreferrer" className="group flex gap-1 text-sm text-zinc-200 hover:text-white">
              <span className="line-clamp-2">{a.title}</span>
              <ExternalLink size={12} className="mt-1 shrink-0 text-zinc-600 group-hover:text-zinc-400" aria-label="opens in new tab" />
            </a>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
              <span>
                {a.source}
                {a.alsoReportedBy?.length ? ` +${a.alsoReportedBy.length}` : ""}
              </span>
              <span>{ago(a.publishedAt, now)}</span>
              <Badge tone={tone(a.sentiment)}>
                {a.sentiment} {signed(a.sentimentScore)}
              </Badge>
              <span>conf {Math.round(a.confidence * 100)}%</span>
              <span>relevance {a.relevanceLabel.toLowerCase()}</span>
              {a.events.length > 0 && <span className="text-amber-400">{a.events.join(", ")}</span>}
            </div>
          </li>
        ))}
        {!d.articles.length && <li className="py-2 text-sm text-zinc-500">No relevant articles.</li>}
      </ul>
    </div>
  );
}

// Compact provider health: RSS feeds (publication-time freshness) + NewsAPI. Failed feeds are named.
function ProviderLine({ providers }: { providers: NewsProviderStatus[] }) {
  const rss = providers.filter((p) => p.provider === "RSS");
  const live = rss.filter((p) => p.status === "LIVE").length;
  const failed = rss.filter((p) => p.status === "FAILED");
  const api = providers.find((p) => p.provider === "NEWSAPI");
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
      <span>Sources:</span>
      <span className="flex items-center gap-1">
        RSS <Badge tone={live ? "neutral" : "warn"}>{rss.length ? `${live}/${rss.length} LIVE` : "OFF"}</Badge>
      </span>
      {failed.length > 0 && <span className="text-amber-400">failed: {failed.map((f) => f.name).join(", ")}</span>}
      {api && (
        <span className="flex items-center gap-1">
          NewsAPI <Badge tone={api.status === "LIVE" ? "neutral" : "warn"}>{api.status}</Badge>
        </span>
      )}
    </div>
  );
}

export function NewsPanel({ analyses }: { analyses: Analysis[] }) {
  const now = new Date();
  const real = analyses.filter((a) => a.snapshot.news.detail);
  return (
    <Card className="p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-zinc-400">News sentiment &amp; event risk</h2>
      {real[0]?.snapshot.news.detail?.providers && <ProviderLine providers={real[0].snapshot.news.detail.providers} />}
      {real.length ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {real.map((a) => (
            <IndexNews key={a.snapshot.index} name={a.snapshot.name} d={a.snapshot.news.detail!} now={now} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-amber-400">News: MOCK (shown only with mock market data; never scored with live prices).</p>
      )}
      <p className="mt-3 text-[11px] text-zinc-500">News is a confirmation factor (10 of 100 points), weighted by relevance, freshness and confidence. Automated keyword sentiment; read the source before acting.</p>
    </Card>
  );
}
