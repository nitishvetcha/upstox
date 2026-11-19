// Deterministic scanner inputs for tests: no network, no clock dependence beyond the `now` passed in.
import type { StockInstrument, StockMarketData } from "../services/stockService.ts";
import type { Candle } from "../types.ts";
import type { ScanDeps } from "../engine/stockOpportunityEngine.ts";

// Stock i: a fixed pattern of strong up / strong down / flat moves, positioned near the day's high or low.
export function fixtureQuotes(instruments: StockInstrument[], now: Date): StockMarketData[] {
  return instruments.map((inst, i) => {
    const prev = 100 + i * 10;
    const kind = i % 5; // 0,1 strong up · 2,3 strong down · 4 flat
    const chg = kind < 2 ? 2.8 - kind * 0.9 : kind < 4 ? -(2.8 - (kind - 2) * 0.9) : 0.1;
    const ltp = +(prev * (1 + chg / 100)).toFixed(2);
    const open = prev;
    const high = chg >= 0 ? +(ltp * 1.002).toFixed(2) : prev * 1.003;
    const low = chg >= 0 ? prev * 0.997 : +(ltp * 0.998).toFixed(2);
    return {
      symbol: inst.symbol, exchange: "NSE", instrumentKey: inst.instrumentKey, timestamp: now.toISOString(),
      ltp, open, high: +high.toFixed(2), low: +low.toFixed(2), previousClose: prev, change: +(ltp - prev).toFixed(2), changePercent: chg,
      volume: 100_000 + i * 1000, marketStatus: "OPEN", freshness: "LIVE", source: "UPSTOX", unavailableReason: null,
    };
  });
}

// 130 weekday daily candles per key ending the day before `now`: half the stocks trend up, half trend down.
export function fixtureDaily(keys: string[], now: Date): Map<string, Candle[]> {
  const out = new Map<string, Candle[]>();
  keys.forEach((k, j) => {
    // keys = [NIFTY index, ...stocks in universe order]; the last daily close matches fixtureQuotes' previous close.
    const up = j % 2 === 1 || j === 0, target = j === 0 ? 20_000 : 100 + (j - 1) * 10;
    const f = (i: number) => (up ? 1 + i * 0.003 : 1.4 - i * 0.003);
    const base = target / f(129);
    const cs: Candle[] = [];
    const d = new Date(now.getTime() - 86_400_000);
    while (cs.length < 130) {
      if (d.getUTCDay() % 6 !== 0) {
        const i = 129 - cs.length, c = base * (up ? 1 + i * 0.003 : 1.4 - i * 0.003);
        cs.unshift({ timestamp: `${d.toISOString().slice(0, 10)}T00:00:00+05:30`, open: c * 0.998, high: c * 1.01, low: c * 0.99, close: c, volume: 1e6 });
      }
      d.setUTCDate(d.getUTCDate() - 1);
    }
    out.set(k, cs);
  });
  return out;
}

export const FIXTURE_DEPS: ScanDeps = {
  quotes: async (inst, now) => fixtureQuotes(inst, now),
  daily: async (keys, now) => fixtureDaily(keys, now),
};
// A fixed weekday during market hours, so results never depend on when the suite runs.
export const FIXTURE_NOW = new Date("2026-10-26T05:30:00.000Z"); // Mon 11:00 IST
