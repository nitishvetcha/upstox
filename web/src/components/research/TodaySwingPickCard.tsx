"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Card } from "@/components/ui";

interface SwingLivePick {
  symbol: string;
  setupType: "BREAKOUT" | "PULLBACK";
  signalDate: string;
  referenceEntry: number;
  qty: number;
  capitalAllocated: number;
  stopLoss: number;
  stopPct: number;
  target: number;
  breakevenTrigger: number;
  maxExitDate: string;
  rsVsNiftyPct: number;
  volumeRatio: number;
  score: number;
}

interface SwingScanResult {
  status: "PICK" | "NO_SETUP";
  scannedAt: string | null;
  signalDate: string | null;
  universeCount: number;
  qualifiedCount: number;
  pick: SwingLivePick | null;
  reason?: string;
}

export function TodaySwingPickCard() {
  const [data, setData] = useState<SwingScanResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/swing/today", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active) {
          setData(d);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const pick = data?.pick ?? null;

  return (
    <Card className="p-5 border-emerald-500/30 bg-emerald-950/10">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-white">
            Today&apos;s ₹10k Swing Pick (swing-v1 Mode B)
          </h2>
          <Badge tone={pick ? "bull" : "warn"}>
            {loading ? "LOADING" : pick ? pick.setupType : "NO SETUP"}
          </Badge>
        </div>
        {data?.signalDate && (
          <span className="text-xs text-zinc-400">
            Signal Date: {data.signalDate} · Scanned {data.universeCount} stocks
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-zinc-400">Fetching latest EOD swing scan...</p>
      ) : !pick ? (
        <p className="text-xs text-zinc-400">
          {data?.reason ?? "No stocks qualified for Swing-V1 Mode B today."}
        </p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-4 text-xs">
            <div>
              <div className="text-zinc-400">Symbol</div>
              <div className="font-semibold text-white text-sm">{pick.symbol}</div>
            </div>
            <div>
              <div className="text-zinc-400">Entry Ref (Qty)</div>
              <div className="font-medium text-white">
                ₹{pick.referenceEntry.toFixed(2)} ({pick.qty} sh)
              </div>
            </div>
            <div>
              <div className="text-zinc-400">Stop-Loss (-{pick.stopPct.toFixed(1)}%)</div>
              <div className="font-medium text-rose-400">₹{pick.stopLoss.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-zinc-400">2.5x Target</div>
              <div className="font-medium text-emerald-400">₹{pick.target.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-zinc-400">BE Trigger (+1.5R)</div>
              <div className="font-medium text-amber-300">₹{pick.breakevenTrigger.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-zinc-400">15-Day Max Exit</div>
              <div className="font-medium text-zinc-200">{pick.maxExitDate}</div>
            </div>
          </div>

          <Link
            href={`/saved-picks?symbol=${encodeURIComponent(pick.symbol)}&capital=10000&entry=${pick.referenceEntry}&stop=${pick.stopLoss}&target=${pick.target}`}
            className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 transition-colors"
          >
            Open in Saved Picks (₹10k)
          </Link>
        </div>
      )}
    </Card>
  );
}
