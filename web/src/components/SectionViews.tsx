import Link from "next/link";
import type { IndexId } from "@/lib/types";
import { getAnalysis, getDashboard, providerMode } from "@/lib/services/market";
import { getRiskConfig } from "@/lib/services/risk/riskConfig";
import { DEFAULT_TRANSACTION_COSTS, COSTS_NOT_MODELED } from "@/lib/services/transactionCosts";
import { getAllBacktestRuns } from "@/lib/services/backtestStore";
import { compareRuns } from "@/lib/services/backtestScenarios";
import { toDashboardView } from "@/lib/dashboard";
import { fmtIst } from "@/lib/time";
import { MarketCard } from "./MarketCard";
import { RecommendationCard } from "./RecommendationCard";
import { RecommendationDiagnosticPanel } from "./RecommendationDiagnosticPanel";
import { diagnose } from "@/lib/recommendationDiagnostic";
import { NewsPanel } from "./NewsPanel";
import { Badge, Card, num } from "./ui";
import { DataQualityPanel, IndexSwitch, LevelsPanel, MarketPanel, OptionsPanel, RecommendationSummary, RiskPanel, TechnicalsPanel } from "./AnalysisPanels";

async function viewFor(index: IndexId) {
  const a = await getAnalysis(index);
  return { a, v: toDashboardView(a, getRiskConfig(), new Date().toISOString()) };
}

export async function RecommendationView({ index }: { index: IndexId }) {
  const { a, v } = await viewFor(index);
  return (
    <div className="space-y-4">
      <IndexSwitch index={index} base="/recommendations" />
      <RecommendationCard a={a} />
      <RecommendationDiagnosticPanel d={diagnose(a)} />
      <div className="grid gap-4 lg:grid-cols-2">
        <MarketPanel v={v} />
        <RiskPanel v={v} />
        <TechnicalsPanel v={v} />
        <OptionsPanel v={v} />
        <LevelsPanel v={v} />
        <DataQualityPanel v={v} />
      </div>
    </div>
  );
}

export async function MarketOverview() {
  const { analyses, generatedAt } = await getDashboard();
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {analyses.map((a) => <MarketPanel key={a.snapshot.index} v={toDashboardView(a, getRiskConfig(), generatedAt)} />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">{analyses.map((a) => <MarketCard key={a.snapshot.index} a={a} />)}</div>
    </div>
  );
}

export async function OptionChainView({ index }: { index: IndexId }) {
  const { a, v } = await viewFor(index);
  const s = a.snapshot;
  const n = (x: number | null, d = 2) => (x === null ? "N/A" : num(x, d));
  return (
    <div className="space-y-4">
      <IndexSwitch index={index} base="/option-chain" />
      <div className="grid gap-4 lg:grid-cols-2"><OptionsPanel v={v} /><LevelsPanel v={v} /></div>
      <Card className="overflow-x-auto p-3">
        <div className="mb-2 flex flex-wrap gap-2 text-xs text-zinc-400">
          <span>{s.name} · expiry {s.expiry} · spot {num(s.spot)}</span>
          <Badge tone={v.dataQuality.optionChain === "LIVE" ? "neutral" : "warn"}>{v.dataQuality.optionChain}</Badge>
          <span>fetched {s.sources.optionChain.fetchedAt ? `${fmtIst(s.sources.optionChain.fetchedAt)} IST` : "N/A"}</span>
        </div>
        <table className="w-full min-w-[720px] text-right font-mono text-[11px]">
          <thead className="text-zinc-500">
            <tr><th>CE OI</th><th>CE ΔOI</th><th>CE IV</th><th>CE LTP</th><th className="text-center">Strike</th><th>PE LTP</th><th>PE IV</th><th>PE ΔOI</th><th>PE OI</th></tr>
          </thead>
          <tbody>
            {s.chain.map((r) => (
              <tr key={r.strike} className={`border-t border-zinc-800/60 ${r.strike === v.options.atmStrike ? "bg-zinc-800/50 text-zinc-100" : "text-zinc-300"}`}>
                <td>{n(r.call.oi, 0)}</td><td>{n(r.call.chgOi, 0)}</td><td>{n(r.call.iv, 1)}</td><td>{n(r.call.ltp)}</td>
                <td className="text-center font-semibold">{num(r.strike, 0)}</td>
                <td>{n(r.put.ltp)}</td><td>{n(r.put.iv, 1)}</td><td>{n(r.put.chgOi, 0)}</td><td>{n(r.put.oi, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export async function StrategiesView({ index }: { index: IndexId }) {
  const { a, v } = await viewFor(index);
  return (
    <div className="space-y-4">
      <IndexSwitch index={index} base="/strategies" />
      <RecommendationSummary v={v} />
      <Card className="p-4">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">Strategy candidates built by the engine (regime {a.regime})</h2>
        {a.candidates.length === 0 ? (
          <p className="text-sm text-zinc-500">No strategy was built for this regime/data state. {a.blockers[0] ?? ""}</p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="text-zinc-500"><tr><th>Strategy</th><th>Score</th><th>Entry</th><th>Stop</th><th>T1</th><th>R:R</th><th>Risk</th><th>Status</th></tr></thead>
            <tbody className="font-mono">
              {a.candidates.map((c) => (
                <tr key={c.strategy} className="border-t border-zinc-800/60">
                  <td className="font-sans text-zinc-200">{c.strategy}</td><td>{c.score}</td><td>{num(c.entry)}</td><td>{num(c.stop)}</td><td>{num(c.target1)}</td><td>1:{num(c.rr)}</td>
                  <td>{c.risk ? c.risk.status : "N/A"}</td>
                  <td className={c.rejected ? "text-amber-400" : "text-emerald-400"}>{c.rejected ?? (a.plan?.strategy === c.strategy ? "RECOMMENDED" : "below threshold / not selected")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

export async function NewsView() {
  const { analyses } = await getDashboard();
  return <NewsPanel analyses={analyses} />;
}

export async function SystemHealthView() {
  const { analyses, generatedAt } = await getDashboard();
  return (
    <Card className="overflow-x-auto p-4">
      <p className="mb-3 text-xs text-zinc-400">Provider mode: <span className="font-mono text-zinc-200">{providerMode()}</span> · generated {fmtIst(generatedAt)} IST · read-only toward Upstox (no order endpoints)</p>
      <table className="w-full min-w-[560px] text-left text-xs">
        <thead className="text-zinc-500"><tr><th>Index</th><th>Subsystem</th><th>Source</th><th>Provider</th><th>Fetched (IST)</th><th>Last trade (IST)</th></tr></thead>
        <tbody className="font-mono">
          {analyses.flatMap((a) =>
            Object.entries(a.snapshot.sources).map(([k, src]) => (
              <tr key={a.snapshot.index + k} className="border-t border-zinc-800/60">
                <td className="font-sans">{a.snapshot.name}</td><td>{k}</td>
                <td className={src.source === "LIVE" ? "text-zinc-200" : "text-amber-400"}>{src.source}</td>
                <td>{src.provider ?? "—"}</td><td>{src.fetchedAt ? fmtIst(src.fetchedAt) : "N/A"}</td><td>{src.lastTradeTime ? fmtIst(src.lastTradeTime) : "N/A"}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>
      {analyses.some((a) => a.snapshot.fallbackReason) && <p className="mt-2 text-xs text-amber-400">Fallback: {analyses.map((a) => a.snapshot.fallbackReason).filter(Boolean).join(", ")}</p>}
    </Card>
  );
}

export function SettingsView() {
  const r = getRiskConfig();
  const c = DEFAULT_TRANSACTION_COSTS;
  const rows: [string, string][] = [
    ["Account capital", `₹${num(r.accountCapital, 0)}`], ["Risk per trade", `${r.riskPerTradePercent}%`], ["Max daily loss", `${r.maxDailyLossPercent}%`],
    ["Max open risk", `${r.maxOpenRiskPercent}%`], ["Max position value", `${r.maxPositionValuePercent}%`], ["Max concurrent positions", String(r.maxConcurrentPositions)],
    ["Min risk/reward", `1 : ${r.minRiskReward}`], ["Max lots per trade", String(r.maxLotsPerTrade)], ["Option slippage", `${r.optionSlippagePercent}%`],
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-4">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">Risk configuration (read-only; env/defaults)</h2>
        <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-sm">{rows.map(([k, x]) => <div key={k} className="contents"><dt className="text-zinc-400">{k}</dt><dd className="font-mono">{x}</dd></div>)}</dl>
      </Card>
      <Card className="p-4">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">Backtest transaction costs ({c.version})</h2>
        <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-sm">
          {([["Brokerage / order", `₹${c.brokeragePerOrder}`], ["STT (sell premium)", `${c.sttRate * 100}%`], ["Exchange txn", `${c.exchangeTxnRate * 100}%`], ["GST", `${c.gstRate * 100}%`], ["SEBI", `₹${Math.round(c.sebiRate * 1e7)} per crore`], ["Stamp duty (buy)", `${c.stampDutyRate * 100}%`]] as const).map(([k, x]) => (
            <div key={k} className="contents"><dt className="text-zinc-400">{k}</dt><dd className="font-mono">{x}</dd></div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-zinc-500">{c.source} Not modeled: {COSTS_NOT_MODELED.join("; ")}.</p>
      </Card>
    </div>
  );
}

export function BacktestRunsView() {
  const runs = getAllBacktestRuns();
  if (!runs.length)
    return (
      <Card className="p-4 text-sm text-zinc-400">
        No backtest runs stored yet. Run one from <Link href="/performance" className="text-zinc-200 underline">Performance</Link> (real Upstox history; no mock candles).
      </Card>
    );
  const label = (r: (typeof runs)[number]) => `${r.config.index === "nifty" ? "NIFTY" : "BANK NIFTY"} · ${r.execution.model === "CLOSE_ONLY" ? "close-only" : "intrabar"} · ${r.metadata?.dataModel ?? "PHASE9_LEGACY"}`;
  const { rows, note } = compareRuns(runs.map((r) => ({ label: label(r), result: r })));
  const m = (x: { value: number | null } | number | null | string) => (x === null ? "N/A" : typeof x === "object" ? (x.value === null ? "N/A" : num(x.value)) : typeof x === "number" ? num(x) : x);
  return (
    <div className="space-y-3">
      <div role="alert" className="rounded border-2 border-red-500/60 bg-red-500/10 p-3 text-sm font-semibold text-red-200">
        HISTORICAL SIMULATION — NOT LIVE MARKET DATA. Historical option prices are model-derived; results are not equivalent to observed historical option quotes.
      </div>
      <Card className="overflow-x-auto p-3">
        <p className="mb-2 text-xs text-zinc-500">{note} Open a run for equity curve, drawdown, trade journal and the full data-quality scorecard.</p>
        <table className="w-full min-w-[1100px] text-right text-xs">
          <thead className="text-zinc-500">
            <tr><th className="text-left">Run</th><th className="text-left">Period</th><th>Trades</th><th>Win rate</th><th>Net P&L</th><th>Return</th><th>PF</th><th>Expectancy</th><th>Avg R</th><th>Max DD</th><th>Sharpe</th><th>Sortino</th><th>Costs</th><th className="text-left">Options / OI / News</th><th className="text-left">Validation</th></tr>
          </thead>
          <tbody className="font-mono">
            {rows.map((r, k) => (
              <tr key={r.runId} className="border-t border-zinc-800/60">
                <td className="text-left font-sans"><Link href={`/performance?run=${r.runId}`} className="text-zinc-100 underline">{r.label}</Link><div className="font-mono text-[10px] text-zinc-500">{r.runId}</div></td>
                <td className="text-left">{runs[k].config.startDate} → {runs[k].config.endDate}</td>
                <td>{r.trades}</td><td>{m(r.winRate)}%</td>
                <td className={r.netPnL >= 0 ? "text-emerald-400" : "text-red-400"}>₹{num(r.netPnL, 0)}</td>
                <td>{num(r.returnPercent)}%</td><td>{m(r.profitFactor)}</td><td>{m(r.expectancy)}</td><td>{m(r.averageR)}</td><td>{num(r.maxDrawdownPercent)}%</td>
                <td>{m(r.sharpe)}</td><td>{m(r.sortino)}</td><td>{typeof r.transactionCosts === "number" ? `₹${num(r.transactionCosts, 0)}` : r.transactionCosts}</td>
                <td className="text-left text-amber-400">{r.dataQuality ? `${r.dataQuality.options} / ${r.dataQuality.oi} / ${r.dataQuality.news}` : "SYNTHETIC / SYNTHETIC / MOCK"}</td>
                <td className="text-left">{r.validation ?? "N/A"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
