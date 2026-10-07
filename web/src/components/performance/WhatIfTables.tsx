"use client";

type M = { value: number | null; reason: string | null };
type Row = {
  runId: string; capital: number; executionModel: string; flattenOnDailyLossLimit: boolean; trades: number; wins: number; losses: number;
  winRate: M; netPnL: number; returnPercent: number; profitFactor: M; expectancy: M; averageR: M; maxDrawdownPercent: number; sharpe: M;
  positionSizeRejections: number; riskRejections: number; dailyLossFlattens: number; feasibility: string;
};
export type WhatIf =
  | { kind: "scenarios"; data: { note: string; rows: Row[]; feasibility: { minimumCapitalForOneLot: { min: number; median: number } | null; riskPerLot: { median: number } | null } | null } }
  | { kind: "compare"; data: { closeOnly: Row; intrabar: Row; returnDifferencePp: number; sensitivity: string; thresholds: { highReturnDiffPp: number; moderateReturnDiffPp: number } } };

const m = (x: M) => (x.value === null ? "NOT AVAILABLE" : x.value.toLocaleString("en-IN"));
const inr = (v: number) => `${v < 0 ? "−" : ""}₹${Math.abs(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const cols: [string, (r: Row) => string | number][] = [
  ["Trades", (r) => r.trades], ["Wins", (r) => r.wins], ["Losses", (r) => r.losses], ["Win rate", (r) => m(r.winRate)], ["Net P&L", (r) => inr(r.netPnL)],
  ["Return", (r) => `${r.returnPercent}%`], ["Profit factor", (r) => m(r.profitFactor)], ["Expectancy", (r) => m(r.expectancy)], ["Avg R", (r) => m(r.averageR)],
  ["Max DD", (r) => `${r.maxDrawdownPercent}%`], ["Sharpe", (r) => m(r.sharpe)], ["Position-size rejections", (r) => r.positionSizeRejections], ["Risk rejections", (r) => r.riskRejections],
];

export function WhatIfTables({ w }: { w: WhatIf }) {
  const rows = w.kind === "scenarios" ? w.data.rows : [w.data.closeOnly, w.data.intrabar];
  const head = rows.map((r) => (w.kind === "scenarios" ? inr(r.capital) : r.executionModel));
  return (
    <div className="mt-2 rounded border border-zinc-800 p-3">
      <p className="mb-2 text-zinc-300">
        {w.kind === "scenarios"
          ? `${w.data.note} Minimum capital for one lot: ${w.data.feasibility?.minimumCapitalForOneLot ? `${inr(w.data.feasibility.minimumCapitalForOneLot.min)} (cheapest signal) – ${inr(w.data.feasibility.minimumCapitalForOneLot.median)} (median signal)` : "not measurable"}.`
          : `Execution sensitivity: ${w.data.sensitivity} (return difference ${w.data.returnDifferencePp} pp; HIGH > ${w.data.thresholds.highReturnDiffPp} pp or P&L sign flip, MODERATE > ${w.data.thresholds.moderateReturnDiffPp} pp). Same candles, config and strategy; only execution differs.`}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full font-mono text-xs">
          <thead className="border-b border-zinc-800 text-zinc-400"><tr><th className="p-2 text-left">Metric</th>{head.map((h) => <th key={h} className="p-2 text-left">{h}</th>)}</tr></thead>
          <tbody>{cols.map(([label, f]) => <tr key={label} className="border-b border-zinc-800/60"><td className="p-2 text-zinc-400">{label}</td>{rows.map((r) => <td key={r.runId + label} className="p-2 text-zinc-200">{f(r)}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
