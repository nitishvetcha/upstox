import { BarChart3 } from "lucide-react";
import { getTradingViewChartUrl } from "@/lib/tradingView";

const QUICK_SYMBOLS = ["NIFTY", "BANKNIFTY", "CRUDEOIL", "NATURALGAS"] as const;

export function TradingViewQuickBar() {
  return (
    <div className="app-surface rounded-2xl border border-zinc-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
        <BarChart3 size={15} className="text-sky-400" />
        <span>Open in TradingView</span>
        <span className="text-[11px] font-normal text-zinc-400">(15m Live Charts)</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {QUICK_SYMBOLS.map((sym) => (
          <a
            key={sym}
            href={getTradingViewChartUrl(sym, "15")}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900/80 px-2.5 py-1 text-xs font-medium text-sky-300 hover:border-sky-500/60 hover:bg-zinc-800 transition-colors"
          >
            <span>{sym}</span>
            <span className="text-[10px] text-zinc-400">↗</span>
          </a>
        ))}
      </div>
    </div>
  );
}
