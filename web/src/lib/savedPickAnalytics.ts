// Pure analytical functions for saved picks:
// 1. Live market place & excursion metrics
// 2. Real-time probability of touching Target 1 before Stop Loss
// 3. Smart Decision Verdict: KEEP vs REMOVE / TIME EXIT
import type { SavedPick } from "./savedPicks.ts";
export type { SavedPick };

export interface PickLiveAnalysis {
  pickId: string;
  instrument: string;
  instrumentType: string;
  direction: "LONG" | "SHORT";
  isLong: boolean;
  isOption: boolean;
  entry: number;
  stopLoss: number;
  target1: number;
  target2: number;
  rr1: number;
  breakevenWinRate: number; // in percent (e.g. 32.3%)

  // Live Market Position
  livePrice: number | null;
  hasLivePrice: boolean;
  pnlPerUnit: number | null;
  pnlPercent: number | null;
  distanceToTarget1: number | null;
  distanceToTarget1Percent: number | null;
  distanceToStop: number | null;
  distanceToStopPercent: number | null;
  progressPercent: number; // 0% (at Stop Loss) -> 50% (at Entry) -> 100% (at Target 1)

  // Probability Analysis
  probability: number; // 0% to 100%
  probabilityTier: "EXCELLENT" | "HIGH" | "FAIR" | "LOW" | "CRITICAL";
  probabilityLabel: string;
  statisticalEdge: number; // probability - breakevenWinRate

  // Smart Action Verdict
  verdict: "KEEP" | "BOOK_PROFIT" | "TIME_EXIT" | "REMOVE" | "WATCHLIST";
  verdictTone: "emerald" | "sky" | "amber" | "red" | "zinc";
  verdictLabel: string;
  verdictReason: string;
  actionableStep: string;
  urgency: "NORMAL" | "ACTION_REQUIRED" | "CRITICAL_EXIT";
}

export interface AnalyzePickOptions {
  livePrice?: number | null;
  now?: Date;
  timeStopMinutes?: number; // default 45
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;

export function analyzeSavedPick(pick: SavedPick, options: AnalyzePickOptions = {}): PickLiveAnalysis {
  const isLong = pick.direction !== "SHORT";
  const isOption = pick.instrumentType === "INDEX_OPTION" || pick.instrumentType === "STOCK_OPTION";
  const entry = Number(pick.entry) || 0;
  const stopLoss = Number(pick.stopLoss) || 0;
  const target1 = pick.targets?.[0] != null ? Number(pick.targets[0]) : entry;
  const target2 = pick.targets?.[1] != null ? Number(pick.targets[1]) : target1;

  const perUnitRisk = isLong ? Math.max(0, entry - stopLoss) : Math.max(0, stopLoss - entry);
  const perUnitReward1 = isLong ? Math.max(0, target1 - entry) : Math.max(0, entry - target1);
  const rr1 = perUnitRisk > 0 ? r2(perUnitReward1 / perUnitRisk) : 0;
  const breakevenWinRate = rr1 > 0 ? r1((1 / (1 + rr1)) * 100) : 50;

  const rawLive = options.livePrice != null && Number.isFinite(options.livePrice) && options.livePrice > 0
    ? options.livePrice
    : null;
  const hasLivePrice = rawLive !== null;
  const livePrice = rawLive ?? entry;

  // Elapsed time in trade since pick was saved
  const now = options.now ?? new Date();
  const savedDate = new Date(pick.savedAt);
  const elapsedMinutes = !Number.isNaN(savedDate.getTime())
    ? Math.max(0, Math.floor((now.getTime() - savedDate.getTime()) / 60000))
    : 0;

  // P&L metrics
  const pnlPerUnit = hasLivePrice
    ? r2(isLong ? livePrice - entry : entry - livePrice)
    : null;
  const pnlPercent = hasLivePrice && entry > 0
    ? r1(((pnlPerUnit ?? 0) / entry) * 100)
    : null;

  // Distance metrics
  const distanceToTarget1 = hasLivePrice
    ? r2(isLong ? target1 - livePrice : livePrice - target1)
    : null;
  const distanceToTarget1Percent = hasLivePrice && livePrice > 0
    ? r1(((distanceToTarget1 ?? 0) / livePrice) * 100)
    : null;

  const distanceToStop = hasLivePrice
    ? r2(isLong ? livePrice - stopLoss : stopLoss - livePrice)
    : null;
  const distanceToStopPercent = hasLivePrice && livePrice > 0
    ? r1(((distanceToStop ?? 0) / livePrice) * 100)
    : null;

  // Visual Progress: 0% = Stop Loss, 50% = Entry, 100% = Target 1
  let progressPercent = 50;
  if (entry > 0 && stopLoss > 0 && target1 > 0) {
    if (isLong) {
      if (livePrice <= stopLoss) progressPercent = 0;
      else if (livePrice >= target1) progressPercent = 100;
      else if (livePrice < entry) {
        progressPercent = r1(((livePrice - stopLoss) / Math.max(0.001, entry - stopLoss)) * 50);
      } else {
        progressPercent = r1(50 + ((livePrice - entry) / Math.max(0.001, target1 - entry)) * 50);
      }
    } else {
      if (livePrice >= stopLoss) progressPercent = 0;
      else if (livePrice <= target1) progressPercent = 100;
      else if (livePrice > entry) {
        progressPercent = r1(((stopLoss - livePrice) / Math.max(0.001, stopLoss - entry)) * 50);
      } else {
        progressPercent = r1(50 + ((entry - livePrice) / Math.max(0.001, entry - target1)) * 50);
      }
    }
  }

  // Real-time Probability of touching Target 1 before Stop Loss
  // Risk-neutral hitting probability: (P - S) / (T - S)
  let probability = breakevenWinRate;
  if (hasLivePrice && entry > 0 && stopLoss > 0 && target1 > 0) {
    if (isLong) {
      if (livePrice >= target1) {
        probability = 100;
      } else if (livePrice <= stopLoss) {
        probability = 0;
      } else {
        const totalSpan = target1 - stopLoss;
        const currentSpan = livePrice - stopLoss;
        probability = totalSpan > 0 ? r1(Math.min(98, Math.max(2, (currentSpan / totalSpan) * 100))) : breakevenWinRate;
      }
    } else {
      if (livePrice <= target1) {
        probability = 100;
      } else if (livePrice >= stopLoss) {
        probability = 0;
      } else {
        const totalSpan = stopLoss - target1;
        const currentSpan = stopLoss - livePrice;
        probability = totalSpan > 0 ? r1(Math.min(98, Math.max(2, (currentSpan / totalSpan) * 100))) : breakevenWinRate;
      }
    }
  }

  const statisticalEdge = r1(probability - breakevenWinRate);

  let probabilityTier: PickLiveAnalysis["probabilityTier"] = "FAIR";
  let probabilityLabel = `${probability}% Odds`;
  if (probability >= 80) {
    probabilityTier = "EXCELLENT";
    probabilityLabel = `${probability}% Odds (High Conviction)`;
  } else if (probability >= 60) {
    probabilityTier = "HIGH";
    probabilityLabel = `${probability}% Odds (Strong Feasibility)`;
  } else if (probability >= 40) {
    probabilityTier = "FAIR";
    probabilityLabel = `${probability}% Odds (Standard)`;
  } else if (probability > 15) {
    probabilityTier = "LOW";
    probabilityLabel = `${probability}% Odds (Near Stop Loss)`;
  } else {
    probabilityTier = "CRITICAL";
    probabilityLabel = `${probability}% Odds (Stop Breach)`;
  }

  // Smart Action Verdict: KEEP vs REMOVE vs TIME EXIT vs BOOK PROFIT
  let verdict: PickLiveAnalysis["verdict"] = "WATCHLIST";
  let verdictTone: PickLiveAnalysis["verdictTone"] = "zinc";
  let verdictLabel = "⚪ WATCHLIST";
  let verdictReason = "Awaiting live market quote or market opening.";
  let actionableStep = `Set a LIMIT order at ₹${entry} with Stop Loss at ₹${stopLoss}.`;
  let urgency: PickLiveAnalysis["urgency"] = "NORMAL";

  const timeStopThreshold = options.timeStopMinutes ?? 45;

  if (!hasLivePrice) {
    verdict = "WATCHLIST";
    verdictTone = "zinc";
    verdictLabel = "⚪ WATCHLIST (AWAITING MARKET)";
    verdictReason = "Market quotes are not active for this instrument right now.";
    actionableStep = `Set a LIMIT order at ₹${entry} with Stop Loss at ₹${stopLoss}.`;
    urgency = "NORMAL";
  } else if ((isLong && livePrice >= target1) || (!isLong && livePrice <= target1)) {
    // Target 1 Hit!
    verdict = "BOOK_PROFIT";
    verdictTone = "emerald";
    verdictLabel = "🏆 BOOK 50% PROFIT (TARGET 1 REACHED)";
    verdictReason = `Price reached Target 1 (₹${target1}) with +${pnlPercent}% gain. First profit objective met!`;
    actionableStep = `Book 50% profit now. Trail Stop Loss to Entry (₹${entry}) to ride Target 2 (₹${target2}) risk-free.`;
    urgency = "ACTION_REQUIRED";
  } else if ((isLong && livePrice <= stopLoss) || (!isLong && livePrice >= stopLoss)) {
    // Stop Loss Hit!
    verdict = "REMOVE";
    verdictTone = "red";
    verdictLabel = "🔴 REMOVE (STOP LOSS HIT)";
    verdictReason = `Price breached Stop Loss (₹${stopLoss}) with ${pnlPercent}% loss. Capital protection triggered.`;
    actionableStep = "Exit position immediately. Remove this pick from your active watchlist.";
    urgency = "CRITICAL_EXIT";
  } else if (isOption && elapsedMinutes >= timeStopThreshold && (pnlPerUnit ?? 0) < perUnitRisk * 0.35) {
    // Option Theta Time-Exit Rule
    verdict = "TIME_EXIT";
    verdictTone = "amber";
    verdictLabel = "🟡 TIME EXIT (THETA DECAY RISK)";
    verdictReason = `Trade has been held for ${elapsedMinutes}m without breakout. Option time decay (Theta) is eroding premium.`;
    actionableStep = "Close trade at breakeven or small loss now. Do NOT hold stagnant options all day.";
    urgency = "ACTION_REQUIRED";
  } else if (pnlPerUnit != null && pnlPerUnit > 0) {
    // In Profit & Progressing
    verdict = "KEEP";
    verdictTone = "emerald";
    verdictLabel = "🟢 STRONG KEEP (ON TRACK)";
    verdictReason = `Trade is in profit (+${pnlPercent}%) and moving toward Target 1 (${distanceToTarget1Percent}% away).`;
    actionableStep = `Hold position. Maintain active Stop Loss at ₹${stopLoss}. Target 1 is ₹${target1}.`;
    urgency = "NORMAL";
  } else if (distanceToStop != null && distanceToStopPercent != null && distanceToStopPercent <= 5) {
    // Near Stop Loss
    verdict = "KEEP";
    verdictTone = "amber";
    verdictLabel = "⚠️ CAUTION (NEAR STOP LOSS)";
    verdictReason = `Price is within ${distanceToStopPercent}% of Stop Loss (₹${stopLoss}). Downward pressure present.`;
    actionableStep = `Strictly honor Stop Loss at ₹${stopLoss}. Do not average down or move your stop lower.`;
    urgency = "ACTION_REQUIRED";
  } else {
    // Consolidating near entry
    verdict = "KEEP";
    verdictTone = "sky";
    verdictLabel = "🔵 KEEP (CONSOLIDATING)";
    verdictReason = `Price is hovering near Entry (₹${entry}). Trade thesis remains intact.`;
    actionableStep = `Continue holding with Stop Loss set at ₹${stopLoss}. Awaiting momentum toward ₹${target1}.`;
    urgency = "NORMAL";
  }

  return {
    pickId: pick.id,
    instrument: pick.instrument,
    instrumentType: pick.instrumentType,
    direction: pick.direction as "LONG" | "SHORT",
    isLong,
    isOption,
    entry,
    stopLoss,
    target1,
    target2,
    rr1,
    breakevenWinRate,
    livePrice: rawLive,
    hasLivePrice,
    pnlPerUnit,
    pnlPercent,
    distanceToTarget1,
    distanceToTarget1Percent,
    distanceToStop,
    distanceToStopPercent,
    progressPercent,
    probability,
    probabilityTier,
    probabilityLabel,
    statisticalEdge,
    verdict,
    verdictTone,
    verdictLabel,
    verdictReason,
    actionableStep,
    urgency,
  };
}
