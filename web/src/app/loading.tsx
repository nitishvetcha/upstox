import { RefreshCw } from "lucide-react";

export default function RootLoading() {
  return (
    <div className="flex min-h-[60vh] w-full flex-col items-center justify-center p-6 text-center animate-pulse">
      <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 mb-4 shadow-xl">
        <RefreshCw size={28} className="animate-spin text-sky-400" />
        <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-sky-500"></span>
        </span>
      </div>
      <h2 className="text-lg font-bold text-zinc-100">Loading Quantitative System…</h2>
      <p className="mt-1 max-w-sm text-xs text-zinc-400">
        Syncing real-time market data, technical indicators, and option analytics.
      </p>
    </div>
  );
}
