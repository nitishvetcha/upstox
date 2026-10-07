"use client";

import { useState } from "react";
import { WhatIfTables, type WhatIf } from "./WhatIfTables";
import { useRouter } from "next/navigation";

const field = "rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100";

// Config-level filters (index, dates, timeframe, capital, risk %, slippage, compounding, strategy) need a new
// deterministic run; trade-level filters are applied on the report instead.
export function RunForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState("CLOSE_ONLY");
  const [whatIf, setWhatIf] = useState<WhatIf | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const action = ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value ?? "run";
    setBusy(true);
    setError(null);
    const body = Object.fromEntries(new FormData(e.currentTarget));
    const payload = { ...body, compounding: body.compounding === "on", flattenOnDailyLossLimit: body.dailyLossMode === "flatten" };
    const res = await fetch(`/api/backtest/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const j = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok || !j?.data) return setError(j?.message ?? `Backtest failed (HTTP ${res.status})`);
    if (action !== "run") return setWhatIf({ kind: action as WhatIf["kind"], data: j.data });
    router.push(`/performance?run=${j.data.runId}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3 text-xs text-zinc-400">
      <label className="flex flex-col gap-1">Index<select name="index" className={field}><option value="nifty">NIFTY 50</option><option value="banknifty">BANK NIFTY</option></select></label>
      <label className="flex flex-col gap-1">From<input type="date" name="startDate" defaultValue="2026-09-10" className={field} /></label>
      <label className="flex flex-col gap-1">To<input type="date" name="endDate" defaultValue="2026-10-05" className={field} /></label>
      <label className="flex flex-col gap-1">Timeframe<select name="timeframe" defaultValue="15m" className={field}>{["5m", "15m", "30m", "1h"].map((t) => <option key={t}>{t}</option>)}</select></label>
      <label className="flex flex-col gap-1">Capital ₹<input type="number" name="startingCapital" defaultValue={100000} min={10000} step={10000} className={`${field} w-28`} /></label>
      <label className="flex flex-col gap-1">Risk %<input type="number" name="riskPerTradePercent" defaultValue={1} min={0.1} max={5} step={0.1} className={`${field} w-20`} /></label>
      <label className="flex flex-col gap-1">Slippage %<input type="number" name="slippagePercent" defaultValue={1} min={0} max={5} step={0.1} className={`${field} w-20`} /></label>
      <label className="flex flex-col gap-1">Strategy<select name="strategyFilter" className={field}>{["ALL", "Long Call", "Long Put", "Bull Call Spread", "Bear Put Spread", "ATM Straddle", "Iron Condor"].map((s) => <option key={s}>{s}</option>)}</select></label>
      <label className="flex flex-col gap-1">Execution model<select name="executionModel" value={model} onChange={(e) => setModel(e.target.value)} className={field}><option value="CLOSE_ONLY">CLOSE_ONLY</option><option value="INTRABAR_MODEL_DERIVED">INTRABAR_MODEL_DERIVED</option></select></label>
      <label className="flex flex-col gap-1">Data model<select name="dataModel" className={field}><option value="PHASE10">PHASE10 (VIX IV, constituent breadth, costs)</option><option value="PHASE9_LEGACY">PHASE9_LEGACY (synthetic; comparison only)</option></select></label>
      <label className="flex flex-col gap-1">Daily loss limit<select name="dailyLossMode" className={field}><option value="block">Block new entries</option><option value="flatten">Flatten open positions</option></select></label>
      <label className="flex items-center gap-1 pb-1"><input type="checkbox" name="compounding" /> Compounding</label>
      <button name="action" value="run" disabled={busy} className="rounded border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 hover:bg-zinc-700 disabled:opacity-50">{busy ? "Running…" : "Run backtest"}</button>
      <button name="action" value="scenarios" disabled={busy} className="rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50">Capital scenarios</button>
      <button name="action" value="compare" disabled={busy} className="rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50">Compare execution models</button>
      {model === "INTRABAR_MODEL_DERIVED" && (
        <p className="w-full rounded border border-amber-500/40 bg-amber-500/10 p-2 text-amber-300">
          <strong>INTRABAR MODEL IS SYNTHETIC.</strong> Historical option OHLC is unavailable. Option intrabar prices are derived from underlying
          historical OHLC using the configured pricing model (Black-Scholes, 14.5% IV), along an assumed path (bullish bar O→L→H→C, bearish O→H→L→C).
          If a bar touches both stop and target, the stop wins; gaps fill at the open.
        </p>
      )}
      {error && <span className="w-full text-amber-400">{error}</span>}
      {whatIf && <div className="w-full"><WhatIfTables w={whatIf} /></div>}
    </form>
  );
}
