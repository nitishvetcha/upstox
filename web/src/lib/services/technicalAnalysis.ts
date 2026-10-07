// Pure technical analysis on real candles. No I/O, no generated data: anything that can't be computed is null.
import type { Candle, FuturesVwap, TechnicalAnalysis, Timeframe } from "../types.ts";
import { istMinutes } from "../time.ts";

// Documented, configurable thresholds.
export const VOLATILITY = {
  // Daily ATR as % of price. NIFTY/BANK NIFTY usually sit around 0.8–1.3%; outside that band is unusual.
  lowAtrPct: 0.8,
  highAtrPct: 1.6,
  // ATM IV (percent) above which option premium is treated as expensive / volatile regardless of ATR.
  highIv: 25,
};
const OPEN = 9 * 60 + 15; // 09:15 IST
const OR_END = 9 * 60 + 30; // opening range = 09:15–09:30 IST
const STRUCTURE_BARS = 20;

const clamp = (x: number, lo = -1, hi = 1) => Math.min(hi, Math.max(lo, x));
const last = <T,>(xs: T[]) => xs[xs.length - 1];

// IST calendar date of a candle timestamp.
export const istDate = (iso: string) => new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(0, 10);

// EMA seeded with the SMA of the first `period` values; null until then.
export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = values.map(() => null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) out[i] = prev = (values[i] - prev) * k + prev;
  return out;
}

// Wilder smoothing (RSI, ATR): first value = simple mean, then avg = (avg × (n−1) + x) / n.
function wilder(xs: number[], n: number): number | null {
  if (xs.length < n) return null;
  let avg = xs.slice(0, n).reduce((a, b) => a + b, 0) / n;
  for (let i = n; i < xs.length; i++) avg = (avg * (n - 1) + xs[i]) / n;
  return avg;
}

export function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  const ch = closes.slice(1).map((c, i) => c - closes[i]);
  const gain = wilder(ch.map((d) => Math.max(d, 0)), period)!;
  const loss = wilder(ch.map((d) => Math.max(-d, 0)), period)!;
  if (loss === 0) return gain === 0 ? 50 : 100;
  return 100 - 100 / (1 + gain / loss);
}

export function atr(candles: Candle[], period = 14): number | null {
  if (candles.length < period + 1) return null;
  const tr = candles.slice(1).map((c, i) => {
    const pc = candles[i].close;
    return Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
  });
  return wilder(tr, period);
}

export function macd(closes: number[]) {
  const fast = ema(closes, 12);
  const slow = ema(closes, 26);
  const line = closes.map((_, i) => (fast[i] !== null && slow[i] !== null ? fast[i]! - slow[i]! : null));
  const defined = line.filter((v): v is number => v !== null);
  const sig = ema(defined, 9);
  if (sig.length < 2 || last(sig) === null || sig.at(-2) === null) return null;
  const hist = last(defined) - last(sig)!;
  const prevHist = defined.at(-2)! - sig.at(-2)!;
  return { macd: last(defined), signal: last(sig)!, histogram: hist, previousHistogram: prevHist };
}

// Session VWAP: typical price × volume over the session's candles only. Null if any candle lacks volume.
export function vwap(session: Candle[]): number | null {
  if (!session.length || session.some((c) => c.volume === null)) return null;
  let pv = 0;
  let v = 0;
  for (const c of session) {
    pv += ((c.high + c.low + c.close) / 3) * c.volume!;
    v += c.volume!;
  }
  return v > 0 ? pv / v : null;
}

export function previousDay(daily: Candle[], sessionDate: string) {
  const prev = [...daily].reverse().find((c) => istDate(c.timestamp) < sessionDate);
  return prev ? { high: prev.high, low: prev.low, close: prev.close } : null;
}

// 09:15–09:30 IST of the session; null until the window has closed.
export function openingRange(intraday: Candle[], sessionDate: string, now: Date) {
  const today = istDate(now.toISOString()) === sessionDate;
  if (today && istMinutes(now).minutes < OR_END) return null;
  const bars = intraday.filter((c) => {
    const m = istMinutes(new Date(c.timestamp)).minutes;
    return istDate(c.timestamp) === sessionDate && m >= OPEN && m < OR_END;
  });
  if (!bars.length) return null;
  return { high: Math.max(...bars.map((c) => c.high)), low: Math.min(...bars.map((c) => c.low)) };
}

// Higher highs / higher lows across the last 20 candles (two halves compared), plus breakout of the prior range.
export function priceStructure(candles: Candle[]): TechnicalAnalysis["priceAction"] {
  if (candles.length < STRUCTURE_BARS + 1) return null;
  const recent = candles.slice(-STRUCTURE_BARS);
  const a = recent.slice(0, STRUCTURE_BARS / 2);
  const b = recent.slice(STRUCTURE_BARS / 2);
  const hi = (xs: Candle[]) => Math.max(...xs.map((c) => c.high));
  const lo = (xs: Candle[]) => Math.min(...xs.map((c) => c.low));
  const higherHigh = hi(b) > hi(a);
  const higherLow = lo(b) > lo(a);
  const lowerHigh = hi(b) < hi(a);
  const lowerLow = lo(b) < lo(a);
  const structure = higherHigh && higherLow ? "BULLISH STRUCTURE" : lowerHigh && lowerLow ? "BEARISH STRUCTURE" : "RANGE";
  const prior = candles.slice(-STRUCTURE_BARS - 1, -1);
  const close = last(candles).close;
  const event = close > hi(prior) ? "BREAKOUT" : close < lo(prior) ? "BREAKDOWN" : "RANGE";
  return { structure, event, higherHigh, higherLow, lowerHigh, lowerLow };
}

export function volatilityRegime(atrPercent: number | null, atmIv: number | null = null): TechnicalAnalysis["volatilityRegime"] {
  if (atrPercent === null && atmIv === null) return null;
  if ((atrPercent ?? 0) > VOLATILITY.highAtrPct || (atmIv ?? 0) > VOLATILITY.highIv) return "HIGH VOLATILITY";
  if (atrPercent !== null && atrPercent < VOLATILITY.lowAtrPct) return "LOW VOLATILITY";
  return "NORMAL VOLATILITY";
}

export const rsiState = (v: number): NonNullable<TechnicalAnalysis["rsiState"]> =>
  v > 70 ? "OVERBOUGHT" : v >= 55 ? "BULLISH" : v > 45 ? "NEUTRAL" : v >= 30 ? "BEARISH" : "OVERSOLD";

function emaStructure(price: number, e9: number | null, e21: number | null, e50: number | null): TechnicalAnalysis["emaStructure"] {
  if (e9 === null || e21 === null) return null;
  if (e50 !== null && price > e9 && e9 > e21 && e21 > e50) return "STRONG_BULLISH";
  if (e50 !== null && price < e9 && e9 < e21 && e21 < e50) return "STRONG_BEARISH";
  if (Math.abs(e9 - e21) / price < 0.0002) return "RANGE"; // < 0.02% apart = flat
  return e9 > e21 ? "BULLISH" : "BEARISH";
}

// VWAP signal: futures price vs FUTURES VWAP when valid (live indices); spot VWAP only if spot candles carry volume.
function vwapComponent(t: Omit<TechnicalAnalysis, "technicalScore" | "trend">) {
  const f = t.futuresVwap;
  if (f && f.state !== "UNAVAILABLE")
    return { name: "VWAP", d: f.state === "ABOVE VWAP" ? 1 : f.state === "BELOW VWAP" ? -1 : 0, note: `Futures price ${f.state === "AT VWAP" ? "at" : f.state === "ABOVE VWAP" ? "above" : "below"} futures VWAP` };
  if (t.vwap !== null) return { name: "VWAP", d: t.price > t.vwap ? 1 : -1, note: t.vwapState! };
  return { name: "VWAP", d: null, note: f ? `Futures VWAP unavailable: ${f.reason}` : "VWAP unavailable (no volume in index candles)" };
}

// Each component: direction -1..+1. Score = 3 points per component for agreeing with the overall direction,
// rescaled to 15 over the components that could be computed (missing ones are listed, never guessed).
function scoreAndTrend(t: Omit<TechnicalAnalysis, "technicalScore" | "trend">) {
  const emaD = { STRONG_BULLISH: 1, BULLISH: 0.5, RANGE: 0, BEARISH: -0.5, STRONG_BEARISH: -1 } as const;
  const comps: { name: string; d: number | null; note: string }[] = [
    { name: "EMA structure", d: t.emaStructure ? emaD[t.emaStructure] : null, note: t.emaStructure ? `EMA ${t.emaStructure.replace("_", " ").toLowerCase()}` : "EMAs unavailable" },
    { name: "RSI", d: t.rsi === null ? null : clamp((t.rsi - 50) / 15), note: t.rsi === null ? "RSI unavailable" : `RSI ${t.rsi.toFixed(1)} (${t.rsiState})` },
    vwapComponent(t),
    {
      name: "MACD",
      d: t.macdHistogram === null ? null : t.macdHistogram > 0 ? (t.macdState === "BULLISH" ? 1 : 0.5) : t.macdHistogram < 0 ? (t.macdState === "BEARISH" ? -1 : -0.5) : 0,
      note: t.macdHistogram === null ? "MACD unavailable" : `MACD histogram ${t.macdHistogram >= 0 ? "positive" : "negative"}${t.macdState === "NEUTRAL" ? ", fading" : ""}`,
    },
    {
      name: "Price action",
      d: !t.priceAction ? null : t.priceAction.structure === "BULLISH STRUCTURE" ? 1 : t.priceAction.structure === "BEARISH STRUCTURE" ? -1 : 0,
      note: !t.priceAction ? "Not enough candles for structure" : `${t.priceAction.structure.toLowerCase()}${t.priceAction.event !== "RANGE" ? `, ${t.priceAction.event.toLowerCase()}` : ""}`,
    },
  ];
  const used = comps.filter((c) => c.d !== null);
  const D = used.length ? used.reduce((s, c) => s + c.d!, 0) / used.length : 0;
  const s = D >= 0 ? 1 : -1;
  const components = comps.map((c) => ({ name: c.name, max: 3, points: c.d === null ? null : Math.round(3 * ((1 + s * c.d) / 2) * 10) / 10, note: c.note }));
  const pts = components.filter((c) => c.points !== null).reduce((a, c) => a + c.points!, 0);
  const technicalScore = {
    score: used.length >= 3 ? Math.round((15 * pts) / (3 * used.length) * 10) / 10 : null,
    max: 15 as const,
    components,
  };

  const stack = t.emaStructure === "STRONG_BULLISH" || t.emaStructure === "STRONG_BEARISH";
  const state: TechnicalAnalysis["trend"]["state"] =
    used.length < 3 ? "NEUTRAL" : D >= 0.5 && stack && s > 0 ? "STRONG_BULLISH" : D <= -0.5 && stack && s < 0 ? "STRONG_BEARISH" : D >= 0.2 ? "BULLISH" : D <= -0.2 ? "BEARISH" : "NEUTRAL";
  const reasons = used.filter((c) => (state === "NEUTRAL" ? true : Math.sign(c.d!) === s)).map((c) => c.note);
  return { technicalScore, trend: { state, direction: Math.round(D * 100) / 100, reasons } };
}

const TF_MIN: Record<Timeframe, number> = { "5m": 5, "15m": 15, "30m": 30, "1h": 60, "1d": 1440 };

export function analyzeTechnicals(input: {
  timeframe: Timeframe;
  candles: Candle[]; // selected timeframe, oldest first
  daily: Candle[]; // completed daily candles, oldest first
  openingCandles: Candle[]; // ≤15m intraday candles covering 09:15–09:30
  futuresVwap?: FuturesVwap | null;
  now: Date;
}): TechnicalAnalysis | null {
  const { timeframe, candles, daily, openingCandles, now } = input;
  const futuresVwap = input.futuresVwap ?? null;
  if (!candles.length) return null;
  const closes = candles.map((c) => c.close);
  const price = last(closes);
  // Daily candles are completed days only, so the daily view is "as of today"; intraday uses the latest candle's session.
  const sessionDate = timeframe === "1d" ? istDate(now.toISOString()) : istDate(last(candles).timestamp);
  const session = candles.filter((c) => istDate(c.timestamp) === sessionDate);
  const [e9, e21, e50, e200] = [9, 21, 50, 200].map((p) => last(ema(closes, p)));
  const r = rsi(closes);
  const v = TF_MIN[timeframe] < 1440 ? vwap(session) : null;
  const a = atr(candles);
  const completedDays = daily.filter((c) => istDate(c.timestamp) < sessionDate);
  const dAtr = atr(completedDays);
  const m = macd(closes);
  const pd = previousDay(daily, sessionDate);
  const or = TF_MIN[timeframe] < 1440 ? openingRange(openingCandles, sessionDate, now) : null;
  const macdState = !m ? null : m.histogram > 0 && m.histogram >= m.previousHistogram ? "BULLISH" : m.histogram < 0 && m.histogram <= m.previousHistogram ? "BEARISH" : "NEUTRAL";

  const base = {
    timeframe,
    price,
    sessionDate,
    marketClosed: timeframe !== "1d" && sessionDate !== istDate(now.toISOString()),
    candleCount: candles.length,
    lastCandleAt: last(candles).timestamp,
    ema9: e9,
    ema21: e21,
    ema50: e50,
    ema200: e200,
    emaStructure: emaStructure(price, e9, e21, e50),
    rsi: r,
    rsiState: r === null ? null : rsiState(r),
    vwap: v,
    vwapState: v === null ? null : price > v ? ("ABOVE VWAP" as const) : ("BELOW VWAP" as const),
    futuresVwap,
    atr: a,
    atrPercent: a === null ? null : (a / price) * 100,
    dailyAtr: dAtr,
    dailyAtrPercent: dAtr === null ? null : (dAtr / price) * 100,
    macd: m?.macd ?? null,
    macdSignal: m?.signal ?? null,
    macdHistogram: m?.histogram ?? null,
    macdState: macdState as TechnicalAnalysis["macdState"],
    previousDayHigh: pd?.high ?? null,
    previousDayLow: pd?.low ?? null,
    previousDayClose: pd?.close ?? null,
    openingRangeHigh: or?.high ?? null,
    openingRangeLow: or?.low ?? null,
    openingRangeBreakout: !or ? null : price > or.high ? ("ABOVE" as const) : price < or.low ? ("BELOW" as const) : ("INSIDE" as const),
    priceAction: priceStructure(candles),
    volatilityRegime: volatilityRegime(dAtr === null ? null : (dAtr / price) * 100),
  };
  return { ...base, ...scoreAndTrend(base) };
}

// Chart points for the last `bars` candles: close + EMA 9/21 over the full history, VWAP reset each IST session.
export function chartSeries(candles: Candle[], bars = 120) {
  const closes = candles.map((c) => c.close);
  const [e9, e21] = [ema(closes, 9), ema(closes, 21)];
  let day = "";
  let pv = 0;
  let vol = 0;
  let ok = true;
  const vw = candles.map((c) => {
    const d = istDate(c.timestamp);
    if (d !== day) [day, pv, vol, ok] = [d, 0, 0, true];
    if (c.volume === null || c.volume <= 0) ok = false;
    if (!ok) return null;
    pv += ((c.high + c.low + c.close) / 3) * c.volume!;
    vol += c.volume!;
    return pv / vol;
  });
  const round = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);
  return candles
    .map((c, i) => ({ t: c.timestamp, close: c.close, ema9: round(e9[i]), ema21: round(e21[i]), vwap: round(vw[i]) }))
    .slice(-bars);
}
