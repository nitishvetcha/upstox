// Historical replay of the live intraday stock scanner + collector + monitor, minute by minute.
// Rules: docs/intraday-replay-rules.md (frozen 2026-10-24). Pure: no I/O, no paper-trade records.
import type { StockMarketData } from "../services/stockService.ts";
import type { Candle } from "../types.ts";
import { scoreIntradayQuote, niftyProxyChange } from "./stockOpportunityEngine.ts";

export const REPLAY_VERSION = "intraday-replay-1";
const OPEN_MIN = 9 * 60 + 15;
const LAST_MIN = 15 * 60 + 29;
const CUTOFF_MIN = 14 * 60 + 30; // entry time = close of bar m = minute m+1; must be before 14:30

// One stock's bars for one session, oldest first. minute = IST minute of day of the bar's start.
export interface DayBars {
  symbol: string;
  prevClose: number;
  minute: Int16Array;
  o: Float32Array; h: Float32Array; l: Float32Array; c: Float32Array; v: Float32Array;
}

export interface ReplayTrade {
  date: string; symbol: string; direction: "BULLISH" | "BEARISH"; setup: string; score: number;
  entryMinute: number; entry: number; stop: number; target1: number; target2: number;
  exitMinute: number; exit: number; exitReason: "STOP" | "STOP_GAP" | "TARGET1" | "TARGET2" | "TARGET_GAP" | "EOD";
  riskPerUnit: number; grossR: number;
}

interface State { i: number; open: number; high: number; low: number; last: number; vol: number }
interface Pos { t: Omit<ReplayTrade, "exitMinute" | "exit" | "exitReason" | "grossR"> }

const quote = (b: DayBars, s: State): StockMarketData => ({
  symbol: b.symbol, exchange: "NSE", instrumentKey: b.symbol, timestamp: "", ltp: s.last,
  open: s.open, high: s.high, low: s.low, previousClose: b.prevClose,
  change: s.last - b.prevClose, changePercent: ((s.last - b.prevClose) / b.prevClose) * 100, volume: s.vol,
  marketStatus: "OPEN", freshness: "LIVE", source: "UPSTOX", unavailableReason: null,
});

// `seen` persists across days: the live collector never re-enters an identical setup it has already created.
export function replayDay(date: string, stocks: DayBars[], seen = new Set<string>()): ReplayTrade[] {
  const st: (State | null)[] = stocks.map(() => null);
  const ptr = stocks.map(() => 0);
  const open = new Map<string, Pos>();
  const trades: ReplayTrade[] = [];

  const close = (p: Pos, minute: number, px: number, reason: ReplayTrade["exitReason"]) => {
    const long = p.t.direction === "BULLISH";
    trades.push({ ...p.t, exitMinute: minute, exit: px, exitReason: reason, grossR: ((long ? px - p.t.entry : p.t.entry - px) / p.t.riskPerUnit) });
    open.delete(p.t.symbol);
  };

  for (let m = OPEN_MIN; m <= LAST_MIN; m++) {
    // 1. Advance each stock to its bar for minute m (if any) and manage its open position on that bar.
    for (let k = 0; k < stocks.length; k++) {
      const b = stocks[k];
      const i = ptr[k];
      if (i >= b.minute.length || b.minute[i] !== m) continue;
      ptr[k]++;
      const o = b.o[i], h = b.h[i], l = b.l[i], c = b.c[i];
      const s = st[k];
      st[k] = s ? { i, open: s.open, high: Math.max(s.high, h), low: Math.min(s.low, l), last: c, vol: s.vol + b.v[i] }
                : { i, open: o, high: h, low: l, last: c, vol: b.v[i] };
      const p = open.get(b.symbol);
      if (!p) continue;
      const t = p.t;
      if (t.direction === "BULLISH") {
        if (o <= t.stop) close(p, m, o, "STOP_GAP");
        else if (l <= t.stop) close(p, m, t.stop, "STOP");
        else if (o >= t.target1) close(p, m, o, "TARGET_GAP");
        else if (h >= t.target2) close(p, m, t.target2, "TARGET2");
        else if (h >= t.target1) close(p, m, t.target1, "TARGET1");
      } else {
        if (o >= t.stop) close(p, m, o, "STOP_GAP");
        else if (h >= t.stop) close(p, m, t.stop, "STOP");
        else if (o <= t.target1) close(p, m, o, "TARGET_GAP");
        else if (l <= t.target2) close(p, m, t.target2, "TARGET2");
        else if (l <= t.target1) close(p, m, t.target1, "TARGET1");
      }
    }

    // 2. Scan at the close of bar m with data up to m only; entries before 14:30.
    if (m + 1 >= CUTOFF_MIN) continue;
    const live: { k: number; q: StockMarketData }[] = [];
    for (let k = 0; k < stocks.length; k++) { const s = st[k]; if (s) live.push({ k, q: quote(stocks[k], s) }); }
    const nifty = niftyProxyChange(live.map((x) => x.q.changePercent!));
    const cands = [];
    for (const { k, q } of live) {
      const r = scoreIntradayQuote(q, nifty);
      if (r) cands.push({ k, q, r });
    }
    cands.sort((a, b) => b.r.scored.score - a.r.scored.score); // stable: ties keep universe order, as live
    for (const { k, r } of cands.slice(0, 3)) {
      const sym = stocks[k].symbol;
      if (open.has(sym)) continue;
      const key = `${sym}|${r.scored.direction}|${r.scored.setup}|${r.plan.entry}|${r.plan.stop}|${r.plan.target1}`;
      if (seen.has(key)) continue;
      const risk = r.scored.direction === "BULLISH" ? r.plan.entry - r.plan.stop : r.plan.stop - r.plan.entry;
      if (!(risk > 0)) continue; // the live collector rejects a stop on the wrong side
      seen.add(key);
      open.set(sym, { t: { date, symbol: sym, direction: r.scored.direction, setup: r.scored.setup, score: r.scored.score, entryMinute: m + 1,
        entry: r.plan.entry, stop: r.plan.stop, target1: r.plan.target1, target2: r.plan.target2, riskPerUnit: risk } });
    }
  }

  // 3. End of day: anything still open exits at its last bar's close.
  for (const p of [...open.values()]) {
    const k = stocks.findIndex((b) => b.symbol === p.t.symbol);
    close(p, LAST_MIN + 1, st[k]!.last, "EOD");
  }
  return trades;
}

// ── Data validation (protocol: "Data validation") ─────────────────────────────
export const MIN_BARS_PER_DAY = 300;
export const CORP_ACTION_GAP = 0.25;
export type DayIssue = "bad_ohlc" | "too_few_bars" | "no_prev_close" | "corporate_action";
export interface DayCounters { droppedOutsideSession: number; droppedBadTz: number; duplicates: number; reordered: number }

// Turns one stock's raw candles for one IST date into validated DayBars, or the reason the day is excluded.
// Never fills or invents bars.
export function validateDay(symbol: string, raw: Candle[], prevClose: number | undefined, n: DayCounters): DayBars | DayIssue {
  if (!(prevClose && prevClose > 0)) return "no_prev_close";
  const byMin = new Map<number, Candle>();
  let lastMin = -1;
  for (const c of raw) {
    if (!c.timestamp.endsWith("+05:30")) { n.droppedBadTz++; continue; }
    const m = Number(c.timestamp.slice(11, 13)) * 60 + Number(c.timestamp.slice(14, 16));
    if (m < OPEN_MIN || m > LAST_MIN) { n.droppedOutsideSession++; continue; }
    if (byMin.has(m)) { n.duplicates++; continue; }
    if (m < lastMin) n.reordered++;
    lastMin = Math.max(lastMin, m);
    byMin.set(m, c);
  }
  const bars = [...byMin.entries()].sort((a, b) => a[0] - b[0]);
  for (const [, c] of bars) {
    if (!(c.open > 0 && c.high > 0 && c.low > 0 && c.close > 0) || c.high < Math.max(c.open, c.close) || c.low > Math.min(c.open, c.close)) return "bad_ohlc";
  }
  if (bars.length < MIN_BARS_PER_DAY) return "too_few_bars";
  if (Math.abs(bars[0][1].open / prevClose - 1) > CORP_ACTION_GAP) return "corporate_action";
  const len = bars.length;
  const b: DayBars = { symbol, prevClose, minute: new Int16Array(len), o: new Float32Array(len), h: new Float32Array(len), l: new Float32Array(len), c: new Float32Array(len), v: new Float32Array(len) };
  bars.forEach(([m, c], i) => { b.minute[i] = m; b.o[i] = c.open; b.h[i] = c.high; b.l[i] = c.low; b.c[i] = c.close; b.v[i] = c.volume ?? 0; });
  return b;
}
