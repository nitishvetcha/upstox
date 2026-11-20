import Link from "next/link";
import { RecommendationCard } from "@/components/RecommendationCard";
import { MarketCard } from "@/components/MarketCard";
import { DataStatus } from "@/components/DataStatus";
import { PriceChart } from "@/components/PriceChart";
import { NewsPanel } from "@/components/NewsPanel";
import { getDashboard } from "@/lib/services/market";
import { getRiskConfig } from "@/lib/services/risk/riskConfig";
import { toDashboardView } from "@/lib/dashboard";
import { DataQualityPanel, RiskPanel } from "@/components/AnalysisPanels";
import { RecommendationWidget } from "@/components/RecommendationWidget";
import { RecommendationJournal } from "@/components/RecommendationJournal";
import { loadInventories } from "@/lib/research/inventoryStore";
import { OpsPanel } from "@/components/OpsPanel";
import { BookOpen, Target } from "lucide-react";

export default async function Dashboard() {
  const { analyses, today, generatedAt } = await getDashboard();

  return (
    <div className="mx-auto max-w-[90rem] space-y-6">
      <section className="app-surface overflow-hidden rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="app-kicker">Research command center</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">Market decisions, with the evidence visible</h1>
            <p className="mt-2 text-sm leading-6 text-zinc-400 sm:text-base">Start with the strongest eligible opportunity, review its risk and freshness, then save it for manual monitoring.</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 text-sm">
          <Link href="/opportunities" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 font-semibold text-zinc-950 shadow-lg shadow-sky-950/30 hover:bg-sky-400">
            <Target size={16} aria-hidden /> Review opportunities
          </Link>
          <Link href="/opportunity-journal" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900/80 px-4 py-2 font-semibold text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800">
            <BookOpen size={16} aria-hidden /> Open journal
          </Link>
          </div>
        </div>
        <div className="mt-5 border-t border-zinc-800 pt-4"><DataStatus snaps={analyses.map((a) => a.snapshot)} refreshedAt={generatedAt} /></div>
      </section>
      <OpsPanel now={Date.parse(generatedAt)} />
      <StrategyMap />
      <RecommendationCard a={today} />
      <div className="grid gap-4 lg:grid-cols-2">
        <RiskPanel v={toDashboardView(today, getRiskConfig(), generatedAt)} />
        <DataQualityPanel v={toDashboardView(today, getRiskConfig(), generatedAt)} />
      </div>
      <RecommendationWidget />
      <RecommendationJournal />
      <div className="grid gap-4 lg:grid-cols-2">
        {analyses.map((a) => (
          <MarketCard key={a.snapshot.index} a={a} />
        ))}
      </div>
      <ResearchLabSummary />
      <NewsPanel analyses={analyses} />
      <PriceChart />
    </div>
  );
}

function StrategyMap() {
  const strategies = [
    {
      title: "Index options",
      status: "ACTIVE SCREENING",
      statusClass: "border-emerald-700/60 bg-emerald-950/30 text-emerald-300",
      detail: "Opportunity Engine: defined-risk tactical screening with live-price, Greeks convexity, structural invalidation stops, and per-leg verification.",
    },
    {
      title: "Intraday stocks",
      status: "PAPER EVALUATION",
      statusClass: "border-sky-700/60 bg-sky-950/30 text-sky-300",
      detail: "1.5% max-risk structural stops, real volume/VWAP validation, sector breadth alignment. Forward paper tracking only.",
    },
    {
      title: "Long-term bluechips",
      status: "FUNDAMENTAL RESEARCH",
      statusClass: "border-teal-700/60 bg-teal-950/30 text-teal-300",
      detail: "Multi-factor balance sheet quality screener: ROCE > 15%, ROE > 15%, low debt/equity, and moat analysis from annual filings.",
    },
    {
      title: "Strategy 11.4 (Legacy)",
      status: "FROZEN BENCHMARK",
      statusClass: "border-zinc-700 bg-zinc-900 text-zinc-400",
      detail: "Preserved byte-for-byte under SHA-256 lock as an immutable historical reference; not the unified recommendation source.",
    },
    {
      title: "Swing / positional stocks",
      status: "RETIRED · WATCH ONLY",
      statusClass: "border-red-800/60 bg-red-950/30 text-red-300",
      detail: "The prior positional strategy lost money in its five-year backtest. Results remain visible for observation, never as actionable picks.",
    },
  ];

  return (
    <section aria-labelledby="strategy-map-title" className="app-surface rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="app-kicker">Engine readiness</p>
          <h2 id="strategy-map-title" className="mt-1 text-lg font-semibold text-zinc-100">Strategy status</h2>
          <p className="mt-1 text-sm text-zinc-400">Know what is actionable, experimental, or retired before reviewing a candidate.</p>
        </div>
        <Link href="/opportunities" className="rounded-lg border border-zinc-700 px-3 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-800">
          Open unified opportunities
        </Link>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {strategies.map((strategy) => (
          <article key={strategy.title} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-zinc-200">{strategy.title}</h3>
              <span className={`rounded-full border px-2 py-1 text-xs font-bold ${strategy.statusClass}`}>{strategy.status}</span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">{strategy.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ResearchLabSummary() {
  const inv = loadInventories()[0];
  const enabled = inv?.experiments.filter((e) => e.enabled).length ?? 0;
  return (
    <Link href="/options-research" className="block rounded border border-zinc-800 bg-zinc-900/60 p-4 text-sm hover:border-zinc-600">
      <div className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-400">Historical Options Research Lab</div>
      {inv ? (
        <p className="mt-1 text-zinc-300">
          Expired-contract history: {inv.expiredHistory.available ? "available" : `blocked (${inv.expiredHistory.errorCode})`} ·
          completed expiries: {inv.completedExpiriesRetrievable} · experiments enabled: {enabled}/{inv.experiments.length}
          <span className="block text-xs text-zinc-500">Independent of the live options audit · inventory {inv.id}</span>
        </p>
      ) : <p className="mt-1 text-zinc-500">No data inventory run yet.</p>}
    </Link>
  );
}
