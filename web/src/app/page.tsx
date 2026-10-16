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

export default async function Dashboard() {
  const { analyses, today, generatedAt } = await getDashboard();

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex items-center justify-between">
        <DataStatus snaps={analyses.map((a) => a.snapshot)} refreshedAt={generatedAt} />
        <div className="flex gap-2 text-sm">
          <Link href="/opportunities" className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
            Opportunity Engine →
          </Link>
          <Link href="/opportunity-journal" className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            Journal →
          </Link>
        </div>
      </div>
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
      <NewsPanel analyses={analyses} />
      <PriceChart />
    </div>
  );
}
