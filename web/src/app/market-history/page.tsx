"use client";

import { useEffect, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ChartPoint, HistoryCoverage } from "@/lib/marketHistory";
import type { StockInstrument, StockMarketData } from "@/lib/services/stockService";
import { Card } from "@/components/ui";

const RANGES = ["1M", "3M", "6M", "1Y", "2Y", "3Y", "5Y", "MAX"] as const;
const INTERVALS = ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w", "1mo"] as const;
const WATCHLIST = ["NIFTY", "BANKNIFTY", "RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK", "SBIN", "ITC", "LT"];
// Validated categorical slots on the dark surface; price stays neutral ink.
const C = { close: "#d4d4d8", ema20: "#3987e5", ema50: "#d95926", ema100: "#9085e9", ema200: "#2fa37a", vwap: "#c2a03a" };

type Hist = {
  instrument: StockInstrument; interval: string; range: string; points: ChartPoint[]; support: number | null; resistance: number | null;
  coverage: HistoryCoverage | null; source?: string; quality?: string; fetchedAt?: string; error?: string;
};

const fmtT = (iso: string, intraday: boolean) =>
  new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", ...(intraday ? { hour: "2-digit", minute: "2-digit", hour12: false } : { year: "2-digit" }) });

export default function MarketHistoryPage() {
  const [symbol, setSymbol] = useState("NIFTY");
  const [range, setRange] = useState<(typeof RANGES)[number]>("1Y");
  const [interval, setIntervalTf] = useState<(typeof INTERVALS)[number]>("1d");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<StockInstrument[]>([]);
  const [hist, setHist] = useState<Hist | null>(null);
  const [quote, setQuote] = useState<StockMarketData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!q.trim()) return;
    const t = setTimeout(() => fetch(`/api/stocks/search?q=${encodeURIComponent(q)}`).then((r) => r.json()).then((j) => setResults(j.results ?? [])), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag for the fetch below
    setLoading(true);
    Promise.all([
      fetch(`/api/stocks/${encodeURIComponent(symbol)}/history?range=${range}&interval=${interval}`).then((r) => r.json()),
      fetch(`/api/stocks/${encodeURIComponent(symbol)}`).then((r) => r.json()),
    ]).then(([h, s]) => {
      if (!live) return;
      setHist(h);
      setQuote(s.quote ?? null);
      setLoading(false);
    });
    return () => { live = false; };
  }, [symbol, range, interval]);

  const intraday = !["1d", "1w", "1mo"].includes(interval);
  const pts = hist?.points ?? [];
  const cov = hist?.coverage;

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-zinc-100">Market History</h1>
        <p className="text-sm text-zinc-400">Indices and NSE equities. Long ranges are fetched in provider-sized chunks and cached; coverage shows what the provider actually returned.</p>
      </div>

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap gap-1">
          {WATCHLIST.map((s) => (
            <button key={s} onClick={() => setSymbol(s)} className={`rounded px-2 py-0.5 text-xs ${s === symbol ? "bg-zinc-700 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800"}`}>{s}</button>
          ))}
        </div>
        <div className="relative max-w-sm">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search NSE stocks…" aria-label="Search NSE stocks"
            className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100" />
          {q && results.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded border border-zinc-700 bg-zinc-900 text-sm">
              {results.map((r) => (
                <li key={r.instrumentKey}>
                  <button className="w-full px-2 py-1 text-left hover:bg-zinc-800" onClick={() => { setSymbol(r.symbol); setQ(""); setResults([]); }}>
                    <span className="font-mono text-zinc-100">{r.symbol}</span> <span className="text-zinc-500">{r.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex rounded border border-zinc-700 p-0.5">
            {RANGES.map((r) => <button key={r} aria-pressed={r === range} onClick={() => setRange(r)} className={`rounded px-2 py-0.5 ${r === range ? "bg-zinc-700 text-zinc-100" : "text-zinc-400"}`}>{r}</button>)}
          </div>
          <label className="flex items-center gap-1 text-zinc-400">Timeframe
            <select value={interval} onChange={(e) => setIntervalTf(e.target.value as (typeof INTERVALS)[number])} className="rounded border border-zinc-700 bg-zinc-950 px-1 py-0.5 text-zinc-100">
              {INTERVALS.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </label>
        </div>
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <span className="text-lg font-semibold text-zinc-100">{hist?.instrument?.name ?? symbol}</span>
            {quote?.ltp != null && (
              <span className="ml-3 font-mono text-zinc-100">₹{quote.ltp.toLocaleString("en-IN")}
                {quote.change !== undefined && <span className={quote.change >= 0 ? "text-emerald-400" : "text-red-400"}> {quote.change >= 0 ? "+" : ""}{quote.change} ({quote.changePercent}%)</span>}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-3 font-mono text-[11px] text-zinc-400">
            <span>SOURCE {hist?.source ?? "—"}</span>
            <span>QUALITY {hist?.quality ?? "—"}</span>
            <span>LIVE QUOTE {quote?.freshness ?? "—"}{quote?.unavailableReason ? ` (${quote.unavailableReason})` : ""}</span>
            <span>TIMEFRAME {interval} · {range}</span>
            <span>UPDATED {hist?.fetchedAt ? fmtT(hist.fetchedAt, true) : "—"}</span>
          </div>
        </div>

        {loading && <p className="text-sm text-zinc-500">Loading history…</p>}
        {!loading && hist?.error && <p className="rounded border border-amber-800 bg-amber-950/40 p-3 text-sm text-amber-200">History unavailable: {hist.error}</p>}
        {!loading && !hist?.error && pts.length === 0 && <p className="text-sm text-zinc-500">The provider returned no candles for this range.</p>}

        {!loading && pts.length > 0 && (
          <div className="space-y-2">
            <div className="h-80">
              <ResponsiveContainer>
                <ComposedChart data={pts} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid stroke="#27272a" />
                  <XAxis dataKey="t" tickFormatter={(t) => fmtT(t, intraday)} minTickGap={40} stroke="#71717a" fontSize={11} />
                  <YAxis yAxisId="p" domain={["auto", "auto"]} stroke="#71717a" fontSize={11} width={70} />
                  <YAxis yAxisId="v" orientation="right" hide domain={[0, (max: number) => max * 4]} />
                  <Tooltip labelFormatter={(t) => fmtT(String(t), intraday)} contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", fontSize: 12 }} />
                  <Bar yAxisId="v" dataKey="volume" fill="#3f3f46" isAnimationActive={false} />
                  <Line yAxisId="p" dataKey="close" stroke={C.close} dot={false} strokeWidth={1.5} isAnimationActive={false} />
                  {(["ema20", "ema50", "ema100", "ema200", "vwap"] as const).map((k) => (
                    <Line key={k} yAxisId="p" dataKey={k} stroke={C[k]} dot={false} strokeWidth={1} isAnimationActive={false} connectNulls={false} />
                  ))}
                  {hist?.support != null && <ReferenceLine yAxisId="p" y={hist.support} stroke="#2fa37a" strokeDasharray="4 4" label={{ value: "S", fill: "#2fa37a", fontSize: 10 }} />}
                  {hist?.resistance != null && <ReferenceLine yAxisId="p" y={hist.resistance} stroke="#d95926" strokeDasharray="4 4" label={{ value: "R", fill: "#d95926", fontSize: 10 }} />}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-3 text-[11px] text-zinc-400">
              {Object.entries(C).map(([k, c]) => <span key={k}><span style={{ color: c }}>━</span> {k.toUpperCase()}</span>)}
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <div className="h-32">
                <div className="text-[11px] text-zinc-500">RSI (14)</div>
                <ResponsiveContainer>
                  <LineChart data={pts}><XAxis dataKey="t" hide /><YAxis domain={[0, 100]} ticks={[30, 70]} stroke="#71717a" fontSize={10} width={30} />
                    <ReferenceLine y={70} stroke="#52525b" strokeDasharray="3 3" /><ReferenceLine y={30} stroke="#52525b" strokeDasharray="3 3" />
                    <Line dataKey="rsi" stroke="#9085e9" dot={false} isAnimationActive={false} /></LineChart>
                </ResponsiveContainer>
              </div>
              <div className="h-32">
                <div className="text-[11px] text-zinc-500">MACD (12,26,9)</div>
                <ResponsiveContainer>
                  <ComposedChart data={pts}><XAxis dataKey="t" hide /><YAxis stroke="#71717a" fontSize={10} width={40} />
                    <Bar dataKey="macdHist" fill="#52525b" isAnimationActive={false} />
                    <Line dataKey="macd" stroke="#3987e5" dot={false} isAnimationActive={false} />
                    <Line dataKey="macdSignal" stroke="#d95926" dot={false} isAnimationActive={false} /></ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </Card>

      {cov && (
        <Card className="p-4 text-xs">
          <h2 className="mb-2 text-sm font-semibold text-zinc-200">Provider coverage</h2>
          <div className="grid grid-cols-2 gap-y-1 font-mono md:grid-cols-4">
            <span className="text-zinc-500">Requested</span><span className="text-zinc-200">{cov.requestedStart} → {cov.requestedEnd}</span>
            <span className="text-zinc-500">Actual</span><span className="text-zinc-200">{cov.actualStart ?? "—"} → {cov.actualEnd ?? "—"}</span>
            <span className="text-zinc-500">Bars</span><span className="text-zinc-200">{cov.bars}</span>
            <span className="text-zinc-500">Status</span><span className="text-zinc-200">{cov.status}</span>
            <span className="text-zinc-500">Chunks</span><span className="text-zinc-200">{cov.chunks} ({cov.cachedChunks} cached)</span>
            <span className="text-zinc-500">Failed chunks</span><span className="text-zinc-200">{cov.failedChunks.length}</span>
            <span className="text-zinc-500">Provider floor</span><span className="text-zinc-200">{cov.providerEarliest}{cov.clampedToProviderFloor ? " (range clamped)" : ""}</span>
          </div>
          <p className="mt-2 text-zinc-500">Options: current live chain only — historical option data is provider-blocked (see Option History).</p>
        </Card>
      )}
    </div>
  );
}
