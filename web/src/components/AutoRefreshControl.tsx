"use client";

import { useEffect, useState, useTransition, useCallback, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Pause, Play } from "lucide-react";

const DEFAULT_INTERVAL_SEC = 900; // default 15 minutes (900 seconds)

function subscribeStorage(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getStoredIntervalSnapshot(): number {
  try {
    const stored = localStorage.getItem("analyzer_auto_refresh_sec");
    const parsed = Number(stored);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  } catch {}
  return DEFAULT_INTERVAL_SEC;
}

function getServerSnapshot(): number {
  return DEFAULT_INTERVAL_SEC;
}

export function AutoRefreshControl() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const storedInterval = useSyncExternalStore(
    subscribeStorage,
    getStoredIntervalSnapshot,
    getServerSnapshot
  );
  const [overrideInterval, setOverrideInterval] = useState<number | null>(null);
  const intervalSec = overrideInterval ?? storedInterval;
  const [secondsLeft, setSecondsLeft] = useState<number>(DEFAULT_INTERVAL_SEC);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

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

  useEffect(() => {
    if (isPending) {
      window.dispatchEvent(new Event("app:start-loading"));
    } else {
      window.dispatchEvent(new Event("app:stop-loading"));
    }
  }, [isPending]);

  const formatCountdown = (secs: number) => {
    if (secs < 60) return `${secs}s`;
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  };

  const pct = intervalSec > 0 ? ((intervalSec - secondsLeft) / intervalSec) * 100 : 0;

  return (
    <>
      {isPending && (
        <div className="fixed top-4 right-4 z-[9990] flex items-center gap-2.5 rounded-full border border-sky-400/50 bg-zinc-950/95 px-4 py-2 text-xs font-medium text-sky-200 shadow-2xl backdrop-blur-md">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
          </span>
          <RefreshCw size={13} className="animate-spin text-sky-400" />
          <span>Refreshing Live Quotes &amp; Signals…</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900/80 px-2.5 py-1 text-xs shadow-sm">
        <button
          type="button"
          onClick={handleManualRefresh}
          disabled={isPending}
          className={`flex items-center gap-1.5 rounded px-2.5 py-1 font-medium transition-all ${
            isPending
              ? "bg-sky-950 text-sky-300 ring-1 ring-sky-500 shadow-[0_0_10px_rgba(56,189,248,0.3)]"
              : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
          } disabled:opacity-75`}
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
        <span suppressHydrationWarning>{isPaused ? "Paused" : formatCountdown(mounted ? secondsLeft : DEFAULT_INTERVAL_SEC)}</span>
      </button>

      <div className="relative h-1.5 w-12 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full transition-all duration-1000 ${isPaused ? "bg-amber-500/50" : "bg-sky-500"}`}
          style={{ width: `${isPaused ? 100 : pct}%` }}
        />
      </div>

      <select
        value={mounted ? intervalSec : DEFAULT_INTERVAL_SEC}
        suppressHydrationWarning
        onChange={(e) => {
          const val = Number(e.target.value);
          setOverrideInterval(val);
          setSecondsLeft(val);
          try {
            localStorage.setItem("analyzer_auto_refresh_sec", String(val));
          } catch {}
        }}
        className="rounded bg-zinc-950 px-1.5 py-0.5 text-[11px] font-mono text-zinc-300 border border-zinc-800 focus:outline-none"
        aria-label="Auto-refresh interval"
      >
        <option value={15}>15s</option>
        <option value={30}>30s</option>
        <option value={60}>1m</option>
        <option value={120}>2m</option>
        <option value={300}>5m</option>
        <option value={900}>15m (default)</option>
        <option value={1800}>30m</option>
      </select>
    </div>
    </>
  );
}
