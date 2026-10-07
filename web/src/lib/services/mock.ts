// MOCK DATA: hand-picked index levels and indicators, with an option chain priced by
// Black-Scholes so premiums, deltas and IV are mutually consistent. Never shown as live.
import type { IndexId, News, OptionRow, Snapshot, SourceInfo } from "../types.ts";
import { isRegularSession, istMinutes } from "../time.ts";
import { INSTRUMENTS } from "./instrumentRegistry.ts";

const DAY = 86_400_000;
const R = 0.065; // risk-free rate

function ncdf(x: number) {
  // Abramowitz & Stegun 7.1.26
  const t = 1 / (1 + (0.3275911 * Math.abs(x)) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp((-x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

export function bs(S: number, K: number, T: number, iv: number) {
  const sd = iv * Math.sqrt(T);
  const d1 = (Math.log(S / K) + (R + (iv * iv) / 2) * T) / sd;
  const d2 = d1 - sd;
  const disc = K * Math.exp(-R * T);
  const pdf = Math.exp((-d1 * d1) / 2) / Math.sqrt(2 * Math.PI);
  const decay = (-S * pdf * iv) / (2 * Math.sqrt(T));
  return {
    call: S * ncdf(d1) - disc * ncdf(d2),
    put: disc * ncdf(-d2) - S * ncdf(-d1),
    callDelta: ncdf(d1),
    putDelta: ncdf(d1) - 1,
    gamma: pdf / (S * sd),
    vega: (S * pdf * Math.sqrt(T)) / 100, // per 1 IV point
    callTheta: (decay - R * disc * ncdf(d2)) / 365, // per day
    putTheta: (decay + R * disc * ncdf(-d2)) / 365,
  };
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const istDate = (now: Date) => new Date(now.getTime() + 330 * 60_000); // UTC fields read as IST

// NIFTY: weekly expiry on Tuesday.
// Exchange rule: an expiry falling on a holiday moves to the previous trading day (e.g. Tue 2026-10-20 Dussehra →
// Mon 2026-10-19, as listed in Upstox option contracts). An expiry is over after 15:30 IST on its day.
const prevTradingDay = (ds: string) => {
  let d = ds;
  while (!isRegularSession(d)) d = ymd(new Date(Date.parse(`${d}T00:00:00Z`) - DAY));
  return d;
};
const stillOpen = (exp: string, now: Date) => exp > ymd(istDate(now)) || (exp === ymd(istDate(now)) && istMinutes(now).minutes < 930);

// NIFTY: weekly expiry on Tuesday (holiday → previous trading day).
export function nextTuesday(now: Date) {
  const d = istDate(now);
  const ahead = (2 - istMinutes(now).weekday + 7) % 7;
  for (let w = 0; w < 3; w++) {
    const exp = prevTradingDay(ymd(new Date(d.getTime() + (ahead + 7 * w) * DAY)));
    if (stillOpen(exp, now)) return exp;
  }
  throw new Error("unreachable");
}

// BANK NIFTY: monthly expiry on the last Tuesday of the month (holiday → previous trading day).
export function lastTuesday(now: Date) {
  const d = istDate(now);
  for (let add = 0; add < 3; add++) {
    const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + add + 1, 0));
    end.setUTCDate(end.getUTCDate() - ((end.getUTCDay() - 2 + 7) % 7));
    const exp = prevTradingDay(ymd(end));
    if (stillOpen(exp, now)) return exp;
  }
  throw new Error("unreachable");
}

interface ChainCfg {
  spot: number;
  step: number;
  atmIv: number;
  expiry: string;
  putPeak: number;
  callPeak: number;
  oiScale: number;
  putOiRatio: number;
  callChgPct: number;
  putChgPct: number;
}

const round05 = (n: number) => Math.max(0.05, Math.round(n * 20) / 20);

function makeChain(c: ChainCfg, now: Date): OptionRow[] {
  const expiryClose = new Date(c.expiry + "T10:00:00Z").getTime(); // 15:30 IST
  const T = Math.max(expiryClose - now.getTime(), DAY / 2) / (365 * DAY);
  const atm = Math.round(c.spot / c.step) * c.step;
  const rows: OptionRow[] = [];
  for (let k = -15; k <= 15; k++) {
    const strike = atm + k * c.step;
    const m = (c.spot - strike) / c.spot;
    const iv = Math.max(0.6, 1 + 6 * m + 120 * m * m) * (c.atmIv / 100);
    const p = bs(c.spot, strike, T, iv);
    const bell = (peak: number) => Math.exp(-(((strike - peak) / (6 * c.step)) ** 2));
    const callOi = Math.round(c.oiScale * (0.2 + bell(c.callPeak)) * (strike >= c.spot ? 1 : 0.35));
    const putOi = Math.round(c.oiScale * c.putOiRatio * (0.2 + bell(c.putPeak)) * (strike <= c.spot ? 1 : 0.35));
    const near = Math.exp(-(((strike - c.spot) / (4 * c.step)) ** 2));
    const quote = (ltp: number, oi: number, chgPct: number, delta: number, theta: number) => {
      const px = round05(ltp);
      const spread = Math.max(0.05, px * (Math.abs(m) > 0.03 ? 0.08 : 0.004));
      return {
        ltp: px,
        bid: round05(px - spread / 2),
        ask: round05(px + spread / 2),
        oi,
        chgOi: Math.round(oi * chgPct * (0.3 + near)),
        volume: Math.round(oi * 0.8 * (1 + near)),
        iv: Math.round(iv * 1000) / 10,
        delta: Math.round(delta * 100) / 100,
        gamma: Math.round(p.gamma * 1e5) / 1e5,
        theta: Math.round(theta * 100) / 100,
        vega: Math.round(p.vega * 100) / 100,
      };
    };
    rows.push({
      strike,
      call: { ...quote(p.call, callOi, c.callChgPct, p.callDelta, p.callTheta), instrumentKey: `MOCK_FO|MOCK${strike}CE` },
      put: { ...quote(p.put, putOi, c.putChgPct, p.putDelta, p.putTheta), instrumentKey: `MOCK_FO|MOCK${strike}PE` },
    });
  }
  return rows;
}

export const MOCK_NEWS: News = { score: 0.42, bullishPct: 58, neutralPct: 30, bearishPct: 12, eventRisk: null };

export function mockSource(fetchedAt: string): SourceInfo {
  return { source: "MOCK", provider: "MOCK", fetchedAt };
}

import { calculateBreadth } from "./breadthService.ts";
import { INDEX_CONSTITUENTS } from "./breadthConfig.ts";
import type { ConstituentQuote } from "../types.ts";

export function mockSnapshot(index: IndexId, now = new Date()): Snapshot {
  const ago = (s: number) => new Date(now.getTime() - s * 1000).toISOString();
  const breadthSrc = mockSource(ago(5));
  const sources = {
    market: mockSource(ago(5)),
    optionChain: mockSource(ago(12)),
    technical: mockSource(ago(5)),
    news: mockSource(ago(240)),
    breadth: breadthSrc,
  };
  const news = { ...MOCK_NEWS };
  const meta = { sources, fallbackReason: null, technical: null };

  if (index === "nifty") {
    const spot = 25118.4;
    const prevClose = 25012.65;
    const expiry = nextTuesday(now);
    const spotChgPct = ((spot - prevClose) / prevClose) * 100;
    const niftyQuotes: ConstituentQuote[] = INDEX_CONSTITUENTS.nifty.map((c, idx) => {
      const isAdv = idx < 34;
      const isDec = idx >= 34 && idx < 48;
      const chgPct = isAdv ? 0.8 : isDec ? -0.6 : 0.02;
      return {
        symbol: c.symbol,
        lastPrice: 1000 * (1 + chgPct / 100),
        previousClose: 1000,
        change: 1000 * (chgPct / 100),
        changePercent: chgPct,
        timestamp: now.toISOString(),
      };
    });
    const breadth = calculateBreadth("nifty", niftyQuotes, spotChgPct, now, breadthSrc);
    return {
      index,
      name: INSTRUMENTS.nifty.name,
      spot,
      prevClose,
      expiry,
      strikeStep: 50,
      lotSize: 65,
      indicators: {
        ema9: 25090, ema21: 25045, ema50: 24960, ema200: 24610, vwap: 25071, rsi: 61.4, macdHist: 6.2,
        atr: 182, pdh: 25064, pdl: 24921, orHigh: 25096, orLow: 25038,
      },
      ivPercentile: 38,
      breadth,
      news,
      chain: makeChain(
        { spot, step: 50, atmIv: 12.4, expiry, putPeak: 25000, callPeak: 25300, oiScale: 4_200_000, putOiRatio: 1.25, callChgPct: 0.05, putChgPct: 0.12 },
        now,
      ),
      ...meta,
    };
  }

  const spot = 56240;
  const prevClose = 56410;
  const expiry = lastTuesday(now);
  const spotChgPct = ((spot - prevClose) / prevClose) * 100;
  const bankQuotes: ConstituentQuote[] = INDEX_CONSTITUENTS.banknifty.map((c, idx) => {
    const isAdv = idx < 4;
    const chgPct = isAdv ? 0.5 : -0.7;
    return {
      symbol: c.symbol,
      lastPrice: 1000 * (1 + chgPct / 100),
      previousClose: 1000,
      change: 1000 * (chgPct / 100),
      changePercent: chgPct,
      timestamp: now.toISOString(),
    };
  });
  const breadth = calculateBreadth("banknifty", bankQuotes, spotChgPct, now, breadthSrc);
  return {
    index,
    name: INSTRUMENTS.banknifty.name,
    spot,
    prevClose,
    expiry,
    strikeStep: 100,
    lotSize: 30,
    indicators: {
      ema9: 56280, ema21: 56310, ema50: 56150, ema200: 55400, vwap: 56300, rsi: 47.2, macdHist: -14,
      atr: 430, pdh: 56520, pdl: 56180, orHigh: 56450, orLow: 56250,
    },
    ivPercentile: 44,
    breadth,
    news,
    chain: makeChain(
      { spot, step: 100, atmIv: 13.8, expiry, putPeak: 56000, callPeak: 56500, oiScale: 1_100_000, putOiRatio: 0.95, callChgPct: 0.1, putChgPct: 0.06 },
      now,
    ),
    ...meta,
  };
}
