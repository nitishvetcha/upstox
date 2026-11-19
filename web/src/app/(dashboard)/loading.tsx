import { RefreshCw } from "lucide-react";

export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Top Loading Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-sky-900/50 bg-gradient-to-r from-sky-950/40 via-zinc-900/50 to-zinc-900/40 p-4 shadow-lg backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30">
            <RefreshCw size={20} className="animate-spin text-sky-400" />
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-sky-500"></span>
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-zinc-100 md:text-lg">Loading Market Analysis…</h1>
              <span className="rounded-full bg-sky-950 px-2.5 py-0.5 text-[11px] font-mono text-sky-400 border border-sky-800/60">
                LIVE COMPUTE
              </span>
            </div>
            <p className="mt-0.5 text-xs text-zinc-400">
              Scanning 6 indices (NIFTY, BANKNIFTY, SENSEX...) &amp; equity breadth. Computing Greeks, ATR &amp; setups…
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
          <span>Synchronizing provider pipeline</span>
        </div>
      </div>

      {/* Decision Funnel Skeleton */}
      <div className="space-y-2">
        <div className="h-4 w-32 rounded bg-zinc-800" />
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3">
              <div className="h-3 w-20 rounded bg-zinc-800 mb-2" />
              <div className="h-6 w-14 rounded bg-zinc-700/80" />
            </div>
          ))}
        </div>
      </div>

      {/* Section Skeleton 1: Index Options */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="h-5 w-44 rounded bg-zinc-800" />
          <div className="h-4 w-28 rounded bg-zinc-800/60" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="h-5 w-28 rounded bg-zinc-700/80" />
                <div className="h-5 w-36 rounded-full bg-zinc-800" />
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4].map((j) => (
                  <div key={j} className="h-10 rounded bg-zinc-950/60 p-1.5 space-y-1">
                    <div className="h-2 w-10 rounded bg-zinc-800" />
                    <div className="h-3 w-14 rounded bg-zinc-700" />
                  </div>
                ))}
              </div>
              <div className="h-24 rounded-lg bg-zinc-950/40 border border-zinc-800/40 p-3 space-y-2">
                <div className="h-4 w-48 rounded bg-zinc-800" />
                <div className="h-3 w-64 rounded bg-zinc-800/60" />
                <div className="h-3 w-32 rounded bg-zinc-800/40" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Section Skeleton 2: Stocks Grid */}
      <div className="space-y-3">
        <div className="h-5 w-36 rounded bg-zinc-800" />
        <div className="grid gap-3 md:grid-cols-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-36 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 space-y-2.5">
              <div className="flex justify-between">
                <div className="h-4 w-24 rounded bg-zinc-700" />
                <div className="h-4 w-16 rounded bg-zinc-800" />
              </div>
              <div className="h-3 w-40 rounded bg-zinc-800/60" />
              <div className="h-12 rounded bg-zinc-950/50" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
