"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { fmtIst, marketStatus, commodityMarketStatus } from "@/lib/time";
import { Badge, num, signed } from "./ui";
import { dataAge } from "./dataAgeUtils";
import { StreamStatusPill } from "./StreamStatusPill";

export { dataAge } from "./dataAgeUtils";

export interface Ticker {
  name: string;
  spot: number;
  change: number | null;
  expiry: string;
}

export function TopBar({
  tickers,
  generatedAt,
  dataLabel,
  upstoxStatus,
}: {
  tickers: Ticker[];
  generatedAt: string;
  dataLabel: string;
  upstoxStatus: "VERIFIED_CONNECTED" | "CONFIGURED_UNVERIFIED" | "VERIFICATION_FAILED" | "EXPIRED" | "MISSING" | "INVALID" | "UNKNOWN";
}) {
  const [now, setNow] = useState<Date | null>(null); // null on the server: avoids a hydration mismatch

  // Only the local clock ticks here. Market data is never re-fetched on a timer: every Upstox request must be
  // deliberate (the Refresh data button). A timer re-running the server data loading would make live calls
  // in the background, outside any approval.
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const clock = setInterval(tick, 1000);
    return () => clearInterval(clock);
  }, []);

  const eqStatus = now ? marketStatus(now) : null;
  const commStatus = now ? commodityMarketStatus(now) : null;

  const renderMarketBadge = () => {
    if (!now) return null;
    if (eqStatus === "OPEN" && commStatus === "OPEN") {
      return <Badge tone="neutral">MARKET OPEN (EQUITY + MCX)</Badge>;
    }
    if (eqStatus === "OPEN") {
      return <Badge tone="neutral">MARKET OPEN (EQUITY)</Badge>;
    }
    if (commStatus === "OPEN") {
      return <Badge tone="neutral">MCX OPEN (17:00–23:30)</Badge>;
    }
    return <Badge tone="warn">MARKET CLOSED</Badge>;
  };

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-zinc-950/90 px-4 py-2.5 text-xs backdrop-blur-xl md:px-6">
      <div className="flex items-center gap-5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tickers.map((t) => {
        const pct = t.change === null ? null : (t.change / (t.spot - t.change)) * 100;
        const color = (t.change ?? 0) >= 0 ? "text-emerald-400" : "text-red-400";
        return (
          <div key={t.name} className="flex shrink-0 items-baseline gap-2 rounded-lg border border-zinc-800/80 bg-zinc-900/55 px-2.5 py-1.5">
            <span className="font-semibold text-zinc-200">{t.name}</span>
            <span className="font-mono text-sm font-semibold tabular-nums text-zinc-100">{num(t.spot)}</span>
            {t.change !== null && pct !== null && (
              <span className={`font-mono tabular-nums ${color}`}>
                {signed(t.change)} ({signed(pct)}%)
              </span>
            )}
            <span className="text-zinc-500">{t.expiry}</span>
          </div>
        );
      })}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-zinc-800/60 pt-2 text-zinc-400">
        {renderMarketBadge()}
        <span className="font-mono font-semibold tabular-nums text-zinc-300">{now ? `${fmtIst(now)} IST` : "--:--:-- IST"}</span>
        <span className="flex items-center gap-1" title={`Data fetched at ${fmtIst(generatedAt)} IST`}>
          <RefreshCw size={12} aria-hidden /> {fmtIst(generatedAt)}
          {now && <span className="text-zinc-600">({dataAge(now, generatedAt)})</span>}
        </span>
        <Link href="/system-health#data-sources" title="Which inputs are live, stale, mock or unavailable" className="inline-flex min-h-[24px] items-center rounded py-1">
          <Badge tone={dataLabel === "LIVE DATA" || dataLabel === "END OF DAY" ? "neutral" : "warn"}>{dataLabel}{dataLabel !== "LIVE DATA" && dataLabel !== "END OF DAY" ? " — why?" : ""}</Badge>
        </Link>
        <StreamStatusPill />
        <span className="ml-auto" />
        {upstoxStatus === "VERIFIED_CONNECTED" ? (
          <span className="text-emerald-400">● Upstox Connected</span>
        ) : upstoxStatus === "CONFIGURED_UNVERIFIED" ? (
          <span className="text-amber-400" title="A credential is configured but no verification request has succeeded yet">◐ Upstox Not Verified</span>
        ) : (
          <span className="flex items-center gap-2">
            <span className={upstoxStatus === "MISSING" ? "text-zinc-400" : "text-amber-400"}>
              {upstoxStatus === "MISSING" ? "○ Upstox Not Connected" : upstoxStatus === "VERIFICATION_FAILED" ? "⚠ Upstox Verification Failed" : upstoxStatus === "UNKNOWN" ? "⚠ Upstox Status Unknown" : "⚠ Upstox Session Expired"}
            </span>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- API route redirecting to Upstox needs a full page load */}
            <a href="/api/auth/login" className="rounded bg-zinc-100 px-2 py-0.5 font-semibold text-zinc-900 hover:bg-white">
              {upstoxStatus === "MISSING" ? "Connect Upstox" : "Reconnect"}
            </a>
          </span>
        )}
      </div>
    </header>
  );
}
