import Link from "next/link";
import { Info, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui";
import { EquityCharts } from "@/components/performance/EquityCharts";
import { RunForm } from "@/components/performance/RunForm";
import { TradeJournal } from "@/components/performance/TradeJournal";
import { getAllBacktestRuns, getBacktestRun } from "@/lib/services/backtestStore";
import { buildPerformanceReport, type TradeFilters } from "@/lib/services/performance/report";
import { journal } from "@/lib/services/performance/journal";
import type { Metric } from "@/lib/services/performance/metrics";

const inr = (v: number | null) => (v === null ? "—" : `${v < 0 ? "−" : ""}₹${Math.abs(v).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);
const m = (x: Metric, suffix = "") => (x.value === null ? "NOT AVAILABLE" : `${x.value.toLocaleString("en-IN")}${suffix}`);
const pnlTone = (v: number | null) => (v === null ? "text-zinc-100" : v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-zinc-100");

function Kpi({ label, value, help, reason, tone = "text-zinc-100" }: { label: string; value: string; help: string; reason?: string | null; tone?: string }) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-zinc-500" title={help}>
        {label} <Info size={11} aria-label={help} />
      </div>
      <div className={`font-mono text-lg tabular-nums ${tone}`}>{value}</div>
      {reason && <div className="text-[11px] text-amber-400">{reason}</div>}
    </Card>
  );
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  if (!rows.length) return <p className="py-3 text-sm text-zinc-500">No data in this scope.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full font-mono text-xs">
        <thead className="border-b border-zinc-800 text-zinc-400">
          <tr>{head.map((h) => <th key={h} className="p-2 text-left font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-zinc-800/60">{r.map((c, j) => <td key={j} className="p-2 text-zinc-300">{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <Card className="p-4">
    <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-zinc-400">{title}</h2>
    {children}
  </Card>
);

export default async function PerformancePage({ searchParams }: PageProps<"/performance">) {
  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === "string" && sp[k] ? (sp[k] as string) : undefined);
  const runs = getAllBacktestRuns();
  const run = (get("run") && getBacktestRun(get("run")!)) || runs[0];

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-zinc-100">Performance &amp; Risk Analytics</h1>
        <p className="text-sm text-zinc-400">
          SIMULATED HISTORICAL PERFORMANCE · <span className="text-amber-400">simulation only, 0 real orders</span>
        </p>
      </div>
    </div>
  );

  if (!run) {
    return (
      <div className="mx-auto max-w-7xl space-y-4">
        {header}
        <Section title="Run a backtest">
          <RunForm />
          <p className="mt-3 text-sm text-zinc-500">No backtest runs in this server session yet. Runs need real Upstox historical candles (no mock candles are generated).</p>
        </Section>
      </div>
    );
  }

  const filters: TradeFilters = { strategy: get("strategy"), regime: get("regime"), from: get("from"), to: get("to") };
  const r = buildPerformanceReport(run, filters);
  const c = r.core;
  const dq = r.dataQuality;
  const strategiesInRun = [...new Set(run.trades.map((t) => t.strategy))];
  const regimesInRun = [...new Set(run.trades.map((t) => t.regime))];
  const pct = (v: number | null) => (v === null ? "—" : `${v}%`);
  const sel = "rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100";

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      {header}

      <Section title="Run">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          {runs.map((x) => (
            <Link key={x.runId} href={`/performance?run=${x.runId}`} className={`rounded border px-2 py-1 font-mono ${x.runId === run.runId ? "border-zinc-500 bg-zinc-800 text-zinc-100" : "border-zinc-800 hover:bg-zinc-900"}`}>
              {x.runId} · {x.config.index.toUpperCase()} {x.config.timeframe} {x.config.startDate}→{x.config.endDate}
            </Link>
          ))}
        </div>
        <RunForm />
      </Section>

      <div role="alert" className="space-y-1 rounded border-2 border-red-500/60 bg-red-500/10 p-3 text-sm font-semibold text-red-200">
        {r.warnings.map((w) => (
          <div key={w} className="flex items-start gap-2"><TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden /> {w}</div>
        ))}
      </div>

      {r.scorecard && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="p-3 lg:col-span-2">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">Data quality scorecard · {String(r.metadata?.dataModel ?? "")}</h2>
            <dl className="grid grid-cols-[8rem_10rem_1fr] gap-x-3 gap-y-0.5 text-[11px]">
              {Object.entries(r.scorecard).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="font-mono text-zinc-400">{k}</dt>
                  <dd className={`font-mono ${v.quality === "HISTORICAL_MEASURED" ? "text-zinc-200" : "text-amber-400"}`}>{v.quality}</dd>
                  <dd className="text-zinc-500">{v.source}{v.coveragePercent !== undefined ? ` · ${v.coveragePercent}%` : ""}{v.notes ? ` — ${v.notes}` : ""}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card className="p-3 text-xs">
            <h2 className="mb-2 font-semibold uppercase tracking-wider text-zinc-400">Validation status</h2>
            <div className="font-mono text-sm text-amber-300">{r.validation?.status}</div>
            <ul className="mb-2 list-disc pl-4 text-zinc-400">{r.validation?.reasons.map((x) => <li key={x}>{x}</li>)}</ul>
            {r.sample && (
              <dl className="grid grid-cols-[1fr_auto] gap-x-3 font-mono text-[11px]">
                {([["Sessions", r.sample.evaluatedSessions], ["Bars", r.sample.evaluatedBars], ["Candidate bars", r.sample.candidateBars], ["Trades", r.sample.executedTrades], ["Rejected signals", r.sample.rejectedSignals], ["Trades / month", r.sample.tradesPerMonth ?? "—"], ["Expiries", r.sample.contractExpiries], ["Regimes", r.sample.regimeCoverage]] as const).map(([k, v]) => (
                  <div key={k} className="contents"><dt className="text-zinc-500">{k}</dt><dd>{v}</dd></div>
                ))}
              </dl>
            )}
            {r.costs.breakdown?.modeled && (
              <p className="mt-2 text-zinc-400">Gross ₹{r.costs.breakdown.grossPnL.toLocaleString("en-IN")} − slippage ₹{r.costs.breakdown.slippage.toLocaleString("en-IN")} − costs ₹{r.costs.breakdown.totalCosts.toLocaleString("en-IN")} = net ₹{r.costs.breakdown.netPnL.toLocaleString("en-IN")}</p>
            )}
            <p className="mt-2 font-mono text-[10px] text-zinc-600">{String(r.metadata?.datasetHash ?? "")} · {String(r.metadata?.strategyVersion ?? "")} · {String(r.metadata?.dataVersion ?? "")}</p>
          </Card>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
          <div className="mb-1 flex items-center gap-2 font-semibold"><TriangleAlert size={15} aria-hidden /> BACKTEST DATA QUALITY: {dq.overall}</div>
          <p>{r.interpretation}</p>
        </div>
        <Card className="p-3">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">Data quality</h2>
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 font-mono text-[11px]">
            {([
              ["Spot / candles", dq.spotCandles], ["Technicals", dq.technicals], ["Breadth", dq.breadth], ["Option prices", dq.optionPrices], ["IV", dq.iv],
              ["OI", dq.oi], ["Greeks", dq.greeks], ["Intrabar option prices", dq.intrabarOptionPrices], ["Historical option OHLC", dq.historicalOptionOHLC],
              ["News", dq.news], ["Event risk", dq.eventRisk], ["Execution", dq.execution], ["Transaction costs", dq.transactionCosts],
            ] as const).map(([k, v]) => (
              <div key={k} className="contents"><dt className="text-zinc-400">{k}</dt><dd className={v === "HISTORICAL MEASURED" ? "text-zinc-200" : "text-amber-400"}>{v}</dd></div>
            ))}
          </dl>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-3 text-xs">
          <h2 className="mb-2 font-semibold uppercase tracking-wider text-zinc-400">Historical coverage</h2>
          {r.coverage ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono">
              <dt className="text-zinc-500">Requested</dt><dd>{r.coverage.requestedStart} → {r.coverage.requestedEnd}</dd>
              <dt className="text-zinc-500">Actual</dt><dd>{r.coverage.actualStart ?? "—"} → {r.coverage.actualEnd ?? "—"}</dd>
              <dt className="text-zinc-500">Coverage</dt><dd className={r.coverage.status === "FULL" ? "text-zinc-200" : "text-amber-400"}>{r.coverage.status} · {r.coverage.coveragePercent}% ({r.coverage.barCount}/{r.coverage.expectedBars} bars)</dd>
              <dt className="text-zinc-500">Sessions</dt><dd>{r.coverage.tradingDaysExpected} trading · {r.coverage.missingSessions.length} missing · {r.coverage.partialSessions.length} partial · {r.coverage.weekendDays} weekend days excluded</dd>
              <dt className="text-zinc-500">Data checks</dt><dd>{r.coverage.duplicateBars} duplicates · {r.coverage.outOfOrderBars} out-of-order · {r.coverage.chunks} API chunk(s)</dd>
              {r.coverage.reason && <><dt className="text-zinc-500">Reason</dt><dd className="text-amber-400">{r.coverage.reason}</dd></>}
            </dl>
          ) : <p className="text-amber-400">Coverage not recorded for this run (sample / pre-Phase-9 run).</p>}
        </Card>
        <Card className="p-3 text-xs">
          <h2 className="mb-2 font-semibold uppercase tracking-wider text-zinc-400">Capital feasibility</h2>
          {r.capitalFeasibility && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono">
              <dt className="text-zinc-500">Configured</dt><dd>{inr(r.capitalFeasibility.configuredCapital)} · risk {r.capitalFeasibility.riskPerTradePercent}% · lot {r.capitalFeasibility.lotSize ?? "—"}</dd>
              <dt className="text-zinc-500">1-lot risk</dt><dd>{r.capitalFeasibility.riskPerLot ? `${inr(r.capitalFeasibility.riskPerLot.min)} – ${inr(r.capitalFeasibility.riskPerLot.max)} (median ${inr(r.capitalFeasibility.riskPerLot.median)}, ${r.capitalFeasibility.riskPerLot.samples} signals)` : "—"}</dd>
              <dt className="text-zinc-500">Min capital, 1 lot</dt><dd>{r.capitalFeasibility.minimumCapitalForOneLot ? `${inr(r.capitalFeasibility.minimumCapitalForOneLot.min)} (cheapest) · ${inr(r.capitalFeasibility.minimumCapitalForOneLot.median)} (median)` : "—"}</dd>
              <dt className="text-zinc-500">Status</dt><dd className={r.capitalFeasibility.status === "SUFFICIENT" ? "text-zinc-200" : "text-amber-400"}>{r.capitalFeasibility.status}</dd>
            </dl>
          )}
          <p className="mt-1 text-zinc-500">{r.capitalFeasibility?.note}</p>
        </Card>
        <Card className="p-3 text-xs">
          <h2 className="mb-2 font-semibold uppercase tracking-wider text-zinc-400">Execution</h2>
          {r.execution && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono">
              <dt className="text-zinc-500">Model</dt><dd className={r.execution.model === "CLOSE_ONLY" ? "" : "text-amber-400"}>{r.execution.model}</dd>
              <dt className="text-zinc-500">Path</dt><dd>{r.execution.intrabarPathModel ?? "bar close only"}</dd>
              <dt className="text-zinc-500">Same bar</dt><dd>{r.execution.sameBarExitPolicy ?? "—"}</dd>
              <dt className="text-zinc-500">Daily loss</dt><dd>{r.execution.flattenOnDailyLossLimit ? "Flatten open positions" : "Block new entries"} ({r.execution.dailyLossDefinition.toLowerCase().replace("_", " ")}) · {r.execution.dailyLossFlattens} flattened</dd>
            </dl>
          )}
          {r.execution?.model === "INTRABAR_MODEL_DERIVED" && <p className="mt-1 text-amber-400">INTRABAR MODEL IS SYNTHETIC: option intrabar prices are derived from underlying historical OHLC, not measured.</p>}
        </Card>
      </div>

      <form className="flex flex-wrap items-center gap-2 text-xs text-zinc-400" action="/performance">
        <input type="hidden" name="run" value={run.runId} />
        <span>Trade filters (recomputed from the selected trades):</span>
        <select name="strategy" defaultValue={filters.strategy ?? ""} className={sel}><option value="">Strategy: all</option>{strategiesInRun.map((s) => <option key={s}>{s}</option>)}</select>
        <select name="regime" defaultValue={filters.regime ?? ""} className={sel}><option value="">Regime: all</option>{regimesInRun.map((s) => <option key={s}>{s}</option>)}</select>
        <input type="date" name="from" defaultValue={filters.from} className={sel} aria-label="From" />
        <input type="date" name="to" defaultValue={filters.to} className={sel} aria-label="To" />
        <button className="rounded border border-zinc-700 px-2 py-1 text-zinc-200 hover:bg-zinc-800">Apply</button>
        <Link href={`/performance?run=${run.runId}`} className="text-zinc-500 hover:text-zinc-300">Clear</Link>
        {r.equityBasis === "REALIZED_ONLY" && <span className="text-amber-400">Filtered: equity and ratios use realized exits only.</span>}
      </form>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Net P&L" value={inr(c.netPnL)} help={r.metricHelp.netPnL} tone={pnlTone(c.netPnL)} />
        <Kpi label="Return" value={`${c.totalReturnPercent}%`} help={r.metricHelp.totalReturnPercent} tone={pnlTone(c.totalReturnPercent)} />
        <Kpi label="Win rate" value={m(c.winRate, "%")} help={r.metricHelp.winRate} reason={c.winRate.reason} />
        <Kpi label="Profit factor" value={m(c.profitFactor)} help={r.metricHelp.profitFactor} reason={c.profitFactor.reason} />
        <Kpi label="Expectancy" value={c.expectancy.value === null ? "NOT AVAILABLE" : inr(c.expectancy.value)} help={r.metricHelp.expectancy} reason={c.expectancy.reason} tone={pnlTone(c.expectancy.value)} />
        <Kpi label="Max drawdown" value={`${r.drawdown.maxDrawdownPercent}% (${inr(r.drawdown.maxDrawdown)})`} help={r.metricHelp.maxDrawdown} />
        <Kpi label="Sharpe (ann.)" value={m(r.ratios.sharpe.annualized)} help={r.metricHelp.sharpe} reason={r.ratios.sharpe.annualized.reason} />
        <Kpi label="Sortino (ann.)" value={m(r.ratios.sortino.annualized)} help={r.metricHelp.sortino} reason={r.ratios.sortino.annualized.reason} />
        <Kpi label="Calmar" value={m(r.ratios.calmar)} help={r.metricHelp.calmar} reason={r.ratios.calmar.reason} />
        <Kpi label="Average R" value={m(c.averageR)} help={r.metricHelp.averageR} reason={c.averageR.reason} />
        <Kpi label="Trades" value={`${c.totalTrades} (${c.winningTrades}W / ${c.losingTrades}L / ${c.breakevenTrades}BE)`} help="Closed simulated trades in scope." />
        <Kpi label="Final capital" value={inr(c.finalCapital)} help="Initial capital plus net P&L." />
      </div>

      <Section title="Equity &amp; drawdown">
        <EquityCharts points={r.equity} basis={r.equityBasis} initial={c.initialCapital} />
        <p className="mt-2 text-[11px] text-zinc-500">
          Max DD peak {r.drawdown.maxDrawdownPeriod ? `${inr(r.drawdown.maxDrawdownPeriod.peakEquity)} → trough ${inr(r.drawdown.maxDrawdownPeriod.troughEquity)}, ${r.drawdown.maxDrawdownPeriod.recoveredAt ? `recovered in ${r.drawdown.maxDrawdownPeriod.durationTradingDays} trading days` : "not recovered"}` : "none"} ·
          {" "}{r.drawdown.periods} drawdown periods · current DD {r.drawdown.currentDrawdownPercent}% · {r.ratios.returnObservations} daily return observations · annualized return {m(r.ratios.annualizedReturnPercent, "%")}
        </p>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Monthly performance (by exit month)">
          <Table head={["Month", "Trades", "W", "L", "Win %", "Gross +", "Gross −", "Net", "Return", "Max DD", "PF"]} rows={r.monthly.map((x) => [`${x.month}${x.partial ? " (partial)" : ""}`, x.tradeCount, x.wins, x.losses, m(x.winRate), inr(x.grossProfit), inr(-x.grossLoss), inr(x.netPnL), `${x.returnPercent}%`, inr(x.maxDrawdown), m(x.profitFactor)])} />
        </Section>
        <Section title="Strategy performance (strategies present only)">
          <Table head={["Strategy", "Trades", "Win %", "Net", "Return", "PF", "Exp.", "Avg R", "Max DD", "Avg hold"]} rows={r.strategies.map((x) => [x.key, x.tradeCount, m(x.winRate), inr(x.netPnL), `${x.returnPercent}%`, m(x.profitFactor), m(x.expectancy), m(x.averageR), inr(x.maxDrawdown), x.averageHoldingMinutes === null ? "—" : `${Math.round(x.averageHoldingMinutes)}m`])} />
        </Section>
        <Section title="Regime performance">
          <Table head={["Regime", "Trades", "Share", "Win %", "Net", "P&L contrib.", "PF", "Avg R", "Max DD", "Avg hold"]} rows={r.regimes.map((x) => [x.key, x.tradeCount, pct(x.tradeSharePercent), m(x.winRate), inr(x.netPnL), pct(x.pnlContributionPercent), m(x.profitFactor), m(x.averageR), inr(x.maxDrawdown), x.averageHoldingMinutes === null ? "—" : `${Math.round(x.averageHoldingMinutes)}m`])} />
        </Section>
        <Section title="Day of week (descriptive only)">
          <Table head={["Day", "Trades", "Win %", "Net", "Avg R"]} rows={r.weekdays.map((x) => [x.day, x.tradeCount, m(x.winRate), inr(x.netPnL), m(x.averageR)])} />
        </Section>
        <Section title="R-multiple distribution">
          <Table head={["Bucket", "Trades", "Net P&L"]} rows={r.rDistribution.map((x) => [x.label, x.count, inr(x.netPnL)])} />
          <p className="mt-2 text-[11px] text-zinc-500">{r.risk.lossesBeyondPlannedRisk} trade(s) lost more than 1R: stops are checked at bar closes, so premium can gap through a stop.</p>
        </Section>
        <Section title="Holding time">
          <Table head={["Bucket", "Trades"]} rows={r.holding.buckets.map((b) => [b.label, b.count])} />
          <p className="mt-2 text-[11px] text-zinc-500">Average {r.holding.average ?? "—"}m · median {r.holding.median ?? "—"}m · min {r.holding.minimum ?? "—"}m · max {r.holding.maximum ?? "—"}m{r.holding.missingExitTimestamp ? ` · ${r.holding.missingExitTimestamp} without exit time` : ""}</p>
        </Section>
        <Section title="No-trade analysis (whole run)">
          <p className="mb-2 font-mono text-xs text-zinc-300">{r.noTrade.totalEvaluated} bars evaluated · TRADE {r.noTrade.tradePercent}% · WAIT {r.noTrade.waitPercent}% · NO TRADE {r.noTrade.noTradePercent}%</p>
          <Table head={["Reason", "Count", "% of evaluated bars"]} rows={r.noTrade.reasons.map((x) => [x.code, x.count, `${x.percentOfEvaluated}%`])} />
          <p className="mt-2 text-[11px] text-zinc-500">{r.noTrade.note}</p>
        </Section>
        <Section title="Risk utilization">
          <Table
            head={["Limit", "Configured", "Observed"]}
            rows={[
              ["Risk per trade", `${r.risk.limits.riskPerTradePercent}%`, `avg ${pct(r.risk.averageRiskUtilizationPercent)} · max ${pct(r.risk.maxRiskUtilizationPercent)} of budget`],
              ["Daily loss", `${r.risk.limits.maxDailyLossPercent}%`, `worst day ${inr(r.risk.maxDailyRealizedLoss)} (${r.risk.dailyLossUtilizationPercent}% of limit) · ${r.risk.dailyLossBreachDays} breach day(s)`],
              ["Open risk", `${r.risk.limits.maxOpenRiskPercent}%`, `max ${inr(r.risk.maxOpenRisk)} (${r.risk.maxOpenRiskUtilizationPercent}%) · avg ${inr(r.risk.averageOpenRisk)}`],
              ["Concurrent positions", r.risk.limits.maxConcurrentPositions, r.risk.maxConcurrentPositionsObserved],
              ["Lots per trade", r.risk.limits.maxLotsPerTrade, r.risk.maxLotsObserved],
              ["Max position value", `${r.risk.limits.maxPositionValuePercent}%`, "enforced at entry by the risk engine"],
              ["Min R:R", r.risk.limits.minRiskReward, "enforced at entry"],
              ["Slippage", `${r.risk.limits.slippagePercent}%`, `₹${r.costs.slippage.toLocaleString("en-IN")} total · statutory costs ${typeof r.costs.transactionCosts === "number" ? `₹${r.costs.transactionCosts.toLocaleString("en-IN")}` : r.costs.transactionCosts}`],
              ["Exits", "—", `target ${r.exitReasons.target} · stop ${r.exitReasons.stopLoss} · expiry ${r.exitReasons.expiry} · forced ${r.exitReasons.forced} · risk rejections ${r.risk.riskRejections}`],
            ]}
          />
        </Section>
      </div>

      <Section title="Trade journal">
        <TradeJournal runId={run.runId} rows={journal(run, run.trades)} />
      </Section>
    </div>
  );
}
