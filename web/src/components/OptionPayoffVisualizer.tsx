"use client";

import { useId } from "react";

interface OptionPayoffVisualizerProps {
  strategyType: "LONG_CALL" | "LONG_PUT" | "BULL_CALL_SPREAD" | "BEAR_PUT_SPREAD" | string;
  underlying: string;
  strike: number;
  entry: number;
  stop: number;
  target1: number;
  target2: number;
  breakeven: number;
  maxLoss: number;
  maxProfit?: number | null;
  lotSize?: number | null;
  delta?: number | null;
  theta?: number | null;
  gamma?: number | null;
  vega?: number | null;
  iv?: number | null;
}

export function OptionPayoffVisualizer({
  strategyType,
  underlying,
  strike,
  entry,
  stop,
  target1,
  target2,
  breakeven,
  maxLoss,
  maxProfit,
  lotSize = 65,
  delta,
  theta,
  gamma,
  vega,
  iv,
}: OptionPayoffVisualizerProps) {
  const gradientId = useId();
  const lot = lotSize ?? 65;
  const isCall = strategyType === "LONG_CALL" || strategyType === "BULL_CALL_SPREAD";
  const isSpread = strategyType === "BULL_CALL_SPREAD" || strategyType === "BEAR_PUT_SPREAD";

  // Calculate rupee risk and reward per lot
  const riskPerLot = Math.round(maxLoss * lot);
  const rewardT1PerLot = Math.round(Math.abs(target1 - entry) * lot);
  const rewardT2PerLot = Math.round(Math.abs(target2 - entry) * lot);
  const thetaPerLotDay = theta != null ? Math.round(theta * lot) : null;

  // SVG coordinates for a clean stylized payoff curve
  // ViewBox: 0 0 320 100, zero line at y = 60
  const zeroY = 60;
  const pathD = isCall
    ? isSpread
      ? "M 15 80 L 120 80 L 220 30 L 305 30" // Bull call spread: flat loss, slope up, flat capped profit
      : "M 15 80 L 120 80 L 305 15"         // Long call: flat loss below strike, linear up
    : isSpread
      ? "M 15 30 L 100 30 L 200 80 L 305 80" // Bear put spread
      : "M 15 15 L 200 80 L 305 80";        // Long put

  return (
    <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/70 p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-zinc-200">Interactive Payoff &amp; Greeks Profile</span>
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400">
            {lot} units/lot
          </span>
        </div>
        <div className="text-[11px] text-zinc-400">
          Breakeven: <span className="font-mono text-emerald-400">₹{breakeven.toFixed(2)}</span>
        </div>
      </div>

      {/* Stylized Payoff SVG Graph */}
      <div className="relative mt-2 h-20 w-full overflow-hidden rounded bg-zinc-900/50">
        <svg viewBox="0 0 320 100" className="h-full w-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0.1" />
            </linearGradient>
          </defs>

          {/* Zero baseline */}
          <line x1="0" y1={zeroY} x2="320" y2={zeroY} stroke="#3f3f46" strokeDasharray="3 3" strokeWidth="1" />
          <text x="5" y={zeroY - 4} fill="#71717a" fontSize="8" fontFamily="monospace">PROFIT</text>
          <text x="5" y={zeroY + 11} fill="#71717a" fontSize="8" fontFamily="monospace">LOSS</text>

          {/* Payoff line */}
          <path d={pathD} fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" />

          {/* Target 1 marker */}
          <circle cx={isCall ? 240 : 80} cy={isCall ? 32 : 32} r="3" fill="#10b981" />
          <text x={isCall ? 245 : 85} y={28} fill="#34d399" fontSize="8" fontFamily="monospace">T1 Target</text>

          {/* Stop-loss marker */}
          <circle cx={isCall ? 100 : 220} cy={75} r="3" fill="#ef4444" />
          <text x={isCall ? 70 : 225} y={85} fill="#f87171" fontSize="8" fontFamily="monospace">SL Stop</text>
        </svg>
      </div>

      {/* Risk / Reward Metrics Grid */}
      <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded bg-zinc-900 px-2 py-1">
          <div className="text-[10px] text-zinc-500">Max Risk / Lot</div>
          <div className="mt-0.5 font-mono text-xs font-semibold text-red-400">−₹{riskPerLot.toLocaleString("en-IN")}</div>
        </div>
        <div className="rounded bg-zinc-900 px-2 py-1">
          <div className="text-[10px] text-zinc-500">Target 1 Gain / Lot</div>
          <div className="mt-0.5 font-mono text-xs font-semibold text-emerald-400">+₹{rewardT1PerLot.toLocaleString("en-IN")}</div>
        </div>
        <div className="rounded bg-zinc-900 px-2 py-1">
          <div className="text-[10px] text-zinc-500">Target 2 Gain / Lot</div>
          <div className="mt-0.5 font-mono text-xs font-semibold text-teal-400">+₹{rewardT2PerLot.toLocaleString("en-IN")}</div>
        </div>
        <div className="rounded bg-zinc-900 px-2 py-1">
          <div className="text-[10px] text-zinc-500">Theta Decay / Day</div>
          <div className="mt-0.5 font-mono text-xs text-amber-300">
            {thetaPerLotDay != null ? `−₹${Math.abs(thetaPerLotDay).toLocaleString("en-IN")}` : "—"}
          </div>
        </div>
      </div>

      {/* Greeks Breakdown */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded bg-zinc-900/60 px-2.5 py-1.5 text-[11px] text-zinc-400">
        <div>Delta (Δ): <span className="font-mono text-zinc-200">{delta != null ? delta.toFixed(3) : "—"}</span></div>
        <div>Gamma (Γ): <span className="font-mono text-zinc-200">{gamma != null ? gamma.toFixed(4) : "—"}</span></div>
        <div>Vega (ν): <span className="font-mono text-zinc-200">{vega != null ? vega.toFixed(2) : "—"}</span></div>
        <div>IV: <span className="font-mono text-zinc-200">{iv != null ? `${iv.toFixed(1)}%` : "—"}</span></div>
      </div>
    </div>
  );
}
