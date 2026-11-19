// Market Data Collector — Canonical Ingestion Events, Schemas and Type Definitions
// Complies with COLLECTOR_DATA_SCHEMA.md, COLLECTOR_ARCHITECTURE_SPECIFICATION.md,
// and COLLECTOR_FAILURE_AND_RECOVERY_DESIGN.md.

export type MarketDataProvenance =
  | "EXCHANGE_MATCHING_ENGINE"   // Traded price, volume, matching engine timestamp for derivatives
  | "EXCHANGE_ORDER_BOOK"        // Best bid/ask and depth levels from exchange feed
  | "EXCHANGE_INDEX_CALCULATION" // Spot index cash calculation (mathematical basket, NOT a trade print)
  | "PERIODIC_EXCHANGE_OI"       // Individual contract periodic Open Interest broadcast
  | "UPSTOX_SUPPLIED_GREEKS"     // Broker server-side calculated Greeks (model-derived)
  | "SYSTEM_LOCAL_MONOTONIC"     // Local host high-resolution monotonic timer
  | "LOCAL_BAR_AGGREGATION"      // Locally aggregated 1-minute OHLCV/VWAP bars
  | "PROVENANCE_REST_SNAPSHOT";  // Instantaneous REST quote snapshot; NEVER historical reconstruction

export interface BaseEventHeader {
  /** Event Schema Version */
  schemaVersion: "1.0.0";
  /** Unique event identifier (UUID v4) */
  eventId: string;
  /** Fully qualified Upstox instrument key (e.g. 'NSE_FO|40039|09-11-2026', 'NSE_INDEX|Nifty 50') */
  instrumentKey: string;
  /** WebSocket connection identifier that received the frame (e.g. 'ws-pool-01') */
  connectionId: string;
  /** Data provenance classification */
  provenance: MarketDataProvenance;
  /** Local monotonic timestamp captured at socket read boundary (nanoseconds) */
  localReceiptMonoNs: bigint;
  /** Local UTC wall-clock timestamp at socket read boundary (ISO-8601 string) */
  localReceiptUtcIso: string;
  /** Broker gateway timestamp from FeedResponse.currentTs (milliseconds epoch, null if missing) */
  feedServerTs: number | null;
  /** Calculated transport latency: localReceiptUtcMs - feedServerTs (null if feedServerTs missing) */
  transportLatencyMs: number | null;
  /** 
   * Data quality warning flags:
   * - 'POSSIBLE_RETRANSMISSION': Heuristic duplicate candidate; retained for non-destructive audit
   * - 'SUSPECT_CLOCK_SKEW': Negative transport latency or host-to-gateway clock drift > 1,000 ms
   * - 'PARTIAL_DEPTH': Less than 5 depth levels returned by exchange book
   * - 'FEED_STALLED_DURING_SESSION': Frame received after an unacknowledged feed silence window
   * - 'GAP_RECOVERY_TICK': First tick received following a transport disconnection outage
   * - 'CROSSED_BOOK': Best bid >= best ask
   * - 'STALE_QUOTE': Quote older than threshold
   */
  qualityFlags: string[];
}

// ── 1. Last Traded Price & Volume Event (LTPC) ────────────────────────────────

export interface LTPCEvent extends BaseEventHeader {
  eventType: "LTPC";
  provenance: "EXCHANGE_MATCHING_ENGINE" | "EXCHANGE_INDEX_CALCULATION";
  /** Last Traded Price (null if no trades have executed in this contract today) */
  ltp: number | null;
  /** Last Traded Quantity / Lot Volume of the last trade */
  ltq: number | null;
  /** Last Trade Timestamp asserted by exchange matching engine (ms epoch, null if untraded) */
  lastTradeTs: number | null;
  /** Cumulative Traded Volume in contracts/shares for the current session */
  sessionVolume: number | null;
  /** Previous trading session closing price */
  closePrice: number | null;
}

// ── 2. Best Bid / Ask Top-of-Book Event ───────────────────────────────────────

export interface BestBidAskEvent extends BaseEventHeader {
  eventType: "BEST_BID_ASK";
  provenance: "EXCHANGE_ORDER_BOOK";
  /** Best Bid Price (Level 1). Null if bid side of the book is empty (zero buyers). */
  bestBidPrice: number | null;
  /** Best Bid Quantity (Level 1). Null if bid side is empty. */
  bestBidQuantity: number | null;
  /** Best Ask Price (Level 1). Null if ask side of the book is empty (zero sellers). */
  bestAskPrice: number | null;
  /** Best Ask Quantity (Level 1). Null if ask side is empty. */
  bestAskQuantity: number | null;
  /** Bid/Ask Spread Percentage: (bestAskPrice - bestBidPrice) / midPrice. Null if two-sided quote missing. */
  spreadPct: number | null;
  /** Upstox V3 proto does NOT provide individual bid/ask timestamps; preserved as UNKNOWN */
  quoteSourceTs: "UNKNOWN";
}

// ── 3. Market Depth Event (5 Levels) ──────────────────────────────────────────

export interface DepthLevel {
  level: 1 | 2 | 3 | 4 | 5;
  bidPrice: number | null;
  bidQuantity: number | null;
  bidOrders: number | null;
  askPrice: number | null;
  askQuantity: number | null;
  askOrders: number | null;
}

export interface MarketDepthEvent extends BaseEventHeader {
  eventType: "MARKET_DEPTH";
  provenance: "EXCHANGE_ORDER_BOOK";
  /** Exactly 5 depth levels. Levels with no orders contain explicit nulls. */
  levels: [DepthLevel, DepthLevel, DepthLevel, DepthLevel, DepthLevel];
  /** Total Bid Quantity in the top 5 levels */
  totalBidQty: number | null;
  /** Total Ask Quantity in the top 5 levels */
  totalAskQty: number | null;
}

// ── 4. Option Greeks & Implied Volatility Event ───────────────────────────────

export interface GreeksEvent extends BaseEventHeader {
  eventType: "OPTION_GREEKS";
  provenance: "UPSTOX_SUPPLIED_GREEKS";
  /** Implied Volatility (decimal format: 0.155 = 15.5%). Null if uncomputed or out of bounds. */
  iv: number | null;
  /** Option Delta (-1.0 to +1.0). Null if uncomputed. */
  delta: number | null;
  /** Option Gamma. Null if uncomputed. */
  gamma: number | null;
  /** Option Theta (decay per day in price points). Null if uncomputed. */
  theta: number | null;
  /** Option Vega (price change per 1% IV change). Null if uncomputed. */
  vega: number | null;
  /** Option Rho. Null if uncomputed. */
  rho: number | null;
  /** Underlying reference price used by broker in Greek calculation */
  underlyingSpotPriceRef: number | null;
  /** Upstox V3 proto does NOT provide explicit Greek calculation timestamp; preserved as UNKNOWN */
  greekCalculationTs: "UNKNOWN";
}

// ── 5. Open Interest Event (Contract-Level) ───────────────────────────────────

export interface OpenInterestEvent extends BaseEventHeader {
  eventType: "OPEN_INTEREST";
  provenance: "PERIODIC_EXCHANGE_OI";
  /** Current contract Open Interest in number of contracts (NOT full-chain OI) */
  openInterest: number | null;
  /** Day-over-day net change in contract OI (null if not supplied in live feed) */
  oiChange: number | null;
  /** Upstox V3 proto does NOT provide explicit exchange OI broadcast timestamp; preserved as UNKNOWN */
  oiBroadcastTs: "UNKNOWN";
}

// ── 6. Index Futures 1-Minute Bar Event (Locally Aggregated) ─────────────────

export interface FuturesBarEvent extends BaseEventHeader {
  eventType: "FUTURES_BAR";
  provenance: "LOCAL_BAR_AGGREGATION";
  barTimestamp: string;       // ISO-8601 start time (e.g. '2026-11-16T09:30:00+05:30')
  open: number;               // First traded price in 60s window
  high: number;               // Max traded price in 60s window
  low: number;                // Min traded price in 60s window
  close: number;              // Last traded price in 60s window
  volume: number;             // Sum of traded quantities in window
  openInterest: number;       // Latest contract OI at bar close
  vwap: number | null;        // Volume-Weighted Average Price accumulated from 09:15 IST (null if vol=0)
}

// ── 7. Cash Spot Index Bar Event (Exchange Calculation) ───────────────────────

export interface SpotIndexBarEvent extends BaseEventHeader {
  eventType: "SPOT_INDEX_BAR";
  provenance: "EXCHANGE_INDEX_CALCULATION";
  barTimestamp: string;       // ISO-8601 start time
  open: number;               // First computed index value in window
  high: number;               // Max computed index value in window
  low: number;                // Min computed index value in window
  close: number;              // Last computed index value in window
  volume: null;               // Non-traded calculation; volume is permanently null
  openInterest: null;         // Spot indices have no Open Interest
}

export type CanonicalMarketEvent =
  | LTPCEvent
  | BestBidAskEvent
  | MarketDepthEvent
  | GreeksEvent
  | OpenInterestEvent
  | FuturesBarEvent
  | SpotIndexBarEvent;

// ── 8. Operational Health States & Connection Telemetry ──────────────────────

export type FeedTransportHealthState =
  | "STATE_TRANSPORT_HEALTHY_DATA_FLOWING"       // Socket open, ping/pong active, market data streaming
  | "STATE_TRANSPORT_HEALTHY_DATA_STALLED"       // Socket open, ping/pong active, but zero market data for > threshold during market hours
  | "STATE_TRANSPORT_UNHEALTHY"                  // Socket closed, TCP reset, or ping timed out (> 5s)
  | "STATE_SUBSCRIPTION_PARTIALLY_REJECTED"      // Socket open, but broker gateway rejected specific keys
  | "STATE_MARKET_CLOSED_OR_HALTED"              // Expected feed silence outside 09:15–15:30 IST or exchange halt
  | "STATE_INDIVIDUAL_CONTRACT_INACTIVE";        // Connection healthy, but specific illiquid contract has zero updates

export interface ConnectionStatusEvent {
  schemaVersion: "1.0.0";
  eventType: "CONNECTION_STATUS";
  connectionId: string;
  state: "CONNECTING" | "OPEN" | "SUBSCRIBED" | "DISCONNECTED" | "GAP_RECORDED" | "HALTED";
  healthState: FeedTransportHealthState;
  localReceiptUtcIso: string;
  localReceiptMonoNs: bigint;
  remoteEndpoint: string;
  reconnectAttempt: number;
  gapDurationMs: number | null;
  details: string;
}

export interface SubscriptionConfig {
  /** Target maximum instruments per connection (provisional planning example: 100, configurable) */
  maxKeysPerSocket: number;
  /** Maximum concurrent WebSocket connections per account (provisional planning example: 3, configurable) */
  maxConnections: number;
  /** Delay between subscription frame dispatches in ms (provisional planning example: 500 ms) */
  subscriptionStaggerMs: number;
  /** Subscription Mode: strictly 'full' (decodes to full_d5 response) */
  subscriptionMode: "full";
}

export interface SubscriptionStatusEvent {
  schemaVersion: "1.0.0";
  eventType: "SUBSCRIPTION_STATUS";
  connectionId: string;
  localReceiptUtcIso: string;
  localReceiptMonoNs: bigint;
  requestGuid: string;
  mode: "full";
  keysRequestedCount: number;
  keysAcknowledgedCount: number;
  rejectedKeys: { instrumentKey: string; reason: string }[];
  status: "CONFIRMED" | "PARTIAL_REJECTION" | "TOTAL_REJECTION";
}

// ── 9. Universe Manifest & Gap Accounting ────────────────────────────────────

export interface UniverseContractDescriptor {
  instrumentKey: string;
  exchangeToken: string;
  tradingSymbol: string;
  underlying: "NIFTY" | "BANKNIFTY";
  expiryDate: string;
  strikePrice: number;
  optionType: "CE" | "PE" | "FUTIDX" | "INDEX";
  lotSize: number;
  tier: "CORE_ATM" | "OUTER_WING" | "UNDERLYING_REFERENCE";
}

export interface HashedUniverseManifest {
  schemaVersion: "1.0.0";
  manifestType: "HashedUniverseManifest";
  masterSource: string;
  masterRetrievalDate: string;
  masterContentSha256: string;
  selectionRuleVersion: string;
  calendarReference: string;
  marketSessionDate: string;
  selectedExpiries: {
    NIFTY: string[];
    BANKNIFTY: string[];
  };
  atmReference: {
    method: "PRE_OPEN_CASH_0900_IST" | "PREV_CLOSE_CASH";
    priceTimestamp: string;
    niftyAtmStrike: number;
    bankniftyAtmStrike: number;
  };
  selectedContracts: UniverseContractDescriptor[];
  expectedKeysCount: number;
  resolvedKeysCount: number;
  missingKeys: Array<{
    instrumentKey: string;
    tier: "CORE_ATM" | "OUTER_WING";
    reason: string;
  }>;
  universeStatus: "COMPLETE" | "PARTIAL" | "INVALID";
  manifestHash: string;
}

export interface DataGapRecord {
  gapId: string;
  sessionDate: string;
  gapStartUtcIso: string;
  gapEndUtcIso: string;
  gapDurationMs: number;
  affectedInstrumentsCount: number;
  affectedInstrumentKeys?: string[];
  cause: "DISCONNECTION" | "FEED_STALL" | "BACKPRESSURE_DROP" | "CRASH_RECOVERY";
  restSnapshotReferenceTaken: boolean;
  notes: string;
}

export interface CollectorSessionManifest {
  schemaVersion: "1.0.0";
  sessionId: string;
  sessionDate: string;
  startedAtUtcIso: string;
  completedAtUtcIso: string;
  universeManifestHash: string;
  partitionFiles: Array<{
    path: string;
    segment: "options" | "futures" | "spot" | "late";
    rowCount: number;
    sha256: string;
    fileSizeBytes: number;
    posixMode: string;
  }>;
  totalEventsProcessed: number;
  totalGapsRecorded: number;
  gaps: DataGapRecord[];
  droppedEventCount: number;
  sessionIntegrityStatus: "FULL_FIDELITY_SESSION" | "PARTIAL_DATA_SESSION" | "CORRUPTED_SESSION";
  manifestSha256: string;
}
