"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Calculator,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  DollarSign,
  HelpCircle,
  Percent,
  RefreshCw,
  RotateCcw,
  Shield,
  Sliders,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { analyzeSavedPick } from "@/lib/savedPickAnalytics";
import type { SavedPick, PickSource } from "@/lib/savedPicks";
export type { CalculatorPick } from "./savedPickUtils";
export { defaultLotSize } from "./savedPickUtils";
import { defaultLotSize } from "./savedPickUtils";
import type { CalculatorPick } from "./savedPickUtils";

interface SavedPickCalculatorProps {
  pick: CalculatorPick;
  onClose?: () => void;
}

const fmtInr = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);

const round2 = (n: number) => Math.round(n * 100) / 100;

export function SavedPickCalculator({ pick, onClose }: SavedPickCalculatorProps) {
  const isLong = pick.direction !== "SHORT";
  const isOption = pick.instrumentType.includes("OPTION");
  const isStock = pick.instrumentType === "STOCK";
  const rawEntry = Number(pick.entry) || 0;
  const rawStop = Number(pick.stopLoss) || 0;
  const rawT1 = pick.targets?.[0] != null ? Number(pick.targets[0]) : 0;
  const rawT2 = pick.targets?.[1] != null ? Number(pick.targets[1]) : 0;

  // Interactive adjustable trade levels
  const [entry, setEntry] = useState<number>(rawEntry);
  const [stop, setStop] = useState<number>(rawStop);
  const [t1, setT1] = useState<number>(rawT1);
  const [t2, setT2] = useState<number>(rawT2);
  const [activePreset, setActivePreset] = useState<string>("original");
  const [slipCopied, setSlipCopied] = useState(false);

  const detectedLotSize = useMemo(
    () => defaultLotSize(pick.instrument, pick.instrumentType),
    [pick.instrument, pick.instrumentType]
  );

  const initialLtp = pick.livePrice != null && pick.livePrice > 0 ? pick.livePrice : rawEntry;
  const [lotSize, setLotSize] = useState<number>(detectedLotSize);
  const [lots, setLots] = useState<number>(1);
  const [accountCapital, setAccountCapital] = useState<number>(isStock ? 10_000 : 100_000);
  const [simulatedLtp, setSimulatedLtp] = useState<number>(initialLtp);
  const [customLtpInput, setCustomLtpInput] = useState<string>(initialLtp ? String(initialLtp) : "");

  const totalQuantity = Math.max(1, lots) * Math.max(1, lotSize);
  const capitalRequired = Math.round(entry * totalQuantity * 100) / 100;

  // Stop loss calculations
  const perUnitRisk = isLong ? Math.max(0, entry - stop) : Math.max(0, stop - entry);
  const totalMaxRisk = Math.round(perUnitRisk * totalQuantity * 100) / 100;
  const riskOfCapitalPct = accountCapital > 0 ? (totalMaxRisk / accountCapital) * 100 : 0;
  const stopLossPct = entry > 0 ? (perUnitRisk / entry) * 100 : 0;

  // Target 1 calculations
  const perUnitGainT1 = isLong ? Math.max(0, t1 - entry) : Math.max(0, entry - t1);
  const totalGainT1 = Math.round(perUnitGainT1 * totalQuantity * 100) / 100;
  const gainT1Pct = entry > 0 ? (perUnitGainT1 / entry) * 100 : 0;
  const rr1 = perUnitRisk > 0 ? perUnitGainT1 / perUnitRisk : 0;

  // Target 2 calculations
  const perUnitGainT2 = isLong ? Math.max(0, t2 - entry) : Math.max(0, entry - t2);
  const totalGainT2 = Math.round(perUnitGainT2 * totalQuantity * 100) / 100;
  const gainT2Pct = entry > 0 ? (perUnitGainT2 / entry) * 100 : 0;
  const rr2 = perUnitRisk > 0 ? perUnitGainT2 / perUnitRisk : 0;

  // Live P&L based on simulated or live LTP
  const currentLtp = simulatedLtp || entry;
  const pnlPerUnit = isLong ? currentLtp - entry : entry - currentLtp;
  const livePnlRupees = Math.round(pnlPerUnit * totalQuantity * 100) / 100;
  const livePnlPct = entry > 0 ? (pnlPerUnit / entry) * 100 : 0;
  const currentPositionValue = Math.round(currentLtp * totalQuantity * 100) / 100;

  // Breakeven win rate: 1 / (1 + RR)
  const breakevenWinRate = rr1 > 0 ? (1 / (1 + rr1)) * 100 : 50;

  // Slip generation with Part 2 Limit Order & Theta Time-Exit Safeguards
  const generateAdjustedSlip = () => {
    return [
      `=== UPSTOX ORDER SLIP (${isOption ? "OPTIONS" : "EQUITY"}) ===`,
      `ORDER TYPE: LIMIT ORDER ONLY (DO NOT USE MARKET ORDER - SLIPPAGE RISK)`,
      `INSTRUMENT: ${pick.instrument}`,
      `ACTION: ${isLong ? "BUY / LONG" : "SELL / SHORT"}`,
      `QUANTITY: ${totalQuantity} units (${lots} lot${lots > 1 ? "s" : ""})`,
      `LIMIT PRICE: ₹${entry}`,
      `STOP LOSS: ₹${stop} (-${stopLossPct.toFixed(1)}% | -₹${totalMaxRisk.toLocaleString("en-IN")})`,
      `TARGET 1 (Book 50%): ₹${t1} (+${gainT1Pct.toFixed(1)}% | +₹${totalGainT1.toLocaleString("en-IN")})`,
      `TARGET 2 (Runner): ₹${t2 || t1}`,
      `RISK/REWARD: 1 : ${rr1.toFixed(2)}x`,
      `MANDATORY SAFEGUARDS:`,
      `1. Place LIMIT order at ₹${entry} (avoids bid-ask slippage).`,
      `2. Place system Stop Loss at ₹${stop} immediately upon fill.`,
      isOption
        ? `3. ⏱️ TIME STOP (45-60m Rule): If Target 1 is not reached within 45-60 min, close position at breakeven/small loss to avoid Theta decay.`
        : `3. Intraday Exit: Square off before 3:15 PM IST. Never hold leveraged positions overnight.`,
      `==============================================`,
    ].join("\n");
  };

  const handleCopyAdjustedSlip = async () => {
    try {
      const text = generateAdjustedSlip();
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else if (typeof document !== "undefined") {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setSlipCopied(true);
      setTimeout(() => setSlipCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleAutoSize10k = () => {
    const cap = 10_000;
    setAccountCapital(cap);
    const riskPerShare = isLong ? Math.max(0.01, entry - stop) : Math.max(0.01, stop - entry);
    const riskBudget = cap * 0.015; // 1.5% = ₹150
    const riskQty = Math.floor(riskBudget / riskPerShare);
    const cashQty = Math.floor(cap / (entry || 1));
    const sizedQty = Math.max(1, Math.min(riskQty, cashQty));
    setLots(sizedQty);
    setLotSize(1);
  };

  // Quick Preset Handlers
  const applyPreset = (preset: "scalp" | "intraday" | "swing" | "original") => {
    setActivePreset(preset);
    if (preset === "original") {
      setEntry(rawEntry);
      setStop(rawStop);
      setT1(rawT1);
      setT2(rawT2);
      setSimulatedLtp(rawEntry);
      setCustomLtpInput(String(rawEntry));
      return;
    }

    const currentRisk = perUnitRisk > 0 ? perUnitRisk : Math.max(0.5, entry * 0.25);

    if (preset === "scalp") {
      // 1:1.0 Scalp
      const newT1 = round2(isLong ? entry + currentRisk * 1.0 : entry - currentRisk * 1.0);
      const newT2 = round2(isLong ? entry + currentRisk * 1.5 : entry - currentRisk * 1.5);
      setT1(newT1);
      setT2(newT2);
    } else if (preset === "intraday") {
      // 1:1.5 Realistic Intraday
      const newT1 = round2(isLong ? entry + currentRisk * 1.5 : entry - currentRisk * 1.5);
      const newT2 = round2(isLong ? entry + currentRisk * 2.0 : entry - currentRisk * 2.0);
      setT1(newT1);
      setT2(newT2);
    } else if (preset === "swing") {
      // 1:2.0 Moderate Swing
      const newT1 = round2(isLong ? entry + currentRisk * 2.0 : entry - currentRisk * 2.0);
      const newT2 = round2(isLong ? entry + currentRisk * 3.0 : entry - currentRisk * 3.0);
      setT1(newT1);
      setT2(newT2);
    }
  };

  // Adjust Stop Loss by percentage preset
  const setStopByPct = (pct: number) => {
    setActivePreset("custom");
    const delta = round2(entry * (pct / 100));
    const newStop = round2(isLong ? Math.max(0.05, entry - delta) : entry + delta);
    setStop(newStop);
  };

  // Trade Health and Status determination
  const statusVerdict = useMemo(() => {
    if (!entry || !stop) return { label: "INCOMPLETE LEVELS", color: "text-zinc-400", bg: "bg-zinc-800" };
    if (isLong) {
      if (currentLtp >= t2 && t2 > 0)
        return { label: "TARGET 2 HIT (MAX PROFIT)", color: "text-emerald-400", bg: "bg-emerald-950/60 border-emerald-700" };
      if (currentLtp >= t1 && t1 > 0)
        return { label: "TARGET 1 HIT (LOCK PROFIT)", color: "text-emerald-400", bg: "bg-emerald-950/60 border-emerald-700" };
      if (currentLtp > entry)
        return { label: "IN PROFIT (TRENDING IN FAVOR)", color: "text-emerald-400", bg: "bg-emerald-950/40 border-emerald-800" };
      if (currentLtp <= stop)
        return { label: "STOPPED OUT (STRICT EXIT)", color: "text-red-400", bg: "bg-red-950/60 border-red-700" };
      return { label: "NORMAL PULLBACK (WITHIN RISK BUFFER)", color: "text-amber-400", bg: "bg-amber-950/40 border-amber-800" };
    } else {
      if (currentLtp <= t2 && t2 > 0)
        return { label: "TARGET 2 HIT (MAX PROFIT)", color: "text-emerald-400", bg: "bg-emerald-950/60 border-emerald-700" };
      if (currentLtp <= t1 && t1 > 0)
        return { label: "TARGET 1 HIT (LOCK PROFIT)", color: "text-emerald-400", bg: "bg-emerald-950/60 border-emerald-700" };
      if (currentLtp < entry)
        return { label: "IN PROFIT (TRENDING IN FAVOR)", color: "text-emerald-400", bg: "bg-emerald-950/40 border-emerald-800" };
      if (currentLtp >= stop)
        return { label: "STOPPED OUT (STRICT EXIT)", color: "text-red-400", bg: "bg-red-950/60 border-red-700" };
      return { label: "NORMAL PULLBACK (WITHIN RISK BUFFER)", color: "text-amber-400", bg: "bg-amber-950/40 border-amber-800" };
    }
  }, [currentLtp, entry, stop, t1, t2, isLong]);

  // Visual Gauge Progress calculation (clamped 0 to 100%)
  const gaugePct = useMemo(() => {
    if (!entry || !stop || !t1) return 50;
    const minVal = Math.min(stop, entry, t1);
    const maxVal = Math.max(stop, entry, t1, t2 || t1);
    const range = maxVal - minVal;
    if (range <= 0) return 50;
    const clampedLtp = Math.max(minVal, Math.min(maxVal, currentLtp));
    return isLong
      ? ((clampedLtp - minVal) / range) * 100
      : ((maxVal - clampedLtp) / range) * 100;
  }, [currentLtp, entry, stop, t1, t2, isLong]);

  const customLtpId = useId();
  const accountCapitalId = useId();
  const lotsId = useId();
  const lotSizeId = useId();
  const entryId = useId();
  const stopId = useId();
  const t1Id = useId();
  const t2Id = useId();

  const liveAnalysis = useMemo(
    () =>
      analyzeSavedPick(
        {
          id: pick.id,
          savedAt: new Date().toISOString(),
          instrument: pick.instrument,
          instrumentType: (pick.instrumentType === "STOCK"
            ? "STOCK"
            : pick.instrument.toUpperCase().includes("NIFTY")
            ? "INDEX_OPTION"
            : "STOCK_OPTION") as SavedPick["instrumentType"],
          direction: (pick.direction === "SHORT" ? "SHORT" : "LONG") as "LONG" | "SHORT",
          entry,
          stopLoss: stop,
          targets: [t1, t2],
          source: (pick.source === "LIVE" ? "LIVE" : "RESEARCH") as PickSource,
          validation: "NOT_VALIDATED",
        },
        { livePrice: currentLtp }
      ),
    [pick, entry, stop, t1, t2, currentLtp]
  );

  return (
    <div className="mt-3 rounded-xl border border-zinc-700/80 bg-zinc-950 p-4 shadow-xl text-zinc-200">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-2">
          <Calculator className="text-sky-400" size={18} />
          <div>
            <span className="text-sm font-bold text-white">{pick.instrument}</span>
            <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-300">
              {pick.instrumentType}
            </span>
            <span
              className={`ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                isLong
                  ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                  : "bg-red-950 text-red-400 border border-red-800"
              }`}
            >
              {pick.direction}
            </span>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            title="Close calculator"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Live Market Place, Probability & Smart Verdict Banner */}
      <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900/80 p-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="font-semibold text-white">Live Market Status:</span>
            <span className="font-mono font-bold text-base text-white">₹{currentLtp}</span>
            <span
              className={`font-mono font-bold ${
                livePnlRupees >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {livePnlRupees >= 0 ? "+" : ""}
              {fmtInr(livePnlRupees)} ({livePnlPct.toFixed(1)}%)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-xs font-bold ${
                liveAnalysis.probability >= 60
                  ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                  : liveAnalysis.probability >= 40
                  ? "bg-sky-950 text-sky-300 border border-sky-800"
                  : liveAnalysis.probability >= 20
                  ? "bg-amber-950 text-amber-300 border border-amber-800"
                  : "bg-red-950 text-red-300 border border-red-800"
              }`}
            >
              <Sparkles size={11} />
              {liveAnalysis.probability}% Odds of T1
            </span>
            <span className="text-[10px] text-zinc-400 font-mono">
              (Req: {breakevenWinRate.toFixed(1)}%)
            </span>
          </div>
        </div>

        {/* Verdict Callout */}
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-zinc-950/80 p-2.5 border border-zinc-800/80">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold text-zinc-400">Recommendation:</span>
              <span
                className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${
                  liveAnalysis.verdict === "BOOK_PROFIT"
                    ? "bg-emerald-950 text-emerald-300 border border-emerald-700"
                    : liveAnalysis.verdict === "KEEP"
                    ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                    : liveAnalysis.verdict === "TIME_EXIT"
                    ? "bg-amber-950 text-amber-300 border border-amber-800"
                    : liveAnalysis.verdict === "REMOVE"
                    ? "bg-red-950 text-red-300 border border-red-800"
                    : "bg-zinc-800 text-zinc-300"
                }`}
              >
                {liveAnalysis.verdictLabel}
              </span>
            </div>
            <div className="text-[11px] text-zinc-300">
              {liveAnalysis.verdictReason}
            </div>
          </div>
          <div className="text-right text-[11px] text-sky-300 font-medium">
            👉 {liveAnalysis.actionableStep}
          </div>
        </div>
      </div>

      {/* Non-Trader Friendly 3-Step Plain English Translation */}
      <div className="mt-3.5 rounded-lg border border-sky-800/40 bg-sky-950/20 p-3">
        <div className="flex items-center gap-2 text-xs font-bold text-sky-300 uppercase tracking-wide">
          <HelpCircle size={14} className="text-sky-400" />
          <span>Simple 3-Step Guide (How This Trade Works in Plain English)</span>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-3 text-xs">
          <div className="rounded border border-zinc-800 bg-zinc-900/80 p-2.5">
            <div className="text-[10px] uppercase font-bold text-sky-400">Step 1: Your Purchase</div>
            <div className="mt-1 font-semibold text-white">
              Buy {totalQuantity} units at <span className="font-mono text-sky-300">₹{entry}</span>
            </div>
            <div className="mt-0.5 text-[11px] text-zinc-400">
              Total money needed to invest: <span className="font-mono font-bold text-zinc-200">{fmtInr(capitalRequired)}</span>.
            </div>
          </div>

          <div className="rounded border border-red-900/40 bg-zinc-900/80 p-2.5">
            <div className="text-[10px] uppercase font-bold text-red-400">Step 2: Safety Guard (Stop Loss)</div>
            <div className="mt-1 font-semibold text-white">
              Safety exit if price hits <span className="font-mono text-red-400">₹{stop}</span>
            </div>
            <div className="mt-0.5 text-[11px] text-zinc-400">
              Maximum loss is capped at <span className="font-mono font-bold text-red-400">-{fmtInr(totalMaxRisk)}</span> (-{stopLossPct.toFixed(1)}%). Protects the rest of your money.
            </div>
          </div>

          <div className="rounded border border-emerald-900/40 bg-zinc-900/80 p-2.5">
            <div className="text-[10px] uppercase font-bold text-emerald-400">Step 3: Profit Goal (Target 1)</div>
            <div className="mt-1 font-semibold text-white">
              Take profit at <span className="font-mono text-emerald-300">₹{t1}</span>
            </div>
            <div className="mt-0.5 text-[11px] text-zinc-400">
              Expected gain: <span className="font-mono font-bold text-emerald-400">+{fmtInr(totalGainT1)}</span> (+{gainT1Pct.toFixed(1)}% profit on your money).
            </div>
          </div>
        </div>
      </div>

      {/* Target & Level Adjuster Section */}
      <div className="mt-3.5 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-2.5">
          <div className="flex items-center gap-1.5">
            <Sliders size={14} className="text-sky-400" />
            <span className="text-xs font-semibold text-white">
              Customize Levels (T1 / T2 / Stop Loss)
            </span>
            <span className="text-[11px] text-zinc-400">· Adjust according to your risk tolerance</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-zinc-500 font-medium">Quick R:R Presets:</span>
            <button
              type="button"
              onClick={() => applyPreset("scalp")}
              className={`rounded px-2 py-0.5 text-[10px] font-medium transition ${
                activePreset === "scalp"
                  ? "bg-sky-600 text-white font-bold"
                  : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              }`}
            >
              1:1.0 Scalp (Quick Profit)
            </button>
            <button
              type="button"
              onClick={() => applyPreset("intraday")}
              className={`rounded px-2 py-0.5 text-[10px] font-medium transition ${
                activePreset === "intraday"
                  ? "bg-sky-600 text-white font-bold"
                  : "bg-sky-950/80 text-sky-300 border border-sky-800/80 hover:bg-sky-900"
              }`}
            >
              1:1.5 Intraday (Recommended)
            </button>
            <button
              type="button"
              onClick={() => applyPreset("swing")}
              className={`rounded px-2 py-0.5 text-[10px] font-medium transition ${
                activePreset === "swing"
                  ? "bg-emerald-600 text-white font-bold"
                  : "bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 hover:bg-emerald-900"
              }`}
            >
              1:2.0 Moderate Swing
            </button>
            <button
              type="button"
              onClick={() => applyPreset("original")}
              className="flex items-center gap-1 rounded bg-zinc-800/80 px-2 py-0.5 text-[10px] text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
              title="Reset to algorithmic scanner values"
            >
              <RotateCcw size={10} />
              Reset
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {/* Entry Price */}
          <div className="rounded border border-zinc-800 bg-zinc-950/80 p-2.5">
            <div className="text-[10px] font-semibold uppercase text-zinc-400">
              Entry Price (Buying Price)
            </div>
            <div className="mt-1 flex items-center gap-1">
              <input
                id={entryId}
                type="number"
                step="0.05"
                value={entry}
                onChange={(e) => {
                  setActivePreset("custom");
                  const val = Number(e.target.value) || 0;
                  setEntry(val);
                }}
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs font-bold text-white focus:border-sky-500 focus:outline-none"
              />
            </div>
            <div className="mt-1 text-[10px] text-zinc-400">
              Cost per single share or option unit
            </div>
          </div>

          {/* Stop Loss */}
          <div className="rounded border border-red-900/40 bg-zinc-950/80 p-2.5">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-semibold uppercase text-red-400">
                Stop Loss (Safety Exit)
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setStopByPct(25)}
                  className="rounded bg-red-950/80 px-1 text-[9px] text-red-300 hover:bg-red-900"
                  title="Set stop to -25%"
                >
                  25%
                </button>
                <button
                  type="button"
                  onClick={() => setStopByPct(50)}
                  className="rounded bg-red-950/80 px-1 text-[9px] text-red-300 hover:bg-red-900"
                  title="Set stop to -50%"
                >
                  50%
                </button>
              </div>
            </div>
            <div className="mt-1 flex items-center gap-1">
              <input
                id={stopId}
                type="number"
                step="0.05"
                value={stop}
                onChange={(e) => {
                  setActivePreset("custom");
                  const val = Number(e.target.value) || 0;
                  setStop(val);
                }}
                className="w-full rounded border border-red-800/60 bg-zinc-900 px-2 py-1 font-mono text-xs font-bold text-red-300 focus:border-red-500 focus:outline-none"
              />
            </div>
            <div className="mt-1 text-[10px] text-red-400 font-mono">
              Max loss: -₹{round2(perUnitRisk)} (-{stopLossPct.toFixed(1)}%)
            </div>
          </div>

          {/* Target 1 */}
          <div className="rounded border border-emerald-900/40 bg-zinc-950/80 p-2.5">
            <div className="text-[10px] font-semibold uppercase text-emerald-400">
              Target 1 (Primary Goal)
            </div>
            <div className="mt-1 flex items-center gap-1">
              <input
                id={t1Id}
                type="number"
                step="0.05"
                value={t1}
                onChange={(e) => {
                  setActivePreset("custom");
                  const val = Number(e.target.value) || 0;
                  setT1(val);
                }}
                className="w-full rounded border border-emerald-800/60 bg-zinc-900 px-2 py-1 font-mono text-xs font-bold text-emerald-300 focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div className="mt-1 text-[10px] text-emerald-400 font-mono">
              Gain: +{gainT1Pct.toFixed(1)}% (R:R {rr1.toFixed(2)}x)
            </div>
          </div>

          {/* Target 2 */}
          <div className="rounded border border-emerald-900/30 bg-zinc-950/80 p-2.5">
            <div className="text-[10px] font-semibold uppercase text-emerald-300">
              Target 2 (Extended Runner)
            </div>
            <div className="mt-1 flex items-center gap-1">
              <input
                id={t2Id}
                type="number"
                step="0.05"
                value={t2}
                onChange={(e) => {
                  setActivePreset("custom");
                  const val = Number(e.target.value) || 0;
                  setT2(val);
                }}
                className="w-full rounded border border-emerald-800/40 bg-zinc-900 px-2 py-1 font-mono text-xs font-bold text-emerald-200 focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div className="mt-1 text-[10px] text-emerald-300 font-mono">
              {t2 > 0 ? `Gain: +${gainT2Pct.toFixed(1)}% (R:R ${rr2.toFixed(2)}x)` : "Optional runner"}
            </div>
          </div>
        </div>
      </div>

      {/* Primary KPI Summary Cards */}
      <div className="mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-2.5">
          <div className="text-[11px] font-medium text-zinc-400">Capital Required</div>
          <div className="mt-1 font-mono text-base font-bold text-white">
            {fmtInr(capitalRequired)}
          </div>
          <div className="mt-0.5 text-[10px] text-zinc-500 font-mono">
            ₹{entry} × {totalQuantity} units
          </div>
        </div>

        <div className="rounded-lg border border-red-900/30 bg-zinc-900/60 p-2.5">
          <div className="text-[11px] font-medium text-zinc-400">Max Risk (Stop Loss)</div>
          <div className="mt-1 font-mono text-base font-bold text-red-400">
            -{fmtInr(totalMaxRisk)}
          </div>
          <div className="mt-0.5 text-[10px] text-red-400/80 font-mono">
            -{stopLossPct.toFixed(1)}% of capital
          </div>
        </div>

        <div className="rounded-lg border border-emerald-900/30 bg-zinc-900/60 p-2.5">
          <div className="text-[11px] font-medium text-zinc-400">Target 1 Profit</div>
          <div className="mt-1 font-mono text-base font-bold text-emerald-400">
            +{fmtInr(totalGainT1)}
          </div>
          <div className="mt-0.5 text-[10px] text-emerald-400/80 font-mono">
            +{gainT1Pct.toFixed(1)}% (R:R {rr1.toFixed(2)}x)
          </div>
        </div>

        <div className="rounded-lg border border-emerald-900/20 bg-zinc-900/60 p-2.5">
          <div className="text-[11px] font-medium text-zinc-400">Target 2 Profit</div>
          <div className="mt-1 font-mono text-base font-bold text-emerald-300">
            {t2 > 0 ? `+${fmtInr(totalGainT2)}` : "—"}
          </div>
          <div className="mt-0.5 text-[10px] text-emerald-300/80 font-mono">
            {t2 > 0 ? `+${gainT2Pct.toFixed(1)}% (R:R ${rr2.toFixed(2)}x)` : "Single Target"}
          </div>
        </div>
      </div>

      {/* Live P&L and Price Simulator Bar */}
      <div className="mt-3.5 rounded-lg border border-zinc-800 bg-zinc-900/90 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-zinc-300">Live / Simulated LTP:</span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-zinc-500 font-mono">₹</span>
              <input
                id={customLtpId}
                type="number"
                step="0.05"
                value={customLtpInput}
                onChange={(e) => {
                  setCustomLtpInput(e.target.value);
                  const val = Number(e.target.value);
                  if (Number.isFinite(val) && val > 0) setSimulatedLtp(val);
                }}
                className="w-24 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-xs font-bold text-white focus:border-sky-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  setSimulatedLtp(entry);
                  setCustomLtpInput(String(entry));
                }}
                className="rounded border border-zinc-700 bg-zinc-800 px-1.5 py-1 text-[10px] font-medium text-zinc-300 hover:bg-zinc-700"
                title="Reset to entry price"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Quick Price Shortcuts */}
          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
            <span className="text-zinc-500">Test Price:</span>
            <button
              type="button"
              onClick={() => {
                setSimulatedLtp(stop);
                setCustomLtpInput(String(stop));
              }}
              className="rounded bg-red-950/70 border border-red-800/80 px-2 py-0.5 font-mono text-red-300 hover:bg-red-900/80"
            >
              At Stop (₹{stop})
            </button>
            <button
              type="button"
              onClick={() => {
                setSimulatedLtp(t1);
                setCustomLtpInput(String(t1));
              }}
              className="rounded bg-emerald-950/70 border border-emerald-800/80 px-2 py-0.5 font-mono text-emerald-300 hover:bg-emerald-900/80"
            >
              At T1 (₹{t1})
            </button>
            {t2 > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSimulatedLtp(t2);
                  setCustomLtpInput(String(t2));
                }}
                className="rounded bg-emerald-950/70 border border-emerald-800/80 px-2 py-0.5 font-mono text-emerald-300 hover:bg-emerald-900/80"
              >
                At T2 (₹{t2})
              </button>
            )}
          </div>
        </div>

        {/* Live Unrealized P&L Banner */}
        <div className="mt-2.5 flex flex-wrap items-center justify-between rounded-md border border-zinc-800 bg-zinc-950 p-2.5">
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400">Position Value:</span>
            <span className="font-mono text-xs font-semibold text-zinc-200">
              {fmtInr(currentPositionValue)}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-zinc-400">Unrealized P&L:</span>
              <span
                className={`font-mono text-sm font-bold ${
                  livePnlRupees >= 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {livePnlRupees >= 0 ? `+${fmtInr(livePnlRupees)}` : fmtInr(livePnlRupees)}
              </span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-bold font-mono ${
                  livePnlPct >= 0
                    ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                    : "bg-red-950 text-red-400 border border-red-800"
                }`}
              >
                {livePnlPct >= 0 ? `+${livePnlPct.toFixed(1)}%` : `${livePnlPct.toFixed(1)}%`}
              </span>
            </div>

            <div
              className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusVerdict.bg} ${statusVerdict.color}`}
            >
              {statusVerdict.label}
            </div>
          </div>
        </div>

        {/* Visual Progress Bar (Stop Loss -> Entry -> Target 1 -> Target 2) */}
        <div className="mt-3">
          <div className="flex justify-between text-[10px] font-mono text-zinc-400 mb-1">
            <span className="text-red-400 font-semibold">SL: ₹{stop}</span>
            <span className="text-zinc-300 font-semibold">Entry: ₹{entry}</span>
            <span className="text-emerald-400 font-semibold">T1: ₹{t1}</span>
            {t2 > 0 && <span className="text-emerald-300 font-semibold">T2: ₹{t2}</span>}
          </div>
          <div className="relative h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                currentLtp >= entry ? "bg-emerald-500" : "bg-red-500"
              }`}
              style={{ width: `${Math.max(2, Math.min(100, gaugePct))}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-zinc-500">
            <span>Stop Floor</span>
            <span className="text-sky-400 font-mono">Current: ₹{currentLtp}</span>
            <span>Target Ceiling</span>
          </div>
        </div>
      </div>

      {/* Position Sizing and Inputs Adjuster */}
      <div className="mt-3.5 grid gap-3 sm:grid-cols-3 rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-3">
        <div>
          <label htmlFor={accountCapitalId} className="block text-[11px] font-medium text-zinc-400">
            Account Capital
          </label>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="text-xs text-zinc-500 font-mono">₹</span>
            <input
              id={accountCapitalId}
              type="number"
              value={accountCapital}
              onChange={(e) => setAccountCapital(Number(e.target.value) || 0)}
              className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-xs text-white focus:border-sky-500 focus:outline-none"
            />
          </div>
          <div className="mt-1 text-[10px] text-zinc-500">
            Trade risk: <span className="font-mono text-zinc-300">{riskOfCapitalPct.toFixed(1)}%</span> of capital
          </div>
        </div>

        <div>
          <label htmlFor={lotsId} className="block text-[11px] font-medium text-zinc-400">
            {pick.instrumentType === "STOCK" ? "Number of Shares" : "Number of Lots"}
          </label>
          <div className="mt-1 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setLots((prev) => Math.max(1, prev - 1))}
              className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 font-mono text-xs font-bold hover:bg-zinc-700"
            >
              -
            </button>
            <input
              id={lotsId}
              type="number"
              min={1}
              value={lots}
              onChange={(e) => setLots(Math.max(1, Number(e.target.value) || 1))}
              className="w-full text-center rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-xs font-bold text-white focus:border-sky-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setLots((prev) => prev + 1)}
              className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 font-mono text-xs font-bold hover:bg-zinc-700"
            >
              +
            </button>
          </div>
          <div className="mt-1 text-[10px] text-zinc-500 font-mono">
            Total Qty: {totalQuantity} units
          </div>
          {isStock && (
            <button
              type="button"
              onClick={handleAutoSize10k}
              className="mt-1.5 inline-flex items-center gap-1 rounded bg-sky-950 px-2 py-1 text-[10px] font-semibold text-sky-300 border border-sky-800 hover:bg-sky-900 transition-colors"
            >
              <Sparkles size={11} />
              Auto-Size for ₹10k (1.5% Risk)
            </button>
          )}
        </div>

        <div>
          <label htmlFor={lotSizeId} className="block text-[11px] font-medium text-zinc-400">
            Lot Size (Multiplier)
          </label>
          <div className="mt-1">
            <input
              id={lotSizeId}
              type="number"
              min={1}
              value={lotSize}
              onChange={(e) => setLotSize(Math.max(1, Number(e.target.value) || 1))}
              className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-xs text-white focus:border-sky-500 focus:outline-none"
            />
          </div>
          <div className="mt-1 text-[10px] text-zinc-500">
            Auto-detected for {pick.instrument.split(" ")[0]}
          </div>
        </div>
      </div>

      {/* Probabilistic Edge & "Will It Profit?" Intelligence Card */}
      <div className="mt-3.5 rounded-lg border border-sky-900/60 bg-sky-950/20 p-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sky-900/40 pb-2">
          <div className="flex items-center gap-1.5 font-semibold text-sky-300">
            <HelpCircle size={14} />
            <span>Profit Realism & Probability Analysis:</span>
          </div>
          <button
            type="button"
            onClick={handleCopyAdjustedSlip}
            className="inline-flex items-center gap-1.5 rounded border border-sky-600/80 bg-sky-950 px-2.5 py-1 text-[11px] font-semibold text-sky-200 transition-colors hover:bg-sky-900 hover:text-white"
            title="Copy exchange-ready limit order slip with all safeguards to clipboard"
          >
            {slipCopied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} className="text-sky-400" />}
            <span>{slipCopied ? "Order Slip Copied!" : "Copy Adjusted Limit Order Slip"}</span>
          </button>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 text-zinc-300">
          <div className="rounded border border-sky-900/40 bg-zinc-950/60 p-2.5">
            <div className="font-semibold text-zinc-200">1. Asymmetric Risk/Reward Advantage</div>
            <div className="mt-1 text-[11px] text-zinc-400 leading-relaxed">
              Target 1 gives{" "}
              <span className="font-mono text-emerald-400 font-bold">+{fmtInr(totalGainT1)}</span> vs Stop Loss of{" "}
              <span className="font-mono text-red-400 font-bold">-{fmtInr(totalMaxRisk)}</span>.
              With your adjusted <span className="font-mono text-sky-300 font-bold">{rr1.toFixed(2)}x R:R</span>, you only need a{" "}
              <span className="font-mono text-amber-300 font-bold">{breakevenWinRate.toFixed(1)}% win rate</span> to break even.
              Winning 4 out of 10 trades yields solid mathematical positive expectancy.
            </div>
          </div>

          <div className="rounded border border-sky-900/40 bg-zinc-950/60 p-2.5">
            <div className="font-semibold text-zinc-200">2. Professional Execution Rule</div>
            <div className="mt-1 text-[11px] text-zinc-400 leading-relaxed">
              • Place automatic Stop Loss at{" "}
              <span className="font-mono text-red-300 font-semibold">₹{stop}</span> immediately upon entry.<br />
              • When price touches Target 1 (
              <span className="font-mono text-emerald-300 font-semibold">₹{t1}</span>), book 50% profit and trail Stop Loss to entry (
              <span className="font-mono text-zinc-200 font-semibold">₹{entry}</span>).<br />
              • Let the remaining lots ride to Target 2 (
              <span className="font-mono text-emerald-300 font-semibold">₹{t2 || t1}</span>) completely risk-free!
            </div>
          </div>
        </div>
      </div>

      {/* Part 2: Real-World Execution Safeguards */}
      <div className="mt-3.5 rounded-lg border border-amber-900/40 bg-amber-950/15 p-3 text-xs">
        <div className="flex items-center gap-1.5 font-semibold text-amber-300 uppercase tracking-wide">
          <Shield size={14} className="text-amber-400" />
          <span>Real-World Trading Safeguards (Mandatory Safety Controls)</span>
        </div>
        <div className="mt-2.5 grid gap-2.5 sm:grid-cols-3 text-zinc-300">
          {/* Safeguard 1: Theta Decay / Time-Stop */}
          <div className="rounded border border-amber-900/40 bg-zinc-950/80 p-2.5">
            <div className="flex items-center gap-1.5 font-semibold text-amber-300">
              <Clock size={13} className="text-amber-400" />
              <span>{isOption ? "45–60m Theta Time-Stop" : "Intraday Square-off"}</span>
            </div>
            <div className="mt-1 text-[11px] text-zinc-400 leading-relaxed">
              {isOption ? (
                <>
                  Options suffer from <span className="text-amber-300 font-semibold">Theta (time decay)</span>. If this trade does not move toward Target 1 within <span className="font-mono text-white font-semibold">45–60 minutes</span>, close at breakeven or small loss. Do NOT hold stagnant options all day.
                </>
              ) : (
                <>
                  Intraday equity leverage carries overnight penalty risks. All day trades must be closed before <span className="font-mono text-white font-semibold">3:15 PM IST</span> regardless of target status.
                </>
              )}
            </div>
          </div>

          {/* Safeguard 2: Limit Orders */}
          <div className="rounded border border-sky-900/40 bg-zinc-950/80 p-2.5">
            <div className="flex items-center gap-1.5 font-semibold text-sky-300">
              <Target size={13} className="text-sky-400" />
              <span>Limit Orders Only (Slippage Guard)</span>
            </div>
            <div className="mt-1 text-[11px] text-zinc-400 leading-relaxed">
              Never use <span className="text-red-300 font-semibold">Market Orders</span>. Fast-moving strikes have wide bid-ask spreads that fill 2–5% worse than the screen price. Always place an Exchange <span className="text-sky-300 font-semibold">LIMIT order at ₹{entry}</span>.
            </div>
          </div>

          {/* Safeguard 3: Validation Transparency */}
          <div className="rounded border border-emerald-900/40 bg-zinc-950/80 p-2.5">
            <div className="flex items-center gap-1.5 font-semibold text-emerald-300">
              <CheckCircle2 size={13} className="text-emerald-400" />
              <span>Why &quot;NOT VALIDATED&quot;?</span>
            </div>
            <div className="mt-1 text-[11px] text-zinc-400 leading-relaxed">
              This setup is an algorithmic candidate. Quantitative models require <span className="text-emerald-300 font-semibold">≥30 forward paper trades</span> in the Journal to establish statistical proof (p &lt; 0.05). This prevents false profit promises.
            </div>
          </div>
        </div>
      </div>

      {/* Validation Hub */}
      <div className="mt-3.5 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-xs flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-semibold text-zinc-200 flex items-center gap-1.5">
            <Shield size={14} className="text-emerald-400" />
            <span>Signal Validation Hub:</span>
          </div>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            Saved picks are candidate setups. To forward-track outcomes or test historical edge:
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/opportunity-journal"
            className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-700 hover:border-zinc-500"
          >
            Track in Journal →
          </Link>
          <Link
            href="/backtest"
            className="rounded border border-sky-800 bg-sky-950/60 px-3 py-1 text-xs font-medium text-sky-200 hover:bg-sky-900"
          >
            Walk-Forward Backtest →
          </Link>
        </div>
      </div>
    </div>
  );
}
