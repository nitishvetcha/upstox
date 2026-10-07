"use client";

import { Fragment, useMemo, useState } from "react";
import type { journalEntry } from "@/lib/services/performance/journal";

type Row = ReturnType<typeof journalEntry>;
const field = "rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100";
const ist = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
const money = (v: number | null) => (v === null ? "—" : `${v >= 0 ? "+" : ""}₹${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);

export function TradeJournal({ runId, rows }: { runId: string; rows: Row[] }) {
  const [f, setF] = useState({ strategy: "", regime: "", outcome: "", exitReason: "", from: "", to: "", minR: "", maxR: "" });
  const [sort, setSort] = useState<{ key: "date" | "pnl" | "r" | "duration"; dir: 1 | -1 }>({ key: "date", dir: -1 });
  const [openId, setOpenId] = useState<string | null>(null);
  const uniq = (k: "strategy" | "regime" | "exitReason") => [...new Set(rows.map((r) => r[k]))].sort();

  const shown = useMemo(() => {
    const day = (iso: string) => new Date(Date.parse(iso) + 330 * 60_000).toISOString().slice(0, 10);
    const out = rows.filter(
      (r) =>
        (!f.strategy || r.strategy === f.strategy) &&
        (!f.regime || r.regime === f.regime) &&
        (!f.exitReason || r.exitReason === f.exitReason) &&
        (!f.outcome || (f.outcome === "win" ? r.netPnL > 0 : f.outcome === "loss" ? r.netPnL < 0 : r.netPnL === 0)) &&
        (!f.from || day(r.timestamp) >= f.from) &&
        (!f.to || day(r.timestamp) <= f.to) &&
        (f.minR === "" || r.rMultiple >= Number(f.minR)) &&
        (f.maxR === "" || r.rMultiple <= Number(f.maxR)),
    );
    const key = (r: Row) => (sort.key === "pnl" ? r.netPnL : sort.key === "r" ? r.rMultiple : sort.key === "duration" ? (r.holdingMinutes ?? -1) : Date.parse(r.timestamp));
    return out.sort((a, b) => (key(a) - key(b)) * sort.dir || a.tradeId.localeCompare(b.tradeId));
  }, [rows, f, sort]);

  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v !== "")).toString();
  const th = (label: string, key?: typeof sort.key) => (
    <th className="p-2 text-left font-medium">
      {key ? (
        <button onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : -1 }))} className="hover:text-zinc-200">
          {label}
          {sort.key === key ? (sort.dir === -1 ? " ↓" : " ↑") : ""}
        </button>
      ) : (
        label
      )}
    </th>
  );
  const sel = (k: "strategy" | "regime" | "exitReason", label: string) => (
    <select value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={field} aria-label={label}>
      <option value="">{label}: all</option>
      {uniq(k).map((v) => <option key={v}>{v}</option>)}
    </select>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {sel("strategy", "Strategy")}
        {sel("regime", "Regime")}
        {sel("exitReason", "Exit")}
        <select value={f.outcome} onChange={(e) => setF({ ...f, outcome: e.target.value })} className={field} aria-label="Outcome">
          <option value="">Win/loss: all</option><option value="win">Wins</option><option value="loss">Losses</option><option value="breakeven">Breakeven</option>
        </select>
        <input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} className={field} aria-label="From date" />
        <input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} className={field} aria-label="To date" />
        <input type="number" step="0.5" placeholder="min R" value={f.minR} onChange={(e) => setF({ ...f, minR: e.target.value })} className={`${field} w-20`} />
        <input type="number" step="0.5" placeholder="max R" value={f.maxR} onChange={(e) => setF({ ...f, maxR: e.target.value })} className={`${field} w-20`} />
        <span className="ml-auto flex gap-2 text-xs">
          <a className="rounded border border-zinc-700 px-2 py-1 text-zinc-200 hover:bg-zinc-800" href={`/api/performance/${runId}/export?type=trades${qs ? `&${qs}` : ""}`}>Export trades CSV</a>
          <a className="rounded border border-zinc-700 px-2 py-1 text-zinc-200 hover:bg-zinc-800" href={`/api/performance/${runId}/export?type=legs${qs ? `&${qs}` : ""}`}>Export legs CSV</a>
        </span>
      </div>
      <p className="text-[11px] text-zinc-500">{shown.length} of {rows.length} trades · click a row for its legs · CSV: trades.csv one row per trade; legs.csv one row per leg, joined on run_id + trade_id.</p>
      <div className="overflow-x-auto">
        <table className="w-full font-mono text-xs">
          <thead className="border-b border-zinc-800 text-zinc-400">
            <tr>
              {th("Entry (IST)", "date")}{th("Exit (IST)")}{th("Strategy")}{th("Direction")}{th("Regime")}{th("Lots")}{th("Entry")}{th("Exit")}{th("Risk")}{th("Gross")}{th("Slippage")}{th("Costs")}{th("Net P&L", "pnl")}{th("R", "r")}{th("Held", "duration")}{th("Exit reason")}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <Fragment key={r.tradeId}>
                <tr onClick={() => setOpenId(openId === r.tradeId ? null : r.tradeId)} className="cursor-pointer border-b border-zinc-800/60 hover:bg-zinc-800/30">
                  <td className="p-2 text-zinc-300">{ist(r.timestamp)}</td>
                  <td className="p-2 text-zinc-400">{r.exitTimestamp ? ist(r.exitTimestamp) : "—"}</td>
                  <td className="p-2 text-zinc-200">{r.strategy}{r.legs.length > 1 ? ` (${r.legs.length} legs)` : ""}</td>
                  <td className="p-2 text-zinc-400">{r.direction}</td>
                  <td className="p-2 text-zinc-400">{r.regime}</td>
                  <td className="p-2">{r.lots} ({r.quantity})</td>
                  <td className="p-2">{r.entry}</td>
                  <td className="p-2">{r.exit ?? "—"}</td>
                  <td className="p-2">₹{r.riskAmount.toLocaleString("en-IN")}</td>
                  <td className="p-2">{money(r.grossPnL)}</td>
                  <td className="p-2">₹{r.costs.slippage.toLocaleString("en-IN")}</td>
                  <td className="p-2">{r.costs.total === null ? "NOT MODELED" : `₹${r.costs.total.toLocaleString("en-IN")}`}</td>
                  <td className={`p-2 font-semibold ${r.netPnL > 0 ? "text-emerald-400" : r.netPnL < 0 ? "text-red-400" : "text-zinc-300"}`}>{money(r.netPnL)}</td>
                  <td className="p-2">{r.rMultiple.toFixed(2)}</td>
                  <td className="p-2">{r.holdingMinutes === null ? "—" : `${Math.round(r.holdingMinutes)}m`}</td>
                  <td className="p-2 text-zinc-300">{r.exitReason}</td>
                </tr>
                {openId === r.tradeId && (
                  <tr className="bg-zinc-950/60">
                    <td colSpan={16} className="p-2">
                      <table className="w-full text-[11px] text-zinc-400">
                        <thead><tr><th className="text-left">Leg</th><th className="text-left">Instrument</th><th className="text-left">Side</th><th className="text-left">Qty</th><th className="text-left">Entry fill (mid)</th><th className="text-left">Exit fill (mid)</th><th className="text-left">Leg P&L</th></tr></thead>
                        <tbody>
                          {r.legs.map((l) => (
                            <tr key={l.legNo}>
                              <td>{l.legNo}</td><td>{l.instrument}</td><td>{l.side}</td><td>{l.quantity}</td>
                              <td>{l.entryPrice} ({l.entryMid ?? "—"})</td><td>{l.exitPrice ?? "—"} ({l.exitMid ?? "—"})</td><td>{money(l.pnl)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="mt-1 text-[11px] text-zinc-500">Gross (model mid) {money(r.grossPnL)} · slippage ₹{r.costs.slippage} · statutory costs {r.costs.status} · {r.dataQuality}</p>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
