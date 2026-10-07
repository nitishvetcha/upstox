import type { Snapshot, Subsystem } from "@/lib/types";
import { fmtIst, freshnessOf } from "@/lib/time";
import { Badge } from "./ui";

const NAMES: Record<Subsystem, string> = { market: "Market", optionChain: "Option chain", technical: "Technical", news: "News", breadth: "Breadth" };

// Per-subsystem source + fetch time, so mixed live/mock data is never hidden behind one label.
export function DataTimestamps({ s, stale, now = new Date() }: { s: Snapshot; stale: string[]; now?: Date }) {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono">
      {(Object.keys(NAMES) as Subsystem[]).map((k) => {
        const info = s.sources[k];
        const f = freshnessOf(info.fetchedAt, now, k === "news" ? 30 : 1);
        return (
          <span key={k} className="flex items-center gap-1">
            {NAMES[k]}
            <Badge tone={info.source === "LIVE" ? "neutral" : "warn"}>{info.source === "UNAVAILABLE" ? "N/A" : info.source}</Badge>
            {info.fetchedAt && `${fmtIst(info.fetchedAt)} IST`}
            {f.freshness === "AGING" && <span className="text-amber-400">({f.freshnessSeconds}s old)</span>}
          </span>
        );
      })}
      {stale.length > 0 && <Badge tone="bear">STALE DATA</Badge>}
    </span>
  );
}
