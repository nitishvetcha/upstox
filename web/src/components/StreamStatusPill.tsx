// Phase 3 — Stream Status Indicator Pill Component.
// Displays live WebSocket/SSE streaming health, latency (<40ms), and fallback state in TopBar.

"use client";

import { useMarketStream } from "@/hooks/useMarketStream";
import { Activity } from "lucide-react";

export function StreamStatusPill() {
  const { status, latencyMs, quoteCount } = useMarketStream();

  if (status === "STREAMING") {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-950/40 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300"
        title={`Live WebSocket Protobuf stream active. ${quoteCount} symbols subscribed. Average exchange latency: ${latencyMs}ms.`}
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        </span>
        <Activity size={11} className="text-emerald-400" aria-hidden />
        <span>STREAMING (&lt;{Math.max(1, latencyMs)}ms)</span>
      </span>
    );
  }

  if (status === "CONNECTING") {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-950/30 px-2.5 py-0.5 text-[11px] font-medium text-amber-300"
        title="Connecting to real-time market data stream..."
      >
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400" />
        <span>STREAM CONNECTING</span>
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900/60 px-2.5 py-0.5 text-[11px] font-medium text-zinc-400"
      title="Real-time WebSocket stream inactive. Using standard snapshot data."
    >
      <span className="inline-block h-2 w-2 rounded-full bg-zinc-600" />
      <span>POLLING (Fallback)</span>
    </span>
  );
}
