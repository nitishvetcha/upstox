"use client";

import { useState, useEffect } from "react";
import type { EvaluationReport, BreakdownSlice } from "@/lib/evaluationEngine";

function NA() { return <span className="text-gray-400 text-sm">N/A</span>; }
function Insuf() { return <span className="text-amber-500 text-sm font-medium">INSUFFICIENT SAMPLE</span>; }

function MetricRow({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className="flex justify-between items-start gap-4 py-1.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <span className="text-sm text-gray-600 dark:text-gray-400 shrink-0">{label}</span>
      <span className="text-sm font-medium text-right">
        {value}
        {note && <span className="ml-1 text-xs text-gray-400">({note})</span>}
      </span>
    </div>
  );
}

function fmt(v: number | null | undefined, suffix = ""): React.ReactNode {
  if (v === null || v === undefined) return <NA />;
  return <>{v}{suffix}</>;
}

function fmtPnl(v: number | null | undefined): React.ReactNode {
  if (v === null || v === undefined) return <NA />;
  const color = v >= 0 ? "text-green-600" : "text-red-600";
  return <span className={color}>₹{v.toLocaleString()}</span>;
}

function SampleBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    INSUFFICIENT_SAMPLE: "bg-red-100 text-red-700",
    EARLY_SAMPLE: "bg-amber-100 text-amber-700",
    DEVELOPING_SAMPLE: "bg-yellow-100 text-yellow-700",
    MEANINGFUL_SAMPLE: "bg-blue-100 text-blue-700",
    STRONGER_SAMPLE: "bg-green-100 text-green-700",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-bold ${colorMap[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function EvidenceBadge({ cls }: { cls: string }) {
  const colorMap: Record<string, string> = {
    INSUFFICIENT_SAMPLE: "bg-red-100 text-red-700",
    DESCRIPTIVE_ONLY: "bg-gray-100 text-gray-600",
    EARLY_EVIDENCE: "bg-amber-100 text-amber-700",
    DEVELOPING_EVIDENCE: "bg-yellow-100 text-yellow-700",
    MIXED_EVIDENCE: "bg-purple-100 text-purple-700",
    NEGATIVE_EVIDENCE: "bg-red-200 text-red-800",
    POSITIVE_BUT_UNSTABLE: "bg-blue-100 text-blue-700",
    PRELIMINARY_SUPPORT: "bg-green-100 text-green-700",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-bold ${colorMap[cls] ?? "bg-gray-100 text-gray-600"}`}>
      {cls.replace(/_/g, " ")}
    </span>
  );
}

function BreakdownTable({ data, title }: { data: Record<string, BreakdownSlice>; title: string }) {
  const rows = Object.entries(data);
  if (!rows.length) return null;
  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">{title}</h3>
      <div className="overflow-x-auto">
        <table className="text-xs w-full border-collapse">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800 text-gray-500">
              <th className="text-left px-2 py-1">Slice</th>
              <th className="text-right px-2 py-1">Obs</th>
              <th className="text-right px-2 py-1">Trades</th>
              <th className="text-right px-2 py-1">Win%</th>
              <th className="text-right px-2 py-1">Avg R</th>
              <th className="text-right px-2 py-1">Net P&L</th>
              <th className="text-right px-2 py-1">PF</th>
              <th className="text-left px-2 py-1">Sample</th>
            </tr>
          </thead>
          <tbody>
            {rows.sort(([a], [b]) => a.localeCompare(b)).map(([key, s]) => (
              <tr key={key} className="border-t border-gray-100 dark:border-gray-700">
                <td className="px-2 py-1 font-medium">{key}</td>
                <td className="text-right px-2 py-1">{s.observations}</td>
                <td className="text-right px-2 py-1">{s.completedTrades}</td>
                <td className="text-right px-2 py-1">{s.winRate !== null ? `${s.winRate}%` : "—"}</td>
                <td className="text-right px-2 py-1">{s.avgR !== null ? s.avgR : "—"}</td>
                <td className="text-right px-2 py-1">{s.netPnl !== null ? `₹${s.netPnl.toLocaleString()}` : "—"}</td>
                <td className="text-right px-2 py-1">{s.profitFactor !== null ? s.profitFactor : "—"}</td>
                <td className="px-2 py-1 text-gray-400">{s.sampleAdequacy.replace(/_/g, " ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function RecommendationEvaluation() {
  const [report, setReport] = useState<EvaluationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/recommendations/evaluation")
      .then((r) => r.json())
      .then((d) => { setReport(d as EvaluationReport); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <div className="p-4 text-sm text-gray-500">Loading evaluation…</div>;
  if (error) return <div className="p-4 text-sm text-red-600">Error: {error}</div>;
  if (!report) return null;

  const { performance: p, dataQuality: dq } = report;
  const isInsufficient = report.status === "INSUFFICIENT_SAMPLE";

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Recommendation Evaluation</h1>
          <p className="text-xs text-gray-500 mt-0.5">Strategy: {report.strategyVersion} · Generated {new Date(report.generatedAt).toLocaleString()}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <SampleBadge status={report.status} />
          <EvidenceBadge cls={report.evidenceClassification} />
        </div>
      </div>

      <div className="text-sm text-gray-600 dark:text-gray-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded p-3">
        <strong>Evidence note:</strong> {report.evidenceReason}
      </div>

      {/* Data quality */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-3">Data Quality</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
          {[
            ["Total observations", dq.totalRecords],
            ["TRADE decisions", dq.tradeDecisions],
            ["WAIT decisions", dq.waitDecisions],
            ["NO TRADE decisions", dq.noTradeDecisions],
            ["Completed trades", dq.completedTrades],
            ["Open trades", dq.openTrades],
            ["Expired", dq.expiredTrades],
            ["Invalid records", dq.invalidRecords],
            ["Excluded (version)", dq.excludedByVersion],
            ["Excluded (filter)", dq.excludedByFilter],
          ].map(([label, val]) => (
            <div key={label as string} className="bg-gray-50 dark:bg-gray-800 rounded px-3 py-2">
              <div className="text-xs text-gray-500">{label as string}</div>
              <div className="font-semibold">{val as number}</div>
            </div>
          ))}
        </div>
        {dq.oldestTimestamp && (
          <p className="text-xs text-gray-400 mt-2">
            {dq.oldestTimestamp.slice(0, 10)} → {dq.newestTimestamp?.slice(0, 10) ?? ""}
          </p>
        )}
      </section>

      {/* Performance */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-3">Performance Metrics</h2>
        {isInsufficient ? (
          <div className="text-sm text-amber-600 bg-amber-50 dark:bg-amber-950 rounded p-3">
            Not available — insufficient sample ({p.n} completed trades, need 10+)
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <h3 className="text-xs font-semibold text-gray-500 mb-2 uppercase">Core Metrics</h3>
              <MetricRow label="Completed trades" value={p.n} />
              <MetricRow label="Wins / Losses" value={`${p.wins} / ${p.losses}`} />
              <MetricRow label="Win rate" value={p.winRate !== null ? `${p.winRate}%` : <NA />} />
              {p.winRateCI && (
                <MetricRow
                  label="Win rate 95% CI"
                  value={`${p.winRateCI.lower}% – ${p.winRateCI.upper}%`}
                  note={p.winRateCI.label}
                />
              )}
              <MetricRow label="Loss rate" value={fmt(p.lossRate, "%")} />
              <MetricRow label="Net P&L" value={fmtPnl(p.netPnl)} />
              <MetricRow label="Gross profit" value={fmtPnl(p.grossProfit)} />
              <MetricRow label="Gross loss" value={fmtPnl(p.grossLoss)} />
              <MetricRow label="Profit factor" value={fmt(p.profitFactor)} />
              <MetricRow label="₹ Expectancy / trade" value={fmtPnl(p.expectancyPnl)} />
              <MetricRow label="R Expectancy / trade" value={fmt(p.expectancyR)} />
            </div>
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <h3 className="text-xs font-semibold text-gray-500 mb-2 uppercase">Distribution</h3>
              <MetricRow label="Average win" value={fmtPnl(p.avgWin)} />
              <MetricRow label="Average loss" value={fmtPnl(p.avgLoss)} />
              <MetricRow label="Median win" value={fmtPnl(p.medianWin)} />
              <MetricRow label="Median loss" value={fmtPnl(p.medianLoss)} />
              <MetricRow label="Largest win" value={fmtPnl(p.largestWin)} />
              <MetricRow label="Largest loss" value={fmtPnl(p.largestLoss)} />
              <MetricRow label="Win/Loss ratio" value={fmt(p.winLossRatio)} />
              <MetricRow label="Avg R" value={fmt(p.avgR)} />
              <MetricRow label="Median R" value={fmt(p.medianR)} />
              <MetricRow label="Std R" value={fmt(p.stdR)} />
              <MetricRow label="R ≥ +1 / R ≤ −1" value={`${p.rGePos1} / ${p.rLeNeg1}`} />
            </div>
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <h3 className="text-xs font-semibold text-gray-500 mb-2 uppercase">Risk-Adjusted</h3>
              <MetricRow label="Sharpe" value={p.sharpe !== null ? p.sharpe : <Insuf />} note={p.sharpeLabel ?? undefined} />
              <MetricRow label="Sortino" value={p.sortino !== null ? p.sortino : <Insuf />} note={p.sortinoLabel ?? undefined} />
              <MetricRow label="Calmar" value={p.calmar !== null ? p.calmar : <NA />} note={p.calmarLabel ?? undefined} />
              <MetricRow label="Max drawdown" value={p.drawdown.maxDrawdown !== null ? `₹${p.drawdown.maxDrawdown.toLocaleString()}` : <NA />} />
              <MetricRow label="Max drawdown %" value={fmt(p.drawdown.maxDrawdownPct, "%")} note={p.drawdown.label} />
              <MetricRow label="Max consec. wins" value={p.maxConsecWins} />
              <MetricRow label="Max consec. losses" value={p.maxConsecLosses} />
            </div>
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <h3 className="text-xs font-semibold text-gray-500 mb-2 uppercase">Outlier Analysis</h3>
              <MetricRow label="Net P&L ex-largest win" value={fmtPnl(p.netPnlExLargestWin)} />
              <MetricRow label="Net P&L ex-largest loss" value={fmtPnl(p.netPnlExLargestLoss)} />
              <MetricRow label="Largest win contribution" value={p.outlierContributionLargestWin !== null ? `${p.outlierContributionLargestWin}%` : <NA />} />
              <MetricRow label="Largest loss contribution" value={p.outlierContributionLargestLoss !== null ? `${p.outlierContributionLargestLoss}%` : <NA />} />
              {p.winRateBootstrap && (
                <>
                  <MetricRow label="Win rate bootstrap CI" value={`${p.winRateBootstrap.ci95Lower}% – ${p.winRateBootstrap.ci95Upper}%`} note="bootstrap 95%" />
                  <MetricRow label="Avg R bootstrap CI" value={p.avgRBootstrap ? `${p.avgRBootstrap.ci95Lower} – ${p.avgRBootstrap.ci95Upper}` : "—"} note="bootstrap 95%" />
                </>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Breakdowns */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-3">Breakdowns</h2>
        <p className="text-xs text-gray-400 mb-4">All breakdowns are descriptive. Do not optimize based on these results.</p>
        <BreakdownTable data={report.byUnderlying} title="By Underlying (NIFTY / BANKNIFTY)" />
        <BreakdownTable data={report.byOptionType} title="By Option Type (CE / PE)" />
        <BreakdownTable data={report.byStrategy} title="By Strategy" />
        <BreakdownTable data={report.byRegime} title="By Market Regime" />
        <BreakdownTable data={report.byConfidenceBucket} title="By Confidence Bucket" />
        <BreakdownTable data={report.byRRBucket} title="By R:R Bucket" />
        <BreakdownTable data={report.byWeekday} title="By Weekday" />
        <BreakdownTable data={report.byMonth} title="By Month" />
      </section>

      {/* Recent vs earlier */}
      {(report.recentVsEarlier.earlier || report.recentVsEarlier.recent) && (
        <section>
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-1">Stability Check</h2>
          <p className="text-xs text-gray-400 mb-3">{report.recentVsEarlier.note}</p>
          <div className="grid grid-cols-2 gap-4">
            {[["Earlier half", report.recentVsEarlier.earlier], ["Recent half", report.recentVsEarlier.recent]].map(([label, s]) => (
              s && (
                <div key={label as string} className="bg-gray-50 dark:bg-gray-800 rounded p-3 text-sm">
                  <div className="font-semibold text-xs mb-1">{label as string}</div>
                  <div>Trades: {(s as BreakdownSlice).completedTrades}</div>
                  <div>Win rate: {(s as BreakdownSlice).winRate !== null ? `${(s as BreakdownSlice).winRate}%` : "N/A"}</div>
                  <div>Avg R: {(s as BreakdownSlice).avgR ?? "N/A"}</div>
                  <div>Net P&L: {(s as BreakdownSlice).netPnl !== null ? `₹${(s as BreakdownSlice).netPnl}` : "N/A"}</div>
                </div>
              )
            ))}
          </div>
        </section>
      )}

      {/* Export */}
      <section>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/api/recommendations/evaluation/export"
          className="inline-block text-sm text-blue-600 hover:underline"
        >
          Export evaluation CSV
        </a>
      </section>
    </div>
  );
}
