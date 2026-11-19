# Market Data Collector Architecture Specification
## Decoupled, Observable, and Audit-Grade Market Data Ingestion for Options Research

**Document ID:** `COLLECTOR_ARCHITECTURE_SPECIFICATION.md`  
**Location:** `web/docs/COLLECTOR_ARCHITECTURE_SPECIFICATION.md`  
**Author:** Quantitative Systems Engineering Agent  
**Date:** November 16, 2026  
**Operational Status:** PROVISIONAL ARCHITECTURE SPECIFICATION ONLY (Strictly zero code implementation, zero live connections, zero API calls, zero orders)  
**Strategy Alignment:** Strategy 11.4 (`bcdd18a` frozen baseline)  
**Production Readiness:** STRICT HARD NO-GO (11.25%)  
**Companion Documents:**
- `web/docs/COLLECTOR_DATA_SCHEMA.md`
- `web/docs/COLLECTOR_FAILURE_AND_RECOVERY_DESIGN.md`
- `web/docs/COLLECTOR_OPEN_DECISIONS.md`
- `web/docs/COLLECTOR_ARCHITECTURE_CORRECTION_REPORT.md`
- `web/docs/UPSTOX_HISTORICAL_DATA_VERIFICATION.md`
- `web/docs/UPSTOX_SUPPORT_TECHNICAL_QUESTIONNAIRE.md`

---

## 1. Architectural Philosophy & Governance Principles

The Upstox Market Data Collector is designed as an **autonomous, decoupled ingestion and telemetry engine**. It captures, validates, timestamps, and persistently stores market data for quantitative research, backtesting, and forward paper-trading, without compromising execution boundaries or polluting historical datasets with synthetic fabrications.

### 1.1 Core Governance Principles
1. **Total Strategy Decoupling:** The collector has zero knowledge of strategy entry rules, stop losses, profit targets, or order routing. It outputs standardized, immutable market-data events via an observable event stream and an append-only disk store.
2. **Honesty Over Completeness (Zero Fabrication Rule):** Missing bids, missing asks, missing Greeks, missing OI, and unrecorded trade intervals must remain explicitly `null` or `UNKNOWN`. The collector must **never interpolate, forward-fill, or synthesize** missing values to create an artificial appearance of continuous data.
3. **Dual-Timestamping & Observability:** Every event captures both provider-asserted source time and local high-resolution monotonic time. Network transport latency and quote inter-arrival intervals are measured continuously.
4. **Configurable / Fail-Soft Boundaries:** Unverified provider capacities (such as single-socket instrument limits, account connection limits, and subscription rates) are handled by configurable architecture components rather than hardcoded assumptions.
5. **Passive Baseline Before Enforcement:** All data-quality and freshness metrics run initially in a **passive observation stage**, logging empirical distributions (p50, p95, p99) before hard rejection gates are considered or enacted.

---

## 2. High-Level System Architecture

```
+---------------------------------------------------------------------------------------------------------+
| UPSTOX API V3 (EXTERNAL CLOUD PROVIDER)                                                                 |
|  - REST Auth Gateway: GET /v3/feed/market-data-feed/authorize                                           |
|  - WebSocket Binary Stream: wss://api.upstox.com/v3/feed/market-data-feed (Proto3 FeedResponse)         |
+---------------------------------------------------------------------------------------------------------+
                                      │  (TLS / WebSocket Connections)
                                      ▼
+═════════════════════════════════════════════════════════════════════════════════════════════════════════+
| UPSTOX MARKET DATA COLLECTOR (INDEPENDENT SYSTEM PROCESS)                                               |
|                                                                                                         |
|  ┌───────────────────────────┐         ┌───────────────────────────┐                                    |
|  | Module 1: Dynamic Universe| ──────> | Module 2: Authentication  |                                    |
|  | & Contract Resolution     |         | Boundary (Token / URL)    |                                    |
|  └───────────────────────────┘         └───────────────────────────┘                                    |
|                │                                     │                                                  |
|                ▼                                     ▼                                                  |
|  ┌─────────────────────────────────────────────────────────────────┐                                    |
|  | Module 4: Subscription Manager (Sharding / Key Allocation)      |                                    |
|  └─────────────────────────────────────────────────────────────────┘                                    |
|                                │                                                                        |
|                                ▼                                                                        |
|  ┌─────────────────────────────────────────────────────────────────┐                                    |
|  | Module 3: WebSocket Connection Manager (Pool: Socket 1..M)       |                                    |
|  └─────────────────────────────────────────────────────────────────┘                                    |
|                                │  (Binary Protobuf Frames)                                              |
|                                ▼                                                                        |
|  ┌─────────────────────────────────────────────────────────────────┐                                    |
|  | Module 5: Protobuf Decoder & Event Normalizer                   |                                    |
|  └─────────────────────────────────────────────────────────────────┘                                    |
|                                │  (Canonical Normalized Ingestion Events)                               |
|                                ▼                                                                        |
|  ┌─────────────────────────────────────────────────────────────────┐                                    |
|  | Module 7: Timestamping & Provenance Engine (Dual-Timestamping)  |                                    |
|  └─────────────────────────────────────────────────────────────────┘                                    |
|                                │                                                                        |
|                                ▼                                                                        |
|  ┌─────────────────────────────────────────────────────────────────┐                                    |
|  | Module 8: Data-Quality & Freshness Monitor (Passive Metrics)    |                                    |
|  └─────────────────────────────────────────────────────────────────┘                                    |
|                │                                     │                                                  |
|                ▼                                     ▼                                                  |
|  ┌───────────────────────────┐         ┌───────────────────────────┐                                    |
|  | Module 9: Append-Only     |         | Module 11: Observability  |                                    |
|  | Parquet Storage Manager   |         | & Health Telemetry        |                                    |
|  └───────────────────────────┘         └───────────────────────────┘                                    |
+═════════════════════════════════════════════════════════════════════════════════════════════════════════+
         │                                              │
         ▼                                              ▼
┌───────────────────────────────┐              ┌────────────────────────────────┐
| PERSISTENT DISK ARCHIVE       |              | CONSUMER INTERFACES            |
|  - Daily Parquet Partitions   |              |  - Module 12: Replay Interface |
|  - Write-Once Event Manifest  |              |  - Strategy 11.4 Ingestion Bus |
|  - JSON Project State (Legacy)|              |  - Real-time Diagnostic UI     |
└───────────────────────────────┘              └────────────────────────────────┘
```

---

## 3. Detailed Specifications for the 12 Core Modules

---

### Module 1: Dynamic Universe & Contract Selection
* **Responsibility:** Dynamically resolves the target instrument universe prior to session open (09:00 IST) from the authoritative daily instrument master, strictly reflecting actual exchange contract cycles and regulatory listing structures.
* **Exchange Regulatory Reality (NSE Circular NSE/FAOP/64506):**
  - **Regulatory Evidence:** Official NSE Circular `NSE/FAOP/64506` dated October 10, 2024 discontinued weekly index options on BANKNIFTY after the November 13, 2024 expiry. From November 20, 2024 onward, weekly index options continued **only on NIFTY 50**.
  - **NIFTY 50 Expiry Structure:** Available in weekly and monthly cycles. Target universe selects the **front weekly expiry** and **next weekly expiry** (or monthly contract when the weekly cycle coincides with month-end).
  - **BANK NIFTY Expiry Structure:** Discontinued weekly options; traded strictly in **monthly and quarterly cycles**. Target universe selects the **front monthly expiry** and **next monthly expiry**.
  - **Calendar-Driven Expiry Determination:** Expiry weekdays must **never be hardcoded** (e.g. assuming Thursdays). Expiry dates must be resolved dynamically from the daily instrument master, automatically accommodating exchange-scheduled holiday shifts and contract cycle changes.
* **Dynamic Resolution Algorithm (No Hardcoded Key Count):**
  The collector does **not** enforce a rigid 252-key check at startup. Instead, it executes an 8-step resolution process:
  1. Ingest daily instrument master file (CSV/JSON); record file timestamp and SHA-256 hash in session manifest.
  2. Parse and filter active contracts for target underlyings (`NIFTY` and `BANKNIFTY`).
  3. Identify valid expiries: select front weekly + next weekly for NIFTY; select front monthly + next monthly for BANKNIFTY.
  4. Establish ATM strike reference using an explicit price timestamp (previous session official cash close, or 09:00 IST pre-open indicative cash price).
  5. Select available strikes around ATM: ATM $\pm N$ strikes (target: up to 15 strikes above and 15 strikes below ATM, bounded by actual exchange listings).
  6. Validate CE and PE contracts independently; record any strike where only one side is listed.
  7. Resolve near-month index futures (`FUTIDX`) and cash spot index reference keys (`NSE_INDEX|Nifty 50`, `NSE_INDEX|Nifty Bank`).
  8. Output a `HashedUniverseManifest` (SHA-256 verified) detailing:
     - `masterSource`: Source URL/filename of the ingested daily instrument master (e.g., `complete.csv.gz`).
     - `masterRetrievalDate`: ISO-8601 timestamp when the instrument master was downloaded.
     - `masterContentSha256`: SHA-256 digest of the raw instrument master file.
     - `selectionRuleVersion`: Explicit version identifier of universe selection rules (e.g., `v1.2-nifty-weekly-banknifty-monthly`).
     - `calendarReference`: Exchange trading calendar and regulatory reference (NSE Circular `NSE/FAOP/64506`).
     - `marketSessionDate`: Target trading session date (`YYYY-MM-DD`).
     - `selectedExpiries`: Array of selected expiry dates by underlying (NIFTY: front weekly + next weekly; BANKNIFTY: front monthly + next monthly).
     - `atmReference`: Method and reference price timestamp used to establish ATM strike (e.g., `PRE_OPEN_CASH_0900_IST` or `PREV_CLOSE_CASH`).
     - `selectedContracts`: Complete list of selected contract descriptors (instrument key, exchange token, strike, option type, lot size).
     - `expectedKeysCount`: Theoretical total ($N_{\text{expected}}$).
     - `resolvedKeysCount`: Successfully identified keys ($N_{\text{resolved}}$).
     - `missingKeys`: Specific strikes/legs not found in the master.
     - `universeStatus`: **`COMPLETE`** (100% resolved), **`PARTIAL`** (outer wings unlisted, core intact), or **`INVALID`** (ATM or underlying futures missing).
     - `manifestHash`: SHA-256 digest of the canonical JSON representation of this manifest.
* **Failure Handling & Session Acceptance Criteria:**
  - *Core ATM vs. Outer Wings Boundary*: The universe explicitly partitions option contracts into:
    1. **Core ATM Strikes (ATM $\pm 3$ strikes)**: High gamma/delta sensitivity, mandatory for Strategy 11.4 execution modeling.
    2. **Outer Wings (ATM $\pm 4$ to $\pm 15$ strikes)**: Tail risk hedging and wing liquidity monitoring.
  - *Hard Invalidation (`INVALID`)*: If any contract in Core ATM strikes (ATM $\pm 3$) for front expiry, near-month index futures, or spot index reference keys cannot be resolved in the daily master, the collector halts session startup immediately.
  - *Partial Universe (`PARTIAL`)*: If outer wing strikes (strikes $\pm 4$ to $\pm 15$) are unlisted by the exchange, the collector records the missing keys in `HashedUniverseManifest` and permits collection to proceed in partial mode, subject to owner-configured missing-instrument tolerance.
  - *Prohibition*: Never silently substitute alternate expiries, synthesize missing strikes, or invent fake instrument keys.

---

### Module 2: Authentication Boundary & Secret Handling
* **Responsibility:** Manages API credentials, isolates OAuth access tokens, requests authorized WebSocket URLs, and prevents credential leakage across processes, logs, and memory dumps.
* **Strict Secret Isolation & Security Architecture:**
  - **Filesystem Permissions:** Secrets stored on disk (`web/.data/upstox-token.json`, `.env.local`) must be restricted to POSIX permission mode `0600` (read/write by owner only).
  - **Memory Protection Clarification:** POSIX `0600` protects files on disk, not process memory. In-memory protection is achieved by:
    1. Minimizing the lifetime of plaintext tokens in heap memory.
    2. Isolating credential parsing to Module 2.
    3. Avoiding string concatenations that duplicate token instances across V8 heap memory.
    4. Explicitly zeroing or nullifying token references upon obtaining the ephemeral WebSocket URL.
  - **Environment Isolation:** Do not expose access tokens to child processes or worker threads.
  - **Redaction Policy:** All logger formatters, console outputs, and crash diagnostics pass through an automatic regex scrubber that strips tokens, passwords, and query parameters (`token=...`, `code=...`).
  - **Ephemeral URL Handling:** Authorized WebSocket redirect URLs (returned by `GET /v3/feed/market-data-feed/authorize`) contain short-lived tokens. They are held strictly in memory and never written to persistent logs.
* **Inputs & Outputs:**
  - *Inputs:* Secure environment variables or `0600` credential files.
  - *Outputs:* Ephemeral authorized WebSocket redirect URL.
* **Failure Conditions:** HTTP 401 (`UDAPI100050` token expired), HTTP 403 (`UDAPI1149` plan gate), network timeout.
* **Recovery Behaviour:** Halt connection loop cleanly. Emit `CRITICAL_AUTH_EXPIRED` alert. Never enter an automated retry loop on auth failure; require explicit operator re-authentication.

---

### Module 3: WebSocket Connection Manager
* **Responsibility:** Manages physical TCP/TLS and WebSocket connection lifecycles across a pool of $M$ connections. Handles connection establishment, protocol-level keep-alives, socket buffering, and state transitions.
* **Separation of Transport Health vs. Market-Data Health:**
  A fundamental architectural requirement is that **successful transport-level ping/pong must NEVER automatically classify the market-data feed as healthy**. The system explicitly decouples and tracks six distinct connection and market-data health states:
  1. **`STATE_TRANSPORT_HEALTHY_DATA_FLOWING`**: TCP/TLS socket connected, WebSocket ping/pong round-trips succeeding, and live protobuf market-data messages arriving at expected cadence.
  2. **`STATE_TRANSPORT_HEALTHY_DATA_STALLED`**: TCP/TLS socket connected and WebSocket ping/pong responding, but **zero market-data messages** received across all assigned keys for $> \text{feedSilenceWatchdogMs}$ (e.g., 15–30s) during active trading hours (09:15–15:30 IST) while index/futures markets are active.
  3. **`STATE_TRANSPORT_UNHEALTHY`**: Physical socket closed, TCP reset received, TLS handshake failed, or protocol ping timed out ($> 5,000\text{ ms}$) without pong response.
  4. **`STATE_SUBSCRIPTION_PARTIALLY_REJECTED`**: WebSocket connection open, but broker gateway acknowledged only a subset of requested instrument keys, rejecting invalid/delisted/unentitled keys.
  5. **`STATE_MARKET_CLOSED_OR_HALTED`**: Normal state outside 09:15–15:30 IST or during exchange-wide circuit breaker trading halts; feed silence is expected and watchdog reconnects are inhibited.
  6. **`STATE_INDIVIDUAL_CONTRACT_INACTIVE`**: Connection healthy and overall feed flowing, but an individual illiquid OTM option contract has zero trade/quote updates for 10–30+ minutes. This is standard microstructure behavior and must **never** trigger socket reconnects.
* **Feed-Wide Data Stall Detection Logic:**
  - The manager tracks `lastMarketDataMessageMonoNs` across all assigned subscription keys on each socket connection.
  - If $(t_{\text{now}} - \text{lastMarketDataMessageMonoNs}) > \text{feedSilenceWatchdogMs}$ during active market hours:
    1. Module 3 sends a WebSocket protocol `ping` frame.
    2. If `pong` is received within 5,000 ms, the physical transport to the edge proxy is alive, but upstream feed dissemination has halted $\implies$ transition to `STATE_TRANSPORT_HEALTHY_DATA_STALLED`.
    3. If stall persists beyond a secondary threshold (e.g. 45s total), the manager initiates a clean diagnostic reconnect: terminates socket, requests fresh authorization, and logs `FEED_STALL_DIAGNOSTIC_RECONNECT`.
    4. Outage window is recorded as `FEED_STALL_GAP` in `MANIFEST.jsonl`.
  - *Provider Heartbeat Guarantee Status*: **`PROVIDER CONFIRMATION REQUIRED / UNVERIFIED`**. Upstox documentation does not commit to server-initiated heartbeat frames or maximum inter-frame intervals.
* **Inputs & Outputs:**
  - *Inputs:* Authorized WebSocket URLs from Module 2, subscription frames from Module 4.
  - *Outputs:* Raw incoming binary Protocol Buffers byte frames, connection status events (`OPEN`, `CLOSE`, `ERROR`, `GAP`, `HEALTH_STATE_TRANSITION`).
* **Dependencies:** Platform WebSocket client library (`ws` in Node.js), OS network interface.
* **Failure Conditions:** TCP reset, TLS handshake failure, network route drop, server close frames.
* **Recovery Behaviour:** Exponential backoff reconnect loop (base 1.0s, multiplier 2.0, max 30.0s, max 5 attempts). Emit `DATA_GAP_RECORD` covering the outage duration.
* **Security Considerations:** Enforce TLS 1.3 verification; reject unauthorized or self-signed certificates.
* **Test Strategy:** Injected mock transport tests verifying clean reconnects, backoff timing, and termination under unrecoverable network collapse.

---

### Module 4: Subscription Manager & Configurable Sharding
* **Responsibility:** Distributes the dynamically resolved instrument universe across available WebSocket connections and transmits binary subscription requests.
* **Provisional Configuration Architecture (Not Confirmed Limits):**
  All sharding parameters are explicitly classified as **provisional configuration examples** and must remain configurable:
  ```typescript
  export interface SubscriptionConfig {
    /** Target maximum instruments per connection. Provisional planning example: 100 (configurable) */
    maxKeysPerSocket: number;
    /** Maximum concurrent WebSocket connections per account. Provisional planning example: 3 (configurable) */
    maxConnections: number;
    /** Delay between subscription frame dispatches in ms. Provisional planning example: 500 ms */
    subscriptionStaggerMs: number;
    /** Subscription Mode: strictly 'full' (decodes to full_d5 response) */
    subscriptionMode: "full";
  }
  ```
* **Provider Capacity Boundary Distinctions:**
  The architecture explicitly separates:
  1. *Per-Connection Subscription Capacity*: Limit of keys on one socket (provider claims of 1,500 vs. 2,000 unverified).
  2. *Maximum Simultaneous Account Connections*: Number of sockets an account may open concurrently (unconfirmed by vendor).
  3. *Subscription Request Rate*: Rate limit on `sub` JSON frames (unconfirmed).
  4. *Total Account Instrument Limits*: Aggregate limit across all sockets (unconfirmed).
  5. *Full-Mode Entitlement Restrictions*: Stricter bandwidth or key limits applied specifically to `full` mode.
* **Fail-Soft Allocation Strategy:**
  - If the provider rejects multi-connection dial (account limited to 1 socket), the manager consolidates all keys onto Connection 1 and logs `FALLBACK_SINGLE_SOCKET`.
  - If the provider rejects a bundle size, the manager halves the chunk size and provisions additional connections up to `maxConnections`.
  - If total keys exceed provider capacity, the manager halts and flags `INSUFFICIENT_SUBSCRIPTION_QUOTA`.

---

### Module 5: Protobuf Decoding & Normalization
* **Responsibility:** Ingests raw binary byte buffers from the WebSocket stream, decodes them using the official Proto3 schema (`MarketDataFeed.proto`), and normalizes them into canonical typed ingestion structures.
* **Inputs & Outputs:**
  - *Inputs:* Raw `Uint8Array` binary frames from Module 3.
  - *Outputs:* Structured `FeedResponse` objects containing decoded feeds (`marketFF`, `indexFF`, `ltpc`, `optionGreeks`).
* **Dependencies:** `protobufjs@8.8.1`, official Upstox V3 schema (`com.upstox.marketdatafeederv3udapi.rpc.proto`, SHA-256 `3e1c939dce2c83a3fef91405c5ca268dfa089aae973319f56685f12a5afcf612`).
* **Failure Conditions:** Malformed binary frame, unknown enum value, schema version mismatch, corrupt protobuf bytes.
* **Recovery Behaviour:** Increment `DECODE_ERROR` counter, log corrupted frame length and byte preview to failure ledger, drop corrupted message without crashing worker thread.
* **Data-Quality Requirements:** Strict deserialization: never infer missing fields; enforce exact numeric extraction for prices, quantities, and Greek partials.
* **Test Strategy:** Verify against the 51 existing offline mock decoding suites in `web/src/lib/liveEvidence/wsClient.test.ts`.

---

### Module 6: Market-Data Event Ingestion & Provenance Classification
* **Responsibility:** Maps decoded protobuf feeds into canonical internal event structures with strict provenance attribution.
* **Provenance Rules:**
  - **Spot Indices:** Categorized as **`EXCHANGE_INDEX_CALCULATION`**, never "matching-engine trade prints." Spot indices are mathematical computations with zero traded volume (`volume = null`).
  - **Tradable Derivatives:** Categorized as **`EXCHANGE_MATCHING_ENGINE`** (trades) and **`EXCHANGE_ORDER_BOOK`** (depth).
  - **Greeks:** Categorized as **`UPSTOX_SUPPLIED_GREEKS`** (broker server-side models).
  - **Open Interest:** Categorized as **`PERIODIC_EXCHANGE_OI`** (contract-level broadcast).
* **Futures 1-Minute Bar Construction:**
  - Futures bars are constructed locally from continuous trade ticks (`TradeTickEvent`) using deterministic aggregation:
    - $\text{Open} = \text{first traded price in window}$.
    - $\text{High} = \max(\text{traded prices in window})$.
    - $\text{Low} = \min(\text{traded prices in window})$.
    - $\text{Close} = \text{last traded price in window}$.
    - $\text{Volume} = \sum \text{ltq}$ (or $\Delta \text{sessionVolume}$).
    - $\text{OI} = \text{latest observed contract OI at bar close}$.
    - $\text{VWAP} = \sum(\text{Price} \times \text{Volume}) / \sum \text{Volume}$ from 09:15 IST.
  - If zero trades occur in a minute, no bar is emitted (sparse representation). If futures volume is zero or missing, VWAP is set to `null` (`UNAVAILABLE`).

---

### Module 7: Timestamping & Provenance Engine
* **Responsibility:** Attaches high-resolution temporal coordinates and provenance metadata to every ingestion event.
* **Timestamp Architecture (Strict Separation of Temporal Sources):**
  ```typescript
  interface EventTemporalProvenance {
    providerSourceTs: number | null;    // Decoded from payload: ltpc.ltt (exchange trade time)
    feedServerTs: number | null;        // Decoded from FeedResponse.currentTs (broker gateway time)
    quoteTs: "UNKNOWN";                 // Upstox V3 proto does NOT provide explicit per-quote bid/ask Ts
    localReceiptMonoNs: bigint;         // process.hrtime.bigint() at socket read
    localReceiptUtcIso: string;         // ISO-8601 UTC string at socket read
    calculatedLatencyMs: number | null; // localReceiptUtcMs - feedServerTs
  }
  ```
* **Inputs & Outputs:**
  - *Inputs:* Ingested market events from Module 6, system clocks.
  - *Outputs:* Provenance-enriched events ready for quality monitoring and disk persistence.
* **Dependencies:** Node.js `process.hrtime.bigint()`, host OS synchronized clock (NTP).
* **Failure Conditions:** Negative latency calculation ($\text{local} < \text{server}$ indicating clock drift $> 1.0\text{ s}$), clock jump.
* **Recovery Behaviour:** Flag event with `SUSPECT_CLOCK_SKEW`; preserve raw unadjusted values; log warning to telemetry.
* **Data-Quality Requirements:** Monotonic time must be strictly non-decreasing per socket.
* **Test Strategy:** Mock clock tests verifying correct latency calculation and negative latency detection.

---

### Module 8: Data-Quality & Freshness Monitoring (Passive Observation Stage)
* **Responsibility:** Continuously evaluates feed health, message inter-arrival times, bid/ask inversion, and quote freshness.
* **Passive Observation Mandate:**
  - **Zero Hard Rejections Initially:** During early collection sessions, this module acts strictly as a **passive observability collector**.
  - All proposed thresholds (2.0s quote age, 5.0s Greek age, 180s OI age, 1.0s clock skew) are strictly **unverified engineering proposals awaiting empirical baseline calibration and owner approval**.
  - It records empirical distributions:
    - Transport latency: p50, p95, p99.
    - Quote inter-arrival time: p50, p95, p99.
    - Best bid/ask spread percentage: `(ask - bid) / ltp`.
  - It flags data anomalies (`CROSSED_BOOK`, `ZERO_BID`, `STALE_QUOTE`) in metadata logs **without discarding raw records**.
* **Decoupling Quote Freshness from Trade Freshness:**
  - In options markets, bids and asks update continuously as spot moves, even when no trades execute.
  - Quote freshness (`bidTs` and `askTs`) and trade recency (`ltpTs`) are tracked by separate timers and separate validation rules.

---

### Module 9: Append-Only Storage Manager & Integrity Model
* **Responsibility:** Flushes validated market-data events to disk in an immutable, append-only, daily-partitioned Apache Parquet archive.
* **Storage Structure & Separation from Existing JSON:**
  - Existing project storage (`web/.data/`) remains active and untouched for web dashboard operations.
  - Collector storage resides in an **isolated research directory**: `web/.data/collector/parquet/`.
  - Directory partitioning scheme:
    `web/.data/collector/parquet/year=YYYY/month=MM/day=DD/segment={options|futures|spot}/`
* **File Integrity vs. Immutability — Rigorous 5-Level Taxonomy:**
  To eliminate misleading claims of "tamper-proof immutability", the architecture strictly distinguishes five security and integrity levels:
  1. **Accidental-Write Protection:** Enacted via POSIX file permissions mode `0444` (read-only by owner, group, and others) upon daily session finalization. Prevents accidental software overwrites, process crashes, or rogue local scripts from clobbering completed Parquet files.
  2. **File-Integrity Verification:** Enacted via SHA-256 content digests calculated immediately after file closure and stored in `MANIFEST.jsonl`. Verifies that storage media bit-rot, incomplete file transfers, or truncated writes are detected prior to research ingestion.
  3. **Tamper Evidence:** Comparing SHA-256 hashes against a recorded ledger reveals unauthorized file modifications after session close.
  4. **Cryptographic Authenticity (Unapproved Future Option):** Digital signatures (e.g. Ed25519) asserting non-repudiation and proving origin by an authorized service key. *Currently NOT implemented; documented as an unapproved design option.*
  5. **Protection Against Privileged Modification:** POSIX `chmod 0444` **DOES NOT protect against root/administrator users**, file owners (`chmod u+w`), or compromised user accounts. It must **never** be described as tamper-proof against deliberate internal tampering.
* **Storage Threat Model Boundaries:**
  - *Threats In-Scope (Guaranteed)*: Accidental file clobbering, collector write race conditions, disk bit-rot, partial write truncation, unprivileged process overwrite errors.
  - *Threats Out-of-Scope (Not Guaranteed)*: Root/superuser privilege abuse, deliberate workspace user tampering, compromised host operating system, physical drive seizure.
  - *Strict Infrastructure Boundary*: No cloud storage, S3 object locks, paid services, or external infrastructure without owner authorization.
* **Cryptographic Signing Specification (Documented Unapproved Future Option):**
  If the project owner later authorizes cryptographic manifest signing:
  - *Algorithm*: Ed25519 (RFC 8032) asymmetric digital signatures.
  - *Key Management*: Private key generated offline; stored in OS Keychain / secure enclave; accessible only by the collector service identity (`0400` permissions); public key embedded in research verification suite.
  - *Rotation & Recovery*: Annual key rotation schedule with dual-key verification grace period (30 days).
  - *Verification Procedure*: Downstream ingestion scripts verify `MANIFEST.jsonl.sig` against the trusted public key before loading Parquet data into backtest engines.
  - *Failure Behavior*: Verification failure immediately flags session as `UNAUTHENTICATED_UNTRUSTED_SESSION` and aborts quantitative model training.
* **Inputs & Outputs:**
  - *Inputs:* Quality-scored events from Module 8.
  - *Outputs:* Read-only Parquet files (compressed via Snappy or Zstandard), write-once session manifest (`MANIFEST.jsonl` with SHA-256 hashes).
* **Dependencies:** Parquet serialization engine, local filesystem.
* **Failure Conditions:** Disk full (free space $< 2.0\text{ GB}$), write permission failure.
* **Recovery Behaviour:** Stop consumer queue immediately; buffer events in ring memory; emit `DISK_SPACE_CRITICAL` alert; fail-closed rather than corrupting records.
* **Data-Quality Requirements:** 100% append-only. Existing session files are mounted read-only (`0444`) after session close.

---

### Module 10: Recovery, Reconnect & Gap Handling
* **Responsibility:** Coordinates system state recovery across network drops, socket timeouts, and process restarts, ensuring zero silent data interpolation.
* **Feed Silence & Watchdog Clarification:**
  - A socket must **never be terminated merely because an individual option contract has received no updates**. Deep OTM contracts can remain inactive for extended periods during normal market hours.
  - Watchdog monitors **feed-wide activity**: only if **zero messages arrive across all assigned instruments on a socket** for a configurable duration (provisional example: 15–30s during active market hours 09:15–15:30 IST) is the connection flagged as stalled.
  - Distinguish transport health (TCP open), protocol ping/pong health, feed-wide frame arrivals, and per-instrument activity.
* **Recovery Protocol:**
  1. Detect socket loss or feed-wide silence timeout.
  2. Record disconnect timestamp: `t_disconnect_mono`.
  3. Enter exponential backoff reconnect sequence.
  4. Upon reconnect, reissue subscription request; record `t_reconnect_mono`.
  5. Append permanent `DATA_GAP_RECORD` to session manifest.
  6. **Anti-Fabrication Rule:** Never backfill missed intervals using post-session REST queries or forward-filled prices.

---

### Module 11: Observability & Operational Telemetry
* **Responsibility:** Exports real-time operational telemetry, health states, and performance metrics for live monitoring.
* **Telemetry Metrics Exported:**
  - Active WebSocket connections count ($M_{\text{active}} / M_{\text{configured}}$).
  - Subscribed instruments count ($N_{\text{active}} / N_{\text{expected}}$).
  - Ingestion throughput (messages/sec, bytes/sec).
  - Feed transit latency percentiles (p50, p95, p99 ms).
  - Process RSS memory, Event Loop Lag (ms), disk write queue depth.
  - Active anomaly counts (stale quotes, crossed books, decode errors).
* **Dependencies:** Non-blocking in-memory counters; telemetry exporter failure never blocks market ingestion.

---

### Module 12: Data Replay Interface for Research
* **Responsibility:** Provides a deterministic, tick-accurate replay interface allowing research engines to consume recorded market sessions exactly as they occurred in live trading.
* **Replay Capabilities:**
  - Reads immutable Parquet session partitions.
  - Replays normalized events in exact monotonic timestamp order.
  - Supports configurable replay speed multipliers (1x real-time, 5x, 10x, or unthrottled batch mode).
  - Accurately simulates network latency and gap events.
* **Data-Quality Requirements:** Deterministic reproducibility: two consecutive replay runs with the same configuration must produce identical event sequences.

---

## 4. Realistic Backpressure & Data-Loss Failure Policy

To eliminate contradictory claims regarding "guaranteed lossless ingestion" within bounded memory buffers:

```
+═════════════════════════════════════════════════════════════════════════════════════════════════════════+
| REALISTIC INGESTION CAPACITY & DEGRADATION POLICY                                                       |
|                                                                                                         |
|  [Queue Ingestion Stage]             [Memory Ring Buffer]               [Disk Write Stage]              |
|  Incoming WebSocket Frames ────────> Ring Buffer (Max: 1.5 GB) ───────> Parquet Flush Worker           |
|                                              │                                                          |
|                                              ▼ (If Buffer Exceeds 80% / 1.2 GB)                         |
|                                    [Graceful Degradation]                                               |
|                                     1. Drop debug telemetry frames.                                     |
|                                     2. Log QUEUE_PRESSURE_WARNING.                                      |
|                                              │                                                          |
|                                              ▼ (If Buffer Exceeds 100% / 1.5 GB Under Sustained Overload)   |
|                                    [Controlled Fail-Closed Mode]                                        |
|                                     1. Increment DROPPED_EVENT_COUNT.                                   |
|                                     2. Record exact UNPERSISTED_DATA_GAP.                               |
|                                     3. Terminate affected socket to prevent corrupted state.           |
|                                     4. NEVER claim complete capture after ingestion loss.               |
+═════════════════════════════════════════════════════════════════════════════════════════════════════════+
```

### 4.1 Ingestion Loss Governance Rules
1. **No Unsubstantiated Lossless Claims:** A bounded memory buffer cannot guarantee lossless capture under indefinite sustained disk stall or extreme overload.
2. **Explicit Drop Accounting:** If queue overflow occurs, the collector records:
   - `droppedEventCount`: Number of dropped frames.
   - `degradationStartUtc` and `degradationEndUtc`.
   - `affectedInstruments`: Instruments impacted during the overflow window.
3. **Session Invalidation:** Any market session experiencing dropped market-data frames is automatically marked **`PARTIAL_DATA_SESSION`** in `MANIFEST.jsonl`. It can never be presented as an uncompromised full-fidelity validation session.

---

## 5. Event Ordering & Deduplication Specification

### 5.1 Timestamp Hierarchy for Ordering
When events arrive via WebSocket, the collector establishes order using an explicit timestamp hierarchy:
1. **Primary Ordering Coordinate:** `localReceiptMonoNs` (`process.hrtime.bigint()`). This represents the exact physical sequence in which bytes were read from the OS network socket buffer.
2. **Secondary Tie-Breaker:** For events read in the same socket batch, order by provider gateway timestamp `feedServerTs` (`FeedResponse.currentTs`).
3. **Incomparable Timestamps:** If provider timestamps are missing or identical, local monotonic arrival time is authoritative. Events arriving out of order are passed through a configurable reorder jitter buffer (provisional planning parameter: 100–200 ms). Late arrivals after Parquet flush are written to `session_late_events.parquet`.

### 5.2 Deduplication Strategy & Ambiguous Event Preservation
* **The Reality of Upstox Protobuf Protocol:**
  Inspection of the official schema (`MarketDataFeed.proto`) confirms that Upstox **does NOT provide exchange sequence numbers, packet sequence IDs, or unique trade event identifiers**.
* **Deduplication is a Heuristic, NOT Guaranteed Identity:**
  Without upstream exchange matching engine sequence numbers, exact mathematical event deduplication is impossible. The collector treats deduplication strictly as a conservative heuristic:
  1. **Consecutive Legitimate Trades Protected:** In active index options, multiple distinct market orders frequently execute against resting book depth at the identical price and lot size within the same millisecond. The collector **must NEVER silently drop or filter out consecutive trades** purely because price and volume are identical.
  2. **Timestamp Characteristics & Ambiguity:**
     - Provider gateway timestamp (`feedServerTs` / `FeedResponse.currentTs`) is millisecond-level and identical across all feeds unpacked from a single binary frame.
     - Exchange trade timestamp (`lastTradeTs` / `ltt`) updates only upon new trade execution.
     - Top-of-book and depth changes have no independent quote timestamps (`quoteSourceTs: "UNKNOWN"`).
  3. **Preservation of Ambiguous Duplicates with `POSSIBLE_RETRANSMISSION`:**
     - An incoming event is classified as an ambiguous candidate duplicate if and only if:
       $$\text{instrumentKey} = \text{cachedKey} \;\land\; \text{feedServerTs} = \text{cachedServerTs} \;\land\; \text{lastTradeTs} = \text{cachedTradeTs} \;\land\; \text{depthState} = \text{cachedDepthState}$$
     - **Non-Destructive Principle:** Rather than discarding the candidate event, the collector **preserves the event in the raw dataset** and appends the quality flag **`POSSIBLE_RETRANSMISSION`** to `qualityFlags`.
     - Downstream quantitative research consumers can choose whether to filter or retain flagged events, with complete audit visibility into the raw stream.
  4. **No Claim of Perfect Deduplication:**
     The architecture explicitly refrains from claiming lossless or perfect deduplication. Full event identity guarantees require upstream sequence numbers from the exchange or broker (`PROVIDER CONFIRMATION REQUIRED`).

---

## 6. Strategy 11.4 Integration Boundary & Non-Compromise Policy

The collector is strictly an independent producer. Strategy 11.4 consumes market data through a **read-only, decoupled consumer interface**:

```
+─────────────────────────────────+                   +──────────────────────────────────+
| MARKET DATA COLLECTOR           |                   | STRATEGY 11.4 TRADING ENGINE     |
| (Independent Producer)          |                   | (Independent Consumer)           |
|                                 |                   |                                  |
|  - Normalized Event Stream      | ────────────────> |  - Evaluates 09:30 Decision Window|
|  - Quality Anomaly Logs         |                   |  - Applies Delta Selection (Greeks|
|  - Append-Only Parquet Store    |                   |  - Enforces 5% Bid/Ask Filter    |
|                                 |                   |  - Computes 1% Risk & Position   |
+─────────────────────────────────+                   +──────────────────────────────────+
```

### 6.1 Formal Data Governance Boundary

| Strategy 11.4 Input Requirement | Collector Delivery Channel | Provenance Classification | Handling of Missing / Stale Data |
| :--- | :--- | :--- | :--- |
| **Option Delta (0.16–0.22 short, 0.05–0.08 long)** | `GreeksEvent.delta` | `UPSTOX_SUPPLIED_GREEKS` | If `delta === null`, strategy **gates trade plan**; never synthesizes delta. |
| **Bid/Ask Spread ($\le 5.0\%$)** | `BestBidAskEvent.spreadPct` | `EXCHANGE_ORDER_BOOK` | If quotes missing or spread $> 5\%$, strategy **hard rejects trade**. |
| **Debit Entry Price** | `TradeTickEvent.ltp` | `EXCHANGE_MATCHING_ENGINE` | Evaluated against top bid/ask midpoint; flagged if crossed. |
| **Futures VWAP Trend Filter** | `FuturesBarEvent.vwap` | Derived from `EXCHANGE_VOLUME` | If futures volume missing, VWAP marked `UNAVAILABLE`; strategy pauses. |
| **Spot Trend Indicators (EMAs)** | `SpotIndexBarEvent.close` | `EXCHANGE_INDEX_CALCULATION` | Spot volume remains `null` (not traded); EMA computed on closes only. |
| **Full-Chain OI / PCR Confirmation** | `OpenInterestEvent.openInterest` | `PERIODIC_EXCHANGE_OI` | Intraday full-chain OI is unavailable; strategy uses EOD baseline PCR. |

*Crucial Rule:* Missing data must remain explicitly unavailable. The integration boundary fails closed on any unpopulated or stale field. Strategy 11.4 formulas and the 1% risk limit remain strictly frozen.

---

## 7. Implementation Readiness Summary

* **Architecture Status:** Corrected, exchange-aware, and fully specified across all 12 modules.
* **Implementation Status:** **HELD / STRICTLY STOPPED.** Zero source code files created; zero live connections established.
* **Next Authorized Step:** Project owner review of this specification and companion correction documents.
