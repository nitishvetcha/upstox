import { notFound } from "next/navigation";
import { Card, Stat } from "@/components/ui";
import { SECTIONS } from "@/lib/sections";
import { getPaperTradingEngine } from "@/lib/services/paperStore";
import type { IndexId } from "@/lib/types";
import { SectionError } from "@/components/AnalysisPanels";
import { loadSection } from "@/lib/sectionLoad";
import { BacktestRunsView, MarketOverview, NewsView, OptionChainView, RecommendationView, SettingsView, StrategiesView, SystemHealthView } from "@/components/SectionViews";
import { WalkForwardView } from "@/components/WalkForwardView";

export default async function SectionPage({ params, searchParams }: PageProps<"/[section]">) {
  const { section } = await params;
  const s = SECTIONS.find((x) => x.slug === section && x.slug !== "");
  if (!s) notFound();

  if (section === "paper-trading") {
    const engine = getPaperTradingEngine();
    const summary = engine.getPortfolioSummary();
    const trades = engine.getTrades();
    const openTrades = trades.filter((t) => t.status === "OPEN");
    const closedTrades = trades.filter((t) => t.status !== "OPEN" && t.status !== "PENDING");

    return (
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-zinc-100">{s.title}</h1>
            <p className="text-sm text-zinc-400">
              Simulated Trade Lifecycle & Portfolio Management · <span className="font-semibold text-amber-400">PAPER TRADING (0 REAL ORDERS)</span>
            </p>
          </div>
          <div className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold tracking-wide text-amber-300">
            READ ONLY TOWARD UPSTOX
          </div>
        </div>

        {/* Portfolio KPI Cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Card className="p-3">
            <Stat label="Starting Capital" value={`₹${summary.startingCapital.toLocaleString("en-IN")}`} />
          </Card>
          <Card className="p-3">
            <Stat label="Current Capital" value={`₹${summary.currentCapital.toLocaleString("en-IN")}`} tone={summary.totalPnL >= 0 ? "bull" : "bear"} />
          </Card>
          <Card className="p-3">
            <Stat label="Realized P&L" value={`${summary.realizedPnL >= 0 ? "+" : ""}₹${summary.realizedPnL}`} tone={summary.realizedPnL >= 0 ? "bull" : "bear"} />
          </Card>
          <Card className="p-3">
            <Stat label="Unrealized P&L" value={`${summary.unrealizedPnL >= 0 ? "+" : ""}₹${summary.unrealizedPnL}`} tone={summary.unrealizedPnL >= 0 ? "bull" : "bear"} />
          </Card>
          <Card className="p-3">
            <Stat label="Total P&L" value={`${summary.totalPnL >= 0 ? "+" : ""}₹${summary.totalPnL}`} tone={summary.totalPnL >= 0 ? "bull" : "bear"} />
          </Card>
          <Card className="p-3">
            <Stat label="Open Risk" value={`₹${summary.openRisk}`} tone={summary.openRisk > 0 ? "warn" : undefined} />
          </Card>
        </div>

        {/* Open Positions Section */}
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-zinc-200 uppercase tracking-wider">Open Positions ({openTrades.length})</h2>
          {openTrades.length === 0 ? (
            <p className="text-sm text-zinc-500 py-4 text-center">No active open paper positions. Recommendations with LIVE status will trigger paper trades.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400">
                    <th className="p-2">ID</th>
                    <th className="p-2">Index</th>
                    <th className="p-2">Strategy</th>
                    <th className="p-2">Entry</th>
                    <th className="p-2">Current</th>
                    <th className="p-2">Stop</th>
                    <th className="p-2">Target</th>
                    <th className="p-2">Lots (Qty)</th>
                    <th className="p-2">Unrealized P&L</th>
                    <th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {openTrades.map((t) => (
                    <tr key={t.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                      <td className="p-2 text-zinc-300">{t.id}</td>
                      <td className="p-2 uppercase font-semibold text-zinc-100">{t.index}</td>
                      <td className="p-2 text-zinc-200">{t.strategy}</td>
                      <td className="p-2">{t.entryPrice}</td>
                      <td className="p-2">{t.currentPrice}</td>
                      <td className="p-2 text-red-400">{t.stopLoss}</td>
                      <td className="p-2 text-emerald-400">{t.target1}</td>
                      <td className="p-2">{t.lots} ({t.quantity})</td>
                      <td className={`p-2 font-semibold ${(t.unrealizedPnL ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {(t.unrealizedPnL ?? 0) >= 0 ? "+" : ""}₹{t.unrealizedPnL}
                      </td>
                      <td className="p-2">
                        <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/30">
                          {t.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Closed Trade History Section */}
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-zinc-200 uppercase tracking-wider">Closed Trade History ({closedTrades.length})</h2>
          {closedTrades.length === 0 ? (
            <p className="text-sm text-zinc-500 py-4 text-center">No closed paper trades yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400">
                    <th className="p-2">ID</th>
                    <th className="p-2">Index</th>
                    <th className="p-2">Strategy</th>
                    <th className="p-2">Entry</th>
                    <th className="p-2">Exit</th>
                    <th className="p-2">Realized P&L</th>
                    <th className="p-2">Exit Reason</th>
                    <th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {closedTrades.map((t) => (
                    <tr key={t.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                      <td className="p-2 text-zinc-400">{t.id}</td>
                      <td className="p-2 uppercase font-semibold text-zinc-200">{t.index}</td>
                      <td className="p-2 text-zinc-300">{t.strategy}</td>
                      <td className="p-2">{t.entryPrice}</td>
                      <td className="p-2">{t.exitPrice}</td>
                      <td className={`p-2 font-semibold ${(t.realizedPnL ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {(t.realizedPnL ?? 0) >= 0 ? "+" : ""}₹{t.realizedPnL}
                      </td>
                      <td className="p-2 text-zinc-300">{t.exitReason}</td>
                      <td className="p-2">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold border ${
                          t.status === "TARGET_HIT"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                            : t.status === "STOPPED_OUT"
                            ? "bg-red-500/10 text-red-400 border-red-500/30"
                            : "bg-zinc-800 text-zinc-300 border-zinc-700"
                        }`}>
                          {t.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    );
  }

  const index: IndexId = (await searchParams).index === "banknifty" ? "banknifty" : "nifty";
  const views: Record<string, () => Promise<React.ReactNode>> = {
    market: () => MarketOverview(),
    "option-chain": () => OptionChainView({ index }),
    strategies: () => StrategiesView({ index }),
    recommendations: () => RecommendationView({ index }),
    backtest: async () => BacktestRunsView(),
    "walk-forward": async () => WalkForwardView(),
    news: () => NewsView(),
    "system-health": () => SystemHealthView(),
    settings: async () => SettingsView(),
  };
  const view = views[section];
  if (!view) notFound();
  const res = await loadSection(view);
  const body = res.ok ? res.data : <SectionError title={s.title} error={res.error} />;
  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <h1 className="text-xl font-bold text-zinc-100">{s.title}</h1>
      {body}
    </div>
  );
}
