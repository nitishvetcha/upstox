// Live EOD Swing V1 Mode B (₹10,000 / 1 Position / 15-Day Cap) Scanner & Persistence
// Isolated from Strategy 11.4 options math and stock-v2 intraday baselines.

import * as fs from "node:fs";
import * as path from "node:path";
import { ALL_LIQUID_CONSTITUENTS } from "../services/breadthConstituents.generated.ts";
import { getAccessToken } from "../services/upstoxAuth.ts";
import { UPSTOX_API_BASE } from "../services/upstoxEndpoints.ts";
import { assertUpstoxNetworkAllowed } from "../services/upstoxNetworkGate.ts";
import { istToday } from "../time.ts";
import {
  emaSeries,
  highestHigh,
  return10d,
  smaSeries,
  SWING_CONFIG_DEFAULTS,
  type DailyBar,
  type SwingConfig,
} from "./swingV1.ts";

export interface SwingLivePick {
  symbol: string;
  setupType: "BREAKOUT" | "PULLBACK";
  signalDate: string;
  referenceEntry: number;
  qty: number;
  capitalAllocated: number;
  stopLoss: number;
  stopPct: number;
  target: number;
  breakevenTrigger: number;
  maxExitDate: string;
  rsVsNiftyPct: number;
  volumeRatio: number;
  score: number;
}

export interface SwingScanResult {
  status: "PICK" | "NO_SETUP";
  scannedAt: string;
  signalDate: string;
  universeCount: number;
  qualifiedCount: number;
  pick: SwingLivePick | null;
  reason?: string;
}

export function getSwingTodayPath(): string {
  if (process.env.SWING_TODAY_PATH) return process.env.SWING_TODAY_PATH;
  const isTest =
    process.env.NODE_ENV === "test" ||
    process.argv.some((a) => a.includes(".test.") || a.includes("/test/") || a.includes("test-runner"));
  return path.join(process.cwd(), isTest ? ".test-data" : ".data", "swing-today.json");
}

export function saveTodaySwingScan(result: SwingScanResult): void {
  const filePath = getSwingTodayPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(result, null, 2), "utf8");
}

export function loadTodaySwingScan(): SwingScanResult | null {
  const filePath = getSwingTodayPath();
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as SwingScanResult;
  } catch {
    return null;
  }
}

/** Add N trading days (Mon-Fri) to a YYYY-MM-DD date string. */
export function addTradingDays(dateStr: string, tradingDays: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  let added = 0;
  while (added < tradingDays) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d.toISOString().slice(0, 10);
}

/** Pure evaluation of Swing V1 Mode B on pre-loaded daily bars. */
export function evaluateSwingModeB(
  stockData: Map<string, DailyBar[]>,
  niftyBars: DailyBar[],
  now = new Date(),
  config: SwingConfig = SWING_CONFIG_DEFAULTS.MODE_B_10K
): SwingScanResult {
  const scannedAt = now.toISOString();
  if (niftyBars.length < 15) {
    return {
      status: "NO_SETUP",
      scannedAt,
      signalDate: istToday(now),
      universeCount: stockData.size,
      qualifiedCount: 0,
      pick: null,
      reason: "Insufficient NIFTY 50 daily history",
    };
  }

  const niftyCloses = niftyBars.map((b) => b.close);
  const niftyIdx = niftyBars.length - 1;
  const niftyRet10 = return10d(niftyCloses, niftyIdx);
  const signalDate = niftyBars[niftyIdx].date;

  if (niftyRet10 === null) {
    return {
      status: "NO_SETUP",
      scannedAt,
      signalDate,
      universeCount: stockData.size,
      qualifiedCount: 0,
      pick: null,
      reason: "NIFTY 10-day return unavailable",
    };
  }

  const candidates: SwingLivePick[] = [];

  for (const [symbol, bars] of stockData) {
    if (bars.length < 50) continue;
    const i = bars.length - 1;
    const bar = bars[i];

    // A. Price filter: ₹100 - ₹3,500
    if (bar.close < config.minPrice || bar.close > config.maxPrice) continue;

    const closes = bars.map((b) => b.close);
    const highs = bars.map((b) => b.high);
    const lows = bars.map((b) => b.low);
    const volumes = bars.map((b) => b.volume);

    // B. Trend filter: Price > 20 EMA and 20 EMA > 50 EMA
    const e20 = emaSeries(closes, 20)[i];
    const e50 = emaSeries(closes, 50)[i];
    if (e20 === null || e50 === null) continue;
    if (bar.close <= e20 || e20 <= e50) continue;

    // C. Volume filter: >= 1.3x 20-day SMA
    const volSma = smaSeries(volumes, 20)[i];
    if (volSma === null || volSma <= 0) continue;
    const volumeRatio = bar.volume / volSma;
    if (volumeRatio < config.volumeMultiplier) continue;

    // D. Relative Strength vs NIFTY 50 (10-day)
    const stockRet10 = return10d(closes, i);
    if (stockRet10 === null || stockRet10 <= niftyRet10) continue;
    const rsVsNifty = stockRet10 - niftyRet10;

    // E. Setup criteria: Breakout above 10-day high OR pullback bounce off 20 EMA
    const h10 = highestHigh(highs, config.lookbackHighDays, i);
    const isBreakout = h10 !== null && bar.close > h10;
    const isPullback = bar.low <= e20 && bar.close > e20;
    if (!isBreakout && !isPullback) continue;

    // F. Structural Stop-Loss (trailing 10-day low, clamped 3.0% - 4.5%)
    const trailingStart = Math.max(0, i - config.trailingLowDays);
    const swingLow = Math.min(...lows.slice(trailingStart, i + 1));
    const rawStopDist = bar.close - swingLow;
    const stopDist = Math.max(
      bar.close * config.minStopPct,
      Math.min(bar.close * config.maxStopPct, rawStopDist)
    );

    const qty = Math.floor(config.allocationPerTrade / bar.close);
    if (qty <= 0) continue;

    const stopLoss = Math.round((bar.close - stopDist) * 100) / 100;
    const target = Math.round((bar.close + config.targetMultiplier * stopDist) * 100) / 100;
    const breakevenTrigger = Math.round((bar.close + config.breakevenThresholdR * stopDist) * 100) / 100;
    const score = rsVsNifty * 100 * 0.6 + volumeRatio * 0.4;

    candidates.push({
      symbol,
      setupType: isBreakout ? "BREAKOUT" : "PULLBACK",
      signalDate: bar.date,
      referenceEntry: Math.round(bar.close * 100) / 100,
      qty,
      capitalAllocated: Math.round(qty * bar.close * 100) / 100,
      stopLoss,
      stopPct: Math.round((stopDist / bar.close) * 10000) / 100,
      target,
      breakevenTrigger,
      maxExitDate: addTradingDays(bar.date, config.maxHoldingDays),
      rsVsNiftyPct: Math.round(rsVsNifty * 10000) / 100,
      volumeRatio: Math.round(volumeRatio * 100) / 100,
      score: Math.round(score * 100) / 100,
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates[0] ?? null;

  return {
    status: top ? "PICK" : "NO_SETUP",
    scannedAt,
    signalDate,
    universeCount: stockData.size,
    qualifiedCount: candidates.length,
    pick: top,
    reason: top ? undefined : "No stocks met Swing V1 Mode B criteria today",
  };
}

async function fetchDailyBarsFromUpstox(
  token: string,
  instrumentKey: string,
  toDate: string,
  fromDate: string
): Promise<DailyBar[]> {
  const endpoint = `/v3/historical-candle/${encodeURIComponent(instrumentKey)}/days/1/${toDate}/${fromDate}`;
  assertUpstoxNetworkAllowed(endpoint);
  const res = await fetch(`${UPSTOX_API_BASE}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
    cache: "no-store",
  });
  if (!res.ok) return [];
  const body = (await res.json().catch(() => null)) as { status?: string; data?: { candles?: unknown[][] } } | null;
  const rows = body?.data?.candles;
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => ({
      date: String(r[0]).slice(0, 10),
      open: Number(r[1]),
      high: Number(r[2]),
      low: Number(r[3]),
      close: Number(r[4]),
      volume: Number(r[5]),
    }))
    .filter((b) => Number.isFinite(b.close) && b.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Run live EOD Swing V1 Mode B scan across ALL_LIQUID_CONSTITUENTS and persist result. */
export async function runLiveSwingScan(now = new Date()): Promise<SwingScanResult> {
  const token = await getAccessToken();
  if (!token) {
    const res: SwingScanResult = {
      status: "NO_SETUP",
      scannedAt: now.toISOString(),
      signalDate: istToday(now),
      universeCount: 0,
      qualifiedCount: 0,
      pick: null,
      reason: "Upstox token unavailable",
    };
    saveTodaySwingScan(res);
    return res;
  }

  const toDate = istToday(now);
  const fromDate = new Date(now.getTime() - 120 * 86_400_000).toISOString().slice(0, 10);

  const niftyBars = await fetchDailyBarsFromUpstox(token, "NSE_INDEX|Nifty 50", toDate, fromDate);
  const stockData = new Map<string, DailyBar[]>();

  const SWING_ETFS = [
    { symbol: "GOLDBEES", instrumentKey: "NSE_EQ|INF204KB17I5" },
    { symbol: "SILVERBEES", instrumentKey: "NSE_EQ|INF204KC1402" },
  ];
  const universe = [...ALL_LIQUID_CONSTITUENTS, ...SWING_ETFS];

  // Fetch in batches of 10 with 150ms spacing to respect Upstox rate limits
  for (let i = 0; i < universe.length; i += 10) {
    const batch = universe.slice(i, i + 10);
    const results = await Promise.all(
      batch.map(async (c) => {
        const bars = await fetchDailyBarsFromUpstox(token, c.instrumentKey, toDate, fromDate).catch(() => []);
        return { symbol: c.symbol, bars };
      })
    );
    for (const r of results) {
      if (r.bars.length >= 50) stockData.set(r.symbol, r.bars);
    }
    if (i + 10 < universe.length) {
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  const result = evaluateSwingModeB(stockData, niftyBars, now);
  saveTodaySwingScan(result);
  return result;
}
