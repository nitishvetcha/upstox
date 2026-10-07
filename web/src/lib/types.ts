export type IndexId = "nifty" | "banknifty";

// Where a piece of data came from. UNAVAILABLE = not produced yet (e.g. candle indicators before Phase 3).
export type DataSource = "LIVE" | "MOCK" | "END_OF_DAY" | "STALE" | "UNAVAILABLE";
export type Freshness = "LIVE" | "AGING" | "END_OF_DAY" | "STALE";
export type Subsystem = "market" | "optionChain" | "technical" | "news" | "breadth";

export type FallbackReason =
  | "UPSTOX_NOT_CONNECTED"
  | "UPSTOX_AUTH_EXPIRED"
  | "UPSTOX_FORBIDDEN"
  | "UPSTOX_RATE_LIMITED"
  | "UPSTOX_TIMEOUT"
  | "UPSTOX_NETWORK"
  | "UPSTOX_API_ERROR"
  | "UPSTOX_BAD_RESPONSE"
  | "UPSTOX_EMPTY_CHAIN"
  | "UPSTOX_NO_EXPIRY"
  | "UPSTOX_INVALID_INSTRUMENT";

export interface SourceInfo {
  source: DataSource;
  provider: "UPSTOX" | "MOCK" | null;
  fetchedAt: string | null; // ISO
  lastTradeTime?: string | null; // ISO (actual market timestamp)
}

export interface Quote {
  ltp: number; // 0 = no trade
  bid: number | null;
  ask: number | null;
  oi: number;
  chgOi: number | null; // null when the previous OI is unknown
  volume: number;
  iv: number | null; // annualised, percent
  delta: number | null;
  gamma?: number | null;
  theta?: number | null;
  vega?: number | null;
  /** Upstox canonical instrument key for this option side (e.g. NSE_FO|NIFTY06OCT2026CE22700).
   *  null when the chain does not provide one (backtest/mock). Never constructed — must come from the source. */
  instrumentKey?: string | null;
}

export interface OptionRow {
  strike: number;
  call: Quote;
  put: Quote;
}

// Engine inputs. Live values come from real candles; nullable ones can't always be computed
// (EMA 200 needs 200 bars, VWAP needs volume, the opening range needs 09:30 IST to have passed).
export interface Indicators {
  ema9: number;
  ema21: number;
  ema50: number;
  ema200: number | null;
  vwap: number | null;
  rsi: number;
  macdHist: number;
  atr: number; // daily ATR, index points
  pdh: number;
  pdl: number;
  orHigh: number | null;
  orLow: number | null;
  // Live mode: futures price vs FUTURES VWAP (index candles have no volume). Never compared with spot.
  futuresVwapState?: FuturesVwap["state"] | null;
}

// Session VWAP of the near-month futures contract: a proxy/reference for the index, labelled as futures.
export interface FuturesVwap {
  instrument: string | null; // e.g. "NIFTY FUT 27 OCT 26"
  instrumentKey: string | null;
  expiry: string | null; // YYYY-MM-DD
  timeframe: Timeframe;
  price: number | null; // futures LTP
  vwap: number | null;
  distance: number | null; // price - vwap
  distancePercent: number | null;
  state: "ABOVE VWAP" | "BELOW VWAP" | "AT VWAP" | "UNAVAILABLE";
  reason: string | null; // why UNAVAILABLE
  sessionDate: string | null;
  candleCount: number;
  source: SourceInfo;
}

export type Timeframe = "5m" | "15m" | "30m" | "1h" | "1d";

export interface Candle {
  timestamp: string; // ISO with +05:30 offset, candle open time
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null; // null: the instrument carries no volume (indices)
}

export interface CandleSeries {
  index: IndexId;
  timeframe: Timeframe;
  candles: Candle[]; // oldest first
  source: SourceInfo;
}

export interface TechnicalAnalysis {
  timeframe: Timeframe;
  price: number;
  sessionDate: string; // IST date of the latest candle
  marketClosed: boolean; // latest session is not today (weekend/holiday/before open)
  candleCount: number;
  lastCandleAt: string;
  ema9: number | null;
  ema21: number | null;
  ema50: number | null;
  ema200: number | null;
  emaStructure: "STRONG_BULLISH" | "BULLISH" | "RANGE" | "BEARISH" | "STRONG_BEARISH" | null;
  rsi: number | null;
  rsiState: "OVERBOUGHT" | "BULLISH" | "NEUTRAL" | "BEARISH" | "OVERSOLD" | null;
  vwap: number | null; // spot-candle VWAP: null for indices (no volume)
  vwapState: "ABOVE VWAP" | "BELOW VWAP" | null;
  futuresVwap: FuturesVwap | null; // null when not attempted (mock mode, daily timeframe)
  atr: number | null; // ATR 14 on the selected timeframe
  atrPercent: number | null;
  dailyAtr: number | null; // ATR 14 on completed daily candles
  dailyAtrPercent: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  macdState: "BULLISH" | "BEARISH" | "NEUTRAL" | null;
  previousDayHigh: number | null;
  previousDayLow: number | null;
  previousDayClose: number | null;
  openingRangeHigh: number | null;
  openingRangeLow: number | null;
  openingRangeBreakout: "ABOVE" | "BELOW" | "INSIDE" | null;
  priceAction: {
    structure: "BULLISH STRUCTURE" | "BEARISH STRUCTURE" | "RANGE";
    event: "BREAKOUT" | "BREAKDOWN" | "RANGE";
    higherHigh: boolean;
    higherLow: boolean;
    lowerHigh: boolean;
    lowerLow: boolean;
  } | null;
  volatilityRegime: "LOW VOLATILITY" | "NORMAL VOLATILITY" | "HIGH VOLATILITY" | null;
  technicalScore: {
    score: number | null; // null when fewer than 3 components are computable
    max: 15;
    components: { name: string; max: number; points: number | null; note: string }[];
  };
  trend: {
    state: "STRONG_BULLISH" | "BULLISH" | "NEUTRAL" | "BEARISH" | "STRONG_BEARISH";
    direction: number;
    reasons: string[];
  };
}

export interface News {
  score: number; // -1..1
  bullishPct: number;
  neutralPct: number;
  bearishPct: number;
  eventRisk: string | null; // set when real-news event risk is HIGH/EXTREME (protective filter)
  eventMoveHistory?: number; // avg absolute index move on comparable past events, points
  // Real news only (absent for mock):
  status?: NewsSentiment["status"];
  confidence?: number; // 0..1, distinct from the score
  detail?: NewsSentiment;
}

export interface Article {
  id: string;
  title: string;
  description: string;
  source: string;
  url: string;
  publishedAt: string; // ISO
  category: "INDEX" | "BANKING" | "MARKET" | "MACRO" | "OTHER";
  relevance: number; // 0..1 for the index it was scored against
  relevanceLabel: "HIGH" | "MEDIUM" | "LOW";
  sentiment: "BULLISH" | "BEARISH" | "NEUTRAL";
  sentimentScore: number; // -1..1
  confidence: number; // 0..1
  events: string[];
  provider?: "RSS" | "NEWSAPI"; // delivery mechanism; `source` stays the publisher
  alsoReportedBy?: string[]; // publishers whose duplicate copies were collapsed into this one
}

// Per-provider / per-feed health. Freshness here is from the newest item's publication time, not fetch success.
export interface NewsProviderStatus {
  provider: "RSS" | "NEWSAPI";
  name: string; // feed name, or "NewsAPI"
  status: "LIVE" | "AGING" | "STALE" | "FAILED" | "DISABLED";
  articles: number;
  newestAt: string | null;
  fetchedAt: string | null;
  error: string | null;
}

export interface NewsEvent {
  category: string;
  label: string;
  severity: "NONE" | "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
  timing: "TODAY" | "UPCOMING" | "UNSPECIFIED"; // only what the text states; never an invented time
  headline: string;
  publishedAt: string;
}

export interface NewsSentiment {
  index: IndexId;
  status: "LIVE" | "AGING" | "STALE" | "UNAVAILABLE";
  reason: string | null;
  score: number; // -1..1, weighted by relevance × freshness × confidence
  overall: "BULLISH" | "BEARISH" | "NEUTRAL";
  bullishPct: number;
  bearishPct: number;
  neutralPct: number;
  articleCount: number; // relevant, de-duplicated articles used
  bullishCount: number;
  bearishCount: number;
  fetchedCount: number;
  uniqueCount: number;
  confidence: number; // 0..1
  sectorScore: number | null; // BANK NIFTY: banking-sector articles only
  newestAt: string | null;
  fetchedAt: string | null;
  eventRisk: { level: NewsEvent["severity"]; status: "NONE" | "DETECTED"; reason: string | null; events: NewsEvent[] };
  articles: Article[];
  providers?: NewsProviderStatus[];
}

export type BreadthClassification =
  | "STRONGLY BULLISH"
  | "BULLISH"
  | "NEUTRAL"
  | "BEARISH"
  | "STRONGLY BEARISH";

export type PriceBreadthState =
  | "BULLISH_CONFIRMATION"
  | "BEARISH_CONFIRMATION"
  | "BEARISH_DIVERGENCE"
  | "BULLISH_DIVERGENCE"
  | "DIRECTIONAL_BUILDUP"
  | "NEUTRAL_ALIGNMENT";

export interface ConstituentQuote {
  symbol: string;
  lastPrice: number;
  previousClose: number;
  change: number;
  changePercent: number;
  timestamp: string | null;
}

export interface MarketBreadth {
  index: IndexId;
  status: "LIVE" | "PARTIAL" | "END_OF_DAY" | "STALE" | "UNAVAILABLE";
  advances: number;
  declines: number;
  unchanged: number;
  total: number;
  expected: number;
  coverage: number; // 0..100
  advanceDeclineRatio: number; // advancing / max(declining, 1)
  advancePercent: number;
  declinePercent: number;
  breadthPercent: number; // (adv - dec) / total * 100
  signal: number; // -1 to +1
  classification: BreadthClassification;
  priceBreadthState: PriceBreadthState;
  fetchedAt: string | null;
  reason?: string | null;
  topAdvancers?: ConstituentQuote[];
  topDecliners?: ConstituentQuote[];
  source?: SourceInfo;
}

// One point-in-time view of an index. Mock and Upstox both produce this shape,
// so the engine and UI never know which provider they're looking at.
export interface Snapshot {
  index: IndexId;
  name: string;
  spot: number;
  prevClose: number | null;
  expiry: string; // YYYY-MM-DD
  strikeStep: number;
  lotSize?: number | null;
  indicators: Indicators | null;
  ivPercentile: number | null; // null until IV history exists
  breadth: MarketBreadth | null;
  news: News;
  chain: OptionRow[];
  technical: TechnicalAnalysis | null; // real-candle analysis (null in mock mode or when candles are unavailable)
  sources: Record<Subsystem, SourceInfo>;
  fallbackReason: FallbackReason | null;
}

// --- Provider contract (mock and Upstox implement it) ---

export interface IndexQuote {
  index: IndexId;
  spot: number;
  prevClose: number | null;
  source: SourceInfo;
}

export interface OptionChain {
  index: IndexId;
  expiry: string;
  spot: number;
  strikeStep: number;
  lotSize?: number | null;
  rows: OptionRow[]; // full chain for the expiry, sorted by strike
  source: SourceInfo;
}

export interface Technicals {
  indicators: Indicators | null;
  breadth: MarketBreadth | null;
  ivPercentile: number | null;
  analysis: TechnicalAnalysis | null;
  source: SourceInfo;
  unavailableReason?: string; // why technical data is UNAVAILABLE (never a secret)
}

export interface MarketDataProvider {
  name: "MOCK" | "UPSTOX";
  getMarketSnapshot(index: IndexId): Promise<IndexQuote>;
  getExpiries(index: IndexId): Promise<{ expiries: string[]; source: SourceInfo }>;
  getOptionChain(index: IndexId, expiry?: string): Promise<OptionChain>;
  getTechnicals(index: IndexId, timeframe?: Timeframe): Promise<Technicals>;
  getCandles(index: IndexId, timeframe: Timeframe): Promise<CandleSeries>;
  getBreadth(index: IndexId): Promise<MarketBreadth>;
}

// --- Engine output ---

export type Bias = "BULLISH" | "BEARISH" | "NEUTRAL";
export type Regime =
  | "STRONG BULLISH"
  | "BULLISH"
  | "RANGE"
  | "BEARISH"
  | "STRONG BEARISH"
  | "HIGH VOLATILITY"
  | "EVENT RISK";
export type Setup = "STRONG SETUP" | "VALID SETUP" | "WEAK SETUP" | "NO TRADE";
export type Status = "TRADE" | "WAIT" | "NO TRADE";

export interface Factor {
  key: string;
  label: string;
  max: number;
  score: number;
  available: boolean; // false: inputs missing or from a different source than the market data
  direction: number; // -1 bearish .. +1 bullish (quality factors: -1 bad .. +1 good)
  notes: { text: string; sign: 1 | -1 | 0 }[];
}

export interface ChainMetrics {
  pcrOi: number | null; // null when there is no call OI (never Infinity/NaN)
  pcrVolume: number | null;
  maxPain: number;
  maxPainDistance: number; // spot - max pain, points
  support: number; // highest put OI at or below spot ("OI support")
  resistance: number; // highest call OI at or above spot ("OI resistance")
  supportByOiChange: number | null; // strike with the largest fresh put writing
  resistanceByOiChange: number | null;
  atmStrike: number;
  atmIv: { call: number | null; put: number | null; average: number | null };
  expectedMove: number | null; // 1σ estimate to expiry from ATM IV; null without IV
}

export interface Leg {
  side: "BUY" | "SELL";
  type: "CE" | "PE";
  strike: number;
  ltp: number;
}

export type StrategyName =
  | "Long Call"
  | "Long Put"
  | "Bull Call Spread"
  | "Bear Put Spread"
  | "ATM Straddle"
  | "Iron Condor";

import type { RiskAssessment } from "./services/risk/riskTypes.ts";

export interface TradePlan {
  strategy: StrategyName;
  legs: Leg[];
  credit: boolean; // true: entry is premium received, exits are buy-back prices
  entry: number; // net premium per unit
  entryZone: [number, number];
  stop: number;
  target1: number;
  target2: number;
  rr: number; // reward to target 1 / risk to stop
  maxLoss: number | null; // per unit, null = premium paid
  maxProfit: number | null; // per unit, null = open-ended
  breakevens: number[];
  score: number;
  rejected: string | null;
  risk?: RiskAssessment;
}

export interface Analysis {
  snapshot: Snapshot;
  chain: ChainMetrics;
  factors: Factor[];
  total: number;
  bias: Bias;
  regime: Regime;
  volatilityRegime: TechnicalAnalysis["volatilityRegime"]; // from daily ATR % and ATM IV
  setup: Setup;
  candidates: TradePlan[];
  plan: TradePlan | null;
  status: Status;
  blockers: string[]; // why it's WAIT / NO TRADE
  stale: string[];
  risks: string[]; // event risk / contradictions, shown separately from the reasons
}
