import Link from "next/link";
import { RecommendationCard } from "@/components/RecommendationCard";
import { DataStatus } from "@/components/DataStatus";
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
import { getAuthoritativeRecommendation } from "@/lib/services/authoritativeOpportunity";
import { AuthoritativeRecommendationHero } from "@/components/AuthoritativeRecommendationHero";
import { TodaySwingPickCard } from "@/components/research/TodaySwingPickCard";
import { MarketPulseTable } from "@/components/MarketPulseTable";
import { AccordionSection } from "@/components/ui/AccordionSection";
import { TradingViewQuickBar } from "@/components/ui/TradingViewQuickBar";

export default async function Dashboard() {
  const [{ analyses, today, generatedAt, warming }, authoritativeBest] = await Promise.all([
    getDashboard(),
    getAuthoritativeRecommendation(),
  ]);

  return (
    <div className="mx-auto max-w-[90rem] space-y-4">
      {/* 1. Compact Status Strip (Always Open) */}
      <section className="app-surface rounded-2xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="app-kicker">Research command center</p>
            <h1 className="text-lg font-bold tracking-tight text-white sm:text-xl">
              Market decisions, with the evidence visible
            </h1>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 text-xs">
            <Link
              href="/opportunities"
              className="inline-flex items-center gap-1.5 rounded-xl bg-sky-500 px-3 py-2 font-semibold text-zinc-950 hover:bg-sky-400"
            >
              <Target size={14} aria-hidden /> Review opportunities
            </Link>
            <Link
              href="/opportunity-journal"
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 py-2 font-semibold text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800"
            >
              <BookOpen size={14} aria-hidden /> Journal
            </Link>
          </div>
        </div>
        <div className="mt-3 border-t border-zinc-800 pt-3">
          <DataStatus snaps={analyses.map((a) => a.snapshot)} refreshedAt={generatedAt} isWarming={Boolean(warming)} />
        </div>
      </section>

      {/* 2. Hero Command Row (2-Column Grid, Always Open) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <AuthoritativeRecommendationHero best={authoritativeBest} />
        <TodaySwingPickCard />
      </div>

      {/* TradingView Quick-Link Bar */}
      <TradingViewQuickBar />

      {/* 3. Market Pulse Accordion Table (Always Open, Compact) */}
      <MarketPulseTable analyses={analyses} />

      {/* 4. Collapsible Accordions (All Collapsed by Default) */}
      <div className="space-y-3">
        <AccordionSection
          title="System Diagnostics, Source Matrix & Data Audit"
          summary={<span>8 underlyings · Risk &amp; Data Quality</span>}
          defaultOpen={false}
        >
          <div className="space-y-4">
            <OpsPanel now={Date.parse(generatedAt)} />
            <div className="grid gap-4 lg:grid-cols-2">
              <RiskPanel v={toDashboardView(today, getRiskConfig(), generatedAt)} />
              <DataQualityPanel v={toDashboardView(today, getRiskConfig(), generatedAt)} />
            </div>
            <ResearchLabSummary />
            <StrategyMap />
          </div>
        </AccordionSection>

        <AccordionSection
          title="On-Demand Analysis & Recommendation Journal"
          summary={<span>Interactive lookup &amp; saved entries</span>}
          defaultOpen={false}
        >
          <div className="space-y-4">
            <RecommendationWidget />
            <RecommendationJournal />
          </div>
        </AccordionSection>

        <AccordionSection
          title="News Sentiment & Event Risk"
          summary={<span>{analyses.length} underlyings</span>}
          defaultOpen={false}
        >
          <NewsPanel analyses={analyses} />
        </AccordionSection>

        <AccordionSection
          title="Legacy Benchmark (Strategy 11.4 Frozen Reference)"
          badge={
            <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] font-mono text-zinc-400">
              FROZEN BENCHMARK
            </span>
          }
          summary={<span>SHA-256 locked 2024 baseline</span>}
          defaultOpen={false}
        >
          <RecommendationCard a={today} />
        </AccordionSection>
      </div>
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
      title: "Swing stocks",
      status: "ACTIVE — SWING-V1 MODE B (₹10k)",
      statusClass: "border-emerald-700/60 bg-emerald-950/30 text-emerald-300",
      detail: "Daily EOD delivery swing engine (₹10k / 1 position / 15-day cap, +1.5R BE, 2.5x target).",
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
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {strategies.map((strategy) => (
        <article key={strategy.title} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-zinc-200">{strategy.title}</h3>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${strategy.statusClass}`}>
              {strategy.status}
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">{strategy.detail}</p>
        </article>
      ))}
    </div>
  );
}

function ResearchLabSummary() {
  const inv = loadInventories()[0];
  const enabled = inv?.experiments.filter((e) => e.enabled).length ?? 0;
  return (
    <Link href="/options-research" className="block rounded border border-zinc-800 bg-zinc-900/60 p-3 text-xs hover:border-zinc-600">
      <div className="font-semibold uppercase tracking-[0.15em] text-zinc-400">Historical Options Research Lab</div>
      {inv ? (
        <p className="mt-1 text-zinc-300">
          Expired-contract history: {inv.expiredHistory.available ? "available" : `blocked (${inv.expiredHistory.errorCode})`} ·
          completed expiries: {inv.completedExpiriesRetrievable} · experiments enabled: {enabled}/{inv.experiments.length}
        </p>
      ) : (
        <p className="mt-1 text-zinc-500">No data inventory run yet.</p>
      )}
    </Link>
  );
}
