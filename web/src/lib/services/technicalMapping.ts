// Pure mapping from technical analysis to engine indicators. No network access.
import type { Indicators, TechnicalAnalysis } from "../types.ts";

export function toIndicators(t: TechnicalAnalysis | null): Indicators | null {
  if (!t || t.ema9 === null || t.ema21 === null || t.ema50 === null || t.rsi === null || t.macdHistogram === null) return null;
  if (t.dailyAtr === null || t.previousDayHigh === null || t.previousDayLow === null) return null;
  return {
    ema9: t.ema9,
    ema21: t.ema21,
    ema50: t.ema50,
    ema200: t.ema200,
    vwap: t.vwap,
    rsi: t.rsi,
    macdHist: t.macdHistogram,
    atr: t.dailyAtr,
    pdh: t.previousDayHigh,
    pdl: t.previousDayLow,
    orHigh: t.openingRangeHigh,
    orLow: t.openingRangeLow,
    futuresVwapState: t.futuresVwap && t.futuresVwap.state !== "UNAVAILABLE" ? t.futuresVwap.state : null,
  };
}
