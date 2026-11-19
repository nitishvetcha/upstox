"use client";

import { useEffect, useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Pause, Play } from "lucide-react";

export function AutoRefreshControl() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [intervalSec, setIntervalSec] = useState<number>(30); // default 30s
  const [secondsLeft, setSecondsLeft] = useState<number>(30);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  const triggerRefresh = useCallback(() => {
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  useEffect(() => {
    if (isPaused || intervalSec <= 0) return;

    let remaining = intervalSec;

    const timer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        remaining = intervalSec;
        setSecondsLeft(intervalSec);
        triggerRefresh();
      } else {
        setSecondsLeft(remaining);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [intervalSec, isPaused, refreshTrigger, triggerRefresh]);

  const handleManualRefresh = () => {
    setSecondsLeft(intervalSec);
    setRefreshTrigger((c) => c + 1);
    triggerRefresh();
  };

  const formatCountdown = (secs: number) => {
    if (secs < 60) return `${secs}s`;
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  };

  const pct = intervalSec > 0 ? ((intervalSec - secondsLeft) / intervalSec) * 100 : 0;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900/80 px-2.5 py-1 text-xs shadow-sm">
      <button
        type="button"
        onClick={handleManualRefresh}
        disabled={isPending}
        className="flex items-center gap-1 rounded bg-zinc-800 px-2 py-0.5 font-medium text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
        title="Refresh now"
      >
        <RefreshCw size={12} className={isPending ? "animate-spin text-sky-400" : "text-zinc-400"} />
        <span>{isPending ? "Updating…" : "Refresh"}</span>
      </button>

      <div className="h-3 w-px bg-zinc-700" />

      <button
        type="button"
        onClick={() => setIsPaused((p) => !p)}
        className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200"
        title={isPaused ? "Resume auto-refresh" : "Pause auto-refresh"}
      >
        {isPaused ? <Play size={10} className="text-amber-400" /> : <Pause size={10} className="text-zinc-500" />}
        <span>{isPaused ? "Paused" : formatCountdown(secondsLeft)}</span>
      </button>

      <div className="relative h-1.5 w-12 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full transition-all duration-1000 ${isPaused ? "bg-amber-500/50" : "bg-sky-500"}`}
          style={{ width: `${isPaused ? 100 : pct}%` }}
        />
      </div>

      <select
        value={intervalSec}
        onChange={(e) => {
          const val = Number(e.target.value);
          setIntervalSec(val);
          setSecondsLeft(val);
        }}
        className="rounded bg-zinc-950 px-1.5 py-0.5 text-[11px] font-mono text-zinc-300 border border-zinc-800 focus:outline-none"
        aria-label="Auto-refresh interval"
      >
        <option value={15}>15s</option>
        <option value={30}>30s</option>
        <option value={60}>1m</option>
        <option value={120}>2m</option>
        <option value={300}>5m</option>
        <option value={900}>15m</option>
        <option value={1800}>30m</option>
      </select>
    </div>
  );
}
