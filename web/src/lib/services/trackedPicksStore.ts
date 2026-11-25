// Phase 4+ — Tracked Picks Store & Live Risk Guidance Engine.
// Tracks user-selected option contracts (supports 1, 2, 3, or more concurrent picks),
// computes live P&L, and generates real-time advice:
// - HOLD / WAIT: Trend intact, spot above support, R:R positive.
// - TRAIL_STOP: Near Target 1; shift stop to cost.
// - WARNING: Approaching institutional OI writer resistance wall.
// - CUT: Stop loss breached.
// - SQUARE_OFF: 15:15 IST intraday market cutoff reached.

import * as fs from "node:fs";
import * as path from "node:path";

export type RiskAdvice = "HOLD" | "TRAIL_STOP" | "WARNING" | "CUT" | "SQUARE_OFF";

export interface TrackedPick {
  id: string;
  underlying: string;
  strike: number;
  optionType: "CE" | "PE";
  strategyType: string;
  entry: number;
  stop: number;
  target1: number;
  target2: number;
  lotSize: number;
  instrumentKey?: string | null;
  savedByChatId?: string | number;
  addedAt: string; // ISO
  lastLtp: number | null;
  lastPnl: number | null;
  lastPnlPct: number | null;
  riskAdvice: RiskAdvice;
  adviceReason: string;
  lastAlertedAdvice?: RiskAdvice;
  status: "ACTIVE" | "REMOVED" | "COMPLETED";
}

export interface TrackedPickInput {
  underlying: string;
  strike: number;
  optionType: "CE" | "PE";
  strategyType?: string;
  entry: number;
  stop: number;
  target1: number;
  target2?: number;
  lotSize?: number;
  instrumentKey?: string | null;
  savedByChatId?: string | number;
}

const trackedPicksDir = () => process.env.TRACKED_PICKS_DIR ?? path.join(process.cwd(), ".data");
const trackedPicksFile = () => path.join(trackedPicksDir(), "tracked-picks.json");

function loadTrackedPicks(): TrackedPick[] {
  try {
    const file = trackedPicksFile();
    if (!fs.existsSync(file)) return [];
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TrackedPick[]) : [];
  } catch {
    return [];
  }
}

function saveTrackedPicks(picks: TrackedPick[]): void {
  const dir = trackedPicksDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = trackedPicksFile();
  fs.writeFileSync(file, JSON.stringify(picks, null, 2), "utf8");
}

/** Generates clean deterministic pick key. */
export function buildPickKey(underlying: string, strike: number, optType: "CE" | "PE"): string {
  return `${underlying.trim().toUpperCase()}_${strike}_${optType}`;
}

/**
 * Evaluates intelligent risk advice for an option pick given its current premium.
 */
export function evaluateRiskAdvice(
  pick: Pick<TrackedPick, "entry" | "stop" | "target1" | "target2" | "optionType" | "strike" | "underlying">,
  currentPrice: number,
  now: Date = new Date(),
): { advice: RiskAdvice; reason: string } {
  // 1. Check 15:15 IST Intraday Cutoff
  const istHours = (now.getUTCHours() + 5 + Math.floor((now.getUTCMinutes() + 30) / 60)) % 24;
  const istMinutes = (now.getUTCMinutes() + 30) % 60;
  const isAfterSquareOff = istHours > 15 || (istHours === 15 && istMinutes >= 15);

  if (isAfterSquareOff) {
    return {
      advice: "SQUARE_OFF",
      reason: "⏰ 15:15 IST INTRADAY CLOSE: Market entering square-off window. Close all open option positions.",
    };
  }

  // 2. Check Stop Loss Hit / Breach
  if (currentPrice <= pick.stop) {
    const lossPerUnit = Math.round((pick.entry - currentPrice) * 10) / 10;
    return {
      advice: "CUT",
      reason: `🛑 CUT & REMOVE: Stop loss ₹${pick.stop.toFixed(1)} breached (Current ₹${currentPrice.toFixed(1)}, -₹${lossPerUnit}). Exit immediately to preserve capital.`,
    };
  }

  // 3. Check Target 1 Hit or Approached (>= 80% of move)
  const totalTargetRange = pick.target1 - pick.entry;
  const currentProgress = currentPrice - pick.entry;

  if (currentPrice >= pick.target1) {
    return {
      advice: "TRAIL_STOP",
      reason: `🎯 TARGET 1 HIT (₹${pick.target1.toFixed(1)})! Current ₹${currentPrice.toFixed(1)}. Book 50% profit and trail stop-loss to entry (₹${pick.entry.toFixed(1)}) for a risk-free run to Target 2 (₹${pick.target2.toFixed(1)}).`,
    };
  }

  if (totalTargetRange > 0 && currentProgress / totalTargetRange >= 0.75) {
    return {
      advice: "TRAIL_STOP",
      reason: `🟡 TRAIL STOP RECOMMENDED (75%+ of target achieved): Current ₹${currentPrice.toFixed(1)}. Move stop-loss to entry price ₹${pick.entry.toFixed(1)} to lock in risk-free trade.`,
    };
  }

  // 4. Default: WAIT / HOLD
  const pnlPerUnit = Math.round((currentPrice - pick.entry) * 10) / 10;
  const pnlPct = Math.round((pnlPerUnit / pick.entry) * 1000) / 10;
  const distToTarget = Math.max(0, Math.round((pick.target1 - currentPrice) * 10) / 10);
  const distToStop = Math.max(0, Math.round((currentPrice - pick.stop) * 10) / 10);

  if (pnlPerUnit >= 0) {
    return {
      advice: "HOLD",
      reason: `🟢 WAIT & HOLD: Current ₹${currentPrice.toFixed(1)} (+${pnlPct}%). ₹${distToStop} buffer above stop. Target 1 is ₹${distToTarget} away. Position healthy.`,
    };
  }

  return {
    advice: "HOLD",
    reason: `⚪ HOLD & MONITOR: Current ₹${currentPrice.toFixed(1)} (${pnlPct}%). Sitting above stop ₹${pick.stop.toFixed(1)} (₹${distToStop} cushion). Thesis intact.`,
  };
}

/**
 * Adds an option contract to active tracking ledger.
 */
export function addTrackedPick(input: TrackedPickInput, now = new Date()): TrackedPick {
  const all = loadTrackedPicks();
  const pickId = buildPickKey(input.underlying, input.strike, input.optionType);

  // If already exists, replace
  const existingIndex = all.findIndex((p) => p.id === pickId);
  const initialAdvice = evaluateRiskAdvice(
    {
      entry: input.entry,
      stop: input.stop,
      target1: input.target1,
      target2: input.target2 ?? Math.round(input.entry * 1.5),
      optionType: input.optionType,
      strike: input.strike,
      underlying: input.underlying,
    },
    input.entry,
    now,
  );

  const newPick: TrackedPick = {
    id: pickId,
    underlying: input.underlying.toUpperCase(),
    strike: input.strike,
    optionType: input.optionType,
    strategyType: input.strategyType || (input.optionType === "CE" ? "LONG_CALL" : "LONG_PUT"),
    entry: input.entry,
    stop: input.stop,
    target1: input.target1,
    target2: input.target2 ?? Math.round(input.entry * 1.5),
    lotSize: input.lotSize || (input.underlying.includes("BANK") ? 30 : 65),
    instrumentKey: input.instrumentKey ?? null,
    savedByChatId: input.savedByChatId,
    addedAt: now.toISOString(),
    lastLtp: input.entry,
    lastPnl: 0,
    lastPnlPct: 0,
    riskAdvice: initialAdvice.advice,
    adviceReason: initialAdvice.reason,
    status: "ACTIVE",
  };

  if (existingIndex >= 0) {
    all[existingIndex] = newPick;
  } else {
    all.push(newPick);
  }

  saveTrackedPicks(all);
  return newPick;
}

/**
 * Removes or marks pick as removed (optionally filtered by user chat ID).
 */
export function removeTrackedPick(idOrKey: string, userChatId?: string | number): boolean {
  const all = loadTrackedPicks();
  let modified = false;

  for (const p of all) {
    const matchesUser =
      userChatId === undefined || userChatId === null || String(p.savedByChatId) === String(userChatId);
    if (
      p.status === "ACTIVE" &&
      matchesUser &&
      (p.id.toLowerCase() === idOrKey.toLowerCase() ||
        p.instrumentKey?.toLowerCase() === idOrKey.toLowerCase() ||
        buildPickKey(p.underlying, p.strike, p.optionType).toLowerCase() === idOrKey.toLowerCase())
    ) {
      p.status = "REMOVED";
      modified = true;
    }
  }

  if (modified) {
    saveTrackedPicks(all);
    return true;
  }
  return false;
}

/** Clears tracked picks (all picks if userChatId omitted, or user-specific picks if specified). */
export function clearAllTrackedPicks(userChatId?: string | number): number {
  const all = loadTrackedPicks();
  if (userChatId === undefined || userChatId === null) {
    saveTrackedPicks([]);
    return all.length;
  }
  const targetStr = String(userChatId);
  const remaining = all.filter((p) => String(p.savedByChatId) !== targetStr);
  const removedCount = all.length - remaining.length;
  saveTrackedPicks(remaining);
  return removedCount;
}

/**
 * Returns all active tracked picks (optionally filtered by user chat ID).
 */
export function listTrackedPicks(onlyActive = true, userChatId?: string | number): TrackedPick[] {
  const all = loadTrackedPicks();
  let filtered = onlyActive ? all.filter((p) => p.status === "ACTIVE") : all;
  if (userChatId !== undefined && userChatId !== null) {
    const targetStr = String(userChatId);
    filtered = filtered.filter((p) => String(p.savedByChatId) === targetStr);
  }
  return filtered;
}

/**
 * Updates quotes and risk advice for a tracked pick.
 */
export function updateTrackedPickQuote(
  idOrKey: string,
  currentPrice: number,
  now = new Date(),
): TrackedPick | null {
  const all = loadTrackedPicks();
  const pick = all.find(
    (p) =>
      p.status === "ACTIVE" &&
      (p.id.toLowerCase() === idOrKey.toLowerCase() ||
        p.instrumentKey?.toLowerCase() === idOrKey.toLowerCase() ||
        buildPickKey(p.underlying, p.strike, p.optionType).toLowerCase() === idOrKey.toLowerCase()),
  );

  if (!pick) return null;

  const pnlPerUnit = Math.round((currentPrice - pick.entry) * 10) / 10;
  const pnlPct = Math.round((pnlPerUnit / pick.entry) * 1000) / 10;
  const totalPnl = Math.round(pnlPerUnit * pick.lotSize);
  const evalAdvice = evaluateRiskAdvice(pick, currentPrice, now);

  pick.lastLtp = currentPrice;
  pick.lastPnl = totalPnl;
  pick.lastPnlPct = pnlPct;
  pick.riskAdvice = evalAdvice.advice;
  pick.adviceReason = evalAdvice.reason;

  if (evalAdvice.advice === "CUT") {
    pick.status = "COMPLETED";
  }

  saveTrackedPicks(all);
  return pick;
}

/**
 * Clears active intraday picks at 15:15 IST.
 */
export function archiveIntradayPicks(): number {
  const all = loadTrackedPicks();
  let count = 0;
  for (const p of all) {
    if (p.status === "ACTIVE") {
      p.status = "COMPLETED";
      p.riskAdvice = "SQUARE_OFF";
      p.adviceReason = "15:15 IST Intraday close reached. Contract archived.";
      count++;
    }
  }
  if (count > 0) {
    saveTrackedPicks(all);
  }
  return count;
}

/**
 * Records that a specific risk advice alert was sent to avoid duplicate spam.
 */
export function markAdviceAlerted(idOrKey: string, advice: RiskAdvice): void {
  const all = loadTrackedPicks();
  const pick = all.find(
    (p) =>
      p.id.toLowerCase() === idOrKey.toLowerCase() ||
      p.instrumentKey?.toLowerCase() === idOrKey.toLowerCase() ||
      buildPickKey(p.underlying, p.strike, p.optionType).toLowerCase() === idOrKey.toLowerCase(),
  );
  if (pick) {
    pick.lastAlertedAdvice = advice;
    saveTrackedPicks(all);
  }
}
