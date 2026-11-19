# Market Data Collector Data Schema Specification
## Canonical Ingestion Events, Provenance Tracking, and Parquet Storage Formats

**Document ID:** `COLLECTOR_DATA_SCHEMA.md`  
**Location:** `web/docs/COLLECTOR_DATA_SCHEMA.md`  
**Author:** Quantitative Systems Engineering Agent  
**Date:** November 16, 2026  
**Operational Status:** PROVISIONAL SPECIFICATION ONLY (Zero code implementation, zero data collection)  
**Companion Documents:**
- `web/docs/COLLECTOR_ARCHITECTURE_SPECIFICATION.md`
- `web/docs/COLLECTOR_FAILURE_AND_RECOVERY_DESIGN.md`
- `web/docs/COLLECTOR_OPEN_DECISIONS.md`
- `web/docs/COLLECTOR_ARCHITECTURE_CORRECTION_REPORT.md`

---

## 1. Schema Design Principles & Data Integrity Rules

1. **Zero Fabrication Mandate:** The schema explicitly permits `null` across all fields where market data is missing, non-traded, or omitted by the exchange. Missing bid/ask prices, Greeks, Open Interest, or timestamps must **never be populated with synthetic or interpolated defaults** (e.g. `0.0`, `-1`, or forward-filled values).
2. **Explicit Provenance Attribution:** Every event carries provenance metadata identifying the generating source:
   - **`EXCHANGE_MATCHING_ENGINE`**: Traded prices (`ltp`), trade quantities (`ltq`), and matching engine timestamps for tradable contracts.
   - **`EXCHANGE_ORDER_BOOK`**: Best bid/ask and top-5 depth levels broadcast by the exchange.
   - **`EXCHANGE_INDEX_CALCULATION`**: Spot index values computed mathematically by the exchange (never trade prints).
   - **`PERIODIC_EXCHANGE_OI`**: Contract-level Open Interest broadcast periodically by the exchange (distinct from synchronized full-chain snapshots).
   - **`UPSTOX_SUPPLIED_GREEKS`**: Broker server-side model-derived values.
   - **`SYSTEM_LOCAL_MONOTONIC`**: High-resolution host monotonic clock.
   - **`LOCAL_BAR_AGGREGATION`**: Local deterministic calculation from raw tick streams.
3. **Immutability & Auditability:** Once constructed and timestamped, event objects are frozen and immutable (`Readonly<T>`).
4. **Coexistence with Active JSON Storage:** Existing application storage in `web/.data/` remains completely unchanged. Collector records are stored in an isolated, daily-partitioned Parquet archive under `web/.data/collector/parquet/`.

---

## 2. Canonical Ingestion Event Definitions (TypeScript Interfaces)

All timestamps follow a strict typing discipline:
- Epoch milliseconds (`number`) for provider-asserted timestamps.
- BigInt nanoseconds (`bigint`) for local monotonic timestamps (`process.hrtime.bigint()`).
- ISO-8601 strings (`string`) for human-readable audit timestamps.
- Unsupplied timestamps are typed as `"UNKNOWN" | null`.

```typescript
// ── Core Provenance Metadata ──────────────────────────────────────────────────

export type MarketDataProvenance =
  | "EXCHANGE_MATCHING_ENGINE"   // Traded price, volume, matching engine timestamp for derivatives
  | "EXCHANGE_ORDER_BOOK"        // Best bid/ask and depth levels from exchange feed
  | "EXCHANGE_INDEX_CALCULATION" // Spot index cash calculation (mathematical basket, NOT a trade print)
  | "PERIODIC_EXCHANGE_OI"       // Individual contract periodic Open Interest broadcast
  | "UPSTOX_SUPPLIED_GREEKS"     // Broker server-side calculated Greeks (model-derived)
  | "SYSTEM_LOCAL_MONOTONIC"     // Local host high-resolution monotonic timer
  | "LOCAL_BAR_AGGREGATION";     // Locally aggregated 1-minute OHLCV/VWAP bars

export interface BaseEventHeader {
  /** Event Schema Version (Semantic Versioning) */
  schemaVersion: "1.0.0";
  /** Unique event identifier (UUID v4) */
  eventId: string;
  /** Fully qualified Upstox instrument key (e.g. 'NSE_FO|40039|09-11-2026', 'NSE_INDEX|Nifty 50') */
  instrumentKey: string;
  /** WebSocket connection identifier that received the frame (e.g. 'ws-pool-01') */
  connectionId: string;
  /** Data provenance classification */
  provenance: MarketDataProvenance;
  /** Local monotonic timestamp captured at the exact socket read event (nanoseconds) */
  localReceiptMonoNs: bigint;
  /** Local UTC wall-clock timestamp at socket read event (ISO-8601 string) */
  localReceiptUtcIso: string;
  /** Broker gateway timestamp from FeedResponse.currentTs (milliseconds epoch, null if missing) */
  feedServerTs: number | null;
  /** Calculated transport latency: localReceiptUtcMs - feedServerTs (null if feedServerTs missing) */
  transportLatencyMs: number | null;
  /** 
   * Data quality warning flags. Standardized vocabulary:
   * - 'POSSIBLE_RETRANSMISSION': Identical timestamp/depth/trade heuristically matches prior tick; retained for non-destructive audit.
   * - 'SUSPECT_CLOCK_SKEW': Negative transport latency or host-to-gateway clock drift > 1,000 ms.
   * - 'PARTIAL_DEPTH': Less than 5 depth levels returned by exchange book.
   * - 'FEED_STALLED_DURING_SESSION': Frame received after an unacknowledged feed silence window.
   * - 'GAP_RECOVERY_TICK': First tick received following a transport disconnection outage.
   */
  qualityFlags: string[];
}

// ── 1. Last Traded Price & Volume Event (LTPC) ────────────────────────────────

export interface LTPCEvent extends BaseEventHeader {
  eventType: "LTPC";
  provenance: "EXCHANGE_MATCHING_ENGINE";
  /** Last Traded Price (null if no trades have executed in this contract today) */
  ltp: number | null;
  /** Last Traded Quantity / Lot Volume of the last trade */
  ltq: number | null;
  /** Last Trade Timestamp asserted by exchange matching engine (ltpc.ltt ms epoch, null if untraded) */
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
  bidOrders: number | null; // Null if not provided in feed
  askPrice: number | null;
  askQuantity: number | null;
  askOrders: number | null; // Null if not provided in feed
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
  /** Underlying reference price used by broker in Greek calculation (null if not returned) */
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
  volume: number;             // Sum of traded quantities (ltq) in window
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
  /** Spot indices are non-traded mathematical calculations; volume is permanently null */
  volume: null;
  /** Spot indices have no Open Interest; oi is permanently null */
  openInterest: null;
}

// ── 8. Connection Status & Transport Health Telemetry Event ───────────────────

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
  gapDurationMs: number | null; // Populated only when state === 'GAP_RECORDED'
  details: string;
}

// ── 9. Subscription Status Event ──────────────────────────────────────────────

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

// ── 10. Hashed Universe Manifest (Daily Session Contract Universe) ────────────

export interface HashedUniverseManifest {
  schemaVersion: "1.0.0";
  manifestType: "HashedUniverseManifest";
  /** Daily instrument master source URL/filename */
  masterSource: string;
  /** ISO-8601 timestamp when master was fetched */
  masterRetrievalDate: string;
  /** SHA-256 digest of the ingested instrument master file */
  masterContentSha256: string;
  /** Version identifier of the selection logic */
  selectionRuleVersion: string;
  /** Exchange circular reference governing expiries (e.g., 'NSE_CIRCULAR_NSE_FAOP_64506') */
  calendarReference: string;
  /** Session date (YYYY-MM-DD) */
  marketSessionDate: string;
  /** Selected expiries by underlying */
  selectedExpiries: {
    NIFTY: string[];      // Front weekly + next weekly (or monthly when coinciding)
    BANKNIFTY: string[];  // Front monthly + next monthly (monthly cycle only)
  };
  /** Reference price method used to anchor ATM strikes */
  atmReference: {
    method: "PRE_OPEN_CASH_0900_IST" | "PREV_CLOSE_CASH";
    priceTimestamp: string;
    niftyAtmStrike: number;
    bankniftyAtmStrike: number;
  };
  /** Complete list of selected contracts */
  selectedContracts: Array<{
    instrumentKey: string;
    exchangeToken: string;
    tradingSymbol: string;
    underlying: "NIFTY" | "BANKNIFTY";
    expiryDate: string;
    strikePrice: number;
    optionType: "CE" | "PE" | "FUTIDX" | "INDEX";
    lotSize: number;
    tier: "CORE_ATM" | "OUTER_WING" | "UNDERLYING_REFERENCE";
  }>;
  /** Theoretical expected count */
  expectedKeysCount: number;
  /** Successfully identified keys */
  resolvedKeysCount: number;
  /** Unlisted or rejected keys */
  missingKeys: Array<{
    instrumentKey: string;
    tier: "CORE_ATM" | "OUTER_WING";
    reason: string;
  }>;
  /** Overall session universe status */
  universeStatus: "COMPLETE" | "PARTIAL" | "INVALID";
  /** SHA-256 digest of canonical JSON string of this manifest */
  manifestHash: string;
}
```

---

## 3. Handling of Partial, Corrupted, and Unavailable Data

```
+--------------------------------------------------------------------------------------------------+
| FIELD VALUE REPRESENTATION MATRIX                                                                |
+--------------------------+--------------------+--------------------------------------------------+
| Data Field               | Representation     | Technical Rationale                              |
+--------------------------+--------------------+--------------------------------------------------+
| Missing Bid Price        | `null`             | Never store `0.0` (which implies a legitimate    |
|                          |                    | bid of zero rupees). Null indicates empty queue. |
| Missing Ask Price        | `null`             | Never store `0.0` or `999999.0`. Null indicates  |
|                          |                    | no active sellers in order book.                 |
| Untraded Contract Volume | `null` or `0`      | For options/futures, 0 indicates no volume.      |
| Cash Spot Index Volume   | `null`             | Explicitly `null` (not traded; not 0 volume).    |
| Uncalculated Greeks      | `null`             | If broker IV solver fails to converge, fields    |
|                          |                    | remain null; never fallback to local BS silently.|
| Quote Timestamps         | `"UNKNOWN"`        | Upstox V3 proto lacks quote timestamps; never    |
|                          |                    | infer quote time from `lastTradeTime`.           |
| Missing 15-min Intervals | Record explicit    | Missing intervals due to disconnections are      |
|                          | `DATA_GAP_RECORD`  | permanently documented as gaps; never backfilled.|
+--------------------------------------------------------------------------------------------------+
```

### 3.1 Event Identity, Timestamp Precision, and Deduplication Rules

1. **Absence of Upstream Sequence Numbers:**
   - The official Upstox Proto3 schema (`MarketDataFeed.proto`) contains **no sequence numbers, no packet IDs, and no exchange trade transaction IDs**.
   - Therefore, mathematically deterministic deduplication is impossible at the subscriber level.
2. **Heuristic Deduplication & Ambiguous Event Retention:**
   - Deduplication based on identical provider timestamp (`feedServerTs`) combined with identical 5-level order-book state is strictly a **heuristic**.
   - Under no circumstances will candidate duplicate events be silently deleted or dropped.
   - Ambiguous duplicate frames are retained in the Parquet archive with the **`POSSIBLE_RETRANSMISSION`** quality flag attached.
3. **Protection of Consecutive Legitimate Trades:**
   - Consecutive trade executions at the same price and lot size (e.g. multiple aggressive market orders matching against resting book depth) are legitimate market phenomena.
   - The collector preserves all trade ticks regardless of identical prices or volumes.
4. **Timestamp Precision & Resolution Hierarchy:**
   - **`feedServerTs`**: Upstox gateway timestamp in integer milliseconds epoch. Low-precision; identical for all instruments unpacked from the same WebSocket binary frame.
   - **`lastTradeTs` (`ltt`)**: Exchange matching engine trade timestamp in integer milliseconds epoch. Only updates when a trade occurs.
   - **Quote / Depth Timestamps**: Absent from Upstox Proto3 schema; typed explicitly as `"UNKNOWN"`.
   - **`localReceiptMonoNs`**: System monotonic clock in nanoseconds (`process.hrtime.bigint()`). Authoritative coordinate for local arrival ordering.

---

## 4. Persistent Apache Parquet Storage Schema

### 4.1 Parquet Column Definitions (`segment=options`)

| Parquet Column Name | Physical Data Type | Logical Type | Repetition | Description |
| :--- | :--- | :--- | :--- | :--- |
| `event_id` | `BYTE_ARRAY` | `UTF8` | Required | Unique event UUID v4 |
| `instrument_key` | `BYTE_ARRAY` | `UTF8` | Required | Upstox instrument key |
| `underlying` | `BYTE_ARRAY` | `UTF8` | Required | `'NIFTY'` or `'BANKNIFTY'` |
| `expiry_date` | `BYTE_ARRAY` | `UTF8` | Required | Format: `'YYYY-MM-DD'` |
| `strike_price` | `DOUBLE` | None | Required | Strike price (e.g. `24500.0`) |
| `option_type` | `BYTE_ARRAY` | `UTF8` | Required | `'CE'` or `'PE'` |
| `local_receipt_mono_ns`| `INT64` | None | Required | Monotonic receipt timestamp (ns) |
| `local_receipt_utc_ms`| `INT64` | `TIMESTAMP_MILLIS`| Required | Host UTC timestamp at read (ms) |
| `feed_server_ts` | `INT64` | `TIMESTAMP_MILLIS`| Optional | Upstox gateway timestamp (ms) |
| `transport_latency_ms`| `INT32` | None | Optional | Host read time minus feed time (ms)|
| `ltp` | `DOUBLE` | None | Optional | Last traded price |
| `ltq` | `INT32` | None | Optional | Last traded quantity |
| `last_trade_ts` | `INT64` | `TIMESTAMP_MILLIS`| Optional | Exchange trade timestamp (`ltt`) |
| `session_volume` | `INT64` | None | Optional | Cumulative session volume |
| `best_bid_price` | `DOUBLE` | None | Optional | Level 1 Bid Price |
| `best_bid_qty` | `INT32` | None | Optional | Level 1 Bid Quantity |
| `best_ask_price` | `DOUBLE` | None | Optional | Level 1 Ask Price |
| `best_ask_qty` | `INT32` | None | Optional | Level 1 Ask Quantity |
| `spread_pct` | `DOUBLE` | None | Optional | `(ask - bid) / mid` |
| `open_interest` | `INT64` | None | Optional | Open interest contracts |
| `iv` | `DOUBLE` | None | Optional | Broker Implied Volatility |
| `delta` | `DOUBLE` | None | Optional | Broker Option Delta |
| `gamma` | `DOUBLE` | None | Optional | Broker Option Gamma |
| `theta` | `DOUBLE` | None | Optional | Broker Option Theta |
| `vega` | `DOUBLE` | None | Optional | Broker Option Vega |
| `bid_p_1`..`bid_p_5` | `DOUBLE` | None | Optional | Bids depth levels 1 to 5 |
| `bid_q_1`..`bid_q_5` | `INT32` | None | Optional | Bid sizes levels 1 to 5 |
| `ask_p_1`..`ask_p_5` | `DOUBLE` | None | Optional | Asks depth levels 1 to 5 |
| `ask_q_1`..`ask_q_5` | `INT32` | None | Optional | Ask sizes levels 1 to 5 |
| `quality_flags` | `BYTE_ARRAY` | `UTF8` | Optional | Comma-separated violation flags |

### 4.2 Precision Preservation & Parquet Compatibility
- BigInt monotonic nanoseconds (`localReceiptMonoNs`) are stored as `INT64` (up to $\pm 9.22 \times 10^{18}$ ns, exceeding 290 years of continuous uptime without overflow).
- Timestamps with millisecond resolution are mapped to `INT64` with `TIMESTAMP_MILLIS` logical annotation.
- Prices and Greeks use standard 64-bit IEEE 754 floating-point `DOUBLE`, preserving exact fractional price ticks and Greek sensitivity values.
