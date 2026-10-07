import { getAllWalkForwardRuns } from "@/lib/services/walkForwardStore";
import { Card, Badge, num } from "./ui";

export function WalkForwardView() {
  const runs = getAllWalkForwardRuns();

  if (!runs.length) {
    return (
      <div className="space-y-4">
        <div role="alert" className="rounded border-2 border-red-500/60 bg-red-500/10 p-3 text-sm font-semibold text-red-200">
          HISTORICAL SIMULATION — NOT LIVE MARKET DATA. Out-of-sample walk-forward validation on model-derived option prices.
        </div>
        <Card className="p-4 text-sm text-zinc-400">
          No walk-forward validation runs stored yet. Execute one via <span className="font-mono text-zinc-200">POST /api/backtest/walk-forward</span> or script.
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div role="alert" className="rounded border-2 border-red-500/60 bg-red-500/10 p-3 text-sm font-semibold text-red-200">
        HISTORICAL SIMULATION — NOT LIVE MARKET DATA. Out-of-sample walk-forward validation on model-derived option prices.
      </div>

      {runs.map((r) => (
        <Card key={r.wfRunId} className="space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
            <div>
              <h2 className="text-base font-bold text-zinc-100">
                {r.config.index.toUpperCase()} · Walk-Forward ({r.wfConfig.windowType})
              </h2>
              <div className="font-mono text-xs text-zinc-400">
                Run ID: {r.wfRunId} · Dataset: {r.datasetHash} · Model: {r.wfConfig.executionModel}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={r.gate.includes("SUPPORT") ? "bull" : r.gate.includes("FAILURE") ? "bear" : "warn"}>
                {r.gate}
              </Badge>
            </div>
          </div>

          {/* Aggregated OOS Summary */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            <div className="rounded bg-zinc-900/60 p-2">
              <div className="text-[11px] text-zinc-400">OOS Trades</div>
              <div className="font-mono text-sm font-semibold text-zinc-100">{r.aggregateOOS.totalTrades}</div>
            </div>
            <div className="rounded bg-zinc-900/60 p-2">
              <div className="text-[11px] text-zinc-400">OOS Win Rate</div>
              <div className="font-mono text-sm font-semibold text-zinc-100">{r.aggregateOOS.winRate ?? "N/A"}%</div>
            </div>
            <div className="rounded bg-zinc-900/60 p-2">
              <div className="text-[11px] text-zinc-400">OOS Net P&L</div>
              <div className={`font-mono text-sm font-semibold ${r.aggregateOOS.netPnL >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                ₹{num(r.aggregateOOS.netPnL, 0)}
              </div>
            </div>
            <div className="rounded bg-zinc-900/60 p-2">
              <div className="text-[11px] text-zinc-400">OOS Return</div>
              <div className="font-mono text-sm font-semibold text-zinc-100">{num(r.aggregateOOS.returnPercent)}%</div>
            </div>
            <div className="rounded bg-zinc-900/60 p-2">
              <div className="text-[11px] text-zinc-400">Profit Factor</div>
              <div className="font-mono text-sm font-semibold text-zinc-100">{r.aggregateOOS.profitFactor ?? "N/A"}</div>
            </div>
            <div className="rounded bg-zinc-900/60 p-2">
              <div className="text-[11px] text-zinc-400">Expectancy</div>
              <div className="font-mono text-sm font-semibold text-zinc-100">{r.aggregateOOS.expectancy ?? "N/A"}</div>
            </div>
            <div className="rounded bg-zinc-900/60 p-2">
              <div className="text-[11px] text-zinc-400">Avg R</div>
              <div className="font-mono text-sm font-semibold text-zinc-100">{r.aggregateOOS.averageR ?? "N/A"}</div>
            </div>
          </div>

          {/* Concentration Warning Box */}
          {r.concentration.triggered && (
            <div className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-300">
              ⚠️ CONCENTRATION WARNING: Largest single window contributed {r.concentration.contributionPercent}% of total OOS profit (₹{num(r.concentration.largestWindowPnL, 0)}). Performance is highly window-concentrated.
            </div>
          )}

          {/* Windows Table */}
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">Out-Of-Sample Windows</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-right text-xs">
                <thead className="text-zinc-500">
                  <tr>
                    <th className="text-left">#</th>
                    <th className="text-left">Development Window</th>
                    <th className="text-left">OOS Window</th>
                    <th>OOS Trades</th>
                    <th>OOS P&L</th>
                    <th>OOS Return</th>
                    <th>OOS PF</th>
                    <th>Expectancy</th>
                    <th>PF Delta</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {r.windows.map((w) => (
                    <tr key={w.window.windowIndex} className="border-t border-zinc-800/60">
                      <td className="text-left font-sans">{w.window.windowIndex}</td>
                      <td className="text-left text-zinc-400">{w.window.trainStartDate} → {w.window.trainEndDate}</td>
                      <td className="text-left text-zinc-200 font-semibold">{w.window.testStartDate} → {w.window.testEndDate}</td>
                      <td>{w.testSummary.trades}</td>
                      <td className={w.testSummary.netPnL >= 0 ? "text-emerald-400" : "text-red-400"}>
                        ₹{num(w.testSummary.netPnL, 0)}
                      </td>
                      <td>{num(w.testSummary.returnPercent)}%</td>
                      <td>{typeof w.testSummary.profitFactor === "object" ? (w.testSummary.profitFactor?.value ?? "N/A") : (w.testSummary.profitFactor ?? "N/A")}</td>
                      <td>{typeof w.testSummary.expectancy === "object" ? (w.testSummary.expectancy?.value ?? "N/A") : (w.testSummary.expectancy ?? "N/A")}</td>
                      <td className={w.degradation.profitFactorDelta && w.degradation.profitFactorDelta < 0 ? "text-amber-400" : "text-zinc-400"}>
                        {w.degradation.profitFactorDelta ?? "N/A"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
