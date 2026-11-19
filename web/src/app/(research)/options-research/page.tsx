export const dynamic = "force-dynamic";

import { Card } from "@/components/ui";
import type { DataClass } from "@/lib/research/optionsInventory";
import { loadInventories } from "@/lib/research/inventoryStore";
import { INDEX_HISTORY_QUALITY } from "@/lib/research/indexHistoryQuality";

const CLASS_STYLE: Record<DataClass, string> = {
  GENUINE_HISTORICAL: "bg-emerald-900/40 text-emerald-300",
  LIVE_SNAPSHOT: "bg-sky-900/40 text-sky-300",
  MODEL_DERIVED_SYNTHETIC: "bg-amber-900/40 text-amber-300",
  TEST_FIXTURE: "bg-zinc-800 text-zinc-400",
};
const na = (v: unknown) => (v === null || v === undefined || v === "" ? <span className="text-zinc-500">unavailable</span> : String(v));

export default function OptionsResearchPage() {
  const all = loadInventories();
  const inv = all[0];
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-zinc-100">Historical Options Research Lab</h1>
        <p className="text-sm text-zinc-400">Read-only research. No orders, no live trading, and no link to the frozen intraday strategy.</p>
      </div>

      <div role="note" className="rounded border border-sky-700/50 bg-sky-900/20 p-3 text-sm text-sky-200">
        Historical research readiness is <b>independent</b> of the live options data audit (options-audit-1). Passing the live
        audit does not prove any historical dataset is accurate, and a historical result can never bypass the live audit.
      </div>

      {!inv ? (
        <Card className="p-4 text-sm text-zinc-300">
          No inventory has been run yet. Run <code className="font-mono">node scripts/options-research-inventory.ts</code> with a valid Upstox login.
        </Card>
      ) : (
        <>
          <Card className="space-y-2 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-400">Verdict</h2>
            <p className="text-lg font-semibold text-amber-300">
              {inv.experiments.some((e) => e.enabled) ? "Some experiments are supported by the data" : "Not enough historical options data for a credible backtest"}
            </p>
            <p className="text-sm text-zinc-300">
              Expired-contract history: {inv.expiredHistory.available
                ? <span className="text-emerald-300">available</span>
                : <span className="text-red-300">blocked ({inv.expiredHistory.status} {inv.expiredHistory.errorCode}: {inv.expiredHistory.message})</span>}.
              Completed expiry cycles retrievable: <b>{inv.completedExpiriesRetrievable}</b>.
            </p>
            <p className="text-xs text-zinc-500">Inventory {inv.id} · {inv.createdAt} · {inv.version}</p>
          </Card>

          <Card className="p-4">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-zinc-400">Experiments</h2>
            <ul className="space-y-2 text-sm">
              {inv.experiments.map((e) => (
                <li key={e.id} className="rounded border border-zinc-800 p-2">
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${e.enabled ? "bg-emerald-800 text-emerald-100" : "bg-zinc-800 text-zinc-400"}`}>{e.enabled ? "ENABLED" : "DISABLED"}</span>
                    <span className="font-medium text-zinc-100">{e.title}</span>
                  </div>
                  {e.reasons.map((r) => <p key={r} className="mt-1 text-xs text-amber-300">• {r}</p>)}
                  <p className="mt-1 text-xs text-zinc-500">Needs: {e.needs.join("; ")}</p>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-zinc-500">
              Filters (index, expiry, CE/PE, strike, moneyness, date range) and strategy configuration unlock per experiment once its data requirements are met.
              No parameter optimisation and no automatic promotion are provided.
            </p>
          </Card>

          <Card className="p-4">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-zinc-400">Field availability</h2>
            <div className="overflow-x-auto"><table className="w-full text-xs"><tbody>
              {Object.entries(inv.fields).map(([k, f]) => (
                <tr key={k} className="border-b border-zinc-800/60">
                  <td className="py-1.5 pr-3 font-mono text-zinc-300">{k}</td>
                  <td className={`py-1.5 pr-3 font-semibold ${f.available ? "text-emerald-300" : "text-red-300"}`}>{f.available ? "available" : "unavailable"}</td>
                  <td className="py-1.5 pr-3 text-zinc-400">{f.source}</td>
                  <td className="py-1.5 text-zinc-500">{f.note}</td>
                </tr>
              ))}
            </tbody></table></div>
          </Card>

          <Card className="p-4">
            <h2 className="mb-1 text-xs font-semibold uppercase tracking-[0.15em] text-zinc-400">Coverage: currently listed contracts (genuine, unexpired only)</h2>
            <p className="mb-2 text-xs text-zinc-500">ATM CE/PE on the nearest three expiries and the furthest one. The 1-minute probe window is the last 27 days (provider request limit), so “1-min from” is a window start, not a listing date.</p>
            <div className="overflow-x-auto"><table className="w-full font-mono text-xs">
              <thead className="text-zinc-400"><tr>{["Contract", "Expiry", "Daily bars", "Daily from", "1-min bars", "1-min from", "Volume", "OI"].map((h) => <th key={h} className="p-1.5 text-left font-medium">{h}</th>)}</tr></thead>
              <tbody>{inv.activeContracts.map((c) => (
                <tr key={c.symbol} className="border-t border-zinc-800/60 text-zinc-300">
                  <td className="p-1.5">{c.symbol}</td><td className="p-1.5">{c.expiry}</td><td className="p-1.5">{c.dailyBars}</td><td className="p-1.5">{na(c.dailyFirst)}</td>
                  <td className="p-1.5">{c.minuteBars}</td><td className="p-1.5">{na(c.minuteFirst?.slice(0, 16))}</td><td className="p-1.5">{c.volumePresent ? "yes" : "no"}</td><td className="p-1.5">{c.oiPresent ? "yes" : "no"}</td>
                </tr>))}
              </tbody></table></div>
            <p className="mt-2 text-xs text-zinc-500">
              Listed expiries: {Object.entries(inv.activeExpiries).map(([k, v]) => `${k} ${v.count} (${v.nearest} → ${v.furthest})`).join(" · ")}.
              Underlying index daily history: {Object.entries(inv.underlying).map(([k, v]) => `${k} ${v.dailyBars} bars from ${v.dailyFirst}`).join(" · ")}; intraday from 2022.
              Raw start is not a usable start for every index: see the data-quality notes below.
              Index candles are never used as a substitute for option prices.
              <span className="mt-2 block space-y-1">
                {INDEX_HISTORY_QUALITY.map((q) => (
                  <span key={q.index} className="block">
                    <span className="font-mono text-zinc-300">{q.index}</span>
                    {" "}raw start {q.rawFirstSession} · conservative usable start {q.usableFrom}
                    {q.flatPlaceholderYears ? ` · placeholder (flat, zero-volume) bars: ${q.flatPlaceholderYears}` : ""}
                    {q.duplicateSessions.length ? ` · duplicate sessions: ${q.duplicateSessions.join(", ")}` : ""}
                    {q.warnings.length ? ` · ${q.warnings.join("; ")}` : ""}
                  </span>
                ))}
              </span>
            </p>
          </Card>

          <Card className="p-4">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-zinc-400">Local datasets</h2>
            <ul className="space-y-1 text-xs">
              {inv.localDatasets.map((d) => (
                <li key={d.path} className="flex flex-wrap items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 font-semibold ${CLASS_STYLE[d.class]}`}>{d.class}</span>
                  <span className="font-mono text-zinc-300">{d.path}</span><span className="text-zinc-500">({d.files} files) {d.note}</span>
                </li>))}
            </ul>
          </Card>

          <Card className="space-y-1 p-4 text-sm text-zinc-300">
            <h2 className="mb-1 text-xs font-semibold uppercase tracking-[0.15em] text-zinc-400">What is needed to proceed</h2>
            <p>1. Expired-contract option candles (1- or 5-minute, with volume and OI) for ≥ 2 years. With Upstox, the provider has refused this access; the code it returned is shown on the Option History page (earlier notes linked it to the <b>Plus plan</b>, UDAPI1149, which has not been re-confirmed). A licensed NSE historical F&O data vendor is the alternative.</p>
            <p>2. Historical lot sizes and the expiry calendar for the same period (NSE circulars), since both changed over time.</p>
            <p>3. Ideally historical bid/ask or spread data. Without it, fills must use a documented conservative spread model and cannot be called executable.</p>
            <p>4. Then a pre-registered hypothesis (entries, exits, sizing, costs, benchmark, development and untouched validation periods), as for every earlier strategy.</p>
          </Card>

          <Card className="space-y-1 p-4 text-xs text-zinc-400">
            <h2 className="mb-1 font-semibold uppercase tracking-[0.15em]">In-house IV / Greeks model (for future use)</h2>
            <p>Black-Scholes, European exercise (index options), risk-free rate 6.5% (app constant), no dividend yield, expiry at 15:30 IST on expiry day, IV solved by bisection between 0.1% and 500%; unsolvable prices (below intrinsic) return no value.</p>
            <p>Three kinds are kept distinct: source-supplied (none historical), recomputed from timestamped historical prices, and inferred from unverified inputs (never used for ranking, risk or profitability). Passing model tests does not prove the input prices are accurate.</p>
          </Card>

          <Card className="p-4 text-xs text-zinc-400">
            <h2 className="mb-1 font-semibold uppercase tracking-[0.15em]">Run history</h2>
            <p>Inventories: {all.map((i) => i.id).join(", ")}. Experiments run: <b>none</b>. No experiment can run on the current data.</p>
          </Card>
        </>
      )}
    </div>
  );
}
