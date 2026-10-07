// MOCK provider: slices the mock snapshot into the provider contract. Always labelled source: MOCK.
import type { IndexId, MarketDataProvider } from "../types.ts";
import { mockSnapshot } from "./mock.ts";
import { InvalidRequestError } from "./errors.ts";

export function mockProvider(now = () => new Date()): MarketDataProvider {
  const snap = (i: IndexId) => mockSnapshot(i, now());
  return {
    name: "MOCK",
    getMarketSnapshot: async (index) => {
      const s = snap(index);
      return { index, spot: s.spot, prevClose: s.prevClose, source: s.sources.market };
    },
    getExpiries: async (index) => {
      const s = snap(index);
      return { expiries: [s.expiry], source: s.sources.optionChain };
    },
    getOptionChain: async (index, expiry) => {
      const s = snap(index);
      if (expiry && expiry !== s.expiry) throw new InvalidRequestError(`Expiry ${expiry} is not available in mock data`);
      return { index, expiry: s.expiry, spot: s.spot, strikeStep: s.strikeStep, rows: s.chain, source: s.sources.optionChain };
    },
    getTechnicals: async (index) => {
      const s = snap(index);
      return { indicators: s.indicators, breadth: s.breadth, ivPercentile: s.ivPercentile, analysis: null, source: s.sources.technical };
    },
    // Mock mode never generates candles.
    getCandles: async (index, timeframe) => ({
      index,
      timeframe,
      candles: [],
      source: { source: "UNAVAILABLE", provider: "MOCK", fetchedAt: null },
    }),
    getBreadth: async (index) => {
      const s = snap(index);
      return s.breadth!;
    },
  };
}
