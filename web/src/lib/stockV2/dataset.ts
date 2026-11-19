// Read-only loader for the historical stock-session files. Never writes. Rejects anything that is not a complete session.
import * as fs from "node:fs";
import * as path from "node:path";
import type { Bar } from "./indicators.ts";

export const EXPECTED_BARS = 375;

// Closing window in which the stored feed prints flat, zero-volume bars: 15:15–15:29 IST, 14 per session file. The
// bars are LABELLED (placeholder: true) and counted; their prices are kept, because the EMAs run through them.
const CLOSING_FROM_MIN = 15 * 60 + 15;
const CLOSING_TO_MIN = 15 * 60 + 29;
export function isClosingPlaceholder(b: Bar): boolean {
  const d = new Date(Date.parse(b.timestamp) + 330 * 60_000);
  const m = d.getUTCHours() * 60 + d.getUTCMinutes();
  return m >= CLOSING_FROM_MIN && m <= CLOSING_TO_MIN && b.volume === 0 && b.open === b.high && b.high === b.low && b.low === b.close;
}
const FILE = /^(\d{4}-\d{2}-\d{2})-([A-Z0-9&-]+)\.json$/;

export interface SessionFileIssue {
  file: string;
  reason: string;
}

export interface HistoricalDataset {
  dates: string[];
  symbols: string[];
  bars: Map<string, Bar[]>; // symbol → chronological bars across all sessions
  sessionsPerSymbol: Map<string, number>;
  issues: SessionFileIssue[];
  closingPlaceholderBars: number; // bars labelled placeholder: true (flat, zero-volume, 15:15–15:29)
}

// Parses one session file. Returns the bars, or a reason it must be excluded.
export function parseSessionFile(file: string, json: unknown): { bars: Bar[]; date: string; symbol: string } | { reason: string } {
  const m = FILE.exec(file);
  if (!m) return { reason: "filename does not match YYYY-MM-DD-SYMBOL.json" };
  const [, date, symbol] = m;
  if (!json || typeof json !== "object") return { reason: "not a JSON object" };
  const rec = json as { status?: unknown; candles?: unknown; symbol?: unknown; date?: unknown };
  if (rec.status !== "OK") return { reason: `status is ${String(rec.status)}, not OK` };
  if (rec.symbol !== symbol || rec.date !== date) return { reason: "record symbol/date does not match filename" };
  if (!Array.isArray(rec.candles)) return { reason: "candles missing" };
  const bars: Bar[] = [];
  for (const c of rec.candles as Record<string, unknown>[]) {
    const ok = typeof c.timestamp === "string" && [c.open, c.high, c.low, c.close, c.volume].every((v) => typeof v === "number" && Number.isFinite(v));
    if (!ok) return { reason: "malformed candle" };
    bars.push({ timestamp: c.timestamp as string, open: c.open as number, high: c.high as number, low: c.low as number, close: c.close as number, volume: c.volume as number });
  }
  if (bars.length !== EXPECTED_BARS) return { reason: `${bars.length} candles, expected ${EXPECTED_BARS}` };
  for (const b of bars) if (isClosingPlaceholder(b)) b.placeholder = true;
  bars.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  return { bars, date, symbol };
}

export function loadHistoricalDataset(dir: string): HistoricalDataset {
  const files = fs.readdirSync(dir).filter((f) => FILE.test(f)).sort();
  const dates = new Set<string>();
  const bars = new Map<string, Bar[]>();
  const sessionsPerSymbol = new Map<string, number>();
  const issues: SessionFileIssue[] = [];
  let closingPlaceholderBars = 0;
  for (const f of files) {
    let json: unknown;
    try {
      json = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    } catch {
      issues.push({ file: f, reason: "unreadable JSON" });
      continue;
    }
    const parsed = parseSessionFile(f, json);
    if ("reason" in parsed) {
      issues.push({ file: f, reason: parsed.reason });
      continue;
    }
    dates.add(parsed.date);
    closingPlaceholderBars += parsed.bars.filter((b) => b.placeholder).length;
    bars.set(parsed.symbol, [...(bars.get(parsed.symbol) ?? []), ...parsed.bars]);
    sessionsPerSymbol.set(parsed.symbol, (sessionsPerSymbol.get(parsed.symbol) ?? 0) + 1);
  }
  for (const [s, list] of bars) bars.set(s, list.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)));
  return { dates: [...dates].sort(), symbols: [...bars.keys()].sort(), bars, sessionsPerSymbol, issues, closingPlaceholderBars };
}

// Chronological split. Development is the earliest `devCount` dates; validation is the following `valCount` dates.
export function chronologicalSplit(dates: string[], devCount: number, valCount: number): { development: string[]; validation: string[] } {
  if (dates.length < devCount + valCount) throw new Error(`need ${devCount + valCount} sessions, have ${dates.length}`);
  return { development: dates.slice(0, devCount), validation: dates.slice(devCount, devCount + valCount) };
}
