"use client";

import { useEffect, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "./ui";

type Point = { t: string; close: number; ema9: number | null; ema21: number | null; vwap: number | null };
type Resp = { series: Point[]; status: string; unavailableReason: string | null; source: string; fetchedAt: string | null; error?: string };

const INDICES = [
  ["nifty", "NIFTY 50"],
  ["banknifty", "BANK NIFTY"],
] as const;
const TFS = ["5m", "15m", "30m", "1h"] as const;
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
    <div className="flex rounded border border-zinc-700 p-0.5 text-xs">
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          aria-pressed={v === value}
          className={`rounded px-2 py-0.5 ${v === value ? "bg-zinc-700 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"}`}
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

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/technical/${index}?timeframe=${tf}`)
      .then((r) => r.json())
      .then((d: Resp) => !cancelled && setData(d))
      .catch(() => !cancelled && setData({ series: [], status: "UNAVAILABLE", unavailableReason: "Request failed", source: "UNAVAILABLE", fetchedAt: null }));
    return () => {
      cancelled = true;
    };
  }, [index, tf]);

  const series = data?.series ?? [];
  const hasVwap = series.some((p) => p.vwap !== null);
  const loading = data === null;

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-xs font-semibold uppercase tracking-[0.15em] text-zinc-400">Price · EMA 9 / 21 · VWAP</h2>
        <Toggle value={index} options={INDICES} onChange={(v) => (setIndex(v), setData(null))} />
        <Toggle value={tf} options={TFS.map((t) => [t, t.toUpperCase()] as const)} onChange={(v) => (setTf(v), setData(null))} />
      </div>

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
            <span>Source {data.source === "LIVE" ? "UPSTOX (LIVE)" : data.source}</span>
            {data.fetchedAt && <span>Fetched {ist(data.fetchedAt)} IST</span>}
            <span>Last {series.length} candles · times IST</span>
            {!hasVwap && <span>Spot VWAP N/A (index candles carry no volume); futures VWAP is on the market card</span>}
          </div>
        </>
      )}
    </Card>
  );
}
