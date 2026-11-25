// MOCK provider: slices the mock snapshot into the provider contract. Always labelled source: MOCK.
import type { IndexId, UnderlyingId, Indicators, MarketDataProvider, TechnicalAnalysis, Timeframe } from "../types.ts";
import { mockSnapshot } from "./mock.ts";
import { InvalidRequestError } from "./errors.ts";

// MOCK technical analysis built ONLY from the same snapshot indicators the technicals cards read (no new calculation).
// The snapshot indicators are defined on the 15m timeframe; other timeframes get no analysis (null), not a copy.
// Snapshot `atr` is DAILY ATR (see Indicators), so it maps to dailyAtr, never to the 15m ATR. Anything the snapshot
// does not carry (MACD signal, 15m ATR, candles, trend, price action) stays null.
export function mockTechnicalAnalysis(ind: Indicators | null, spot: number, prevClose: number | null, timeframe: Timeframe): TechnicalAnalysis | null {
  if (!ind || timeframe !== "15m") return null;
  return {
    timeframe,
    price: spot,
    sessionDate: "",
    marketClosed: false,
    candleCount: 0,
    lastCandleAt: "",
    ema9: ind.ema9,
    ema21: ind.ema21,
    ema50: ind.ema50,
    ema200: ind.ema200,
    emaStructure: null,
    rsi: ind.rsi,
    rsiState: null,
    // Spot VWAP is null for indices in the real provider (no volume). The snapshot vwap is not relabelled here.
    vwap: null,
    vwapState: null,
    futuresVwap: null,
    atr: null,
    atrPercent: null,
    dailyAtr: ind.atr,
    dailyAtrPercent: null,
    macd: null,
    macdSignal: null,
    macdHistogram: ind.macdHist,
    macdState: null,
    previousDayHigh: ind.pdh,
    previousDayLow: ind.pdl,
    previousDayClose: prevClose,
    openingRangeHigh: ind.orHigh,
    openingRangeLow: ind.orLow,
    openingRangeBreakout: null,
    priceAction: null,
    volatilityRegime: null,
    technicalScore: { score: null, max: 15, components: [] },
    // No trend is computed for mock; null is kept, not an inferred state.
    trend: null as unknown as TechnicalAnalysis["trend"],
  };
}

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function mockProvider(now = () => new Date()): MarketDataProvider {
  const snap = (i: UnderlyingId) => mockSnapshot(i, now());
  return {
    name: "MOCK",
    getMarketSnapshot: async (index) => {
      const s = snap(index);
      return { index, spot: s.spot, prevClose: s.prevClose, source: s.sources.market };
    },
    // MOCK only: a synthetic second weekly expiry (+7 days) so the expiry switch can be exercised.
    // Its rows are the same synthetic chain relabelled; source stays MOCK.
    getExpiries: async (index) => {
      const s = snap(index);
      return { expiries: [s.expiry, addDays(s.expiry, 7)], source: s.sources.optionChain };
    },
    getOptionChain: async (index, expiry) => {
      const s = snap(index);
      if (expiry && expiry !== s.expiry && expiry !== addDays(s.expiry, 7)) throw new InvalidRequestError(`Expiry ${expiry} is not available in mock data`);
      return {
        index,
        expiry: expiry ?? s.expiry,
        spot: s.spot,
        strikeStep: s.strikeStep,
        lotSize: s.lotSize ?? null,
        rows: s.chain,
        source: s.sources.optionChain,
      };
    },
    getTechnicals: async (index, timeframe = "15m") => {
      const s = snap(index);
      return {
        indicators: s.indicators,
        breadth: s.breadth,
        ivPercentile: s.ivPercentile,
        analysis: mockTechnicalAnalysis(s.indicators, s.spot, s.prevClose, timeframe),
        source: s.sources.technical,
      };
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
      return s.breadth ?? {
        index,
        status: "UNAVAILABLE",
        advances: 0,
        declines: 0,
        unchanged: 0,
        total: 0,
        expected: 50,
        coverage: 0,
        advanceDeclineRatio: 0,
        advancePercent: 0,
        declinePercent: 0,
        breadthPercent: 0,
        signal: 0,
        classification: "NEUTRAL",
        priceBreadthState: "NEUTRAL_ALIGNMENT",
        fetchedAt: null,
      };
    },
  };
}
