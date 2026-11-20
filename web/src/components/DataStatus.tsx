import { CircleCheck, Clock, TriangleAlert } from "lucide-react";
import type { Snapshot } from "@/lib/types";
import { dataLabel } from "@/lib/dataStatus";
import { FALLBACK_LABELS } from "@/lib/fallback";
import { fmtIst } from "@/lib/time";
import { sourceProviderLabel } from "@/lib/provenanceDisplay";
import { AutoRefreshControl } from "./AutoRefreshControl";

const NOTE = {
  "LIVE DATA": "All data from Upstox.",
  "END OF DAY": "Market closed. Prices are end-of-day snapshots. News and available breadth data retain their individual source statuses.",
  "PARTIAL LIVE DATA": "Some inputs are not fully live (stale, unavailable, partial breadth coverage or mock — see per-source labels). The model will not trade on mixed data.",
  "MOCK DATA": "Simulated prices and indicators for development. This is not live market data.",
  "MOCK FALLBACK": "Upstox data unavailable, showing simulated data. This is not live market data.",
} as const;

export function DataStatus({ snaps, refreshedAt }: { snaps: Snapshot[]; refreshedAt: string }) {
  const label = dataLabel(snaps);
  const reason = snaps.find((s) => s.fallbackReason)?.fallbackReason;
  const live = label === "LIVE DATA";
  const eod = label === "END OF DAY";
  // G3: every subsystem of every snapshot counts. Mixed providers show MIXED; nothing is defaulted to UPSTOX.
  const provider = sourceProviderLabel(snaps.flatMap((s) => Object.values(s.sources).map((x) => x.provider)));
  const Icon = live ? CircleCheck : eod ? Clock : TriangleAlert;

  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded border px-3 py-2 text-sm ${
        live
          ? "border-zinc-700 bg-zinc-900 text-zinc-300"
          : eod
            ? "border-sky-700/50 bg-sky-950/30 text-sky-300"
            : "border-amber-500/40 bg-amber-500/10 text-amber-300"
      }`}
    >
      <Icon size={16} aria-hidden />
      <strong className="font-semibold">{label}</strong>
      {reason && <span>Reason: {FALLBACK_LABELS[reason]}.</span>}
      <span>{NOTE[label]}</span>
      <span className="ml-auto flex flex-wrap items-center gap-3 font-mono text-xs">
        <span>Source: {provider} · Last refresh {fmtIst(refreshedAt)} IST</span>
        <AutoRefreshControl />
      </span>
    </div>
  );
}
