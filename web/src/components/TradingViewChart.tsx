"use client";

import { useEffect, useRef, useState } from "react";
import { getTradingViewSymbol, getTradingViewChartUrl, getTradingViewWidgetEmbedUrl } from "@/lib/tradingView";
import { ExternalLink, BarChart3, LineChart as LineChartIcon, RefreshCw } from "lucide-react";

export interface TradingViewChartProps {
  symbol?: string;
  timeframe?: string; // "1" | "5" | "15" | "30" | "60" | "D"
  height?: number;
  className?: string;
  showToolbar?: boolean;
}

export function TradingViewChart({
  symbol = "NIFTY",
  timeframe = "15",
  height = 460,
  className = "",
  showToolbar = true,
}: TradingViewChartProps) {
  const tvSymbol = getTradingViewSymbol(symbol);
  const [currentTf, setCurrentTf] = useState(timeframe);
  const [chartKey, setChartKey] = useState(0);

  // Timeframe options compatible with TradingView
  const tfOptions: { label: string; value: string }[] = [
    { label: "1m", value: "1" },
    { label: "5m", value: "5" },
    { label: "15m", value: "15" },
    { label: "1h", value: "60" },
    { label: "1D", value: "D" },
  ];

  const embedUrl = getTradingViewWidgetEmbedUrl(tvSymbol, currentTf, "dark");
  const externalUrl = getTradingViewChartUrl(tvSymbol, currentTf);

  return (
    <div className={`flex flex-col rounded-xl border border-zinc-800 bg-[#09090b] overflow-hidden ${className}`}>
      {showToolbar && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 bg-zinc-950/60 px-3.5 py-2">
          <div className="flex items-center gap-2.5">
            <span className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-zinc-100">
              <BarChart3 size={15} className="text-sky-400" />
              {tvSymbol}
            </span>
            <span className="rounded bg-sky-950/60 border border-sky-800/50 px-1.5 py-0.5 text-[10px] font-medium text-sky-400">
              TradingView Live
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Timeframe selector */}
            <div className="flex rounded-lg border border-zinc-800 bg-zinc-900/80 p-0.5 text-xs">
              {tfOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setCurrentTf(opt.value);
                    setChartKey((k) => k + 1);
                  }}
                  className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                    currentTf === opt.value
                      ? "bg-sky-500 text-zinc-950 font-semibold shadow-sm"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Refresh chart button */}
            <button
              type="button"
              onClick={() => setChartKey((k) => k + 1)}
              title="Reload Chart"
              className="inline-flex items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/60 p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
            >
              <RefreshCw size={13} />
            </button>

            {/* Direct TradingView Link */}
            <a
              href={externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900/80 px-2 py-1 text-xs font-medium text-zinc-300 hover:border-sky-500 hover:text-sky-300 transition-colors"
            >
              <span>Open in TradingView</span>
              <ExternalLink size={12} />
            </a>
          </div>
        </div>
      )}

      {/* Embedded TradingView Iframe Widget */}
      <div className="relative w-full" style={{ height }}>
        <iframe
          key={`${tvSymbol}-${currentTf}-${chartKey}`}
          title={`TradingView Chart - ${tvSymbol}`}
          src={embedUrl}
          className="h-full w-full border-0"
          loading="lazy"
          allow="fullscreen"
        />
      </div>
    </div>
  );
}
