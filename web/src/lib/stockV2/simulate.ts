// Stock V2 bar-level simulator for one stock. Causal: a signal at bar i uses bars <= i; entry is at bar i+1's open.
import { ema, sessionVwap, type Bar } from "./indicators.ts";
import { adverse, evaluateGates, rewardToRisk, roundTripCharges, RISK, SCENARIOS, sizePosition, type CostScenario, type EventRisk, type GateInputs, type Side } from "./risk.ts";
import { signalFor, type StrategyId } from "./signal.ts";

export const WINDOW = { entryFromMin: 9 * 60 + 30, entryBeforeMin: 14 * 60, squareOffBeforeMin: 15 * 60 + 15 };
export const STOP_ATR_BUFFER = 0.15;
export const TARGET_ATR_MULT = 1.2;
export const ATR_FLOOR_PCT = 0.008;

const MIN_MS = 60_000;

export interface Trade {
  symbol: string;
  strategy: StrategyId;
  scenario: string;
  date: string;
  side: Side;
  signalTime: string;
  entryTime: string;
  entryFill: number;
  stop: number;
  target: number;
  exitTime: string;
  exitFill: number;
  exitReason: "STOP" | "TARGET" | "TIME" | "GAP_EXIT";
  qty: number;
  riskAmount: number;
  eventFactor: number;
  notional: number;
  grossPnl: number;
  charges: number;
  netPnl: number;
  grossR: number;
  netR: number;
  holdMinutes: number;
  plannedRR: number;
}

export interface SessionOutcome {
  date: string;
  status: "GATED" | "NO_SIGNAL" | "REJECTED_PLAN" | "TRADED";
  reasons: string[];
  missingMinutes: number;
}

// FULL evaluates every market gate and fails closed on missing inputs. CORE evaluates none of them: it is the
// research variant that uses only the trading window, and it records that gates were not evaluated.
export type GateMode = "FULL" | "CORE";
export const CORE_NOT_EVALUATED = ["NOT_EVALUATED:market_state", "NOT_EVALUATED:event_risk", "NOT_EVALUATED:india_vix", "NOT_EVALUATED:nifty_atr", "NOT_EVALUATED:verified_live_stocks"];

export interface SimOptions {
  strategy: StrategyId;
  scenario?: CostScenario;
  capital?: number;
  gateMode?: GateMode;
  // Research variant. When true, the labelled closing placeholders are removed before any indicator is computed.
  // Default false: the stored feed is used as it is. Stored bars are never changed by this option.
  excludePlaceholders?: boolean;
}

// The series the indicators and the trade path run on. With excludePlaceholders, the flat zero-volume 15:15–15:29
// placeholder bars are dropped first, so they never reach an EMA (which runs across sessions) or a warm-up count.
export function analysisSeries(bars: Bar[], excludePlaceholders: boolean): Bar[] {
  return excludePlaceholders ? bars.filter((b) => !b.placeholder) : bars;
}

export function istMinute(iso: string): number {
  const d = new Date(Date.parse(iso) + 330 * 60_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export function istDate(iso: string): string {
  return new Date(Date.parse(iso) + 330 * 60_000).toISOString().slice(0, 10);
}

// Missing minutes between consecutive bars of one session.
export function countMissingMinutes(sess: Bar[]): number {
  let missing = 0;
  for (let k = 1; k < sess.length; k++) {
    const gap = Math.round((Date.parse(sess[k].timestamp) - Date.parse(sess[k - 1].timestamp)) / MIN_MS);
    if (gap > 1) missing += gap - 1;
  }
  return missing;
}

// `bars` is one stock's full chronological series. `gates` is keyed by IST date; a missing key means every input is missing.
export function simulateStock(symbol: string, bars: Bar[], gates: Record<string, GateInputs>, options: SimOptions): { trades: Trade[]; sessions: SessionOutcome[] } {
  const scenario = options.scenario ?? SCENARIOS.BASE;
  const capital = options.capital ?? RISK.defaultCapital;
  // Missing minutes are counted on the stored session, so excluding placeholders does not create a false gap.
  const storedByDate = new Map<string, Bar[]>();
  for (const b of bars) storedByDate.set(istDate(b.timestamp), [...(storedByDate.get(istDate(b.timestamp)) ?? []), b]);
  const missingByDate = new Map([...storedByDate].map(([d, list]) => [d, countMissingMinutes(list)]));

  const series = analysisSeries(bars, options.excludePlaceholders === true);
  const closes = series.map((b) => b.close);
  const highs = series.map((b) => b.high);
  const lows = series.map((b) => b.low);
  const e9 = ema(closes, 9);
  const e21 = ema(closes, 21);
  const e200 = ema(closes, 200);

  const sessionsByDate = new Map<string, number[]>();
  series.forEach((b, i) => {
    const d = istDate(b.timestamp);
    sessionsByDate.set(d, [...(sessionsByDate.get(d) ?? []), i]);
  });

  const trades: Trade[] = [];
  const sessions: SessionOutcome[] = [];

  for (const [date, idx] of sessionsByDate) {
    const missingInputs: GateInputs = { marketState: null, eventRisk: null, indiaVix: null, niftyAtrPct: null, verifiedLiveStocks: null };
    const core = options.gateMode === "CORE";
    const gate = core ? { allowed: true, eventFactor: 1, reasons: CORE_NOT_EVALUATED } : evaluateGates(gates[date] ?? missingInputs);
    const sess = idx.map((i) => series[i]);
    const missingMinutes = missingByDate.get(date) ?? 0;
    if (!gate.allowed) {
      sessions.push({ date, status: "GATED", reasons: gate.reasons, missingMinutes });
      continue;
    }
    const eventRisk: EventRisk = core ? "NONE" : ((gates[date]?.eventRisk ?? "NONE") as EventRisk);
    const vwapGlobal: (number | null)[] = new Array(series.length).fill(null);
    sessionVwap(sess).forEach((v, k) => (vwapGlobal[idx[k]] = v));

    const rejected: string[] = [];
    let hod = -Infinity;
    let lod = Infinity;
    let traded: Trade | null = null;

    for (let k = 0; k < sess.length - 1 && !traded; k++) {
      const b = sess[k];
      hod = Math.max(hod, b.high);
      lod = Math.min(lod, b.low);
      const gi = idx[k];
      const minute = istMinute(b.timestamp);
      if (minute < WINDOW.entryFromMin || minute >= WINDOW.entryBeforeMin) continue;
      if (e200[gi] === null) continue; // EMA 200 warm-up
      const side = signalFor(options.strategy, { i: gi, close: closes, low: lows, high: highs, e9, e21, vwap: vwapGlobal, sessionStart: idx[0] });
      if (!side) continue;

      const entryBar = sess[k + 1];
      if (Date.parse(entryBar.timestamp) - Date.parse(b.timestamp) !== MIN_MS) {
        rejected.push(`${b.timestamp.slice(11, 16)} NON_CONTIGUOUS_ENTRY`);
        continue;
      }
      const entryFill = adverse(side, entryBar.open, "ENTRY", scenario.slippagePct);
      const dayRange = hod - lod;
      const atrProxy = Math.max(dayRange, b.close * ATR_FLOOR_PCT);
      const stop = side === "LONG" ? lod - atrProxy * STOP_ATR_BUFFER : hod + atrProxy * STOP_ATR_BUFFER;
      const target = side === "LONG" ? b.close + atrProxy * TARGET_ATR_MULT : b.close - atrProxy * TARGET_ATR_MULT;

      if ((side === "LONG" && entryFill <= stop) || (side === "SHORT" && entryFill >= stop)) {
        rejected.push(`${b.timestamp.slice(11, 16)} ENTRY_BEYOND_STOP`);
        continue;
      }
      const rr = rewardToRisk(entryFill, stop, target);
      if (rr === null || rr < RISK.minRewardToRisk) {
        rejected.push(`${b.timestamp.slice(11, 16)} RR_BELOW_1_5`);
        continue;
      }
      const size = sizePosition(entryFill, stop, eventRisk, capital);
      if (!size.ok) {
        rejected.push(`${b.timestamp.slice(11, 16)} ${size.reason}`);
        continue;
      }

      // Exit path from the entry bar onward. Stop before target on any bar touching both. A missing minute during
      // the hold exits at the first bar after the gap, adverse-filled: the path inside the gap is unknown.
      let exitFill = 0;
      let exitReason: Trade["exitReason"] = "TIME";
      let exitTime = sess[sess.length - 1].timestamp;
      let lastIdx = k + 1;
      for (let j = k + 1; j < sess.length; j++) {
        const x = sess[j];
        if (istMinute(x.timestamp) >= WINDOW.squareOffBeforeMin) break;
        lastIdx = j;
        const gapBefore = j > k + 1 && Date.parse(x.timestamp) - Date.parse(sess[j - 1].timestamp) !== MIN_MS;
        if (gapBefore) {
          exitFill = adverse(side, x.open, "GAP_EXIT", scenario.slippagePct);
          exitReason = "GAP_EXIT";
          exitTime = x.timestamp;
          break;
        }
        const stopHit = side === "LONG" ? x.low <= stop : x.high >= stop;
        const targetHit = side === "LONG" ? x.high >= target : x.low <= target;
        if (stopHit) {
          exitFill = adverse(side, stop, "STOP_EXIT", scenario.slippagePct);
          exitReason = "STOP";
          exitTime = x.timestamp;
          break;
        }
        if (targetHit) {
          exitFill = target;
          exitReason = "TARGET";
          exitTime = x.timestamp;
          break;
        }
      }
      if (exitReason === "TIME") {
        exitFill = adverse(side, sess[lastIdx].close, "TIME_EXIT", scenario.slippagePct);
        exitTime = sess[lastIdx].timestamp;
      }

      const qty = size.qty;
      const sign = side === "LONG" ? 1 : -1;
      const grossPnl = (exitFill - entryFill) * qty * sign;
      const charges = roundTripCharges(side, entryFill, exitFill, qty, scenario.costMultiplier).total;
      const netPnl = grossPnl - charges;
      traded = {
        symbol,
        strategy: options.strategy,
        scenario: scenario.name,
        date,
        side,
        signalTime: b.timestamp,
        entryTime: entryBar.timestamp,
        entryFill,
        stop,
        target,
        exitTime,
        exitFill,
        exitReason,
        qty,
        riskAmount: size.riskAmount,
        eventFactor: size.eventFactor,
        notional: entryFill * qty,
        grossPnl,
        charges,
        netPnl,
        grossR: grossPnl / size.riskAmount,
        netR: netPnl / size.riskAmount,
        holdMinutes: (Date.parse(exitTime) - Date.parse(entryBar.timestamp)) / MIN_MS,
        plannedRR: rr,
      };
      trades.push(traded);
    }

    if (traded) sessions.push({ date, status: "TRADED", reasons: [], missingMinutes });
    else if (rejected.length) sessions.push({ date, status: "REJECTED_PLAN", reasons: rejected, missingMinutes });
    else sessions.push({ date, status: "NO_SIGNAL", reasons: [], missingMinutes });
  }
  return { trades, sessions };
}
