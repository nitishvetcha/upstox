import { CircleCheck, TriangleAlert } from "lucide-react";
import type { Snapshot } from "@/lib/types";
import { dataLabel } from "@/lib/dataStatus";
import { FALLBACK_LABELS } from "@/lib/fallback";
import { fmtIst } from "@/lib/time";

const NOTE = {
  "LIVE DATA": "All data from Upstox.",
  "PARTIAL LIVE DATA": "Some data is live and some is mock or not available yet (see per-source labels). The model will not trade on mixed data.",
  "MOCK DATA": "Simulated prices and indicators for development. This is not live market data.",
  "MOCK FALLBACK": "Upstox data unavailable, showing simulated data. This is not live market data.",
} as const;

export function DataStatus({ snaps, refreshedAt }: { snaps: Snapshot[]; refreshedAt: string }) {
  const label = dataLabel(snaps);
  const reason = snaps.find((s) => s.fallbackReason)?.fallbackReason;
  const live = label === "LIVE DATA";
  const provider = snaps.some((s) => s.sources.market.provider === "UPSTOX") ? "UPSTOX" : "MOCK";
  const Icon = live ? CircleCheck : TriangleAlert;

  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded border px-3 py-2 text-sm ${
        live ? "border-zinc-700 bg-zinc-900 text-zinc-300" : "border-amber-500/40 bg-amber-500/10 text-amber-300"
      }`}
    >
      <Icon size={16} aria-hidden />
      <strong className="font-semibold">{label}</strong>
      {reason && <span>Reason: {FALLBACK_LABELS[reason]}.</span>}
      <span>{NOTE[label]}</span>
      <span className="ml-auto font-mono text-xs">
        Source: {provider} · Last refresh {fmtIst(refreshedAt)} IST
      </span>
    </div>
  );
}
