# Market Data Collector Failure & Recovery Design
## Comprehensive Fault Tolerance, Gap Preservation, and Incident Response Specification

**Document ID:** `COLLECTOR_FAILURE_AND_RECOVERY_DESIGN.md`  
**Location:** `web/docs/COLLECTOR_FAILURE_AND_RECOVERY_DESIGN.md`  
**Author:** Quantitative Systems Engineering Agent  
**Date:** November 16, 2026  
**Operational Status:** PROVISIONAL SPECIFICATION ONLY (Zero code implementation, zero data collection)  
**Companion Documents:**
- `web/docs/COLLECTOR_ARCHITECTURE_SPECIFICATION.md`
- `web/docs/COLLECTOR_DATA_SCHEMA.md`
- `web/docs/COLLECTOR_OPEN_DECISIONS.md`
- `web/docs/COLLECTOR_ARCHITECTURE_CORRECTION_REPORT.md`

---

## 1. Core Fault-Tolerance Philosophy & Golden Rule

In quantitative research and algorithmic trading, **an unrecorded market gap is infinitely preferable to fabricated data**. If a system failure or network disruption occurs during market hours, the collector must record the exact boundary of the outage, document what was lost, and preserve the gap.

### The Golden Rule of Collector Recovery:
> **The collector must NEVER silently create a continuous-looking dataset from missing data.**  
> Gaps must remain explicitly logged, immutable, and visible to downstream strategy engines. Synthetic interpolation, price forward-filling, and retrospective REST patching are strictly prohibited.

---

## 2. Comprehensive Matrix of the 12 Failure Modes

```
+═════════════════════════════════════════════════════════════════════════════════════════════════════════+
| UPSTOX MARKET DATA COLLECTOR: FAILURE TAXONOMY                                                          |
|                                                                                                         |
|  [Network & Transport Layer]          [Protocol & Ingestion Layer]        [Storage & System Layer]      |
|  1. WebSocket Disconnection           5. Feed-Wide Silence vs Inactivity  9. Disk-Full / Write Failure  |
|  2. Auth Expiration (401/403)         6. Malformed Protobuf Frames        10. Process Restart / Crash   |
|  3. Subscription Rejection            7. Duplicate Events vs Retransmit   11. Partial Recovery (Gaps)   |
|  4. Ingestion Backpressure & Loss     8. Out-of-Order Events              12. Host Clock Drift          |
+═════════════════════════════════════════════════════════════════════════════════════════════════════════+
```

---

### Failure Mode 1: WebSocket Disconnection (Transport Interruption)

* **Root Cause:** Upstream network routing drop, exchange matching engine reset, intermediate proxy timeout, or local ISP disconnection.
* **Detection Mechanism:**
  - Socket `close` or `error` event emitted by the underlying OS TCP stack.
  - Absence of TCP keep-alive ACKs.
* **Immediate Reaction:**
  1. Record high-resolution disconnect timestamp: `t_disconnect_mono = process.hrtime.bigint()`.
  2. Transition connection state from `SUBSCRIBED` to `DISCONNECTED`.
  3. Emit structured telemetry event: `CONNECTION_STATUS { state: 'DISCONNECTED', connectionId }`.
* **Recovery Protocol:**
  1. Initiate exponential backoff timer:
     $$T_{\text{wait}} = \min(T_{\text{base}} \times 2^{\text{attempt}}, T_{\text{max}})$$
     (where $T_{\text{base}} = 1.0\text{ s}$, $T_{\text{max}} = 30.0\text{ s}$, max 5 consecutive attempts).
  2. On each attempt, request a fresh authorized WebSocket redirect URL from Module 2.
  3. Upon successful reconnection, immediately transmit subscription payloads for the assigned key bundle.
  4. Record reconnection timestamp: `t_reconnect_mono`.
  5. Calculate outage duration: $\Delta t_{\text{gap}} = (t_{\text{reconnect\_mono}} - t_{\text{disconnect\_mono}}) / 10^6\text{ ms}$.
  6. Append a permanent `DATA_GAP_RECORD` to the session manifest.
* **Data Integrity Impact:**
  - Zero synthetic data is created.
  - Any Strategy 11.4 decision window falling within $[t_{\text{disconnect}}, t_{\text{reconnect}}]$ is marked `GAP_UNAVAILABLE`.
* **Logging & Alerts:**
  - High-severity alert logged to operational console: `WARN: WebSocket [ws-01] disconnected; entering reconnect backoff`.
  - On reconnect: `INFO: WebSocket [ws-01] restored after outage; gap recorded`.

---

### Failure Mode 2: Authentication Expiration & Secret Boundary Failure

* **Root Cause:** Expiration of the Upstox OAuth access token (daily 03:30 AM IST expiry), account plan gate (`UDAPI1149`), or revoked credentials.
* **Secret Handling Architecture:**
  - *Filesystem Permissions*: Token storage on disk (`web/.data/upstox-token.json`) is strictly secured with POSIX mode `0600` (owner read/write).
  - *Process Memory Protection*: POSIX `0600` protects files on disk, not process memory. In-memory protection is achieved by minimizing plaintext token lifetime in heap, isolating token parsing, avoiding string-concatenation leaks, and scrubbing all crash dumps and log formatters.
  - *Ephemeral URL Handling*: Authorized WebSocket redirect URLs containing short-lived tokens are held strictly in transient memory and redacted from console and disk logs.
* **Detection Mechanism:**
  - `GET /v3/feed/market-data-feed/authorize` returns HTTP `401 Unauthorized` (`UDAPI100050`) or HTTP `403 Forbidden` (`UDAPI1149`).
* **Immediate Reaction:**
  1. Halt connection loops immediately across all sockets.
  2. Do **not** enter a high-frequency retry loop (prevents API key blacklisting).
  3. Transition collector state to `HALTED_AUTH_REQUIRED`.
* **Recovery Protocol:**
  1. Require explicit operator intervention: operator executes authorized browser login flow.
  2. Upon placing a verified new token file, operator issues a resume command.
  3. Collector re-reads token, requests a fresh authorized WebSocket URL, and resumes collection.
* **Data Integrity Impact:**
  - Clean boundary: session collection halts cleanly; manifest records `COLLECTOR_HALTED_AUTH_EXPIRED`.

---

### Failure Mode 3: Subscription Rejection (Partial or Total)

* **Root Cause:** One or more instrument keys are invalid, delisted, expired, or rejected by Upstox due to segment entitlement restrictions.
* **Detection Mechanism:**
  - Server sends an explicit error frame, or acknowledges only a subset of requested keys in the response stream.
  - Key absent from feed updates while other keys on the same socket stream actively.
* **Immediate Reaction:**
  1. Identify the specific rejected key(s) from the acknowledgment payload.
  2. Flag rejected keys as `SUBSCRIPTION_REJECTED` in Module 4.
  3. Continue streaming active, acknowledged keys without terminating the connection.
* **Recovery Protocol:**
  1. Log rejected keys to the daily session manifest: `web/.data/collector/parquet/.../REJECTED_INSTRUMENTS.json`.
  2. If the rejected key is an essential contract (e.g. ATM CE/PE), mark the entire option chain quality as `PARTIAL_CHAIN_INCOMPLETE`.
  3. Attempt one re-subscription with verified canonical key format. If rejected again, isolate the failure.
* **Data Integrity Impact:**
  - Prevents bad keys from crashing valid feeds. Downstream strategy engine refuses to evaluate trade setups missing essential leg quotes.

---

### Failure Mode 4: Ingestion Backpressure & Bounded-Memory Data Loss Policy

* **Root Cause:** High-volatility market open burst (09:15–09:20 IST) causes incoming WebSocket message rates to exceed disk flush serialization speeds.
* **Anti-Lossless-Myth Statement:**
  > A bounded memory buffer cannot guarantee lossless capture under indefinite sustained disk stalls or extreme burst overload. The architecture defines an explicit, realistic degradation and failure policy.
* **Detection Mechanism:**
  - In-memory event ring buffer exceeds 80% capacity ($> 1.2\text{ GB}$).
  - Event loop lag exceeds 50 ms; disk write worker queue exceeds 100,000 pending records.
* **Multi-Stage Degradation Protocol:**
  1. *Stage 1 (Warning / Flush Acceleration)*: At 80% capacity, increase Parquet worker concurrency; log `QUEUE_PRESSURE_WARNING`.
  2. *Stage 2 (Non-Critical Shedding)*: At 90% capacity, drop non-critical diagnostic telemetry events; preserve all market-data depth, trade, and Greek frames.
  3. *Stage 3 (Controlled Fail-Closed Mode)*: If buffer reaches 100% (1.5 GB) under sustained overload:
     - Increment `DROPPED_EVENT_COUNT`.
     - Record exact `UNPERSISTED_DATA_GAP` with start and end timestamps.
     - Terminate affected socket connection cleanly to force upstream buffering or deliberate reconnect gap, rather than silently dropping random ticks in memory.
     - **Never claim complete capture after an ingestion loss.**
* **Data Integrity Impact:**
  - Explicit accounting: session manifest records `PARTIAL_DATA_SESSION` with exact dropped event counts and timestamps.

---

### Failure Mode 5: Transport Health vs. Market-Data Feed Stall (Watchdog Logic)

* **Root Cause:** Upstream feed silently freezes without issuing a TCP close frame (half-open socket / zombie connection), or upstream market data ticker plant stops publishing while the edge proxy remains responsive.
* **Separation of Transport vs. Market Data Health (6 Explicit States):**
  A successful protocol-level ping/pong does **not** prove that market data is healthy. The collector monitors six explicit states:
  1. `STATE_TRANSPORT_HEALTHY_DATA_FLOWING`: Physical connection alive, ping/pong active, live protobuf messages flowing.
  2. `STATE_TRANSPORT_HEALTHY_DATA_STALLED`: Physical socket open, ping/pong succeeds, but **zero market-data messages** received across all assigned keys for $> \text{feedSilenceWatchdogMs}$ (15–30s) during market hours (09:15–15:30 IST) while index/futures are active.
  3. `STATE_TRANSPORT_UNHEALTHY`: Socket closed, TCP reset received, TLS failure, or ping timed out ($> 5,000\text{ ms}$) without pong response.
  4. `STATE_SUBSCRIPTION_PARTIALLY_REJECTED`: Socket open, but broker rejected specific requested keys.
  5. `STATE_MARKET_CLOSED_OR_HALTED`: Expected feed silence outside 09:15–15:30 IST or during market halts.
  6. `STATE_INDIVIDUAL_CONTRACT_INACTIVE`: Connection healthy, feed active, but an individual illiquid contract has zero updates (normal market microstructure; never triggers reconnect).
* **Detection of Feed-Wide Stall When Ping/Pong Succeeds:**
  - Watchdog timer tracks `lastFeedMessageMonoNs` across all assigned keys on a connection.
  - If **zero messages of any kind** arrive on that socket for a configurable threshold (provisional planning example: 15–30 seconds during active market hours 09:15–15:30 IST):
    1. Send a WebSocket protocol `ping` frame.
    2. If protocol `pong` is received within 5,000 ms, the transport is alive, but market data is stalled $\implies$ transition to `STATE_TRANSPORT_HEALTHY_DATA_STALLED`.
    3. If no protocol `pong` is received within 5,000 ms, transport is dead $\implies$ transition to `STATE_TRANSPORT_UNHEALTHY`.
    4. If stall persists $> 45\text{ s}$, trigger a clean diagnostic socket reset to force re-subscription.
    5. Record the outage duration as a `FEED_STALL_GAP`.
  - *Provider Heartbeat Guarantee Status*: **`PROVIDER CONFIRMATION REQUIRED / UNVERIFIED`**. Upstox documentation provides no contractual guarantee of periodic server-initiated heartbeats.
* **Immediate Reaction & Recovery:**
  1. Forcibly terminate the unresponsive or stalled TCP socket (`socket.terminate()`).
  2. Trigger immediate reconnect sequence via Module 3.
  3. Record the outage duration as a `SILENT_OUTAGE_GAP` in `MANIFEST.jsonl`.
* **Data Integrity Impact:**
  - Prevents zombie socket lockup while avoiding false disconnects on illiquid contracts.

---

### Failure Mode 6: Malformed Protobuf Frames & Schema Decode Errors

* **Root Cause:** Upstox updates the backend Protobuf schema without notice, sends truncated binary packets, or network bit-flips occur.
* **Detection Mechanism:**
  - `protobufjs` throws `DecodeError` or `RangeError` during `decodeFeedResponse(bytes)`.
* **Immediate Reaction:**
  1. Catch the exception inside Module 5's isolated decode boundary.
  2. Prevent decode error from crashing the Node.js event loop.
  3. Increment `DECODE_ERROR` counter.
* **Recovery Protocol:**
  1. Write raw corrupted byte array to a forensic quarantine log: `web/.data/collector/corrupt_frames/frame_<timestamp>.bin`.
  2. Log corrupted frame length, connection ID, and error stack trace.
  3. Resume decoding subsequent frames immediately.
  4. If decode errors exceed 10 per minute, trigger `SCHEMA_MISMATCH_ALERT`.
* **Data Integrity Impact:**
  - Corrupted messages are discarded and quarantined; valid messages continue processing.

---

### Failure Mode 7: Duplicate Events vs. Valid Consecutive Trades & Retransmissions

* **Root Cause:** Upstream message re-transmission, redundant subscription feeds, or socket reconnect replays.
* **Crucial Trading Reality & Protobuf Reality:**
  - Upstox `MarketDataFeed.proto` contains **no exchange sequence numbers, packet IDs, or unique trade event identifiers**.
  - In liquid index options, multiple valid trades can occur at the exact same price and lot size within the same millisecond. Deduplicating purely on `(instrumentKey, price, size)` erroneously destroys genuine trade volume!
* **Deduplication Strategy & Ambiguous Event Preservation:**
  - Without sequence numbers, deduplication is strictly a **heuristic**.
  - An event is treated as an ambiguous duplicate candidate **only if**:
    $$\text{instrumentKey} = \text{cachedKey} \;\land\; \text{feedServerTs} = \text{cachedServerTs} \;\land\; \text{lastTradeTs} = \text{cachedTradeTs} \;\land\; \text{depthState} = \text{cachedDepthState}$$
  - **Preservation Mandate**: Ambiguous events are **NEVER silently deleted or discarded**. Instead, they are retained in the dataset and flagged with **`POSSIBLE_RETRANSMISSION`** in `qualityFlags`.
  - Consecutive legitimate trades at the same price and lot size are preserved unconditionally.
  - The architecture explicitly disclaims perfect deduplication guarantees until Upstox supplies upstream sequence identifiers (`PROVIDER CONFIRMATION REQUIRED`).

---

### Failure Mode 8: Out-of-Order Events (Time-Reversed Ticks)

* **Root Cause:** Asynchronous multi-thread dispatch at the broker gateway, multi-socket arrival jitter, or network route changes.
* **Ordering Hierarchy:**
  1. Primary coordinate: `localReceiptMonoNs` (`process.hrtime.bigint()`). Represents the exact physical sequence of OS socket reads.
  2. Secondary tie-breaker: `feedServerTs` (`FeedResponse.currentTs`).
* **Detection & Reordering Protocol:**
  1. Incoming events pass through a configurable **reorder jitter buffer** (provisional planning example: 100–200 ms).
  2. Events are sorted by monotonic arrival timestamp before serialization.
  3. If an event arrives later than an already-flushed Parquet row group, it is appended to `session_late_events.parquet` with explicit `LATE_OUT_OF_ORDER` flag.
  4. Previously written Parquet files are never modified or rewritten.
* **Data Integrity Impact:**
  - Primary Parquet partitions remain monotonically ordered; late ticks are preserved in secondary partitions with full provenance.

---

### Failure Mode 9: Disk-Full, Filesystem Write Failures & Storage Integrity Boundaries

* **Root Cause:** Storage volume exhaustion, permission denial, OS disk quota limits, or disk write failures.
* **Storage Threat Model & Integrity Boundaries:**
  The storage design strictly separates five levels of integrity guarantees:
  1. *Accidental-Write Protection*: POSIX mode `0444` applied at session close prevents unintentional overwrites by application bugs or rogue scripts.
  2. *File-Integrity Verification*: SHA-256 hashes recorded in `MANIFEST.jsonl` verify against bit-rot and partial writes.
  3. *Tamper Evidence*: Comparing current hashes against the manifest ledger reveals unauthorized file modifications.
  4. *Cryptographic Authenticity*: Digital signatures (Ed25519) proving origin are an unapproved future design option (currently not implemented).
  5. *Protection Against Privileged Modification*: POSIX `chmod 0444` **DOES NOT protect against root or privileged users** modifying files. The architecture guarantees accidental-write protection and tamper evidence, not tamper-proof immutability against privileged actors.
* **Detection Mechanism:**
  - Filesystem write returns `ENOSPC` (no space left on device) or `EACCES`.
  - Storage manager pre-write disk check detects free space $< 2.0\text{ GB}$.
* **Immediate Reaction:**
  1. Immediately suspend disk write operations.
  2. Redirect incoming events to an in-memory emergency circular buffer (capacity: 10 minutes of market data).
  3. Emit high-priority emergency alert.
* **Recovery Protocol:**
  1. Flush emergency buffer to disk only after disk space is cleared by operator.
  2. If buffer reaches 100% capacity before space is cleared, fail-closed: halt collection rather than corrupting existing Parquet files.
* **Data Integrity Impact:**
  - Preserves all data already committed to disk. Existing files are closed cleanly and verified.

---

### Failure Mode 10: Process Restart & Crash Recovery

* **Root Cause:** Host server reboot, power failure, OS kernel panic, or unhandled process termination.
* **Detection Mechanism:**
  - Collector process starts up and detects unclosed Parquet part files or missing manifest entries from an earlier session date.
* **Immediate Reaction:**
  1. Enter crash recovery inspection mode prior to initializing network connections.
  2. Verify integrity of existing Parquet files using Parquet footer validation.
* **Recovery Protocol:**
  1. Repair and close any unfinalized Parquet files.
  2. Compute SHA-256 hashes of all valid recovered files and append to `MANIFEST.jsonl`.
  3. Record a `CRASH_RECOVERY_GAP` covering the interval between the last recorded event and current startup.
  4. Resume normal collection if the current time is within active market hours (09:15–15:30 IST).
* **Data Integrity Impact:**
  - Zero data loss for already-fsynced records. The crash interval is permanently documented as a gap.

---

### Failure Mode 11: Partial Data Recovery (Anti-Fabrication Enforcement)

* **Root Cause:** A temporary network outage resulted in missing quotes during a market session.
* **Prohibited Behavior:**
  - **Never** query historical REST endpoints after the session to fill missing intervals.
  - **Never** carry forward quotes across an outage to simulate continuous presence.
* **Required Protocol:**
  1. Leave the outage interval completely empty in Parquet storage.
  2. Record an explicit entry in `web/.data/collector/parquet/.../GAPS.jsonl`:
     ```json
     {
       "sessionDate": "2026-11-16",
       "gapStartUtc": "2026-11-16T04:45:00.000Z",
       "gapEndUtc": "2026-11-16T04:55:00.000Z",
       "gapDurationMs": 600000,
       "affectedInstrumentsCount": 248,
       "cause": "TCP_RESET_RECONNECT_BACKOFF"
     }
     ```
  3. Downstream strategy backtest and replay engines read `GAPS.jsonl` and automatically invalidate any trade setups evaluated during that interval.
* **Data Integrity Impact:**
  - Research engines maintain unimpeachable academic and regulatory credibility.

---

### Failure Mode 12: Host Clock Drift & Desynchronization

* **Root Cause:** Host system clock deviates from true atomic time (NTP daemon failure or VM time dilation).
* **Detection Mechanism:**
  - Monotonic clock validation: $\text{CalculatedLatency} = \text{localReceiptUtcMs} - \text{feedServerTs}$.
  - If $\text{CalculatedLatency} < -500\text{ ms}$ (local clock behind server) or $> 5,000\text{ ms}$ (local clock ahead of server) across multiple connections.
* **Immediate Reaction:**
  1. Emit `SUSPECT_HOST_CLOCK_SKEW` warning.
  2. Rely strictly on `localReceiptMonoNs` (`process.hrtime.bigint()`) for all relative interval and latency calculations.
* **Recovery Protocol:**
  1. Trigger local NTP synchronization check.
  2. Annotate all events serialized during the skew window with `SKEW_DETECTED`.
* **Data Integrity Impact:**
  - Relative event ordering remains mathematically intact via the monotonic clock; wall-clock audit timestamps are flagged.

---

## 3. Summary of Fault Responses

| Failure Mode | Ingestion Impact | Storage Reaction | Strategy 11.4 Engine State |
| :--- | :--- | :--- | :--- |
| **1. WebSocket Drop** | Stream paused | Append `DATA_GAP_RECORD` | `PAUSED (GAP_INTERVAL)` |
| **2. Auth Expiry** | Halted cleanly | File fsync & lock | `HALTED (AUTH_REQUIRED)` |
| **3. Key Rejection** | Partial stream | Log to `REJECTED_KEYS` | `PARTIAL_CHAIN_INCOMPLETE` |
| **4. Backpressure** | Ring buffer expanded | Controlled drop accounting | `HEALTHY (OBSERVING)` |
| **5. Feed-Wide Silence**| Forcible reconnect | Append `SILENT_GAP` | `PAUSED (GAP_INTERVAL)` |
| **6. Decode Error** | Frame quarantined | Error count incremented | `HEALTHY (FRAME_DROPPED)` |
| **7. Duplicate Frame** | Filtered / Flagged | Deduplicated or logged | `HEALTHY (UNAFFECTED)` |
| **8. Out-of-Order** | Jitter buffer reorder | Written to late partition | `HEALTHY (REORDERED)` |
| **9. Disk Full** | Memory buffer only | Halt writes cleanly | `CRITICAL_PAUSE` |
| **10. Crash Restart** | Reconnect on startup | Fsync & manifest repair | `SESSION_RECOVERED` |
| **11. Missing Data** | Gaps preserved | Write explicit `GAPS.jsonl` | `INVALID_DECISION_INTERVAL` |
| **12. Clock Drift** | Monotonic fallback | Flag `SKEW_DETECTED` | `WARNING (MONO_ACTIVE)` |
