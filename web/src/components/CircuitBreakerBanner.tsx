// Phase 4 — Portfolio Circuit Breaker Status Banner Component.
// Displays active risk halts (Daily Loss Halt, 60m Heat Stop, Position Cap) with real-time countdown.

"use client";

import { useEffect, useState, useCallback } from "react";
import { Shield, AlertTriangle, Flame, ShieldAlert, RotateCcw } from "lucide-react";
import type { CircuitBreakerState } from "@/lib/services/portfolioCircuitBreaker";

export function CircuitBreakerBanner() {
  const [state, setState] = useState<CircuitBreakerState | null>(null);
  const [, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/api/risk/circuit-breaker");
        if (res.ok && active) {
          const json = await res.json();
          setState(json.data);
        }
      } catch {
        // Ignore background fetch error
      }
    };

    const timer = setTimeout(() => {
      void load();
    }, 0);
    const interval = setInterval(load, 15000); // 15s poll

    return () => {
      active = false;
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

  const handleResetHeatStop = async () => {
    setResetting(true);
    try {
      const res = await fetch("/api/risk/circuit-breaker", { method: "POST" });
      if (res.ok) {
        const json = await res.json();
        setState(json.data);
      }
    } finally {
      setResetting(false);
    }
  };

  if (!state) return null;

  if (state.status === "DAILY_HALT") {
    return (
      <div className="rounded-xl border border-red-500/60 bg-red-950/40 p-4 text-red-200 backdrop-blur">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
          <div className="space-y-1">
            <div className="text-sm font-semibold tracking-wide text-red-100">
              🛑 MAX DAILY LOSS CIRCUIT BREAKER TRIPPED
            </div>
            <p className="text-xs text-red-300">
              Cumulative realized daily loss (₹{state.realizedDailyLoss.toLocaleString("en-IN")}) has breached the daily risk ceiling (₹{state.maxDailyLossAllowed.toLocaleString("en-IN")}).
              All automated & paper trade entries are strictly halted until next session (09:15 IST).
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (state.status === "HEAT_STOP") {
    const mins = Math.max(1, Math.ceil(state.cooldownRemainingSec / 60));
    return (
      <div className="rounded-xl border border-amber-500/50 bg-amber-950/30 p-4 text-amber-200 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Flame className="h-5 w-5 shrink-0 text-amber-400 animate-pulse" />
            <div>
              <div className="text-sm font-semibold text-amber-100">
                🔥 HEAT STOP ACTIVE — {mins}m Cooling-Off Window
              </div>
              <p className="text-xs text-amber-300">
                {state.consecutiveLosses} consecutive stop-outs detected. New trade recommendations are temporarily paused to protect risk capital.
              </p>
            </div>
          </div>
          <button
            onClick={handleResetHeatStop}
            disabled={resetting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-600/60 bg-amber-900/40 px-3 py-1.5 text-xs font-semibold text-amber-200 transition hover:bg-amber-800/50 disabled:opacity-50"
          >
            <RotateCcw size={12} className={resetting ? "animate-spin" : ""} />
            <span>Clear Heat Stop (Operator)</span>
          </button>
        </div>
      </div>
    );
  }

  if (state.status === "POSITION_CAP") {
    return (
      <div className="rounded-xl border border-blue-500/40 bg-blue-950/30 p-3 text-blue-200">
        <div className="flex items-center gap-2.5">
          <AlertTriangle className="h-4 w-4 shrink-0 text-blue-400" />
          <span className="text-xs font-medium text-blue-200">
            Portfolio at Capacity: {state.currentOpenPositions}/{state.maxConcurrentPositions} concurrent positions open. New entries locked.
          </span>
        </div>
      </div>
    );
  }

  // Normal healthy state
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-3.5 py-2 text-xs text-zinc-300">
      <div className="flex items-center gap-2">
        <Shield size={14} className="text-emerald-400" />
        <span className="font-semibold text-zinc-200">Portfolio Circuit Breakers:</span>
        <span className="text-emerald-400 font-medium">ACTIVE (0/3 Breached)</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-400">
        <span>Daily Loss: ₹{state.realizedDailyLoss} / ₹{state.maxDailyLossAllowed} max</span>
        <span>Consecutive Losses: {state.consecutiveLosses} / 2 limit</span>
        <span>Open Slots: {state.currentOpenPositions} / {state.maxConcurrentPositions}</span>
      </div>
    </div>
  );
}
