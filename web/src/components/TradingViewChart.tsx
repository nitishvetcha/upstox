"use client";

import { useState } from "react";
import { getTradingViewSymbol, getTradingViewChartUrl, getTradingViewWidgetEmbedUrl } from "@/lib/tradingView";
import { ExternalLink, BarChart3, RefreshCw } from "lucide-react";

export interface TradingViewChartProps {
  symbol?: string;
  timeframe?: string; // "1" | "5" | "15" | "30" | "60" | "D"
  height?: number;
  className?: string;
  showToolbar?: boolean;
  showInstrumentSelector?: boolean;
}

const DEFAULT_INSTRUMENTS: { label: string; value: string }[] = [
  { label: "NIFTY", value: "NIFTY" },
  { label: "BANK NIFTY", value: "BANKNIFTY" },
  { label: "FIN NIFTY", value: "FINNIFTY" },
  { label: "MIDCP NIFTY", value: "MIDCPNIFTY" },
  { label: "SENSEX", value: "SENSEX" },
  { label: "BANKEX", value: "BANKEX" },
  { label: "CRUDE OIL", value: "CRUDEOIL" },
  { label: "NATURAL GAS", value: "NATURALGAS" },
];

export function TradingViewChart({
  symbol = "NIFTY",
  timeframe = "15",
  height = 460,
  className = "",
  showToolbar = true,
  showInstrumentSelector = false,
}: TradingViewChartProps) {
  const [prevProps, setPrevProps] = useState({ symbol, timeframe });
  const [activeSymbol, setActiveSymbol] = useState(symbol);
  const [currentTf, setCurrentTf] = useState(timeframe);
  const [chartKey, setChartKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // Sync state when props change during render (standard React pattern avoiding cascading renders in effects)
  if (symbol !== prevProps.symbol || timeframe !== prevProps.timeframe) {
    setPrevProps({ symbol, timeframe });
    setActiveSymbol(symbol);
    setCurrentTf(timeframe);
    setLoading(true);
    setLoadError(false);
  }

  const tvSymbol = getTradingViewSymbol(activeSymbol);

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
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-zinc-100">
              <BarChart3 size={15} className="text-sky-400" />
              {tvSymbol}
            </span>
            <span className="rounded bg-sky-950/60 border border-sky-800/50 px-1.5 py-0.5 text-[10px] font-medium text-sky-400">
              TradingView Live
            </span>

            {/* Quick Instrument Switcher */}
            {showInstrumentSelector && (
              <div className="ml-2 flex flex-wrap rounded-lg border border-zinc-800 bg-zinc-900/80 p-0.5 text-xs">
                {DEFAULT_INSTRUMENTS.map((inst) => {
                  const instTvSymbol = getTradingViewSymbol(inst.value);
                  const isSelected = tvSymbol === instTvSymbol;
                  return (
                    <button
                      key={inst.value}
                      type="button"
                      onClick={() => {
                        setActiveSymbol(inst.value);
                        setLoading(true);
                        setLoadError(false);
                        setChartKey((k) => k + 1);
                      }}
                      className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                        isSelected
                          ? "bg-sky-600 text-white font-semibold shadow-sm"
                          : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      {inst.label}
                    </button>
                  );
                })}
              </div>
            )}
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
                    setLoading(true);
                    setLoadError(false);
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
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/80 text-xs text-zinc-400 z-10">
            <RefreshCw size={18} className="animate-spin text-sky-400 mb-2" />
            <span>Loading TradingView chart for {tvSymbol}…</span>
          </div>
        )}
        <iframe
          key={`${tvSymbol}-${currentTf}-${chartKey}`}
          title={`TradingView Chart - ${tvSymbol}`}
          src={embedUrl}
          className="h-full w-full border-0"
          loading="lazy"
          allow="fullscreen"
          onLoad={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setLoadError(true);
          }}
        />
        {loadError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/95 p-6 text-center z-20">
            <BarChart3 size={32} className="text-amber-400 mb-2" />
            <p className="text-sm font-semibold text-zinc-200">Unable to embed TradingView chart directly</p>
            <p className="text-xs text-zinc-400 mt-1 mb-4 max-w-sm">
              Your browser or network may restrict cross-origin iframe widgets. You can open the live chart directly on TradingView:
            </p>
            <div className="flex items-center gap-3">
              <a
                href={externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 shadow-sm transition-colors"
              >
                <span>Open {tvSymbol} on TradingView</span>
                <ExternalLink size={13} />
              </a>
              <button
                type="button"
                onClick={() => {
                  setLoadError(false);
                  setLoading(true);
                  setChartKey((k) => k + 1);
                }}
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:text-white"
              >
                Retry
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
