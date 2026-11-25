// Phase 2 — Historical Data Quality & Integrity Verifier
// Enforces strict validation across historical OHLCV data sets:
// - Chronological continuity & interval gap detection
// - OHLC geometric validity (High >= Max(Open, Close), Low <= Min(Open, Close), Low > 0)
// - Session boundary enforcement (NSE 09:15–15:30 IST vs MCX 09:00/17:00–23:30 IST)
// - Volume & liquidity sanity checks
// - Overall completeness & replay certification score

import type { Candle, UnderlyingId, Timeframe } from "../types.ts";
import { isCommodityId } from "./instrumentRegistry.ts";
import { istMinutes, istToday, commoditySessionWindow, sessionWindow } from "../time.ts";

export interface DataAnomaly {
  timestamp: string;
  type: "INVALID_OHLC" | "OUT_OF_BOUNDS_SESSION" | "NON_CHRONOLOGICAL" | "NEGATIVE_VOLUME" | "EXTREME_GAP";
  message: string;
}

export interface DataQualityReport {
  underlying: UnderlyingId;
  timeframe: Timeframe;
  totalBars: number;
  validBars: number;
  startDate: string | null;
  endDate: string | null;
  qualityScore: number; // 0 to 100
  gapCount: number;
  anomalyCount: number;
  anomalies: DataAnomaly[];
  isReplayReady: boolean;
}

/**
 * Expected bar duration in minutes for intraday timeframes.
 */
function timeframeToMinutes(tf: Timeframe): number {
  switch (tf) {
    case "5m": return 5;
    case "15m": return 15;
    case "30m": return 30;
    case "1h": return 60;
    case "1d": return 24 * 60;
  }
}

/**
 * Validates a single OHLC candle's geometric integrity.
 */
export function validateCandleGeometry(c: Candle): { valid: boolean; error?: string } {
  if (c.open <= 0 || c.high <= 0 || c.low <= 0 || c.close <= 0) {
    return { valid: false, error: "Non-positive price component" };
  }
  if (c.high < c.low) {
    return { valid: false, error: `High (${c.high}) is lower than Low (${c.low})` };
  }
  if (c.high < Math.max(c.open, c.close)) {
    return { valid: false, error: `High (${c.high}) is lower than max(Open, Close)` };
  }
  if (c.low > Math.min(c.open, c.close)) {
    return { valid: false, error: `Low (${c.low}) is higher than min(Open, Close)` };
  }
  if (c.volume !== null && c.volume < 0) {
    return { valid: false, error: `Volume (${c.volume}) cannot be negative` };
  }
  return { valid: true };
}

/**
 * Verifies whether an intraday candle falls cleanly inside the underlying's official trading session.
 */
export function isCandleWithinSession(c: Candle, underlying: UnderlyingId): boolean {
  const d = new Date(c.timestamp);
  const { minutes } = istMinutes(d);
  const ymd = istToday(d);

  if (isCommodityId(underlying)) {
    const w = commoditySessionWindow(ymd);
    if (!w) return false;
    return minutes >= w.open && minutes <= w.close;
  }

  const w = sessionWindow(ymd);
  if (!w) return false;
  return minutes >= w.open && minutes <= w.close;
}

/**
 * Audits an entire historical candle array for completeness, geometry, and session consistency.
 */
export function assessDataQuality(
  candles: Candle[],
  underlying: UnderlyingId,
  timeframe: Timeframe,
): DataQualityReport {
  if (!candles || candles.length === 0) {
    return {
      underlying,
      timeframe,
      totalBars: 0,
      validBars: 0,
      startDate: null,
      endDate: null,
      qualityScore: 0,
      gapCount: 0,
      anomalyCount: 0,
      anomalies: [],
      isReplayReady: false,
    };
  }

  const anomalies: DataAnomaly[] = [];
  let validBars = 0;
  let gapCount = 0;
  const stepMs = timeframeToMinutes(timeframe) * 60_000;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    let barValid = true;

    // 1. Geometric integrity
    const geom = validateCandleGeometry(c);
    if (!geom.valid) {
      anomalies.push({
        timestamp: c.timestamp,
        type: "INVALID_OHLC",
        message: geom.error ?? "Invalid geometry",
      });
      barValid = false;
    }

    // 2. Session alignment (for intraday)
    if (timeframe !== "1d" && !isCandleWithinSession(c, underlying)) {
      anomalies.push({
        timestamp: c.timestamp,
        type: "OUT_OF_BOUNDS_SESSION",
        message: `Bar at ${c.timestamp} is outside official ${underlying} trading hours`,
      });
      barValid = false;
    }

    // 3. Chronological order & gap check
    if (i > 0) {
      const prev = candles[i - 1];
      const prevMs = new Date(prev.timestamp).getTime();
      const currMs = new Date(c.timestamp).getTime();

      if (currMs <= prevMs) {
        anomalies.push({
          timestamp: c.timestamp,
          type: "NON_CHRONOLOGICAL",
          message: `Timestamp ${c.timestamp} is not strictly after previous ${prev.timestamp}`,
        });
        barValid = false;
      } else if (timeframe !== "1d") {
        // If on same calendar day, check for unexpected intraday gap
        const prevDay = istToday(new Date(prev.timestamp));
        const currDay = istToday(new Date(c.timestamp));
        if (prevDay === currDay && currMs - prevMs > stepMs * 2.5) {
          gapCount++;
          anomalies.push({
            timestamp: c.timestamp,
            type: "EXTREME_GAP",
            message: `Intraday gap of ${Math.round((currMs - prevMs) / 60000)}m between ${prev.timestamp} and ${c.timestamp}`,
          });
        }
      }
    }

    if (barValid) validBars++;
  }

  // Completeness score
  const geometryScore = candles.length > 0 ? (validBars / candles.length) * 100 : 0;
  const gapPenalty = Math.min(25, gapCount * 2);
  const qualityScore = Math.max(0, Math.round((geometryScore - gapPenalty) * 10) / 10);

  // A dataset is replay-ready only if:
  // - Minimum 100 bars
  // - Score >= 90%
  // - 0 INVALID_OHLC geometry errors
  const hasCorruptOhlc = anomalies.some((a) => a.type === "INVALID_OHLC");
  const isReplayReady = candles.length >= 100 && qualityScore >= 90 && !hasCorruptOhlc;

  return {
    underlying,
    timeframe,
    totalBars: candles.length,
    validBars,
    startDate: candles[0].timestamp,
    endDate: candles[candles.length - 1].timestamp,
    qualityScore,
    gapCount,
    anomalyCount: anomalies.length,
    anomalies: anomalies.slice(0, 50),
    isReplayReady,
  };
}
