"use client";

import { useState, Fragment } from "react";
import { ChevronRight } from "lucide-react";
import { getTradingViewChartUrl } from "@/lib/tradingView";
import type { Analysis } from "@/lib/types";

const fmt = (n: number | null | undefined, d = 2) =>
  typeof n === "number" && Number.isFinite(n) ? n.toFixed(d) : "—";

export function MarketPulseTable({ analyses }: { analyses: Analysis[] }) {
  const [expandedIndex, setExpandedIndex] = useState<string | null>(null);

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950/60 overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Market Pulse (8 Underlyings)</h2>
          <p className="text-[11px] text-zinc-400">
            Click any row to inspect EMAs, VWAP, ATR, Opening Range &amp; Breadth
          </p>
        </div>
        <span className="text-[11px] font-mono text-zinc-500">{analyses.length} active</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-zinc-800/80 bg-zinc-900/50 text-[11px] uppercase tracking-wider text-zinc-400">
            <tr>
              <th className="px-4 py-2.5">Symbol</th>
              <th className="px-3 py-2.5">Spot &amp; %</th>
              <th className="px-3 py-2.5">Trend</th>
              <th className="px-3 py-2.5">PCR</th>
              <th className="px-3 py-2.5">ATM IV</th>
              <th className="px-3 py-2.5">Score</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5 text-right">Chart</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {analyses.map((a) => {
              const s = a.snapshot;
              const c = a.chain;
              const t = s.technical;
              const ind = s.indicators;
              const isOpen = expandedIndex === s.index;
              const spot = s.spot;
              const prev = s.prevClose;
              const chgPct = spot && prev ? ((spot - prev) / prev) * 100 : null;
              const trendState = t?.trend?.state ?? "NEUTRAL";
              const trendDir = t?.trend?.direction ?? 0;
              const pcr = c?.pcrOi ?? null;
              const atmIv = c?.atmIv?.average ?? null;
              const score = a.factors?.length ? Math.round((a.factors.filter((f) => f.available).length / a.factors.length) * 100) : null;
              const src = s.sources?.market?.source ?? "UNAVAILABLE";

              return (
                <Fragment key={s.index}>
                  <tr
                    onClick={() => setExpandedIndex(isOpen ? null : s.index)}
                    className="cursor-pointer hover:bg-zinc-900/50 transition-colors"
                  >
                    <td className="px-4 py-2.5 font-semibold text-zinc-100">
                      <div className="flex items-center gap-1.5">
                        <ChevronRight
                          size={14}
                          className={`text-zinc-500 transition-transform ${
                            isOpen ? "rotate-90 text-zinc-200" : ""
                          }`}
                        />
                        <span>{s.index.toUpperCase()}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-zinc-200">
                      {spot ? spot.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—"}
                      {chgPct !== null && (
                        <span
                          className={`ml-1.5 text-[11px] ${
                            chgPct >= 0 ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {chgPct >= 0 ? "+" : ""}
                          {chgPct.toFixed(2)}%
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          trendDir >= 0.2
                            ? "bg-emerald-950/60 text-emerald-300"
                            : trendDir <= -0.2
                              ? "bg-rose-950/60 text-rose-300"
                              : "bg-zinc-800 text-zinc-300"
                        }`}
                      >
                        {trendState.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-zinc-300">{fmt(pcr)}</td>
                    <td className="px-3 py-2.5 font-mono text-zinc-300">
                      {atmIv !== null ? `${fmt(atmIv, 1)}%` : "—"}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-zinc-200">
                      {score !== null ? `${Math.round(score)}/100` : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          src === "LIVE"
                            ? "bg-emerald-950/50 text-emerald-300"
                            : src === "END_OF_DAY"
                              ? "bg-sky-950/50 text-sky-300"
                              : "bg-amber-950/50 text-amber-300"
                        }`}
                      >
                        {src}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <a
                        href={getTradingViewChartUrl(s.index.toUpperCase(), "15")}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-400 hover:text-sky-300 hover:underline"
                      >
                        TV ↗
                      </a>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-zinc-900/40">
                      <td colSpan={8} className="px-6 py-3">
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-xs">
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                              EMAs
                            </div>
                            <div className="mt-1 font-mono text-zinc-300">
                              EMA9: {fmt(ind?.ema9)} · EMA21: {fmt(ind?.ema21)}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                              VWAP &amp; ATR
                            </div>
                            <div className="mt-1 font-mono text-zinc-300">
                              VWAP: {fmt(ind?.vwap)} · ATR: {fmt(t?.atr)}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                              Opening Range
                            </div>
                            <div className="mt-1 font-mono text-zinc-300">
                              {t?.openingRangeLow != null && t?.openingRangeHigh != null
                                ? `${fmt(t.openingRangeLow)} – ${fmt(t.openingRangeHigh)}`
                                : "—"}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                              Market Breadth
                            </div>
                            <div className="mt-1 font-mono text-zinc-300">
                              {s.breadth
                                ? `Adv ${s.breadth.advances} / Dec ${s.breadth.declines}`
                                : "Unavailable"}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
