import type { Candle, OptionRow, Snapshot } from "./types.ts";
import { analyzeTechnicals } from "./services/technicalAnalysis.ts";
import { toIndicators } from "./services/upstoxMarket.ts";
import { INSTRUMENTS } from "./services/instrumentRegistry.ts";
import { INDEX_CONSTITUENTS } from "./services/breadthConfig.ts";
import { calculateBreadth } from "./services/breadthService.ts";
import { MOCK_NEWS, bs, lastTuesday, nextTuesday } from "./services/mock.ts";
import type { BacktestRunConfig } from "./backtestTypes.ts";
import type { PointInTimeInputs } from "./services/historicalContext.ts";

// SYNTHETIC option pricing for backtests: Black-Scholes at a flat 14.5% IV benchmark (no historical
// option-chain data exists here). Entry, mark-to-market and exit all use THIS function, so P&L is internally
// consistent. OI/volume are constant placeholders; Greeks are model-derived.
export const BACKTEST_IV = 14.5; // percent
const EXPIRY_CLOSE_UTC = "T10:00:00Z"; // 15:30 IST

export function yearsToExpiry(expiry: string, now: Date): number {
  return Math.max(Date.parse(expiry + EXPIRY_CLOSE_UTC) - now.getTime(), 0) / (365 * 86_400_000);
}

// Premium per unit for one option at (spot, now). At/after expiry it is intrinsic value.
export function priceOption(type: "CE" | "PE", spot: number, strike: number, expiry: string, now: Date, ivPct = BACKTEST_IV): number {
  const T = yearsToExpiry(expiry, now);
  if (T <= 1 / (365 * 24 * 60)) return Math.max(0, type === "CE" ? spot - strike : strike - spot);
  const p = bs(spot, strike, T, ivPct / 100);
  return Math.max(0.05, type === "CE" ? p.call : p.put);
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const istDayOf = (iso: string) => new Date(Date.parse(iso) + 330 * 60_000).toISOString().slice(0, 10);

// Historical news is NOT AVAILABLE (no timestamped archive). Neutral placeholder: score 0 and confidence 0, so news
// can neither add direction nor trigger a NEWS_CONFLICT veto. Never presented as observed sentiment.
export const NEUTRAL_UNAVAILABLE_NEWS = { score: 0, bullishPct: 0, neutralPct: 100, bearishPct: 0, eventRisk: null, confidence: 0 };
const r05 = (n: number) => Math.max(0.05, Math.round(n * 20) / 20);

// `oiAvailable: false` (Phase 10): historical OI does not exist here, so OI/volume are 0 and change-in-OI null
// rather than invented numbers; the engine then scores the option-chain factor as direction-neutral.
export function buildHistoricalOptionChain(spot: number, step: number, expiry: string, now: Date, ivPct = BACKTEST_IV, oiAvailable = true): OptionRow[] {
  const atm = Math.round(spot / step) * step;
  const T = Math.max(yearsToExpiry(expiry, now), 1 / (365 * 24 * 60));
  const rows: OptionRow[] = [];
  for (let i = -10; i <= 10; i++) {
    const strike = atm + i * step;
    const p = bs(spot, strike, T, ivPct / 100);
    const side = (ltpRaw: number, delta: number, theta: number, oiRaw: number) => {
      const ltp = r05(ltpRaw);
      const oi = oiAvailable ? oiRaw : 0;
      return {
        ltp,
        bid: r2(ltp * 0.995),
        ask: r2(ltp * 1.005),
        oi, // SYNTHETIC placeholder (legacy) or 0 = not available (Phase 10)
        chgOi: oiAvailable ? Math.round(oi * 0.02) : null,
        volume: oi * 2,
        iv: ivPct,
        delta: r2(delta),
        gamma: Math.round(p.gamma * 1e5) / 1e5,
        theta: r2(theta),
        vega: r2(p.vega),
        instrumentKey: null, // backtest has no live Upstox contract identity
      };
    };
    rows.push({ strike, call: side(p.call, p.callDelta, p.callTheta, 50000), put: side(p.put, p.putDelta, p.putTheta, 45000) });
  }
  return rows;
}

/**
 * Builds a deterministic Historical Market Snapshot at timestamp T.
 * Strictly uses candles ending at T without look-ahead bias.
 */
export function buildHistoricalSnapshot(
  config: BacktestRunConfig,
  currentCandle: Candle,
  slicedCandles: Candle[],
  dailyCandles: Candle[],
  openingCandles: Candle[],
  now: Date,
  hist?: PointInTimeInputs, // Phase 10 point-in-time inputs; absent → legacy synthetic inputs (Phase 7–9)
): Snapshot | null {
  if (slicedCandles.length < 35) return null; // Warmup check: require at least 35 bars for MACD/RSI/EMAs

  const spot = currentCandle.close;
  // Legacy: previous bar's close. Phase 10: previous SESSION close (what "change" means for the index and breadth).
  const today = istDayOf(currentCandle.timestamp);
  const prevSession = [...slicedCandles].reverse().find((c) => istDayOf(c.timestamp) < today);
  const prevClose = hist ? (prevSession?.close ?? spot) : slicedCandles.length > 1 ? slicedCandles[slicedCandles.length - 2].close : spot;
  const step = config.index === "nifty" ? 50 : 100;
  const lotSize = config.index === "nifty" ? 65 : 30;

  const iso = now.toISOString();

  // Run pure technical analysis on historical candles up to T
  const techAnalysis = analyzeTechnicals({
    timeframe: config.timeframe,
    candles: slicedCandles,
    daily: dailyCandles,
    openingCandles: openingCandles.length ? openingCandles : slicedCandles.slice(0, 2),
    now,
  });

  if (!techAnalysis) return null;
  // Same engine inputs as live (toIndicators): daily ATR for stops/targets, real EMAs/RSI/MACD/previous-day
  // levels. If any is not computable yet, the bar is warmup — never filled with spot-based placeholders.
  const indicators = toIndicators(techAnalysis);
  if (!indicators) return null;

  const spotChgPct = ((spot - prevClose) / prevClose) * 100;
  // Phase 10: RECONSTRUCTED breadth from historical constituent bars closed by T. Legacy: SYNTHETIC breadth derived
  // from the index's own bar direction.
  const constituents = hist ? hist.breadthQuotes : INDEX_CONSTITUENTS[config.index].map((c, idx) => {
    const isAdv = spotChgPct >= 0 ? idx < 32 : idx < 18;
    const chgPct = isAdv ? 0.6 : -0.5;
    return {
      symbol: c.symbol,
      lastPrice: 500 * (1 + chgPct / 100),
      previousClose: 500,
      change: 500 * (chgPct / 100),
      changePercent: chgPct,
      timestamp: iso,
    };
  });

  // Historical snapshot: nothing here is LIVE. Every subsystem shares the same label so the engine scores them
  // together exactly as before; the run's DataQualityReport says what each input really is.
  const histSrc = { source: "MOCK" as const, provider: "MOCK" as const, fetchedAt: iso, lastTradeTime: iso };
  const breadthSrc = histSrc;
  const breadth = calculateBreadth(config.index, constituents, spotChgPct, now, breadthSrc);

  const sources = { market: histSrc, optionChain: histSrc, technical: histSrc, news: histSrc, breadth: histSrc };

  // Contract expiry as of T (NIFTY weekly Tuesday, BANK NIFTY monthly last Tuesday), from T alone.
  const expiryDate = config.index === "nifty" ? nextTuesday(now) : lastTuesday(now);
  const iv = hist?.iv ?? BACKTEST_IV; // India VIX at T when available, else the flat benchmark (counted by the engine)
  const chain = buildHistoricalOptionChain(spot, step, expiryDate, now, iv, !hist);

  return {
    index: config.index,
    name: INSTRUMENTS[config.index].name,
    spot,
    prevClose,
    expiry: expiryDate,
    strikeStep: step,
    lotSize,
    indicators,
    ivPercentile: hist ? hist.ivPercentile : 40,
    breadth,
    news: hist ? { ...NEUTRAL_UNAVAILABLE_NEWS } : { ...MOCK_NEWS },
    chain,
    technical: techAnalysis,
    sources,
    fallbackReason: null,
  };
}
