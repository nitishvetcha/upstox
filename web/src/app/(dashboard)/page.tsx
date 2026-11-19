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

export default async function Dashboard() {
  const { analyses, today, generatedAt } = await getDashboard();

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <DataStatus snaps={analyses.map((a) => a.snapshot)} refreshedAt={generatedAt} />
        <div className="flex shrink-0 flex-wrap gap-2 text-sm">
          <Link href="/opportunities" className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
            Opportunity Engine →
          </Link>
          <Link href="/opportunity-journal" className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            Journal →
          </Link>
        </div>
      </div>
      <OpsPanel now={Date.parse(generatedAt)} />
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
