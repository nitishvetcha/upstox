// Trade journal + CSV export. Multi-leg trades keep their legs (never flattened into one fake leg).
// CSV format: trades.csv = one row per trade; legs.csv = one row per leg, joined on (run_id, trade_id).
import type { BacktestResult, BacktestTrade } from "../../backtestTypes.ts";
import { holdingMinutes } from "./metrics.ts";

const DIRECTION: Record<string, string> = {
  "Long Call": "BULLISH",
  "Bull Call Spread": "BULLISH",
  "Long Put": "BEARISH",
  "Bear Put Spread": "BEARISH",
  "ATM Straddle": "LONG VOLATILITY",
  "Iron Condor": "NEUTRAL (SHORT VOLATILITY)",
};
const r2 = (n: number) => Math.round(n * 100) / 100;

export function journalEntry(runId: string, t: BacktestTrade) {
  // A leg exiting at 0 is valid (expired worthless); only a missing exit (non-finite / trade not exited) is incomplete.
  const complete = !!t.exitTimestamp && t.legs.every((l) => Number.isFinite(l.entryPrice) && Number.isFinite(l.exitPrice));
  const legs = t.legs.map((l, i) => ({
    legNo: i + 1,
    instrument: `${t.index.toUpperCase()} ${l.strike} ${l.type} ${t.expiry}`,
    optionType: l.type,
    strike: l.strike,
    side: l.side,
    quantity: l.quantity ?? t.quantity,
    entryPrice: l.entryPrice,
    exitPrice: complete ? l.exitPrice : null,
    entryMid: l.entryMid ?? null,
    exitMid: complete ? (l.exitMid ?? null) : null,
    pnl: complete ? r2((l.side === "BUY" ? l.exitPrice - l.entryPrice : l.entryPrice - l.exitPrice) * (l.quantity ?? t.quantity)) : null,
  }));
  return {
    tradeId: t.tradeId,
    runId,
    timestamp: t.entryTimestamp,
    index: t.index,
    strategy: t.strategy,
    regime: t.regime,
    direction: DIRECTION[t.strategy] ?? "UNKNOWN",
    confidence: t.confidence,
    score: t.signalScore,
    entry: t.entryPrice,
    exit: t.exitTimestamp ? t.exitPrice : null,
    credit: t.credit ?? t.entryPrice < 0,
    quantity: t.quantity,
    lots: t.lots,
    riskAmount: t.riskAmount,
    plannedStop: t.stopLoss,
    target: t.target1,
    // Gross = market movement at model mid prices (before slippage and statutory costs).
    grossPnL: t.grossPnL ?? r2(t.realizedPnL + (t.slippageCost ?? 0)),
    costs: t.costs && t.costs.totalCosts > 0
      ? { slippage: t.slippageCost ?? 0, brokerage: t.costs.brokerage, stt: t.costs.stt, exchangeCharges: t.costs.exchangeCharges, gst: t.costs.gst, stampDuty: t.costs.stampDuty, sebiCharges: t.costs.sebiCharges, other: null, total: t.costs.totalCosts, status: "MODELED" }
      : { slippage: t.slippageCost ?? 0, brokerage: null, stt: null, exchangeCharges: null, gst: null, stampDuty: null, sebiCharges: null, other: null, total: null, status: "NOT MODELED (slippage only)" },
    netPnL: t.realizedPnL,
    rMultiple: t.rMultiple,
    holdingMinutes: holdingMinutes(t),
    exitReason: t.exitReason,
    legsComplete: complete,
    exitTimestamp: t.exitTimestamp || null,
    dataQuality: "SIMULATED: historical spot, MODEL-DERIVED option prices",
    legs,
  };
}

export const journal = (result: BacktestResult, trades = result.trades) => trades.map((t) => journalEntry(result.runId, t));

const esc = (v: unknown) => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (header: string[], rows: unknown[][]) => [header.join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n") + "\n";

export const TRADE_COLUMNS = [
  "run_id", "trade_id", "timestamp", "exit_timestamp", "index", "strategy", "regime", "direction", "confidence", "score", "entry", "exit",
  "quantity", "lots", "risk_amount", "stop", "target", "gross_pnl", "slippage_cost", "transaction_cost", "net_pnl", "r_multiple",
  "holding_minutes", "exit_reason", "legs", "data_quality",
];
export function tradesCsv(result: BacktestResult, trades = result.trades): string {
  return toCsv(TRADE_COLUMNS, journal(result, trades).map((j) => [
    j.runId, j.tradeId, j.timestamp, j.exitTimestamp, j.index, j.strategy, j.regime, j.direction, j.confidence, j.score, j.entry, j.exit,
    j.quantity, j.lots, j.riskAmount, j.plannedStop, j.target, j.grossPnL, j.costs.slippage, j.costs.total ?? "NOT MODELED", j.netPnL, j.rMultiple,
    j.holdingMinutes, j.exitReason, j.legs.length, j.dataQuality,
  ]));
}

export const LEG_COLUMNS = ["run_id", "trade_id", "leg_no", "instrument", "option_type", "strike", "side", "quantity", "entry_price", "exit_price", "entry_mid", "exit_mid", "pnl"];
export function legsCsv(result: BacktestResult, trades = result.trades): string {
  return toCsv(LEG_COLUMNS, journal(result, trades).flatMap((j) => j.legs.map((l) => [
    j.runId, j.tradeId, l.legNo, l.instrument, l.optionType, l.strike, l.side, l.quantity, l.entryPrice, l.exitPrice, l.entryMid, l.exitMid, l.pnl,
  ])));
}
