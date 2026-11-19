"use client";

import { useState } from "react";
import { calculatePositionSize, type PositionSizeParams } from "@/lib/positionSizing";

interface PositionSizeCalculatorProps {
  type: "OPTION" | "STOCK";
  entry: number;
  stop: number;
  target1: number;
  target2: number;
  lotSize?: number | null;
  unitPrice?: number | null;
}

const CAPITAL_PRESETS = [
  { label: "₹50k", value: 50_000 },
  { label: "₹1L", value: 100_000 },
  { label: "₹2L", value: 200_000 },
  { label: "₹5L", value: 500_000 },
];

const RISK_PRESETS = [
  { label: "1.0%", value: 1.0 },
  { label: "1.5% (Std)", value: 1.5 },
  { label: "2.0%", value: 2.0 },
];

export function PositionSizeCalculator({
  type,
  entry,
  stop,
  target1,
  target2,
  lotSize,
  unitPrice,
}: PositionSizeCalculatorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [accountCapital, setAccountCapital] = useState(100_000);
  const [riskPercent, setRiskPercent] = useState(1.5);
  const [isCustomCapital, setIsCustomCapital] = useState(false);
  const [customInput, setCustomInput] = useState("100000");

  const effectiveCapital = isCustomCapital ? Math.max(Number(customInput) || 1000, 1000) : accountCapital;

  const sizing = calculatePositionSize({
    type,
    accountCapital: effectiveCapital,
    riskPercent,
    entry,
    stop,
    target1,
    target2,
    lotSize,
    unitPrice,
  });

  return (
    <div className="mt-2 rounded-lg border border-zinc-800 bg-zinc-950/70 p-2.5 text-xs">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between font-semibold text-zinc-300 hover:text-zinc-100 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <span className="text-sky-400">⚖</span>
          <span>Position Sizing &amp; Lot Calculator</span>
          <span className="rounded bg-sky-950/60 border border-sky-800/40 px-1.5 py-0.2 text-[10px] text-sky-300 font-mono">
            {type === "OPTION" ? `${sizing.recommendedLots} lot${sizing.recommendedLots > 1 ? "s" : ""}` : `${sizing.recommendedUnits} shares`}
          </span>
        </span>
        <span className="text-[10px] text-zinc-500 font-mono">
          {isOpen ? "▲ Hide" : "▼ Calculate"}
        </span>
      </button>

      {isOpen && (
        <div className="mt-2.5 pt-2 border-t border-zinc-800/80 space-y-2.5">
          {/* Account Capital Selector */}
          <div>
            <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">
              Account Trading Capital
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {CAPITAL_PRESETS.map((p) => {
                const active = !isCustomCapital && accountCapital === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => {
                      setIsCustomCapital(false);
                      setAccountCapital(p.value);
                    }}
                    className={`rounded px-2 py-0.5 font-mono text-[11px] transition-colors ${
                      active
                        ? "bg-sky-600 text-white font-bold"
                        : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setIsCustomCapital(true)}
                className={`rounded px-2 py-0.5 font-mono text-[11px] transition-colors ${
                  isCustomCapital
                    ? "bg-sky-600 text-white font-bold"
                    : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                }`}
              >
                Custom
              </button>
              {isCustomCapital && (
                <div className="flex items-center gap-1">
                  <span className="text-zinc-500 text-[11px]">₹</span>
                  <input
                    type="number"
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    className="w-24 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-xs text-zinc-100 font-mono"
                    step={10000}
                    min={1000}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Risk Budget Selector */}
          <div>
            <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">
              Max Risk Per Trade
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {RISK_PRESETS.map((r) => {
                const active = riskPercent === r.value;
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setRiskPercent(r.value)}
                    className={`rounded px-2 py-0.5 font-mono text-[11px] transition-colors ${
                      active
                        ? "bg-amber-600 text-white font-bold"
                        : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                    }`}
                  >
                    {r.label}
                  </button>
                );
              })}
              <span className="text-[10px] text-zinc-500 font-mono ml-1">
                Risk Budget: ₹{sizing.riskBudget.toLocaleString("en-IN")}
              </span>
            </div>
          </div>

          {/* Sizing Outputs Table */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1">
            <div className="rounded bg-zinc-900/80 p-2 border border-zinc-800/80">
              <div className="text-[10px] text-zinc-500">Recommended Size</div>
              <div className="text-sm font-bold text-sky-400 font-mono mt-0.5">
                {type === "OPTION" ? (
                  <>
                    {sizing.recommendedLots} <span className="text-[10px] text-zinc-400 font-normal">lot{sizing.recommendedLots > 1 ? "s" : ""} ({sizing.recommendedUnits}u)</span>
                  </>
                ) : (
                  <>
                    {sizing.recommendedUnits} <span className="text-[10px] text-zinc-400 font-normal">shares</span>
                  </>
                )}
              </div>
            </div>

            <div className="rounded bg-zinc-900/80 p-2 border border-zinc-800/80">
              <div className="text-[10px] text-zinc-500">Capital Deployment</div>
              <div className="text-sm font-bold text-zinc-200 font-mono mt-0.5">
                ₹{sizing.capitalRequired.toLocaleString("en-IN")}
                <span className="text-[10px] text-zinc-400 font-normal block sm:inline sm:ml-1">
                  ({sizing.capitalRequiredPercent}%)
                </span>
              </div>
            </div>

            <div className="rounded bg-zinc-900/80 p-2 border border-zinc-800/80">
              <div className="text-[10px] text-zinc-500">Stop Loss Risk</div>
              <div className="text-sm font-bold text-red-300 font-mono mt-0.5">
                ₹{sizing.totalRisk.toLocaleString("en-IN")}
                <span className="text-[10px] text-zinc-400 font-normal block sm:inline sm:ml-1">
                  ({sizing.totalRiskPercent}%)
                </span>
              </div>
            </div>

            <div className="rounded bg-zinc-900/80 p-2 border border-zinc-800/80">
              <div className="text-[10px] text-zinc-500">Target 1 &amp; 2 Gain</div>
              <div className="text-sm font-bold text-emerald-400 font-mono mt-0.5">
                +₹{sizing.target1Profit.toLocaleString("en-IN")}
                <span className="text-[10px] text-teal-400 font-normal block">
                  T2: +₹{sizing.target2Profit.toLocaleString("en-IN")}
                </span>
              </div>
            </div>
          </div>

          {sizing.isCappedByCapital && (
            <div className="text-[10px] text-amber-400 bg-amber-950/30 border border-amber-800/40 rounded px-2 py-1">
              ⚠ Position size capped to prevent exceeding 50% of your account capital on a single intraday trade.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
