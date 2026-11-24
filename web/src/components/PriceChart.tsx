"use client";

import { useEffect, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "./ui";
import { INDICES as INDEX_IDS, INSTRUMENTS } from "@/lib/services/instrumentRegistry";
import { CHART_TIMEFRAMES } from "@/lib/uiConfig";
import { hasAnyIndicator, indicatorGroups, statusBadge, type TechnicalPayload } from "@/lib/technicalDisplay";
import { TradingViewChart } from "./TradingViewChart";
import { getTradingViewChartUrl } from "@/lib/tradingView";
import { ExternalLink, BarChart3, LineChart as ChartIcon } from "lucide-react";

type Point = { t: string; close: number; ema9: number | null; ema21: number | null; vwap: number | null };
type Resp = TechnicalPayload & { series: Point[]; error?: string };
const BADGE_TONE = { ok: "text-emerald-400 border-emerald-800", warn: "text-amber-400 border-amber-800", bad: "text-red-400 border-red-800" } as const;

// Index list comes from the instrument registry (single source of truth), not typed here.
const INDICES = INDEX_IDS.map((id) => [id, INSTRUMENTS[id].name] as const);
const TFS = CHART_TIMEFRAMES;
// Validated (dark surface): categorical slots blue / orange / violet; price stays neutral ink.
const COLORS = { close: "#d4d4d8", ema9: "#3987e5", ema21: "#d95926", vwap: "#9085e9" };

const ist = (iso: string, withDate = false) =>
  new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...(withDate ? { day: "2-digit", month: "short" } : {}),
  });

function Toggle<T extends string>({ value, options, onChange }: { value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap max-w-full rounded border border-zinc-700 p-0.5 text-xs">
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          aria-pressed={v === value}
          className={`min-h-[24px] min-w-[24px] rounded px-2 py-1 ${v === value ? "bg-zinc-700 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// Close price with EMA 9 / EMA 21 / VWAP overlays from GET /api/technical/[index] (backend-aggregated; one call per change).
export function PriceChart() {
  const [index, setIndex] = useState<(typeof INDICES)[number][0]>("nifty");
  const [tf, setTf] = useState<(typeof TFS)[number]>("15m");
  const [data, setData] = useState<Resp | null>(null);
  const [chartMode, setChartMode] = useState<"tradingview" | "recharts">("tradingview");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/technical/${index}?timeframe=${tf}`)
      .then(async (r) => {
        const d = await r.json().catch(() => null);
        // An error body has no series: reject it so the chart shows "Request failed", not a crash.
        if (!r.ok || !d || !Array.isArray(d.series)) throw new Error("technical series unavailable");
        return d as Resp;
      })
      .then((d: Resp) => !cancelled && setData(d))
      .catch(() => !cancelled && setData({ series: [], status: "UNAVAILABLE", unavailableReason: "Request failed", source: "UNAVAILABLE", fetchedAt: null }));
    return () => {
      cancelled = true;
    };
  }, [index, tf]);

  const series = data?.series ?? [];
  const hasVwap = series.some((p) => p.vwap !== null);
  const loading = data === null;
  const badge = data ? statusBadge(data.status, data.source) : null;
  const groups = data ? indicatorGroups(data) : [];
  const anyIndicator = data ? hasAnyIndicator(data) : false;

  const tvInterval = tf.replace("m", "");

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-xs font-semibold uppercase tracking-[0.15em] text-zinc-400">Technical Charting Terminal</h2>
        <div className="flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900/80 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setChartMode("tradingview")}
            className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold transition-colors ${
              chartMode === "tradingview" ? "bg-sky-500 text-zinc-950 shadow-sm" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <BarChart3 size={13} />
            <span>TradingView</span>
          </button>
          <button
            type="button"
            onClick={() => setChartMode("recharts")}
            className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold transition-colors ${
              chartMode === "recharts" ? "bg-zinc-700 text-zinc-100 shadow-sm" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <ChartIcon size={13} />
            <span>Indicators View</span>
          </button>
        </div>
        <Toggle value={index} options={INDICES} onChange={(v) => (setIndex(v), setData(null))} />
        <Toggle value={tf} options={TFS.map((t) => [t, t.toUpperCase()] as const)} onChange={(v) => (setTf(v), setData(null))} />
        <a
          href={getTradingViewChartUrl(index, tvInterval)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/80 px-2.5 py-1 text-xs font-semibold text-zinc-200 hover:border-sky-500 hover:text-sky-300 transition-colors"
          title="Open official TradingView interactive chart in new tab"
        >
          <span>TradingView Web</span>
          <ExternalLink size={12} />
        </a>
      </div>

      {chartMode === "tradingview" ? (
        <div className="mb-4">
          <TradingViewChart symbol={index} timeframe={tvInterval} height={460} showToolbar={false} />
        </div>
      ) : (
        <>
          {data && badge && (
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
              <span className="font-semibold text-zinc-200">{INSTRUMENTS[index]?.name ?? data.index ?? index.toUpperCase()}</span>
              <span>· {data.timeframe ?? tf} candles</span>
              <span className={`rounded border px-1.5 py-0.5 font-semibold ${BADGE_TONE[badge.tone]}`}>{badge.label}</span>
            </div>
          )}

          {loading ? (
            <div className="flex h-72 items-center justify-center text-sm text-zinc-500">Loading candles…</div>
          ) : !series.length ? (
            <div className="flex h-72 items-center justify-center text-sm text-amber-400">
              Technical data: NOT AVAILABLE{data?.unavailableReason ? ` (${data.unavailableReason})` : ""}
            </div>
          ) : (
            <>
              <div className="h-72" role="img" aria-label={`${index} close price with EMA 9 and EMA 21, ${tf} candles`}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="#27272a" vertical={false} />
                    <XAxis dataKey="t" tickFormatter={(t) => ist(t, tf === "1h")} stroke="#52525b" tick={{ fill: "#a1a1aa", fontSize: 11 }} minTickGap={40} />
                    <YAxis domain={["auto", "auto"]} stroke="#52525b" tick={{ fill: "#a1a1aa", fontSize: 11 }} width={64} tickFormatter={(v: number) => v.toLocaleString("en-IN")} />
                    <Tooltip
                      contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", fontSize: 12 }}
                      labelStyle={{ color: "#a1a1aa" }}
                      itemStyle={{ color: "#e4e4e7" }}
                      labelFormatter={(t) => `${ist(String(t), true)} IST`}
                      formatter={(v) => (typeof v === "number" ? v.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "N/A")}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, color: "#a1a1aa" }} />
                    <Line dataKey="close" name="Close" stroke={COLORS.close} strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line dataKey="ema9" name="EMA 9" stroke={COLORS.ema9} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
                    <Line dataKey="ema21" name="EMA 21" stroke={COLORS.ema21} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
                    {hasVwap && <Line dataKey="vwap" name="VWAP" stroke={COLORS.vwap} strokeWidth={2} dot={false} isAnimationActive={false} />}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 text-[11px] text-zinc-500">
                <span>Source {data.source ?? "N/A"}</span>
                {(data.lastCandleCloseAt || data.lastCandleAt) && <span>Last candle {ist(String(data.lastCandleCloseAt || data.lastCandleAt), true)} IST</span>}
                {data.fetchedAt && <span>Fetched {ist(data.fetchedAt)} IST</span>}
                <span>Last {series.length} candles · times IST</span>
                {!hasVwap && <span>Spot VWAP N/A (index candles carry no volume)</span>}
              </div>
            </>
          )}
        </>
      )}

      {data && !loading && (
        <div className="mt-4 border-t border-zinc-800 pt-3" aria-label="Technical indicators">
          {!anyIndicator ? (
            <p className="text-sm text-zinc-500">No indicator values in this response{data.unavailableReason ? ` (${data.unavailableReason})` : ""}. Nothing is estimated.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {groups.map((g) => (
                <div key={g.title}>
                  <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{g.title}</h3>
                  <dl className="divide-y divide-zinc-800/60 text-xs">
                    {g.rows.map((row) => (
                      <div key={row.label} className="flex items-baseline justify-between gap-3 py-1">
                        <dt className="text-zinc-400">
                          {row.label}
                          {row.note && <span className="block text-[10px] text-zinc-600">{row.note}</span>}
                        </dt>
                        <dd className={`font-mono ${row.missing ? "text-zinc-600" : "text-zinc-100"}`}>{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
