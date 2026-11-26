import { Badge, Card, Stat } from "@/components/ui";
import { CandleChart, type Mark, type Overlay, type Level } from "@/components/research/CandleChart";
import { LineChart } from "@/components/research/LineChart";
import { TodaySwingPickCard } from "@/components/research/TodaySwingPickCard";
import { buildChartPayload, equityAndDrawdown, loadDevelopment, loadTradesFile, toChartTime, type TradeRecord } from "@/lib/stockV2Dashboard";

// Stock V2 research explorer. Reads stored historical research only. No broker or market-data request is made.
// Historical results are never presented as live. Failed candidates remain visible and are never promoted.
export const dynamic = "force-dynamic";

type Scenario = { metrics: Record<string, number | null | Record<string, number>>; sessionStatus: Record<string, number>; rejectionCounts: Record<string, number>; byMonth: Record<string, { trades: number; netPnl: number; expectancyR: number | null }> };
type Candidate = { strategy: string; base: Scenario; conservative: Scenario; adverse: Scenario };

const RULES: Record<string, string> = {
  TREND_RECLAIM: "LONG: EMA9 > EMA21 and close > session VWAP. SHORT: mirror. Signal on bar i close; entry at bar i+1 open (adverse slippage). Stop: session low (high for SHORT) minus 0.15 × ATR proxy. Target: close ± 1.2 × ATR proxy. Reward-to-risk must be ≥ 1.5.",
  PULLBACK_RECLAIM: "Trend as above, plus a touch of EMA21 within the previous 3 bars and a close back through EMA9 and VWAP. Same entry, stop, target and 1.5 minimum reward-to-risk.",
  ORB_CONTINUATION: "First close beyond the completed 09:15–09:29 opening range, confirmed by EMA9/EMA21 direction and session VWAP. Entry is the next minute open with adverse slippage; the same causal stop, target and cost model applies.",
};
const fmt = (v: unknown, d = 2) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : "N/A");
const inr = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? `₹${Math.round(v).toLocaleString("en-IN")}` : "N/A");
const pick = (v: string | string[] | undefined, allowed: string[], fallback: string) => {
  const s = Array.isArray(v) ? v[0] : v;
  return s && allowed.includes(s) ? s : fallback;
};

export default async function StockV2Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const dev = loadDevelopment();
  const trades = loadTradesFile();
  const candidates = (dev?.candidates ?? []) as Candidate[];
  const strategy = pick(sp.strategy, Object.keys(RULES), "TREND_RECLAIM");
  const side = pick(sp.side, ["ALL", "LONG", "SHORT"], "ALL");
  const exit = pick(sp.exit, ["ALL", "STOP", "TARGET", "TIME", "GAP_EXIT"], "ALL");
  const symbolFilter = (Array.isArray(sp.symbol) ? sp.symbol[0] : sp.symbol)?.toUpperCase().replace(/[^A-Z0-9&-]/g, "") ?? "";
  const all: TradeRecord[] = (trades?.[strategy] ?? []) as TradeRecord[];
  const filtered = all
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => (side === "ALL" || t.side === side) && (exit === "ALL" || t.exitReason === exit) && (!symbolFilter || t.symbol === symbolFilter));
  const selectedIdx = Number(Array.isArray(sp.trade) ? sp.trade[0] : sp.trade);
  const selected = Number.isInteger(selectedIdx) && all[selectedIdx] ? all[selectedIdx] : null;
  const chart = selected ? buildChartPayload(selected.symbol, selected.date) : null;
  const curves = equityAndDrawdown(all);
  const cand = candidates.find((c) => c.strategy === strategy);

  const marks: Mark[] = selected
    ? [
        { time: toChartTime(selected.entryTime), side: selected.side, kind: "ENTRY", text: `${selected.side} entry ${fmt(selected.entryFill)}` },
        { time: toChartTime(selected.exitTime), side: selected.side, kind: "EXIT", text: `${selected.exitReason} ${fmt(selected.exitFill)}` },
      ]
    : [];
  const levels: Level[] = selected
    ? [
        { price: selected.stop, color: "#f87171", title: "stop" },
        { price: selected.target, color: "#34d399", title: "target" },
      ]
    : [];
  const overlays: Overlay[] = chart
    ? [
        { name: "EMA 9", color: "#38bdf8", data: chart.ema9 },
        { name: "EMA 21", color: "#fbbf24", data: chart.ema21 },
        { name: "EMA 50", color: "#c084fc", data: chart.ema50 },
        { name: "EMA 200", color: "#a1a1aa", data: chart.ema200 },
        { name: "VWAP (session)", color: "#f472b6", data: chart.vwap },
      ]
    : [];

  return (
    <div className="mx-auto max-w-6xl space-y-4 text-zinc-200">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold text-zinc-50">Stock V2 — historical research explorer</h1>
        <Badge tone="warn">HISTORICAL RESEARCH · NOT LIVE</Badge>
        <Badge tone="bear">NO-GO · 3 CANDIDATES REJECTED</Badge>
        <Badge tone="warn">RECOMMENDATION-ONLY · NO ORDERS</Badge>
      </header>

      <TodaySwingPickCard />

      {!dev ? (
        <Card className="p-4 text-sm text-amber-300">No stored development results in .research-data/stock-v2/.</Card>
      ) : (
        <>
          <Card className="grid gap-3 p-4 text-sm sm:grid-cols-2">
            <div>
              <div className="text-xs uppercase tracking-wider text-zinc-400">Development (40 sessions)</div>
              <p className="text-zinc-300">
                {dev.provenance.developmentDates[0]} to {dev.provenance.developmentDates.at(-1)} · {dev.provenance.symbols} stocks · completed. Selection rule applied once: no candidate passed.
              </p>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-zinc-400">Validation (20 sessions)</div>
              <p className="text-zinc-300">NOT RUN. Trend Reclaim, Pullback Reclaim and ORB Continuation all failed development, so the protocol stopped before validation.</p>
            </div>
          </Card>

          <Card className="space-y-2 border-amber-500/40 p-4 text-sm">
            <div className="text-xs uppercase tracking-wider text-amber-300">Warnings and limitations</div>
            <ul className="list-disc space-y-1 pl-5 text-zinc-300">
              <li>Gate mode is CORE: market state, event risk, India VIX, NIFTY ATR and verified-stock count are <b>not evaluated</b> (not in the dataset). These results do not validate the Full specification.</li>
              <li>Survivorship bias: the 50 stocks are one 2026-11-04 constituent snapshot applied to all sessions. Not corrected.</li>
              <li>Costs are assumptions (brokerage, STT, exchange, GST, stamp, SEBI, slippage 0.05%). Verify against the broker schedule before quoting net figures.</li>
              <li>No bid/ask data: spread cost is not measured. Stop fills carry slippage that is large relative to tight stops.</li>
              <li>Historical stock data is OK-status research data, not LIVE market data.</li>
            </ul>
          </Card>

          <Card className="space-y-3 p-4">
            <div className="text-xs uppercase tracking-wider text-zinc-400">Strategy comparison (development, CORE, costs as stated)</div>
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-[11px]">
                <thead className="text-zinc-500">
                  <tr><th className="pr-3">Candidate</th><th className="pr-3">Status</th><th className="pr-3">Scenario</th><th className="pr-3">Trades</th><th className="pr-3">Win %</th><th className="pr-3">PF</th><th className="pr-3">Expectancy R</th><th className="pr-3">Net P&amp;L</th><th>Max DD</th></tr>
                </thead>
                <tbody>
                  {candidates.flatMap((c) =>
                    (["base", "conservative", "adverse"] as const).map((sc) => {
                      const m = c[sc].metrics as Record<string, number | null>;
                      return (
                        <tr key={`${c.strategy}-${sc}`} className="border-t border-zinc-800">
                          <td className="pr-3">{c.strategy}</td>
                          <td className="pr-3 text-red-300">FAILED</td>
                          <td className="pr-3">{sc}</td>
                          <td className="pr-3">{m.trades}</td>
                          <td className="pr-3">{fmt((m.winRate ?? 0) * 100, 1)}</td>
                          <td className="pr-3">{fmt(m.profitFactor, 3)}</td>
                          <td className="pr-3">{fmt(m.expectancyR, 3)}</td>
                          <td className="pr-3">{inr(m.netPnl)}</td>
                          <td>{inr(m.maxDrawdownPnl)}</td>
                        </tr>
                      );
                    }),
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-zinc-500">Selection reasons: {Object.entries(dev.selectionReasons).map(([k, v]) => `${k}: ${v}`).join(" · ")}</p>
          </Card>

          <Card className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-xs uppercase tracking-wider text-zinc-400">Strategy</div>
              {(Object.keys(RULES) as string[]).map((k) => (
                <a key={k} href={`?strategy=${k}`} className={`inline-flex min-h-[24px] items-center rounded border px-2 py-1 text-xs ${k === strategy ? "border-zinc-400 bg-zinc-800" : "border-zinc-800 text-zinc-400"}`}>{k}</a>
              ))}
            </div>
            <p className="text-sm text-zinc-300">{RULES[strategy]}</p>
            {cand && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Trades (base, sample size)" value={String(cand.base.metrics.trades)} />
                <Stat label="LONG / SHORT" value={`${cand.base.metrics.longs} / ${cand.base.metrics.shorts}`} />
                <Stat label="Expectancy (base)" value={`${fmt(cand.base.metrics.expectancyR, 3)} R`} tone="bear" />
                <Stat label="Expectancy (conservative)" value={`${fmt(cand.conservative.metrics.expectancyR, 3)} R`} tone="bear" />
                <Stat label="Profit factor (base)" value={fmt(cand.base.metrics.profitFactor, 3)} />
                <Stat label="Net P&L (base)" value={inr(cand.base.metrics.netPnl)} />
                <Stat label="Total charges (base)" value={inr(cand.base.metrics.charges)} />
                <Stat label="Max drawdown (base)" value={inr(cand.base.metrics.maxDrawdownPnl)} />
              </div>
            )}
            <div className="text-xs text-zinc-400">
              Rejections (base): {Object.entries(cand?.base.rejectionCounts ?? {}).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="space-y-2 p-4">
              <div className="text-xs uppercase tracking-wider text-zinc-400">Equity curve (net ₹, base, {strategy}) — historical</div>
              <LineChart data={curves.equity} color="#34d399" title="Equity (net ₹)" />
            </Card>
            <Card className="space-y-2 p-4">
              <div className="text-xs uppercase tracking-wider text-zinc-400">Drawdown (₹ from peak) — historical</div>
              <LineChart data={curves.drawdown} color="#f87171" title="Drawdown (₹)" />
            </Card>
          </div>

          <Card className="space-y-3 p-4">
            <div className="text-xs uppercase tracking-wider text-zinc-400">Monthly results (development, base)</div>
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-[11px]">
                <thead className="text-zinc-500"><tr><th className="pr-3">Month</th><th className="pr-3">Trades</th><th className="pr-3">Net P&amp;L</th><th>Expectancy R</th></tr></thead>
                <tbody>
                  {Object.entries(cand?.base.byMonth ?? {}).sort().map(([m, v]) => (
                    <tr key={m} className="border-t border-zinc-800"><td className="pr-3">{m}</td><td className="pr-3">{v.trades}</td><td className="pr-3">{inr(v.netPnl)}</td><td>{fmt(v.expectancyR, 3)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="space-y-3 p-4">
            <div className="text-xs uppercase tracking-wider text-zinc-400">Trade explorer — {filtered.length} of {all.length} trades</div>
            <form method="get" className="flex flex-wrap items-end gap-2 text-xs">
              <input type="hidden" name="strategy" value={strategy} />
              <label className="flex flex-col">Side
                <select name="side" defaultValue={side} className="rounded bg-zinc-900 p-1"><option value="ALL">ALL</option><option value="LONG">LONG</option><option value="SHORT">SHORT</option></select>
              </label>
              <label className="flex flex-col">Exit
                <select name="exit" defaultValue={exit} className="rounded bg-zinc-900 p-1"><option value="ALL">ALL</option><option value="STOP">STOP</option><option value="TARGET">TARGET</option><option value="TIME">TIME</option><option value="GAP_EXIT">GAP_EXIT</option></select>
              </label>
              <label className="flex flex-col">Symbol
                <input name="symbol" defaultValue={symbolFilter} placeholder="e.g. RELIANCE" className="rounded bg-zinc-900 p-1" />
              </label>
              <button type="submit" className="rounded border border-zinc-700 px-3 py-1">Apply</button>
            </form>
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-[11px]">
                <thead className="text-zinc-500">
                  <tr><th className="pr-2">Date</th><th className="pr-2">Symbol</th><th className="pr-2">Side</th><th className="pr-2">Entry</th><th className="pr-2">Stop</th><th className="pr-2">Target</th><th className="pr-2">Exit</th><th className="pr-2">Reason</th><th className="pr-2">Net ₹</th><th className="pr-2">Net R</th><th></th></tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 100).map(({ t, i }) => (
                    <tr key={i} className="border-t border-zinc-800">
                      <td className="pr-2">{t.date}</td><td className="pr-2">{t.symbol}</td><td className="pr-2">{t.side}</td>
                      <td className="pr-2">{t.entryTime.slice(11, 16)} @{fmt(t.entryFill)}</td><td className="pr-2">{fmt(t.stop)}</td><td className="pr-2">{fmt(t.target)}</td>
                      <td className="pr-2">{t.exitTime.slice(11, 16)} @{fmt(t.exitFill)}</td><td className="pr-2">{t.exitReason}</td>
                      <td className="pr-2">{inr(t.netPnl)}</td><td className="pr-2">{fmt(t.netR)}</td>
                      <td><a className="inline-flex min-h-[24px] min-w-[24px] items-center px-1 py-1 text-sky-400" href={`?strategy=${strategy}&side=${side}&exit=${exit}&symbol=${symbolFilter}&trade=${i}`}>chart</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length > 100 && <p className="text-xs text-zinc-500">Showing the first 100 matching trades. Narrow the filters to see more.</p>}
          </Card>

          {selected && (
            <Card className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-xs uppercase tracking-wider text-zinc-400">Selected trade — {selected.symbol} {selected.date} · {selected.side}</div>
                <Badge tone="warn">HISTORICAL</Badge>
              </div>
              {chart ? (
                <CandleChart candles={chart.candles} overlays={overlays} marks={marks} levels={levels} />
              ) : (
                <p className="text-sm text-amber-300">The stored session for this trade could not be loaded. No chart is drawn.</p>
              )}
              <p className="text-xs text-zinc-500">Overlays: EMA 9/21/50/200 use stored minute bars from earlier sessions onward (causal). VWAP is session-anchored. Markers: entry at the next bar&apos;s open; exit at the stored fill. Axis times are IST.</p>
              <div className="grid gap-2 text-xs sm:grid-cols-2">
                <div>Signal bar: {selected.signalTime.slice(11, 16)} IST · entry bar: {selected.entryTime.slice(11, 16)} IST (next minute, contiguous)</div>
                <div>Entry fill {fmt(selected.entryFill)} (adverse slippage applied) · stop {fmt(selected.stop)} · target {fmt(selected.target)} · planned R:R {fmt(selected.plannedRR)}</div>
                <div>Exit {selected.exitReason} at {fmt(selected.exitFill)} at {selected.exitTime.slice(11, 16)} IST · held {fmt(selected.holdMinutes, 0)} min</div>
                <div>Qty {selected.qty} · notional {inr(selected.notional)} · risk {inr(selected.riskAmount)} (1% budget, capped by capital)</div>
                <div>Gross {inr(selected.grossPnl)} · charges {inr(selected.charges)} · net {inr(selected.netPnl)} · net R {fmt(selected.netR, 3)}</div>
                <div>Rule: {RULES[selected.strategy] ?? ""}</div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
