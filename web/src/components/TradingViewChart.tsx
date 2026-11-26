"use client";

import { useEffect, useRef, useState } from "react";
import { getTradingViewSymbol, getTradingViewChartUrl } from "@/lib/tradingView";
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

function normalizeTradingViewInterval(tf: string): string {
  const clean = tf.trim().toLowerCase();
  if (clean === "1m" || clean === "1") return "1";
  if (clean === "5m" || clean === "5") return "5";
  if (clean === "15m" || clean === "15") return "15";
  if (clean === "30m" || clean === "30") return "30";
  if (clean === "1h" || clean === "60m" || clean === "60") return "60";
  if (clean === "4h" || clean === "240") return "240";
  if (clean === "1d" || clean === "d") return "D";
  if (clean === "1w" || clean === "w") return "W";
  return tf;
}

export function TradingViewChart({
  symbol = "NIFTY",
  timeframe = "15",
  height = 460,
  className = "",
  showToolbar = true,
  showInstrumentSelector = false,
}: TradingViewChartProps) {
  const normTf = normalizeTradingViewInterval(timeframe);
  const [prevProps, setPrevProps] = useState({ symbol, timeframe: normTf });
  const [activeSymbol, setActiveSymbol] = useState(symbol);
  const [currentTf, setCurrentTf] = useState(normTf);
  const [chartKey, setChartKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync state when props change during render
  if (symbol !== prevProps.symbol || normTf !== prevProps.timeframe) {
    setPrevProps({ symbol, timeframe: normTf });
    setActiveSymbol(symbol);
    setCurrentTf(normTf);
    setLoading(true);
    setLoadError(false);
  }

  const tvSymbol = getTradingViewSymbol(activeSymbol);
  const externalUrl = getTradingViewChartUrl(tvSymbol, currentTf);

  // Timeframe options compatible with TradingView
  const tfOptions: { label: string; value: string }[] = [
    { label: "1m", value: "1" },
    { label: "5m", value: "5" },
    { label: "15m", value: "15" },
    { label: "1h", value: "60" },
    { label: "1D", value: "D" },
  ];

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Reset container contents and flags
    container.innerHTML = "";
    setLoading(true);
    setLoadError(false);

    // Inner widget slot expected by TradingView script
    const widgetSlot = document.createElement("div");
    widgetSlot.className = "tradingview-widget-container__widget";
    widgetSlot.style.height = "100%";
    widgetSlot.style.width = "100%";
    container.appendChild(widgetSlot);

    // Append official TradingView script with structured configuration
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;

    const widgetConfig = {
      autosize: true,
      symbol: tvSymbol,
      interval: currentTf,
      timezone: "Asia/Kolkata",
      theme: "dark",
      style: "1",
      locale: "en",
      enable_publishing: false,
      allow_symbol_change: true,
      calendar: false,
      support_host: "https://www.tradingview.com",
      hide_top_toolbar: false,
      hide_legend: false,
      save_image: false,
      backgroundColor: "rgba(9, 9, 11, 1)",
      gridColor: "rgba(39, 39, 42, 0.4)",
    };

    script.innerHTML = JSON.stringify(widgetConfig);

    script.onerror = () => {
      setLoading(false);
      setLoadError(true);
    };

    container.appendChild(script);

    // Safety timeout to dismiss loading overlay once embed initializes
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1500);

    return () => {
      clearTimeout(timer);
      if (container) {
        container.innerHTML = "";
      }
    };
  }, [tvSymbol, currentTf, chartKey]);

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
              onClick={() => {
                setLoading(true);
                setLoadError(false);
                setChartKey((k) => k + 1);
              }}
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

      {/* Embedded TradingView Advanced Chart Widget */}
      <div className="relative w-full overflow-hidden" style={{ height: `${height}px` }}>
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/80 text-xs text-zinc-400 z-10 pointer-events-none">
            <RefreshCw size={18} className="animate-spin text-sky-400 mb-2" />
            <span>Loading TradingView chart for {tvSymbol}…</span>
          </div>
        )}

        <div
          ref={containerRef}
          className="tradingview-widget-container h-full w-full"
          style={{ height: "100%", width: "100%" }}
        />

        {loadError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/95 p-6 text-center z-20">
            <BarChart3 size={32} className="text-amber-400 mb-2" />
            <p className="text-sm font-semibold text-zinc-200">Unable to embed TradingView chart directly</p>
            <p className="text-xs text-zinc-400 mt-1 mb-4 max-w-sm">
              Your browser or network may restrict external chart scripts. You can open the live chart directly on TradingView:
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
