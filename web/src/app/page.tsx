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
      <DataStatus snaps={analyses.map((a) => a.snapshot)} refreshedAt={generatedAt} />
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
