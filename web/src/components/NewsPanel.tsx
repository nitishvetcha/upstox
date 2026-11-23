"use client";

import { useState } from "react";
import { ExternalLink, TriangleAlert, ChevronDown, ChevronUp, AlertCircle } from "lucide-react";
import type { Analysis, NewsProviderStatus, NewsSentiment } from "@/lib/types";
import { fmtIst } from "@/lib/time";
import { Badge, Card, Stat, signed } from "./ui";

const ago = (iso: string, now: Date) => {
  const m = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 60_000));
  return m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
const tone = (s: string) => (s === "BULLISH" ? "bull" : s === "BEARISH" ? "bear" : "neutral") as "bull" | "bear" | "neutral";
const riskTone = (l: string) => (l === "HIGH" || l === "EXTREME" ? "bear" : l === "MEDIUM" ? "warn" : "neutral") as "bear" | "warn" | "neutral";
const statusTone = (s: string) => (s === "LIVE" ? "neutral" : s === "FAILED" || s === "DISABLED" ? "bear" : "warn") as "neutral" | "bear" | "warn";

function IndexNews({ name, d, now }: { name: string; d: NewsSentiment; now: Date }) {
  const usable = d.status === "LIVE" || d.status === "AGING";
  const [showAll, setShowAll] = useState(false);
  const INITIAL = 10;
  const articles = showAll ? d.articles : d.articles.slice(0, INITIAL);
  const hasMore = d.articles.length > INITIAL;

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

      {/* Event risk — prominent when non-NONE */}
      <div className={`rounded border px-3 py-2 text-sm ${
        d.eventRisk.level === "EXTREME" ? "border-red-500/60 bg-red-950/20"
        : d.eventRisk.level === "HIGH" ? "border-red-400/40 bg-red-950/10"
        : d.eventRisk.level === "MEDIUM" ? "border-amber-500/40 bg-amber-500/5"
        : "border-zinc-800"
      }`}>
        <div className="flex items-center gap-2">
          {d.eventRisk.level !== "NONE" && <TriangleAlert size={14} className={d.eventRisk.level === "EXTREME" || d.eventRisk.level === "HIGH" ? "text-red-400" : "text-amber-400"} aria-hidden />}
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Event risk</span>
          <Badge tone={riskTone(d.eventRisk.level)}>{d.eventRisk.level}</Badge>
          {d.eventRisk.events.length > 0 && (
            <span className="text-xs text-zinc-500">{d.eventRisk.events.map((e) => e.label).join(" · ")}</span>
          )}
        </div>
        {d.eventRisk.reason && <p className="mt-1 text-zinc-300">{d.eventRisk.reason} — exact timing not confirmed from news.</p>}
      </div>

      {/* Article list */}
      <ul className="divide-y divide-zinc-800">
        {/* Article ids can repeat (live-blog URLs), so list index keeps React key unique. */}
        {articles.map((a, i) => (
          <li key={`${a.id}-${i}`} className="py-2">
            <a href={a.url} target="_blank" rel="noopener noreferrer" className="group flex gap-1 text-sm text-zinc-200 hover:text-white">
              <span className="line-clamp-2">{a.title}</span>
              <ExternalLink size={12} className="mt-1 shrink-0 text-zinc-600 group-hover:text-zinc-400" aria-label="opens in new tab" />
            </a>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
              <span>
                {a.source}
                {a.alsoReportedBy?.length ? ` +${a.alsoReportedBy.length} more` : ""}
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

      {hasMore && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
        >
          {showAll ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {showAll ? "Show fewer" : `Show ${d.articles.length - INITIAL} more articles`}
        </button>
      )}
    </div>
  );
}

// Full provider health table: each RSS feed + NewsAPI with freshness, article count, newest article time.
function ProviderTable({ providers, now }: { providers: NewsProviderStatus[]; now: Date }) {
  const rss = providers.filter((p) => p.provider === "RSS");
  const api = providers.find((p) => p.provider === "NEWSAPI");
  const liveCount = rss.filter((p) => p.status === "LIVE").length;
  const failedCount = rss.filter((p) => p.status === "FAILED").length;

  return (
    <details className="mb-3">
      <summary className="cursor-pointer text-[11px] text-zinc-500 hover:text-zinc-300">
        Sources: RSS {liveCount}/{rss.length} feeds live
        {failedCount > 0 && <span className="ml-1 text-amber-400">· {failedCount} failed</span>}
        {api && <span className="ml-1">· NewsAPI <span className={api.status === "LIVE" ? "text-zinc-300" : "text-amber-400"}>{api.status}</span> (24h delay)</span>}
        <span className="ml-1 text-zinc-700">(expand)</span>
      </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[480px] text-[11px]">
          <thead>
            <tr className="text-left text-zinc-600">
              <th className="pb-1 pr-3 font-normal">Feed</th>
              <th className="pb-1 pr-3 font-normal">Status</th>
              <th className="pb-1 pr-3 font-normal">Articles</th>
              <th className="pb-1 pr-3 font-normal">Newest</th>
              <th className="pb-1 font-normal">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-900">
            {rss.map((p) => (
              <tr key={p.name}>
                <td className="py-0.5 pr-3 text-zinc-400">{p.name}</td>
                <td className="py-0.5 pr-3"><Badge tone={statusTone(p.status)}>{p.status}</Badge></td>
                <td className="py-0.5 pr-3 font-mono text-zinc-400">{p.articles}</td>
                <td className="py-0.5 pr-3 font-mono text-zinc-500">{p.newestAt ? ago(p.newestAt, now) : "—"}</td>
                <td className="py-0.5 text-zinc-600">{p.error ?? ""}</td>
              </tr>
            ))}
            {api && (
              <tr>
                <td className="py-0.5 pr-3 text-zinc-400">NewsAPI</td>
                <td className="py-0.5 pr-3"><Badge tone={statusTone(api.status)}>{api.status}</Badge></td>
                <td className="py-0.5 pr-3 font-mono text-zinc-400">{api.articles}</td>
                <td className="py-0.5 pr-3 font-mono text-zinc-500">{api.newestAt ? ago(api.newestAt, now) : "—"}</td>
                <td className="py-0.5 text-zinc-600">~24 h delay (free plan)</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function NewsPanel({ analyses }: { analyses: Analysis[] }) {
  const now = new Date();
  const real = analyses.filter((a) => a.snapshot.news.detail);
  const providers = real[0]?.snapshot.news.detail?.providers;

  // Global event risk: highest level across all indices
  const maxRisk = real.reduce<string>((max, a) => {
    const level = a.snapshot.news.detail?.eventRisk.level ?? "NONE";
    const order = ["NONE", "LOW", "MEDIUM", "HIGH", "EXTREME"];
    return order.indexOf(level) > order.indexOf(max) ? level : max;
  }, "NONE");

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-400">News sentiment &amp; event risk</h2>
        {maxRisk !== "NONE" && (
          <span className="flex items-center gap-1 text-xs font-semibold text-amber-300">
            <AlertCircle size={13} aria-hidden />
            {maxRisk} EVENT RISK DETECTED
          </span>
        )}
      </div>
      {providers && <ProviderTable providers={providers} now={now} />}
      {real.length ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {real.map((a) => (
            <IndexNews key={a.snapshot.index} name={a.snapshot.name} d={a.snapshot.news.detail!} now={now} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-amber-400">News: MOCK (shown only with mock market data; never scored with live prices).</p>
      )}
      <p className="mt-3 text-[11px] text-zinc-500">
        News is a confirmation factor (10 of 100 points), weighted by relevance, freshness and confidence.
        RSS feeds are real-time; NewsAPI (free plan) has ~24 h delay and supplements context only.
        Automated keyword sentiment — read the source before acting.
      </p>
    </Card>
  );
}
