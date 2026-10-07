import type { Candle } from "./types.ts";
import type {
  BacktestResult,
  BacktestRunConfig,
  BacktestRunMeta,
  BacktestTrade,
  BacktestTradeLeg,
  DataQualityReport,
  EquityCurvePoint,
  MonthlyPerformance,
  NoTradeAnalytics,
  RegimePerformance,
  StrategyPerformance,
} from "./backtestTypes.ts";
import { BACKTEST_IV, buildHistoricalSnapshot, priceOption } from "./backtestSnapshot.ts";
import { datasetHash, HistoricalInputs, lookAheadViolations, NEWS_HISTORY_FINDING, OPTIONS_HISTORY_FINDING, type HistoricalContext } from "./services/historicalContext.ts";
import { costsFor, COSTS_NOT_MODELED, DEFAULT_TRANSACTION_COSTS, ZERO_COSTS, type Fill } from "./services/transactionCosts.ts";
import type { BacktestValidation, DataScorecard, SampleStats } from "./backtestTypes.ts";
import { analyze } from "./engine/strategy.ts";
import { evaluateTradeRisk } from "./services/risk/riskService.ts";
import { getRiskConfig } from "./services/risk/riskConfig.ts";
import { calculateTradePnL } from "./paperEngine.ts";
import type { PaperTradeLeg } from "./paperTypes.ts";
import { coreMetrics, drawdownAnalytics, groupStats, istDay, istMonth } from "./services/performance/metrics.ts";
import { evaluateIntrabarExit, intrabarPath, INTRABAR_PATH_MODEL, SAME_BAR_EXIT_POLICY } from "./backtestExecution.ts";
import type { CapitalFeasibility } from "./backtestTypes.ts";
import { isTradingDay } from "./time.ts";

const r2 = (n: number) => Math.round(n * 100) / 100;

export const STRATEGY_VERSION = "strategy-2026.10-p9"; // engine/strategy.ts rules + thresholds (unchanged in Phase 10)
export const RISK_CONFIG_VERSION = "risk-2026.10-p10"; // risk defaults + slippage-aware sizing
export const DATA_VERSION = { PHASE9_LEGACY: "data-p9-synthetic", PHASE10: "data-p10-vix-breadth" } as const;
const TF_MS: Record<string, number> = { "5m": 5 * 60_000, "15m": 15 * 60_000, "30m": 30 * 60_000, "1h": 60 * 60_000, "1d": 0 };

// Deterministic id from the inputs (FNV-1a): same config + candles (+ dataset fingerprint) → same run id and trade ids.
function stableId(config: BacktestRunConfig, candles: Candle[], dsHash = ""): string {
  const s = JSON.stringify({ ...config, id: undefined }) + `|${candles.length}|${candles[0]?.timestamp}|${candles[candles.length - 1]?.timestamp}|${candles[candles.length - 1]?.close}` + (dsHash ? `|${dsHash}` : "");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return `bt_${h.toString(16).padStart(8, "0")}`;
}

// Stable rejection codes (blocker text often embeds numbers, e.g. "Best strategy score 61 …").
// Structured risk-engine reasons → stable rejection codes.
export function riskRejectionCode(reason: string | undefined): string {
  if (reason === "DAILY_LOSS_LIMIT") return "DAILY_LOSS_LIMIT_BLOCK";
  if (reason === "ZERO_LOTS") return "POSITION_SIZE_ZERO";
  return reason ?? "RISK_LIMIT_EXCEEDED";
}

// Trading sessions strictly after `from` up to and including `to` (IST dates): 0 for a same-day trade.
export function overnightSessions(from: string, to: string): number {
  let n = 0;
  for (let d = from; d < to; ) {
    d = new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    if (isTradingDay(d)) n++;
  }
  return n;
}

// Last Tuesday-or-rolled expiry of its month (a monthly contract): no later expiry Tuesday exists in that month.
function isMonthlyTuesday(exp: string): boolean {
  const d = new Date(`${exp}T00:00:00Z`);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  lastDay.setUTCDate(lastDay.getUTCDate() - ((lastDay.getUTCDay() - 2 + 7) % 7));
  return lastDay.getTime() - d.getTime() < 7 * 86_400_000;
}

export function rejectionCode(blocker: string): string {
  const b = blocker.toLowerCase();
  if (b.startsWith("best strategy score")) return "LOW_STRATEGY_SCORE";
  if (b.startsWith("opening 15 minutes")) return "OPENING_WINDOW_WAIT";
  if (b.startsWith("news direction conflicts")) return "NEWS_CONFLICT";
  if (b.startsWith("range-bound")) return "RANGE_CHEAP_IV";
  if (b.startsWith("event risk")) return "EVENT_RISK";
  if (b.includes("stale")) return "STALE_DATA";
  if (b.startsWith("market closed")) return "MARKET_CLOSED";
  if (b.startsWith("not enough comparable data") || b.startsWith("full confirmation")) return "MISSING_INPUTS";
  if (b.includes("position size rounds to 0 lots")) return "POSITION_SIZE_ZERO";
  if (b.includes("bid-ask") || b.includes("two-sided")) return "LOW_LIQUIDITY";
  if (b.includes("risk/reward")) return "POOR_RISK_REWARD";
  if (b.startsWith("signals conflict")) return "SIGNALS_CONFLICT";
  return "OTHER";
}

type Open = { trade: BacktestTrade; legUnits: number };

// Phase 10 sizing: the risk engine sizes on (entry − stop) × (1 + slippage%), which understates the modeled loss at
// the stop (entry fill is worse by slippage, and so is the stop fill). Re-size on the executable risk:
//   planned risk + entry slippage + estimated exit slippage at the stop, never above the per-trade / open-risk budget.
export function slippageAwareSizing(a: {
  plannedRiskPerUnit: number; // risk engine riskPerUnit without its slippage multiplier
  legs: { mid: number; fill: number }[];
  slip: number; // fraction
  netMid: number; // |net entry| per unit at mid
  stop: number;
  lotSize: number;
  maxLots: number; // risk-engine lots (all other limits already applied)
  budget: number; // capital × risk-per-trade %
  openRiskRoom: number; // open-risk limit − existing open risk
}) {
  const entrySlippagePerUnit = a.legs.reduce((t, l) => t + Math.abs(l.fill - l.mid), 0);
  const gross = a.legs.reduce((t, l) => t + l.mid, 0);
  // ponytail: exit slippage estimated from entry gross premium scaled by stop/entry; exact only for single legs.
  const exitSlippagePerUnit = a.slip * gross * Math.max(1, a.netMid > 0 ? Math.abs(a.stop) / a.netMid : 1);
  const riskPerUnit = r2(a.plannedRiskPerUnit + entrySlippagePerUnit + exitSlippagePerUnit);
  const perLot = riskPerUnit * a.lotSize;
  const byBudget = perLot > 0 ? Math.floor(a.budget / perLot) : 0;
  const byOpen = perLot > 0 ? Math.floor(Math.max(0, a.openRiskRoom) / perLot) : 0;
  const lots = Math.max(0, Math.min(a.maxLots, byBudget, byOpen));
  const limitedBy = lots === 0 ? (byBudget === 0 ? "POSITION_SIZE_ZERO" : "OPEN_RISK_LIMIT") : null;
  return { lots, riskPerUnit, entrySlippagePerUnit: r2(entrySlippagePerUnit), exitSlippagePerUnit: r2(exitSlippagePerUnit), totalRisk: r2(perLot * lots), limitedBy };
}

// Validation gate (statistical/data status, not advice). Thresholds are fixed and documented here.
export const MIN_TRADES_FOR_VALIDATION = 30;
export const MIN_SESSIONS_FOR_VALIDATION = 120; // ≈ 6 months
export function validationStatus(v: { coverageStatus: string | null; optionsMode: string; trades: number; sessions: number; expectancy: number | null; regimesWithTrades: number }): BacktestValidation {
  const reasons: string[] = [];
  if (v.coverageStatus !== "FULL") reasons.push(`historical coverage is ${v.coverageStatus ?? "unknown"}`);
  if (v.optionsMode === "UNAVAILABLE") reasons.push("no option data of any kind");
  if (reasons.length) return { status: "INSUFFICIENT_DATA", reasons };
  if (v.trades < MIN_TRADES_FOR_VALIDATION) reasons.push(`${v.trades} trades < ${MIN_TRADES_FOR_VALIDATION}`);
  if (v.sessions < MIN_SESSIONS_FOR_VALIDATION) reasons.push(`${v.sessions} sessions < ${MIN_SESSIONS_FOR_VALIDATION}`);
  if (reasons.length) return { status: "INSUFFICIENT_SAMPLE", reasons };
  const modelNote = v.optionsMode === "FULL" ? "" : " (on model-derived option prices)";
  if (!(v.expectancy !== null && v.expectancy > 0)) return { status: "NOT_SUPPORTED", reasons: [`net expectancy ${v.expectancy ?? "n/a"} ≤ 0 after costs${modelNote}`] };
  if (v.optionsMode !== "FULL" || v.regimesWithTrades < 3)
    return { status: "PARTIAL_VALIDATION", reasons: [`positive net expectancy${modelNote}`, ...(v.regimesWithTrades < 3 ? [`trades in only ${v.regimesWithTrades} regime(s)`] : [])] };
  return { status: "HISTORICALLY_SUPPORTED", reasons: ["positive net expectancy on observed option data across ≥ 3 regimes"] };
}

// One OHLC candle per IST day from intraday bars, stamped at that day's 00:00 IST.
export function aggregateDaily(candles: Candle[]): Candle[] {
  const days = new Map<string, Candle>();
  for (const c of [...candles].sort((a, b) => a.timestamp.localeCompare(b.timestamp))) {
    const d = istDay(c.timestamp);
    const cur = days.get(d);
    if (!cur) days.set(d, { timestamp: `${d}T00:00:00+05:30`, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume });
    else days.set(d, { ...cur, high: Math.max(cur.high, c.high), low: Math.min(cur.low, c.low), close: c.close, volume: cur.volume === null || c.volume === null ? null : cur.volume + c.volume });
  }
  return [...days.values()];
}

// Per-unit value of the position at model prices: debit = what it is worth; credit = what it costs to close.
function positionValue(t: BacktestTrade, mids: number[]): number {
  const net = t.legs.reduce((acc, leg, i) => acc + (leg.side === "BUY" ? mids[i] : -mids[i]), 0);
  return t.credit ? -net : net;
}

// Shared P&L definition with paper trading (calculateTradePnL): Σ BUY (exit − entry) + Σ SELL (entry − exit), × qty.
function legsPnL(t: BacktestTrade, useExit: boolean, mids?: number[]): number {
  const paperLegs: PaperTradeLeg[] = t.legs.map((l, i): PaperTradeLeg => ({
    side: l.side,
    type: l.type,
    strike: l.strike,
    entryLtp: l.entryMid,
    entryFillPrice: l.entryPrice,
    entryFillSource: "LTP_FALLBACK", // backtest fill = synthetic model price ± slippage
    currentPrice: mids ? mids[i] : null,
    exitPrice: useExit ? l.exitPrice : null,
  }));
  return calculateTradePnL(paperLegs, t.quantity, useExit).pnl;
}

// Descriptive only: minimum capital = risk of one lot ÷ risk-per-trade %. Never changes sizing or capital.
export function feasibility(capital: number, riskPct: number, lotSize: number | null, samples: number[]): CapitalFeasibility {
  if (!samples.length)
    return { configuredCapital: capital, riskPerTradePercent: riskPct, lotSize, riskPerLot: null, minimumCapitalForOneLot: null, status: "NO SIGNALS", note: "No strategy candidates were produced, so one-lot risk could not be measured." };
  const s = [...samples].sort((a, b) => a - b);
  const median = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  const minCap = { min: r2(s[0] / (riskPct / 100)), median: r2(median / (riskPct / 100)) };
  return {
    configuredCapital: capital,
    riskPerTradePercent: riskPct,
    lotSize,
    riskPerLot: { min: r2(s[0]), median: r2(median), max: r2(s[s.length - 1]), samples: s.length },
    minimumCapitalForOneLot: minCap,
    status: capital >= minCap.median ? "SUFFICIENT" : capital >= minCap.min ? "SOMETIMES SUFFICIENT" : "INSUFFICIENT CAPITAL",
    note: "Descriptive: one-lot risk measured by the risk engine on every strategy candidate. It does not optimize or recommend account size.",
  };
}

export class BacktestEngine {
  /**
   * Deterministic historical simulation. Spot/candles are historical; option prices are SYNTHETIC
   * (Black-Scholes at a flat IV benchmark) and used consistently for entry, mark-to-market and exit.
   */
  public run(config: BacktestRunConfig, candles: Candle[], dailyCandles: Candle[] = [], meta: BacktestRunMeta = { candleSource: "MOCK" }, ctx: HistoricalContext | null = null): BacktestResult {
    // PHASE10 (historical context supplied): India VIX IV, reconstructed breadth, neutral unavailable news/OI,
    // bar-close decision time, slippage-aware sizing, transaction costs. Without it: the Phase 9 model, unchanged.
    const p10 = !!ctx;
    const hist = ctx ? new HistoricalInputs(ctx) : null;
    const dsHash = datasetHash(candles, dailyCandles, ctx);
    const runId = config.id ?? stableId(config, candles, p10 ? dsHash : "");
    const costCfg = p10 ? (config.transactionCosts ?? DEFAULT_TRANSACTION_COSTS) : null;
    const barMs = p10 ? (TF_MS[config.timeframe] ?? 0) : 0;
    let ivFallbackBars = 0, ivObservedBars = 0, breadthBars = 0, breadthCoverageSum = 0, slippageResized = 0;
    const barRegimes: Record<string, number> = {};
    const sessions = new Set<string>();
    const contractExpiries = new Set<string>();
    let candidateBars = 0;
    const startingCapital = config.startingCapital || 100_000;
    const slip = (config.slippagePercent ?? 1.0) / 100;
    const isCompounding = config.compounding ?? false;
    const model = config.executionModel ?? "CLOSE_ONLY";
    const flatten = config.flattenOnDailyLossLimit ?? false;
    const flattenedDays = new Set<string>();
    let dailyLossFlattens = 0;
    const riskPerLotSamples: number[] = [];
    const riskConfig = getRiskConfig({ ...config.riskConfig, accountCapital: startingCapital });

    const trades: BacktestTrade[] = [];
    const open: Open[] = [];
    const equityCurve: EquityCurvePoint[] = [];
    const rejectionReasons: Record<string, number> = {};
    const bump = (k: string) => (rejectionReasons[k] = (rejectionReasons[k] ?? 0) + 1);
    let totalEvaluated = 0, tradeCount = 0, waitCount = 0, noTradeCount = 0, riskRejections = 0;
    let realized = 0, peak = startingCapital, maxOpenRisk = 0, maxConcurrent = 0, maxLots = 0;
    const dailyRealized = new Map<string, number>(); // IST day → realized P&L
    const dailyLossLimit = startingCapital * (riskConfig.maxDailyLossPercent / 100);

    const startMs = new Date(`${config.startDate}T00:00:00+05:30`).getTime();
    const endMs = new Date(`${config.endDate}T23:59:59+05:30`).getTime();
    const validCandles = candles.filter((c) => {
      const t = new Date(c.timestamp).getTime();
      return t >= startMs && t <= endMs;
    });
    // Daily OHLC: supplied daily candles, else aggregated from the intraday bars of each IST day (derived, not invented).
    const warmDaily = dailyCandles.length ? dailyCandles : aggregateDaily(candles);

    const closeTrade = (o: Open, spot: number, now: Date, reason: BacktestTrade["exitReason"], iv = BACKTEST_IV) => {
      const t = o.trade;
      t.exitSession = istDay(now.toISOString());
      t.overnightCount = overnightSessions(t.entrySession ?? t.exitSession, t.exitSession);
      t.legs.forEach((leg) => {
        leg.exitMid = r2(priceOption(leg.type, spot, leg.strike, t.expiry, now, iv));
        // Selling a long leg receives less; buying back a short leg pays more.
        leg.exitPrice = r2(leg.side === "BUY" ? leg.exitMid * (1 - slip) : leg.exitMid * (1 + slip));
      });
      t.exitTimestamp = now.toISOString();
      t.exitReason = reason;
      t.exitPrice = r2(t.legs.reduce((a, l) => a + (l.side === "BUY" ? l.exitPrice : -l.exitPrice), 0));
      const afterSlippage = legsPnL(t, true);
      t.slippageCost = r2(t.legs.reduce((a, l) => a + Math.abs(l.entryPrice - l.entryMid) + Math.abs(l.exitPrice - l.exitMid), 0) * t.quantity);
      // Market movement, slippage and statutory costs kept separate: gross (mid→mid) − slippage − costs = net.
      const fills: Fill[] = t.legs.flatMap((l) => [
        { side: l.side, price: l.entryPrice, quantity: t.quantity },
        { side: l.side === "BUY" ? ("SELL" as const) : ("BUY" as const), price: l.exitPrice, quantity: t.quantity },
      ]);
      t.costs = costCfg ? costsFor(fills, costCfg) : { ...ZERO_COSTS };
      t.grossPnL = r2(afterSlippage + t.slippageCost);
      t.netPnL = r2(afterSlippage - t.costs.totalCosts);
      t.realizedPnL = t.netPnL;
      t.pnlPercent = t.entryPrice !== 0 ? r2((t.realizedPnL / (Math.abs(t.entryPrice) * t.quantity)) * 100) : 0;
      t.rMultiple = t.riskAmount > 0 ? r2(t.realizedPnL / t.riskAmount) : 0;
      realized += t.realizedPnL;
      const day = istDay(t.exitTimestamp);
      dailyRealized.set(day, r2((dailyRealized.get(day) ?? 0) + t.realizedPnL));
    };

    let ivNow = BACKTEST_IV;
    for (let i = 0; i < validCandles.length; i++) {
      const candle = validCandles[i];
      // Decision time. Legacy: the bar's OPEN timestamp (while using its close: a labeling look-ahead). Phase 10: the
      // bar's CLOSE (open + interval), the first moment its close is actually known.
      const now = new Date(Date.parse(candle.timestamp) + barMs);
      // Look-ahead protection: only candles up to and including T.
      const sliced = candles.slice(0, candles.indexOf(candle) + 1);
      // Only days strictly before T's IST date: a same-day daily candle would contain that day's future bars.
      const today = istDay(now.toISOString());
      const slicedDaily = warmDaily.filter((c) => istDay(c.timestamp) < today);
      const opening = sliced.filter((c) => c.timestamp.slice(0, 10) === candle.timestamp.slice(0, 10)).slice(0, 2);
      const pit = hist ? hist.at(candle.timestamp) : undefined;
      const snapshot = buildHistoricalSnapshot(config, candle, sliced, slicedDaily, opening, now, pit);
      if (!snapshot) {
        bump("INSUFFICIENT_WARMUP");
        continue;
      }
      if (pit) {
        // Explicit timestamp validation: no input may be observed after the decision time.
        const v = lookAheadViolations(
          { underlying: new Date(Date.parse(candle.timestamp) + barMs).toISOString(), option: now.toISOString(), oi: null, iv: pit.ivObservedAt, news: null, breadth: pit.breadthObservedAt },
          now,
        );
        if (v.length) throw new Error(`Look-ahead violation: ${v.join("; ")}`);
        if (pit.iv === null) ivFallbackBars++;
        else ivObservedBars++;
        if (snapshot.breadth && snapshot.breadth.status !== "UNAVAILABLE") {
          breadthBars++;
          breadthCoverageSum += snapshot.breadth.coverage;
        }
      }
      ivNow = pit?.iv ?? BACKTEST_IV;
      totalEvaluated++;
      sessions.add(today);
      contractExpiries.add(snapshot.expiry);
      const spot = candle.close;

      // 1. Exits, judged on the position's premium (not on the index level).
      //    CLOSE_ONLY: model value at the bar close. INTRABAR_MODEL_DERIVED: model value along the bar's assumed
      //    OHLC path (stop wins if both touched; gaps fill at the open).
      for (let j = open.length - 1; j >= 0; j--) {
        const t = open[j].trade;
        const valueAt = (s: number) => positionValue(t, t.legs.map((l) => priceOption(l.type, s, l.strike, t.expiry, now, ivNow)));
        let reason: BacktestTrade["exitReason"] | null = null;
        let fillSpot = spot;
        if (model === "INTRABAR_MODEL_DERIVED") {
          const r = evaluateIntrabarExit(intrabarPath(candle), valueAt, t.credit, t.stopLoss, t.target1);
          t.exitBarOptionOHLC = { open: r2(r.optionOHLC.open), high: r2(r.optionOHLC.high), low: r2(r.optionOHLC.low), close: r2(r.optionOHLC.close) };
          if (r.exit) {
            // A stop gapped through at the open fills at the open: labeled GAP_EXIT, never as a stop at the stop level.
            reason = r.exit.gap && r.exit.reason === "STOP_LOSS" ? "GAP_EXIT" : r.exit.reason;
            fillSpot = r.exit.fillSpot;
            t.exitGap = r.exit.gap;
          }
        } else {
          const v = valueAt(spot);
          if (t.credit ? v >= t.stopLoss : v <= t.stopLoss) reason = "STOP_LOSS";
          else if (t.credit ? v <= t.target1 : v >= t.target1) reason = "TARGET";
        }
        if (!reason && now.getTime() >= Date.parse(`${t.expiry}T09:45:00Z`)) reason = "EXPIRY"; // 15:15 IST on expiry day
        if (reason) {
          closeTrade(open[j], fillSpot, now, reason, ivNow);
          open.splice(j, 1);
        }
      }

      // 1b. Daily loss limit (realized-only, same definition as the risk engine). Optional flatten, once per day.
      if (flatten && open.length && !flattenedDays.has(today) && -(dailyRealized.get(today) ?? 0) >= dailyLossLimit) {
        flattenedDays.add(today);
        for (const o of open) {
          closeTrade(o, spot, now, "DAILY_LOSS_LIMIT_FLATTEN", ivNow);
          dailyLossFlattens++;
        }
        open.length = 0;
      }

      // 2. Signal from the same analysis engine as live, sized against THIS run's capital (not the default).
      const capital = isCompounding ? startingCapital + realized : startingCapital;
      const analysis = analyze(snapshot, now, { ...config.riskConfig, accountCapital: capital });
      // Capital feasibility: risk of ONE lot for every candidate the strategy produced (risk-engine figure).
      for (const cand of analysis.candidates) {
        const rpl = evaluateTradeRisk(cand, snapshot, {}, { ...config.riskConfig, accountCapital: capital }, now).riskPerLot;
        if (rpl > 0) riskPerLotSamples.push(rpl);
      }
      barRegimes[analysis.regime] = (barRegimes[analysis.regime] ?? 0) + 1;
      if (analysis.candidates.length) candidateBars++;
      if (analysis.status === "WAIT") waitCount++;
      else if (analysis.status === "NO TRADE") noTradeCount++;

      if (analysis.status === "TRADE" && analysis.plan) {
        const plan = analysis.plan;
        // A contract can't be opened at/after its expiry cutoff (15:15 IST on expiry day): it could not be
        // closed before it expires. Execution fidelity, not a strategy change.
        if (now.getTime() >= Date.parse(`${snapshot.expiry}T09:45:00Z`)) {
          bump("EXPIRY_CUTOFF");
        } else if (!config.strategyFilter || config.strategyFilter === "ALL" || config.strategyFilter === plan.strategy) {
          const todayLoss = Math.max(0, -(dailyRealized.get(istDay(now.toISOString())) ?? 0));
          const risk = evaluateTradeRisk(
            plan,
            snapshot,
            { currentOpenPositions: open.length, existingOpenRisk: open.reduce((a, o) => a + o.trade.riskAmount, 0), overrideCapital: capital, realizedDailyLoss: todayLoss },
            { ...config.riskConfig, accountCapital: capital },
            now,
          );
          const fill = (leg: { side: "BUY" | "SELL"; ltp: number }) => r2(leg.side === "BUY" ? leg.ltp * (1 + slip) : leg.ltp * (1 - slip));
          const existingOpenRisk = open.reduce((a, o) => a + o.trade.riskAmount, 0);
          const sized = p10 && risk.allowed
            ? slippageAwareSizing({
                plannedRiskPerUnit: risk.riskPerUnit / (1 + riskConfig.optionSlippagePercent / 100),
                legs: plan.legs.map((l) => ({ mid: l.ltp, fill: fill(l) })),
                slip,
                netMid: Math.abs(plan.legs.reduce((a, l) => a + (l.side === "BUY" ? l.ltp : -l.ltp), 0)),
                stop: plan.stop,
                lotSize: risk.lotSize,
                maxLots: risk.lots,
                budget: capital * (riskConfig.riskPerTradePercent / 100),
                openRiskRoom: capital * (riskConfig.maxOpenRiskPercent / 100) - existingOpenRisk,
              })
            : null;
          if (sized && sized.lots < risk.lots) slippageResized++;
          if (sized?.limitedBy) {
            riskRejections++;
            bump(sized.limitedBy);
          } else if (risk.allowed && open.length < riskConfig.maxConcurrentPositions) {
            tradeCount++;
            const lots = sized ? sized.lots : risk.lots;
            const quantity = lots * risk.lotSize;
            const legs: BacktestTradeLeg[] = plan.legs.map((leg) => ({
              side: leg.side,
              type: leg.type,
              strike: leg.strike,
              entryMid: leg.ltp,
              entryPrice: fill(leg),
              exitPrice: 0,
              exitMid: 0,
              quantity,
            }));
            const net = r2(legs.reduce((a, l) => a + (l.side === "BUY" ? l.entryPrice : -l.entryPrice), 0));
            const trade: BacktestTrade = {
              tradeId: `${runId}_${String(tradeCount).padStart(4, "0")}`,
              index: config.index,
              strategy: plan.strategy,
              signalTimestamp: now.toISOString(),
              entryTimestamp: now.toISOString(),
              exitTimestamp: "",
              expiry: snapshot.expiry,
              legs,
              credit: plan.credit,
              entryPrice: net,
              exitPrice: 0,
              quantity,
              lots,
              lotSize: risk.lotSize,
              stopLoss: plan.stop,
              target1: plan.target1,
              target2: plan.target2,
              riskAmount: sized ? sized.totalRisk : risk.totalRisk,
              plannedRiskAmount: risk.totalRisk,
              riskReward: plan.rr,
              realizedPnL: 0,
              pnlPercent: 0,
              rMultiple: 0,
              slippageCost: 0,
              exitReason: "END_OF_BACKTEST",
              executionDataQuality: model === "INTRABAR_MODEL_DERIVED" ? "MODEL_DERIVED_INTRABAR" : "CLOSE_ONLY_SYNTHETIC",
              entrySession: istDay(now.toISOString()),
              signalScore: plan.score,
              confidence: analysis.total,
              regime: analysis.regime,
            };
            trades.push(trade);
            open.push({ trade, legUnits: quantity });
            maxLots = Math.max(maxLots, lots);
          } else {
            riskRejections++;
            bump(risk.allowed ? "MAX_CONCURRENT_POSITIONS" : riskRejectionCode(risk.reasons[0]));
          }
        }
      } else {
        for (const b of analysis.blockers) bump(rejectionCode(b));
      }

      // 3. Equity at this bar: cash (start + realized) + open positions marked at model mid (no slippage).
      const unrealized = r2(open.reduce((a, o) => a + legsPnL(o.trade, false, o.trade.legs.map((l) => priceOption(l.type, spot, l.strike, o.trade.expiry, now, ivNow))), 0));
      const cash = r2(startingCapital + realized);
      const equity = r2(cash + unrealized);
      peak = Math.max(peak, equity);
      const openRisk = r2(open.reduce((a, o) => a + o.trade.riskAmount, 0));
      maxOpenRisk = Math.max(maxOpenRisk, openRisk);
      maxConcurrent = Math.max(maxConcurrent, open.length);
      equityCurve.push({
        timestamp: p10 ? now.toISOString() : candle.timestamp,
        equity,
        cash,
        realizedPnL: r2(realized),
        unrealizedPnL: unrealized,
        drawdown: r2(peak - equity),
        drawdownPercent: r2(((peak - equity) / peak) * 100),
        openRisk,
        openPositions: open.length,
      });
    }

    // Close what is still open at the last evaluated bar (model price + slippage); equity's last point then
    // reflects the realized result.
    const last = validCandles[validCandles.length - 1];
    if (last && open.length) {
      const now = new Date(Date.parse(last.timestamp) + barMs);
      for (const o of open) closeTrade(o, last.close, now, "END_OF_BACKTEST", ivNow);
      open.length = 0;
      const lp = equityCurve[equityCurve.length - 1];
      if (lp) {
        lp.cash = lp.equity = r2(startingCapital + realized);
        lp.realizedPnL = r2(realized);
        lp.unrealizedPnL = 0;
        lp.openRisk = 0;
        lp.openPositions = 0;
        peak = Math.max(...equityCurve.map((p) => p.equity), startingCapital);
        lp.drawdown = r2(peak - lp.equity);
        lp.drawdownPercent = r2(((peak - lp.equity) / peak) * 100);
      }
    }

    const closed = trades.filter((t) => t.exitTimestamp);
    const core = coreMetrics(closed, startingCapital);
    const dd = drawdownAnalytics(equityCurve, startingCapital);
    const v = (m: { value: number | null }) => m.value;

    const monthlyPerformance: MonthlyPerformance[] = groupStats(closed, (t) => istMonth(t.exitTimestamp), startingCapital)
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((g) => ({ month: g.key, trades: g.tradeCount, wins: g.wins, losses: g.losses, winRate: g.winRate.value ?? 0, netPnL: g.netPnL, returnPercent: g.returnPercent, maxDrawdownPercent: r2((g.maxDrawdown / startingCapital) * 100) }));
    const strategyPerformance: StrategyPerformance[] = groupStats(closed, (t) => t.strategy, startingCapital).map((g) => ({
      strategy: g.key as BacktestTrade["strategy"], trades: g.tradeCount, wins: g.wins, losses: g.losses, winRate: g.winRate.value ?? 0, netPnL: g.netPnL, profitFactor: g.profitFactor.value, avgR: g.averageR.value,
    }));
    const regimePerformance: RegimePerformance[] = groupStats(closed, (t) => t.regime, startingCapital).map((g) => ({
      regime: g.key, trades: g.tradeCount, wins: g.wins, losses: g.losses, winRate: g.winRate.value ?? 0, netPnL: g.netPnL, avgR: g.averageR.value,
    }));

    const historical = meta.candleSource === "LIVE" || meta.candleSource === "END_OF_DAY";
    const evaluatedP10 = ivObservedBars + ivFallbackBars;
    const ivPct = evaluatedP10 ? r2((ivObservedBars / evaluatedP10) * 100) : 0;
    const breadthAvgCoverage = breadthBars ? r2(breadthCoverageSum / breadthBars) : 0;
    const p10Quality: DataQualityReport | null = !p10 ? null : {
      mode: "PARTIAL",
      datasetMode: "MODEL_DERIVED",
      spot: historical ? "HISTORICAL MEASURED" : "MOCK",
      technicals: historical ? "HISTORICAL MEASURED" : "MOCK",
      breadth: breadthBars ? "RECONSTRUCTED" : "NOT AVAILABLE",
      optionData: "MODEL DERIVED",
      bidAsk: "SYNTHETIC",
      oi: "NOT AVAILABLE",
      iv: ivFallbackBars === 0 && ivObservedBars ? "RECONSTRUCTED" : ivObservedBars ? "PARTIAL / MOCK" : "SYNTHETIC BENCHMARK",
      greeks: "MODEL DERIVED",
      news: "NOT AVAILABLE",
      eventRisk: "NOT AVAILABLE",
      execution: "SIMULATED",
      intrabarOptionPrices: model === "INTRABAR_MODEL_DERIVED" ? "MODEL DERIVED INTRABAR" : "NOT AVAILABLE",
      historicalOptionOHLC: "NOT AVAILABLE",
      transactionCosts: "MODELED",
      note:
        `${historical ? "Historical Upstox candles" : "MOCK candles (not historical)"}; option prices from Black-Scholes at India VIX (observed index IV, flat across strikes) ` +
        `on ${ivPct}% of bars; breadth reconstructed from today's constituent list (survivorship-bias risk); OI and news not available (neutral). ${OPTIONS_HISTORY_FINDING}`,
    };
    const dataQuality: DataQualityReport = p10Quality ?? {
      mode: "PARTIAL",
      datasetMode: "MODEL_DERIVED",
      spot: historical ? "HISTORICAL MEASURED" : "MOCK",
      technicals: historical ? "HISTORICAL MEASURED" : "MOCK",
      breadth: "SYNTHETIC",
      optionData: "SYNTHETIC",
      bidAsk: "SYNTHETIC",
      oi: "SYNTHETIC",
      iv: "SYNTHETIC BENCHMARK",
      greeks: "MODEL DERIVED",
      news: "PARTIAL / MOCK",
      eventRisk: "PARTIAL / MOCK",
      execution: "SIMULATED",
      intrabarOptionPrices: model === "INTRABAR_MODEL_DERIVED" ? "MODEL DERIVED INTRABAR" : "NOT AVAILABLE",
      historicalOptionOHLC: "NOT AVAILABLE",
      transactionCosts: "NOT MODELED",
      note:
        `${historical ? "Historical Upstox candles" : "MOCK candles (not historical)"}; option prices from Black-Scholes at a flat 14.5% IV benchmark ` +
        "(synthetic chain, constant OI); breadth derived from the index's own direction; constant mock news. " +
        "Brokerage, STT, exchange charges, GST, stamp duty and SEBI fees are not modeled (slippage only).",
    };

    const noTradeAnalytics: NoTradeAnalytics = {
      totalEvaluated, tradeCount, waitCount, noTradeCount,
      tradePercent: totalEvaluated ? r2((tradeCount / totalEvaluated) * 100) : 0,
      waitPercent: totalEvaluated ? r2((waitCount / totalEvaluated) * 100) : 0,
      noTradePercent: totalEvaluated ? r2((noTradeCount / totalEvaluated) * 100) : 0,
      rejectionReasons,
    };

    const dayLosses = [...dailyRealized.values()].map((p) => Math.max(0, -p));

    // Phase 10 scorecard (spec labels; HISTORICAL_* only for data actually observed at that time).
    const cov = meta.coverage;
    const scorecard: DataScorecard = {
      spot: { source: "Upstox v3 historical candles", quality: historical ? "HISTORICAL_MEASURED" : "MOCK", coverageStart: cov?.actualStart ?? undefined, coverageEnd: cov?.actualEnd ?? undefined, coveragePercent: cov?.coveragePercent },
      technicals: { source: "Computed from completed historical candles ≤ decision time", quality: historical ? "HISTORICAL_MEASURED" : "MOCK" },
      options: { source: `Black-Scholes from historical spot (${p10 ? "India VIX IV" : "flat 14.5% IV"})`, quality: "MODEL_DERIVED", notes: `Options mode SYNTHETIC; historical option OHLC NOT_AVAILABLE. ${OPTIONS_HISTORY_FINDING}` },
      iv: p10
        ? { source: "India VIX (NSE_INDEX|India VIX) 15m close ≤ decision time", quality: ivFallbackBars ? "PARTIAL" : "HISTORICAL_RECONSTRUCTED", coveragePercent: ivPct, notes: `IV source OBSERVED at index level (India VIX = NIFTY 30-day implied volatility), applied flat across strikes and expiries${config.index === "banknifty" ? "; used as a cross-index PROXY for BANK NIFTY" : ""}. ${ivFallbackBars} bar(s) fell back to the 14.5% benchmark.` }
        : { source: "Flat 14.5% benchmark", quality: "SYNTHETIC" },
      oi: p10
        ? { source: "none", quality: "NOT_AVAILABLE", notes: "Historical OI is not available; the option-chain factor is neutral (no positioning information). Not observed market positioning." }
        : { source: "Constant placeholder (50,000 CE / 45,000 PE)", quality: "SYNTHETIC", notes: "Historical OI is synthetic and should not be interpreted as observed market positioning." },
      greeks: { source: "Black-Scholes", quality: "MODEL_DERIVED" },
      breadth: p10
        ? { source: `Upstox 15m candles of ${ctx!.expectedConstituents} current constituents (list as of ${ctx!.membershipAsOf})`, quality: breadthBars ? "HISTORICAL_RECONSTRUCTED" : "NOT_AVAILABLE", coveragePercent: breadthAvgCoverage, notes: "SURVIVORSHIP_BIAS_RISK = TRUE: historical index membership not available; today's list used for the whole range." }
        : { source: "Derived from the index's own bar direction", quality: "SYNTHETIC", notes: "Historical breadth is synthetic and should not be interpreted as observed constituent breadth." },
      news: p10 ? { source: "none", quality: "NOT_AVAILABLE", notes: NEWS_HISTORY_FINDING } : { source: "Constant mock (+0.42)", quality: "MOCK" },
      events: p10 ? { source: "none", quality: "NOT_AVAILABLE", notes: "No point-in-time scheduled-event calendar is sourced; event-risk regime never triggers historically. Exchange holidays/special sessions are modeled in the calendar." } : { source: "Mock news", quality: "MOCK" },
      execution: { source: `${model}${model === "INTRABAR_MODEL_DERIVED" ? " (DETERMINISTIC_OHLC_PATH, stop-first)" : ""}`, quality: "SIMULATED" },
      transactionCosts: costCfg
        ? { source: costCfg.source, quality: "MODELED", notes: `Config ${costCfg.version}. Not modeled: ${COSTS_NOT_MODELED.join("; ")}.` }
        : { source: "none", quality: "NOT_AVAILABLE", notes: "Statutory costs NOT MODELED (Phase 9 model)." },
    };

    const cand = closed.length;
    const months = sessions.size / 21;
    const tradedRegimes = new Set(closed.map((t) => t.regime));
    const sample: SampleStats = {
      evaluatedSessions: sessions.size,
      evaluatedBars: totalEvaluated,
      candidateBars,
      tradeBars: tradeCount,
      noTradeBars: totalEvaluated - tradeCount,
      executedTrades: cand,
      rejectedSignals: riskRejections + (rejectionReasons.EXPIRY_CUTOFF ?? 0),
      tradesPerMonth: months > 0 ? r2(cand / months) : null,
      barRegimes,
      regimeCoverage: Object.keys(barRegimes).length <= 1 ? "INSUFFICIENT REGIME COVERAGE" : `${Object.keys(barRegimes).length} regimes observed`,
      contractExpiries: contractExpiries.size,
      weeklyExpiries: config.index === "nifty" ? contractExpiries.size : 0,
      monthlyExpiries: [...contractExpiries].filter((e) => config.index === "banknifty" || isMonthlyTuesday(e)).length,
      tradedExpiries: new Set(closed.map((t) => t.expiry)).size,
    };
    const validation = validationStatus({
      coverageStatus: cov?.status ?? null,
      optionsMode: "SYNTHETIC",
      trades: cand,
      sessions: sessions.size,
      expectancy: v(core.expectancy),
      regimesWithTrades: tradedRegimes.size,
    });
    const sumCost = (k: keyof NonNullable<BacktestTrade["costs"]>) => r2(closed.reduce((a, t) => a + (t.costs?.[k] ?? 0), 0));

    return {
      runId,
      createdAt: last ? (p10 ? new Date(Date.parse(last.timestamp) + barMs).toISOString() : last.timestamp) : config.endDate, // deterministic: the last simulated bar, not wall-clock time
      config,
      dataQuality,
      summary: {
        totalTrades: core.totalTrades,
        winningTrades: core.winningTrades,
        losingTrades: core.losingTrades,
        winRate: v(core.winRate) ?? 0,
        grossProfit: core.grossProfit,
        grossLoss: core.grossLoss,
        netPnL: core.netPnL,
        returnPercent: core.totalReturnPercent,
        profitFactor: v(core.profitFactor),
        expectancy: v(core.expectancy),
        maxDrawdown: dd.maxDrawdown,
        maxDrawdownPercent: dd.maxDrawdownPercent,
        bestTrade: v(core.largestWinner) ?? (closed.length ? Math.max(...closed.map((t) => t.realizedPnL)) : null),
        worstTrade: v(core.largestLoser) ?? (closed.length ? Math.min(...closed.map((t) => t.realizedPnL)) : null),
        averageTrade: v(core.expectancy),
        averageWin: v(core.averageWin),
        averageLoss: v(core.averageLoss),
        averageR: v(core.averageR),
      },
      riskMetrics: {
        startingCapital,
        endingCapital: core.finalCapital,
        peakCapital: r2(Math.max(startingCapital, ...equityCurve.map((p) => p.equity))),
        maxOpenRisk: r2(maxOpenRisk),
        maxConcurrentPositions: maxConcurrent,
        dailyLossBreaches: dayLosses.filter((l) => l >= dailyLossLimit).length,
        dailyLossLimit: r2(dailyLossLimit),
        maxDailyRealizedLoss: r2(Math.max(0, ...dayLosses)),
        maxLotsObserved: maxLots,
        riskRejections,
      },
      trades,
      equityCurve,
      monthlyPerformance,
      strategyPerformance,
      regimePerformance,
      noTradeAnalytics,
      meta,
      execution: {
        model,
        intrabarPathModel: model === "INTRABAR_MODEL_DERIVED" ? INTRABAR_PATH_MODEL : null,
        sameBarExitPolicy: model === "INTRABAR_MODEL_DERIVED" ? SAME_BAR_EXIT_POLICY : null,
        flattenOnDailyLossLimit: flatten,
        dailyLossDefinition: "REALIZED_ONLY",
        dailyLossFlattens,
      },
      metadata: {
        runId,
        createdAt: last ? new Date(Date.parse(last.timestamp) + barMs).toISOString() : config.endDate,
        index: config.index,
        timeframe: config.timeframe,
        startDate: config.startDate,
        endDate: config.endDate,
        initialCapital: startingCapital,
        riskConfig,
        executionModel: model,
        transactionCostConfig: costCfg,
        strategyVersion: STRATEGY_VERSION,
        dataVersion: p10 ? DATA_VERSION.PHASE10 : DATA_VERSION.PHASE9_LEGACY,
        riskConfigVersion: p10 ? RISK_CONFIG_VERSION : "risk-2026.10-p9",
        datasetHash: dsHash,
        dataModel: p10 ? "PHASE10" : "PHASE9_LEGACY",
        optionsMode: "SYNTHETIC",
        optionPriceQuality: "MODEL_DERIVED",
        historicalOptionOHLC: "NOT_AVAILABLE",
        ivSource: p10 ? (ivFallbackBars ? "OBSERVED (partial; benchmark fallback on some bars)" : "OBSERVED (India VIX index level)") : "SYNTHETIC",
        survivorshipBiasRisk: p10,
        resultStatus: validation.status,
      },
      scorecard,
      validation,
      sample,
      costSummary: {
        grossPnL: r2(closed.reduce((a, t) => a + (t.grossPnL ?? t.realizedPnL + t.slippageCost), 0)),
        slippage: r2(closed.reduce((a, t) => a + t.slippageCost, 0)),
        brokerage: sumCost("brokerage"),
        stt: sumCost("stt"),
        exchangeCharges: sumCost("exchangeCharges"),
        gst: sumCost("gst"),
        sebiCharges: sumCost("sebiCharges"),
        stampDuty: sumCost("stampDuty"),
        totalCosts: sumCost("totalCosts"),
        netPnL: core.netPnL,
        modeled: !!costCfg,
      },
      historicalInputs: ctx
        ? {
            ivObservedBars,
            ivFallbackBars,
            vixCoverage: ctx.vixCoverage,
            breadthBars,
            breadthAverageCoveragePercent: breadthAvgCoverage,
            constituentCoverage: ctx.constituentCoverage,
            membershipAsOf: ctx.membershipAsOf,
            survivorshipBiasRisk: ctx.survivorshipBiasRisk,
            slippageResizedTrades: slippageResized,
          }
        : null,
      capitalFeasibility: feasibility(startingCapital, riskConfig.riskPerTradePercent, trades[0]?.lotSize ?? (config.index === "nifty" ? 65 : 30), riskPerLotSamples),
    };
  }
}
