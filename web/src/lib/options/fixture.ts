// SYNTHETIC FIXTURE builder for demonstrating the options engine. Not market data. Never label its output LIVE.
import { greeks } from "./greeks.ts";
import { OPT_GATES, type ChainRow, type RiskContext, type UnderlyingState } from "./recommend.ts";

export function syntheticChain(now: string, spot: number, expiry: string, vol = 0.14): ChainRow[] {
  const tY = (Date.parse(`${expiry}T15:30:00+05:30`) - Date.parse(now)) / (365 * 24 * 3600 * 1000);
  const quote = (p: number) => ({
    ltp: p, bid: p * 0.995, ask: p * 1.005, oi: 50_000, volume: 5_000,
    lastTradeTime: new Date(Date.parse(now) - 5_000).toISOString(), instrumentKey: "SYNTHETIC",
  });
  const rows: ChainRow[] = [];
  for (let k = -6; k <= 6; k++) {
    const strike = spot + k * 50;
    rows.push({
      strike, expiry, lotSize: 75,
      call: quote(greeks({ spot, strike, tYears: tY, rate: OPT_GATES.rate, vol, type: "CE" }).price),
      put: quote(greeks({ spot, strike, tYears: tY, rate: OPT_GATES.rate, vol, type: "PE" }).price),
    });
  }
  return rows;
}

export const syntheticRisk: RiskContext = { capital: 1_000_000, dailyLossSoFar: 0, dailyLossLimitPct: 2, openRecommendations: 0, maxConcurrent: 3 };

export function syntheticUnderlying(now: string, spot: number, o: Partial<UnderlyingState> = {}): UnderlyingState {
  return { index: "NIFTY", spot, asOf: now, marketState: "OPEN", trend: "LONG", vwap: spot - 10, swingLow: spot - 50, swingHigh: spot + 50, target: spot + 200, eventRisk: "NONE", chainTimestamp: now, ...o };
}
