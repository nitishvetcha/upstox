"use client";

import { useEffect, useState, useTransition, useCallback } from "react";
import {
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  Target,
  BarChart2,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  Sliders,
  Code2,
  ChevronRight,
} from "lucide-react";
import { CandleChart, type Candle as TVCandle, type Mark, type Level, type Overlay } from "@/components/research/CandleChart";
import { TradingViewChart } from "@/components/TradingViewChart";
import type { StrategyValidationReport, HistoricalTrade } from "@/lib/services/strategyHistoricalValidator";

const SYMBOL_OPTIONS = [
  { label: "NIFTY 50", value: "NIFTY" },
  { label: "BANK NIFTY", value: "BANKNIFTY" },
  { label: "FIN NIFTY", value: "FINNIFTY" },
  { label: "RELIANCE", value: "RELIANCE" },
  { label: "HDFC BANK", value: "HDFCBANK" },
  { label: "TCS", value: "TCS" },
];

const TIMEFRAMES = [
  { label: "5 Min", value: "5m" },
  { label: "15 Min (Recommended)", value: "15m" },
  { label: "30 Min", value: "30m" },
];

const RANGES = [
  { label: "15 Days", value: "15" },
  { label: "30 Days (1 Month)", value: "30" },
  { label: "60 Days (2 Months)", value: "60" },
  { label: "90 Days (1 Quarter)", value: "90" },
];

export default function StrategyValidationPage() {
  const [symbol, setSymbol] = useState("NIFTY");
  const [timeframe, setTimeframe] = useState("15m");
  const [days, setDays] = useState("30");
  const [rr1, setRr1] = useState(1.5);
  const [rr2, setRr2] = useState(2.5);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    symbol: string;
    tvSymbol: string;
    tvUrl: string;
    dataSource: string;
    validation: StrategyValidationReport;
    candles: { timestamp: string; open: number; high: number; low: number; close: number; volume: number | null }[];
  } | null>(null);

  const [activeTab, setActiveTab] = useState<"chart" | "tv_embed" | "pine" | "trades">("chart");
  const [selectedTrade, setSelectedTrade] = useState<HistoricalTrade | null>(null);
  const [copiedPine, setCopiedPine] = useState(false);
  const [, startTransition] = useTransition();

  const runValidation = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/strategy/validate?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&days=${days}&rr1=${rr1}&rr2=${rr2}`,
      );
      if (!res.ok) {
        throw new Error(`Validation API returned HTTP ${res.status}`);
      }
      const json = await res.json();
      startTransition(() => {
        setData(json);
        if (json.validation?.trades?.length > 0) {
          setSelectedTrade(json.validation.trades[0]);
        } else {
          setSelectedTrade(null);
        }
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [symbol, timeframe, days, rr1, rr2]);

  useEffect(() => {
    runValidation();
  }, [runValidation]);

  const copyPineCode = () => {
    if (!data?.validation?.pineScript) return;
    navigator.clipboard.writeText(data.validation.pineScript);
    setCopiedPine(true);
    setTimeout(() => setCopiedPine(false), 2500);
  };

  // Convert raw candles to TradingView Lightweight Chart format
  const tvCandles: TVCandle[] =
    data?.candles?.map((c) => ({
      time: Math.floor(new Date(c.timestamp).getTime() / 1000),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    })) ?? [];

  // Convert validator markers to chart marks
  const chartMarks: Mark[] =
    data?.validation?.trades.flatMap((t) => {
      const entryTime = Math.floor(new Date(t.entryTime).getTime() / 1000);
      const exitTime = Math.floor(new Date(t.exitTime).getTime() / 1000);
      const side = t.direction === "CE_LONG" ? ("LONG" as const) : ("SHORT" as const);

      const entryMark: Mark = {
        time: entryTime,
        side,
        kind: "ENTRY",
        text: `${side === "LONG" ? "CE" : "PE"} Entry @ ${t.entryPrice}`,
      };

      const exitMark: Mark = {
        time: exitTime,
        side,
        kind: "EXIT",
        text: `${t.outcome} (${t.pnlR >= 0 ? "+" : ""}${t.pnlR}R)`,
      };

      return [entryMark, exitMark];
    }) ?? [];

  // Selected trade price levels for chart visualization
  const levels: Level[] = selectedTrade
    ? [
        { price: selectedTrade.entryPrice, color: "#38bdf8", title: `Entry: ${selectedTrade.entryPrice}` },
        { price: selectedTrade.stopLoss, color: "#ef4444", title: `Stop: ${selectedTrade.stopLoss}` },
        { price: selectedTrade.target1, color: "#10b981", title: `T1: ${selectedTrade.target1} (+1.5R)` },
        { price: selectedTrade.target2, color: "#34d399", title: `T2: ${selectedTrade.target2} (+2.5R)` },
      ]
    : [];

  const overlays: Overlay[] = [];

  const metrics = data?.validation?.metrics;

  return (
    <div className="space-y-6 p-4 md:p-6 text-zinc-100 max-w-7xl mx-auto">
      {/* Title & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              QUANT STRATEGY VALIDATOR
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-sky-500/10 text-sky-400 border border-sky-500/20">
              TRADINGVIEW PINE SCRIPT v5
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            Strategy Validator & Backtest Engine
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Replay and evaluate ORB + EMA 9/21/50 + VWAP breakout rules across past historical candles with intrabar stop/targets and theta decay limits.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {data?.tvUrl && (
            <a
              href={data.tvUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 border border-zinc-700 transition"
            >
              <ExternalLink className="w-3.5 h-3.5 text-sky-400" />
              Open in TradingView Web
            </a>
          )}
          <button
            onClick={runValidation}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition disabled:opacity-50 shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Simulating..." : "Run Validation"}
          </button>
        </div>
      </div>

      {/* Control Configuration Bar */}
      <div className="p-4 rounded-xl bg-zinc-900/90 border border-zinc-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1">Underlying Asset</label>
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-sky-500"
          >
            {SYMBOL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1">Timeframe</label>
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-sky-500"
          >
            {TIMEFRAMES.map((tf) => (
              <option key={tf.value} value={tf.value}>
                {tf.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1">Historical Period</label>
          <select
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-sky-500"
          >
            {RANGES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1">Target 1 (R:R)</label>
          <select
            value={rr1}
            onChange={(e) => setRr1(Number(e.target.value))}
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-sky-500"
          >
            <option value={1.0}>1:1.0 (Quick Scalp)</option>
            <option value={1.5}>1:1.5 (Standard Target)</option>
            <option value={2.0}>1:2.0 (Trend Runner)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1">Target 2 (R:R)</label>
          <select
            value={rr2}
            onChange={(e) => setRr2(Number(e.target.value))}
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-sky-500"
          >
            <option value={2.0}>1:2.0 (Conservative)</option>
            <option value={2.5}>1:2.5 (Standard Extension)</option>
            <option value={3.0}>1:3.0 (Aggressive)</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center gap-3">
          <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
          <span>Error running validation: {error}</span>
        </div>
      )}

      {/* KPI Performance Summary Cards */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800">
            <span className="text-xs font-medium text-zinc-400 block mb-1">Win Rate</span>
            <div className="flex items-baseline gap-1.5">
              <span className={`text-2xl font-bold ${metrics.winRatePct >= 50 ? "text-emerald-400" : "text-amber-400"}`}>
                {metrics.winRatePct}%
              </span>
            </div>
            <span className="text-[11px] text-zinc-400 mt-1 block">
              {metrics.winningTrades} wins / {metrics.totalTrades} trades
            </span>
          </div>

          <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800">
            <span className="text-xs font-medium text-zinc-400 block mb-1">Profit Factor</span>
            <div className="flex items-baseline gap-1.5">
              <span className={`text-2xl font-bold ${metrics.profitFactor >= 1.5 ? "text-emerald-400" : "text-zinc-200"}`}>
                {metrics.profitFactor.toFixed(2)}
              </span>
            </div>
            <span className="text-[11px] text-zinc-400 mt-1 block">
              {metrics.profitFactor >= 1.5 ? "Robust Edge" : "Marginal"}
            </span>
          </div>

          <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800">
            <span className="text-xs font-medium text-zinc-400 block mb-1">Cumulative P&L</span>
            <div className="flex items-baseline gap-1.5">
              <span className={`text-2xl font-bold ${metrics.netR >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {metrics.netR >= 0 ? "+" : ""}
                {metrics.netR} R
              </span>
            </div>
            <span className="text-[11px] text-zinc-400 mt-1 block">
              Expectancy: {metrics.expectancyR >= 0 ? "+" : ""}
              {metrics.expectancyR} R/trade
            </span>
          </div>

          <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800">
            <span className="text-xs font-medium text-zinc-400 block mb-1">Max Drawdown</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-rose-400">-{metrics.maxDrawdownR} R</span>
            </div>
            <span className="text-[11px] text-zinc-400 mt-1 block">
              {metrics.maxDrawdownPct > 0 ? `${metrics.maxDrawdownPct}% from peak` : "Zero drawdown"}
            </span>
          </div>

          <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800">
            <span className="text-xs font-medium text-zinc-400 block mb-1">CE Long Win Rate</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-sky-400">{metrics.longWinRatePct}%</span>
            </div>
            <span className="text-[11px] text-zinc-400 mt-1 block">{metrics.longTrades} Call signals</span>
          </div>

          <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800">
            <span className="text-xs font-medium text-zinc-400 block mb-1">PE Put Win Rate</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-amber-400">{metrics.shortWinRatePct}%</span>
            </div>
            <span className="text-[11px] text-zinc-400 mt-1 block">{metrics.shortTrades} Put signals</span>
          </div>
        </div>
      )}

      {/* Main View Tabs */}
      <div className="rounded-2xl bg-zinc-900/90 border border-zinc-800 overflow-hidden">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 pt-3 bg-zinc-950/60">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab("chart")}
              className={`px-3.5 py-2 text-xs font-semibold rounded-t-lg transition flex items-center gap-2 border-b-2 ${
                activeTab === "chart"
                  ? "border-sky-500 text-sky-400 bg-zinc-900/80"
                  : "border-transparent text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5" />
              Interactive Validation Chart
            </button>
            <button
              onClick={() => setActiveTab("tv_embed")}
              className={`px-3.5 py-2 text-xs font-semibold rounded-t-lg transition flex items-center gap-2 border-b-2 ${
                activeTab === "tv_embed"
                  ? "border-sky-500 text-sky-400 bg-zinc-900/80"
                  : "border-transparent text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
              TradingView Live Terminal
            </button>
            <button
              onClick={() => setActiveTab("pine")}
              className={`px-3.5 py-2 text-xs font-semibold rounded-t-lg transition flex items-center gap-2 border-b-2 ${
                activeTab === "pine"
                  ? "border-sky-500 text-sky-400 bg-zinc-900/80"
                  : "border-transparent text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              TradingView Pine Script v5 Strategy
            </button>
          </div>

          <div className="text-[11px] text-zinc-400 pb-2 hidden sm:block">
            Data Engine: <span className="text-zinc-300 font-mono">{data?.dataSource || "Syncing"}</span>
          </div>
        </div>

        {/* Tab 1: Interactive Chart with Overlays */}
        {activeTab === "chart" && (
          <div className="p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400 pb-2 border-b border-zinc-800/80">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> Long Entry (CE)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-400" /> Short Entry (PE)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-400" /> Entry Level
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Stop Loss
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Targets (1.5R & 2.5R)
                </span>
              </div>
              {selectedTrade && (
                <div className="text-xs text-sky-300 font-mono bg-sky-950/60 border border-sky-800/60 px-2.5 py-1 rounded-md">
                  Active Trade Focus: {selectedTrade.direction} @ {selectedTrade.entryPrice} ({selectedTrade.outcome})
                </div>
              )}
            </div>

            <div className="rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800">
              {tvCandles.length > 0 ? (
                <CandleChart candles={tvCandles} overlays={overlays} marks={chartMarks} levels={levels} height={480} />
              ) : (
                <div className="h-[480px] flex items-center justify-center text-sm text-zinc-400">
                  {loading ? "Replaying historical data..." : "No historical candles loaded."}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: TradingView Official Embedded Widget */}
        {activeTab === "tv_embed" && (
          <div className="p-4 space-y-3">
            <div className="text-xs text-zinc-400 flex items-center justify-between">
              <span>Interactive multi-timeframe TradingView terminal for {symbol}.</span>
              {data?.tvUrl && (
                <a
                  href={data.tvUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-400 hover:underline flex items-center gap-1"
                >
                  Full-screen on TradingView.com <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            <TradingViewChart symbol={data?.tvSymbol || "NSE:NIFTY"} timeframe="15" height={520} />
          </div>
        )}

        {/* Tab 3: Turnkey Pine Script v5 Strategy */}
        {activeTab === "pine" && (
          <div className="p-4 md:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-950 p-4 rounded-xl border border-zinc-800">
              <div>
                <h3 className="text-sm font-semibold text-white">Turnkey Pine Script v5 Strategy Code</h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Run this exact strategy directly on TradingView.com across years of historical data in TradingView&apos;s cloud Strategy Tester.
                </p>
              </div>
              <button
                onClick={copyPineCode}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition shrink-0"
              >
                {copiedPine ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedPine ? "Copied to Clipboard!" : "Copy Pine Script"}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
              <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                <span className="font-semibold text-zinc-300 block mb-1">Step 1</span>
                <span className="text-zinc-400">Open any chart on TradingView.com (e.g. NIFTY or BANKNIFTY 15m).</span>
              </div>
              <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                <span className="font-semibold text-zinc-300 block mb-1">Step 2</span>
                <span className="text-zinc-400">Click the <strong className="text-zinc-200">Pine Editor</strong> tab at the bottom of the TradingView screen.</span>
              </div>
              <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                <span className="font-semibold text-zinc-300 block mb-1">Step 3</span>
                <span className="text-zinc-400">Paste this script code and click <strong className="text-zinc-200">&quot;Add to chart&quot;</strong>.</span>
              </div>
              <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                <span className="font-semibold text-zinc-300 block mb-1">Step 4</span>
                <span className="text-zinc-400">Open <strong className="text-zinc-200">Strategy Tester</strong> to see detailed trade-by-trade analytics &amp; deep history!</span>
              </div>
            </div>

            <div className="relative">
              <pre className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-300 overflow-x-auto max-h-[420px] leading-relaxed">
                {data?.validation?.pineScript || "// Generating script..."}
              </pre>
            </div>
          </div>
        )}
      </div>

      {/* Trade Log Breakdown Table */}
      <div className="rounded-2xl bg-zinc-900/90 border border-zinc-800 p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Historical Trade Breakdown</h2>
            <p className="text-xs text-zinc-400">Click any trade row to view entry, stop loss, and targets on the chart above.</p>
          </div>
          <span className="text-xs text-zinc-400 font-mono">
            {data?.validation?.trades?.length ?? 0} Total Simulated Trades
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-zinc-900/90 text-zinc-400 font-medium border-b border-zinc-800">
              <tr>
                <th className="py-2.5 px-3">Trade ID</th>
                <th className="py-2.5 px-3">Date & Time</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3">Entry</th>
                <th className="py-2.5 px-3">Exit</th>
                <th className="py-2.5 px-3">Stop Loss</th>
                <th className="py-2.5 px-3">Target 1 / 2</th>
                <th className="py-2.5 px-3">Bars Held</th>
                <th className="py-2.5 px-3">Outcome</th>
                <th className="py-2.5 px-3">P&L (R)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-mono">
              {data?.validation?.trades && data.validation.trades.length > 0 ? (
                data.validation.trades.map((t) => {
                  const isSelected = selectedTrade?.id === t.id;
                  const isWin = t.pnlR > 0;
                  return (
                    <tr
                      key={t.id}
                      onClick={() => {
                        setSelectedTrade(t);
                        setActiveTab("chart");
                      }}
                      className={`cursor-pointer transition hover:bg-zinc-800/50 ${
                        isSelected ? "bg-sky-500/10 border-l-2 border-sky-400" : ""
                      }`}
                    >
                      <td className="py-2.5 px-3 text-zinc-300 font-semibold">{t.id}</td>
                      <td className="py-2.5 px-3 text-zinc-400">
                        {new Date(t.entryTime).toLocaleString("en-IN", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        })}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold ${
                            t.direction === "CE_LONG"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          }`}
                        >
                          {t.direction === "CE_LONG" ? (
                            <TrendingUp className="w-3 h-3" />
                          ) : (
                            <TrendingDown className="w-3 h-3" />
                          )}
                          {t.direction}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-zinc-200">{t.entryPrice}</td>
                      <td className="py-2.5 px-3 text-zinc-200">{t.exitPrice}</td>
                      <td className="py-2.5 px-3 text-rose-400">{t.stopLoss}</td>
                      <td className="py-2.5 px-3 text-emerald-400">
                        {t.target1} / {t.target2}
                      </td>
                      <td className="py-2.5 px-3 text-zinc-400">{t.barsHeld} bars ({t.barsHeld * 15}m)</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            t.outcome === "TARGET_2_HIT"
                              ? "bg-emerald-500/20 text-emerald-300"
                              : t.outcome === "TARGET_1_PARTIAL"
                              ? "bg-teal-500/20 text-teal-300"
                              : t.outcome === "THETA_TIME_STOP"
                              ? "bg-amber-500/20 text-amber-300"
                              : "bg-rose-500/20 text-rose-300"
                          }`}
                        >
                          {t.outcome}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-bold">
                        <span className={isWin ? "text-emerald-400" : t.pnlR === 0 ? "text-zinc-400" : "text-rose-400"}>
                          {t.pnlR >= 0 ? "+" : ""}
                          {t.pnlR} R
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-zinc-500">
                    No trades triggered for the selected parameters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
