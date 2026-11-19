// Signal flags for the intraday hypotheses I-2 … I-8 (docs/INTRADAY_PROTOCOLS_I2_TO_I8.md). Pure, causal, per bar.
import { ema, ENTRY_SIGNAL_TIMES, type HBar } from "./intradayHourly.ts";

// Wilder RSI(14) on closes; bar i uses closes ≤ i.
export function rsi14(closes: number[], n = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= n) return out;
  let avgG = 0, avgL = 0;
  for (let i = 1; i <= n; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) avgG += d; else avgL -= d;
  }
  avgG /= n; avgL /= n;
  out[n] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgG = (avgG * (n - 1) + Math.max(d, 0)) / n;
    avgL = (avgL * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  }
  return out;
}

// Session VWAP: typical price × volume, reset at the start of each session date.
export function sessionVwap(bars: HBar[]): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  let pv = 0, v = 0, day = "";
  bars.forEach((b, i) => {
    if (b.date !== day) { day = b.date; pv = 0; v = 0; }
    pv += ((b.h + b.l + b.c) / 3) * b.v;
    v += b.v;
    out[i] = v > 0 ? pv / v : null;
  });
  return out;
}

// Per-bar context derived from the session structure of one stock.
export function sessionContext(bars: HBar[]) {
  const prevSessionClose: (number | null)[] = new Array(bars.length).fill(null);
  const prevSessionLow: (number | null)[] = new Array(bars.length).fill(null);
  const openingRangeHigh: (number | null)[] = new Array(bars.length).fill(null);
  const sessionLow = new Map<string, number>();
  const sessionLastClose = new Map<string, number>();
  const sessionOrHigh = new Map<string, number>();
  const dates: string[] = [];
  bars.forEach((b) => {
    if (dates[dates.length - 1] !== b.date) dates.push(b.date);
  });
  const prevDate = new Map<string, string | null>();
  dates.forEach((d, k) => prevDate.set(d, k > 0 ? dates[k - 1] : null));
  bars.forEach((b, i) => {
    if (b.time === "09:15") sessionOrHigh.set(b.date, b.h);
    const pd = prevDate.get(b.date);
    prevSessionClose[i] = pd ? sessionLastClose.get(pd) ?? null : null;
    prevSessionLow[i] = pd ? sessionLow.get(pd) ?? null : null;
    openingRangeHigh[i] = sessionOrHigh.get(b.date) ?? null;
    sessionLow.set(b.date, Math.min(sessionLow.get(b.date) ?? Infinity, b.l));
    sessionLastClose.set(b.date, b.c);
  });
  return { prevSessionClose, prevSessionLow, openingRangeHigh };
}

// Top-quartile membership by intraday relative strength (since the previous session close), across the universe.
// `perSymbol` maps symbol → its standard bars; returns timestamp → set of leading symbols (≥ 20 stocks with a bar at T).
export function relativeStrengthLeaders(perSymbol: Map<string, HBar[]>): Map<string, Set<string>> {
  const byTime = new Map<string, { sym: string; ret: number }[]>();
  for (const [sym, bars] of perSymbol) {
    const ctx = sessionContext(bars);
    bars.forEach((b, i) => {
      const pc = ctx.prevSessionClose[i];
      if (pc === null || pc <= 0) return;
      const list = byTime.get(b.t) ?? [];
      list.push({ sym, ret: b.c / pc - 1 });
      byTime.set(b.t, list);
    });
  }
  const leaders = new Map<string, Set<string>>();
  for (const [t, list] of byTime) {
    if (list.length < 20) continue;
    const sorted = [...list].sort((a, b) => b.ret - a.ret);
    const cut = Math.max(1, Math.floor(sorted.length / 4));
    leaders.set(t, new Set(sorted.slice(0, cut).map((x) => x.sym)));
  }
  return leaders;
}

const timeOk = (b: HBar) => ENTRY_SIGNAL_TIMES.has(b.time);

export function flagsFor(
  id: "I2" | "I3" | "I4" | "I5" | "I6" | "I7" | "I8",
  bars: HBar[], leaders?: Map<string, Set<string>>, symbol?: string,
): boolean[] {
  const closes = bars.map((b) => b.c);
  const e20 = ema(closes, 20), e50 = ema(closes, 50), rsi = rsi14(closes), vwap = sessionVwap(bars);
  const ctx = sessionContext(bars);
  const out = new Array(bars.length).fill(false);
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i];
    if (!timeOk(b)) continue;
    const up = e20[i] !== null && e50[i] !== null && (e20[i] as number) > (e50[i] as number);
    let f = false;
    switch (id) {
      case "I2": {
        if (i < 20 || !up) break;
        let hh = -Infinity; for (let k = i - 10; k < i; k++) hh = Math.max(hh, bars[k].h);
        let vs = 0; for (let k = i - 20; k < i; k++) vs += bars[k].v;
        f = b.c > hh && b.v >= 1.5 * (vs / 20) && up;
        break;
      }
      case "I3": {
        const pv = e20[i - 1];
        f = up && pv !== null && bars[i - 1].l <= pv && e20[i] !== null && b.c > (e20[i] as number) && b.c > bars[i - 1].c;
        break;
      }
      case "I4": {
        const members = leaders?.get(b.t);
        f = !!members && !!symbol && members.has(symbol) && up;
        break;
      }
      case "I5": {
        const or = ctx.openingRangeHigh[i];
        f = b.time === "10:15" && or !== null && b.c > or;
        break;
      }
      case "I6": {
        const vPrev = vwap[i - 1], vNow = vwap[i];
        f = vPrev !== null && vNow !== null && bars[i - 1].date === b.date && bars[i - 1].c < vPrev && b.c > vNow;
        break;
      }
      case "I7": {
        const a = e20[i], c = e50[i], r = rsi[i];
        f = a !== null && c !== null && r !== null && Math.abs(a - c) / b.c < 0.002 && r < 30;
        break;
      }
      case "I8": {
        const pl = ctx.prevSessionLow[i];
        f = pl !== null && bars[i - 1].l < pl && b.c > pl;
        break;
      }
    }
    out[i] = f;
  }
  return out;
}
