// Server-side data for the Stock V2 research dashboard. Reads only stored research files; never fabricates candles,
// trades or indicators. Indicators are computed with the same causal functions the simulator uses.
import * as fs from "node:fs";
import * as path from "node:path";
import { parseSessionFile } from "./stockV2/dataset.ts";
import { ema, sessionVwap, type Bar } from "./stockV2/indicators.ts";
import { istDate } from "./stockV2/simulate.ts";

export const HIST_DIR = path.join(process.cwd(), ".research-data/intraday-bars-historical");
export const RESULTS_DIR = path.join(process.cwd(), ".research-data/stock-v3-historical-2026-11-20");

// Lightweight Charts renders UTC. Shifting by the IST offset makes the axis read as IST wall-clock time.
const IST_SHIFT_S = 19800;
export const toChartTime = (iso: string) => Math.floor(Date.parse(iso) / 1000) + IST_SHIFT_S;

export function loadSymbolSessions(symbol: string, through?: string): { date: string; bars: Bar[] }[] {
  let files: string[];
  try {
    files = fs.readdirSync(HIST_DIR).filter((f) => f.endsWith(`-${symbol}.json`) && (!through || f.slice(0, 10) <= through)).sort();
  } catch {
    return [];
  }
  const out: { date: string; bars: Bar[] }[] = [];
  for (const f of files) {
    try {
      const parsed = parseSessionFile(f, JSON.parse(fs.readFileSync(path.join(/* turbopackIgnore: true */ HIST_DIR, f), "utf8")));
      if ("bars" in parsed) out.push({ date: parsed.date, bars: parsed.bars });
    } catch {
      // unreadable or invalid file: excluded, reported by the loader's issue list
    }
  }
  return out;
}

export interface ChartPayload {
  symbol: string;
  date: string;
  candles: { time: number; open: number; high: number; low: number; close: number }[];
  ema9: { time: number; value: number }[];
  ema21: { time: number; value: number }[];
  ema50: { time: number; value: number }[];
  ema200: { time: number; value: number }[];
  vwap: { time: number; value: number }[];
}

// Indicator series for one stock on one session. EMA uses the full stored history up to the session (causal).
// VWAP is session-anchored. Null values are omitted rather than filled.
export function buildChartPayload(symbol: string, date: string): ChartPayload | null {
  const sessions = loadSymbolSessions(symbol, date);
  const idx = sessions.findIndex((s) => s.date === date);
  if (idx < 0) return null;
  const all: Bar[] = sessions.flatMap((s) => s.bars);
  const closes = all.map((b) => b.close);
  const e9 = ema(closes, 9), e21 = ema(closes, 21), e50 = ema(closes, 50), e200 = ema(closes, 200);
  const start = sessions.slice(0, idx).reduce((n, s) => n + s.bars.length, 0);
  const bars = sessions[idx].bars;
  const vwap = sessionVwap(bars);
  const pick = (arr: (number | null)[], k: number) => arr[start + k];
  const series = (arr: (number | null)[]) =>
    bars.map((b, k) => ({ time: toChartTime(b.timestamp), value: pick(arr, k) })).filter((p): p is { time: number; value: number } => p.value !== null);
  if (istDate(bars[0].timestamp) !== date) return null;
  return {
    symbol,
    date,
    candles: bars.map((b) => ({ time: toChartTime(b.timestamp), open: b.open, high: b.high, low: b.low, close: b.close })),
    ema9: series(e9),
    ema21: series(e21),
    ema50: series(e50),
    ema200: series(e200),
    vwap: bars.map((b, k) => ({ time: toChartTime(b.timestamp), value: vwap[k] })).filter((p): p is { time: number; value: number } => p.value !== null),
  };
}

export interface TradeRecord {
  symbol: string;
  strategy: string;
  scenario: string;
  date: string;
  side: "LONG" | "SHORT";
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
  notional: number;
  grossPnl: number;
  charges: number;
  netPnl: number;
  grossR: number;
  netR: number;
  holdMinutes: number;
  plannedRR: number;
}

export function loadTradesFile(): Record<string, TradeRecord[]> | null {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, "trades-development-base.json"), "utf8")) as { trades: Record<string, TradeRecord[]> };
    return raw.trades;
  } catch {
    return null;
  }
}

export function loadDevelopment(): { provenance: { codeSha256: string; developmentDates: string[]; sessionsLoaded: number; symbols: number; gateNote: string; generatedAt: string; skippedFiles: number }; selected: string | null; selectionReasons: Record<string, string>; candidates: unknown[] } | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, "development.json"), "utf8"));
  } catch {
    return null;
  }
}

// Equity and drawdown from realised net P&L in chronological order. One point per timestamp (last value wins),
// because Lightweight Charts requires strictly ascending times.
export function equityAndDrawdown(trades: TradeRecord[]) {
  const sorted = [...trades].sort((a, b) => a.exitTime.localeCompare(b.exitTime));
  let eq = 0, peak = 0;
  const equity = new Map<number, number>();
  const drawdown = new Map<number, number>();
  for (const t of sorted) {
    eq += t.netPnl;
    peak = Math.max(peak, eq);
    const time = toChartTime(t.exitTime);
    equity.set(time, Math.round(eq));
    drawdown.set(time, -Math.round(peak - eq));
  }
  const toSeries = (m: Map<number, number>) => [...m].sort((a, b) => a[0] - b[0]).map(([time, value]) => ({ time, value }));
  return { equity: toSeries(equity), drawdown: toSeries(drawdown) };
}
