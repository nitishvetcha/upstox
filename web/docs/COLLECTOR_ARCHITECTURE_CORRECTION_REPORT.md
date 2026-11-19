# Market Data Collector Architecture Correction & Consistency Report

**Document ID:** `COLLECTOR_ARCHITECTURE_CORRECTION_REPORT.md`  
**Location:** `web/docs/COLLECTOR_ARCHITECTURE_CORRECTION_REPORT.md`  
**Author:** Quantitative Systems Engineering Agent  
**Date:** November 16, 2026  
**Review Status:** CRITICAL ARCHITECTURAL CORRECTIONS COMPLETED  
**Implementation Status:** STRICTLY STOPPED (Zero source code implemented; zero live feeds)  
**Production Readiness:** STRICT HARD NO-GO (11.25%)

---

## 1. Critical Errors Identified in Previous Drafts

During this architectural and regulatory audit, nine critical errors were identified across earlier documents:

1. **Invalid BANKNIFTY Weekly Expiry Assumption:**
   - *Previous Error*: Assumed BANKNIFTY has front-weekly and next-weekly index options.
   - *Regulatory Reality*: NSE Circular `NSE/FAOP/64506` dated October 10, 2024 discontinued BANKNIFTY weekly index options after November 13, 2024. Weekly index options continued **only on NIFTY 50**. BANKNIFTY trades strictly on monthly and quarterly cycles.
2. **Rigid 252-Key Startup Invalidation:**
   - *Previous Error*: Mandated that the collector refuse startup if fewer than 252 keys were resolved.
   - *Architecture Flaw*: Contract universes change dynamically due to expiry transitions, holidays, strike listings, and regulatory cycle differences. A rigid constant is architecturally invalid.
3. **Unvalidated Multi-Socket Operating Defaults:**
   - *Previous Error*: Presented `maxKeysPerSocket = 100`, `maxConnections = 3`, and `subscriptionStaggerMs = 500` as validated defaults.
   - *Architecture Flaw*: Upstox has not documented or confirmed account-level socket caps or full-mode rate limits.
4. **Flawed Feed-Silence Watchdog Logic:**
   - *Previous Error*: Terminated a WebSocket connection after 5 seconds without messages.
   - *Microstructure Flaw*: Inactive out-of-the-money option contracts routinely go 10–30 minutes without trades or quote updates. Terminating a connection based on an inactive contract causes false reconnect cascades.
5. **Contradictory Lossless Ingestion Claims Under Bounded Memory:**
   - *Previous Error*: Claimed that market depth frames "must never be dropped" while defining a bounded 1.5 GB memory buffer.
   - *Mathematical Flaw*: Under sustained burst overload or disk stalls, a bounded buffer cannot guarantee lossless capture without an explicit degradation policy.
6. **Premature Deduplication of Market Trades:**
   - *Previous Error*: Deduplicated events purely on payload matching.
   - *Trading Flaw*: Legitimate consecutive market trades frequently execute at the identical price and lot size. Deduplicating on price/size destroys genuine trade volume.
7. **Incorrect Credential Security Terminology:**
   - *Previous Error*: Claimed tokens are "stored in protected POSIX memory with 0600 permissions."
   - *Technical Flaw*: POSIX `0600` is a filesystem mode, not process memory protection.
8. **Imprecise Event Provenance on Spot Indices:**
   - *Previous Error*: Attributed spot index values to `EXCHANGE_MATCHING_ENGINE`.
   - *Exchange Reality*: Spot indices are non-traded mathematical calculations (`EXCHANGE_INDEX_CALCULATION`), not trade matching prints.
9. **Historical Spread Governance Contradiction:**
   - *Previous Error*: Open decisions table stated "backtests must use modeled spread," contradicting the governance rule that modeled spread cannot replace observed quotes in primary Strategy 11.4 validation.

---

## 2. Comprehensive Corrections Made

### A. Regulatory Realignment (NSE Circular NSE/FAOP/64506)
* Codified NSE Circular `NSE/FAOP/64506` dated October 10, 2024.
* Realigned contract selection:
  - **NIFTY 50**: Front weekly + next weekly (or monthly when coinciding).
  - **BANK NIFTY**: Front monthly + next monthly (monthly cycle only).
* Expiry weekdays are **never hardcoded**; they are resolved dynamically from the daily instrument master, automatically accommodating holiday shifts.

### B. Replacement of Fixed-Count Gate with Dynamic Universe Validation
* Replaced the hardcoded 252-key check with an 8-step dynamic validation process:
  1. Ingest daily instrument master; record file timestamp and SHA-256 hash.
  2. Parse active contracts for target underlyings.
  3. Resolve valid expiries (NIFTY weekly, BANKNIFTY monthly).
  4. Determine ATM using an explicit reference price (prior cash close or 09:00 IST pre-open indicative spot).
  5. Select available strikes around ATM ($\pm 15$ strikes bounded by exchange listings).
  6. Validate CE and PE availability independently.
  7. Resolve near-month futures and cash spot reference keys.
  8. Output a `HashedUniverseManifest` (SHA-256 verified) marking status as `COMPLETE`, `PARTIAL`, or `INVALID`.
* Strategy-critical instruments (ATM CE/PE for traded underlying, near futures) missing $\implies$ `INVALID` (halt startup); non-critical outer wings missing $\implies$ `PARTIAL` (logged to manifest).

### C. Multi-Socket Parameters Reclassified as Provisional Heuristics
* Parameters `maxKeysPerSocket = 100`, `maxConnections = 3`, `subscriptionStaggerMs = 500` are explicitly designated as **provisional configuration examples**, not safe or confirmed broker limits.
* Distinct provider limits are codified: per-connection capacity, max concurrent account sockets, subscription frame rate limits, aggregate account key limits, and full-mode restrictions.

### D. Separation of Feed-Wide Silence from Contract Inactivity
* Watchdog logic overhauled: individual contract inactivity never triggers connection termination.
* Watchdog monitors **feed-wide activity**: only if zero frames arrive across all assigned keys on a socket for 15–30s during active market hours (09:15–15:30 IST) is a protocol ping dispatched. Socket termination occurs only if protocol pong fails.

### E. Realistic Bounded-Memory Backpressure Policy
* Removed lossless claims under sustained overload.
* Enacted 3-stage degradation policy:
  - Stage 1 (80% / 1.2 GB): Accelerate flush worker; log `QUEUE_PRESSURE_WARNING`.
  - Stage 2 (90% / 1.35 GB): Shed non-critical diagnostic telemetry; preserve all market depth and trades.
  - Stage 3 (100% / 1.5 GB): Controlled fail-closed mode: record `DROPPED_EVENT_COUNT` and exact `UNPERSISTED_DATA_GAP`; terminate affected socket cleanly. Session is marked `PARTIAL_DATA_SESSION`.

### F. Event Identity & Deduplication Rules
* Primary event ordering coordinate: host monotonic nanoseconds (`localReceiptMonoNs`).
* Deduplication strictly requires identical timestamps + identical prices + identical sizes + identical depth states.
* Consecutive trades at the same price are preserved with a `POSSIBLE_RETRANSMISSION` flag rather than dropped.

### G. Accurate Credential Security Architecture
* Separated secret file permissions (`0600` on disk), process environment isolation, in-memory heap lifetime minimization, log regex redaction, transient URL handling, and core dump scrubbing.

### H. Corrected Provenance & Local Futures Bar Rules
* Spot indices reclassified as `EXCHANGE_INDEX_CALCULATION` with `volume = null`.
* Futures 1-minute bars documented as `LOCAL_BAR_AGGREGATION` with explicit OHLCV and VWAP aggregation formulas.
* Parquet physical types verified for precision preservation (INT64 nanoseconds, TIMESTAMP_MILLIS, DOUBLE).

### I. Historical Spread Governance Harmonized
* Reaffirmed that modeled spread is strictly for **exploratory research**. It must never be presented as observed quotes and cannot establish faithful execution validation. Primary Strategy 11.4 validation remains blocked without observed historical bid/ask quotes.

---

## 3. Updated Dynamic Instrument-Universe Sizing

The universe is dynamically determined at session open. The following sizing represents an **illustrative model**, not a hardcoded startup condition:

```
+--------------------------------------------------------------------------------------------------+
| ILLUSTRATIVE DYNAMIC UNIVERSE SIZING MODEL                                                       |
+-------------------+-----------------+-----------+---------+------------+-------------------------+
| Underlying Asset  | Expiry Cycle    | Strikes   | Types   | Multiplier | Illustrative Count      |
+-------------------+-----------------+-----------+---------+------------+-------------------------+
| NIFTY 50 Options  | Front Weekly +  | 31 (±15)  | CE & PE | 2×31×2     | ~124 option contracts   |
|                   | Next Weekly     |           |         |            |                         |
| BANK NIFTY Options| Front Monthly + | 31 (±15)  | CE & PE | 2×31×2     | ~124 option contracts   |
|                   | Next Monthly    |           |         |            | (bounded by listings)   |
| NIFTY Futures     | Near-Month FUT  | N/A       | FUTIDX  | 1          | 1 futures contract      |
| BANK NIFTY Futures| Near-Month FUT  | N/A       | FUTIDX  | 1          | 1 futures contract      |
+-------------------+-----------------+-----------+---------+------------+-------------------------+
| SUB-TOTAL TRADABLE DERIVATIVE INSTRUMENTS                        | ~250 INSTRUMENTS        |
+-------------------+-----------------+-----------+---------+------------+-------------------------+
| NIFTY 50 Spot     | Cash Index      | N/A       | INDEX   | 1          | 1 reference spot key    |
| BANK NIFTY Spot   | Cash Index      | N/A       | INDEX   | 1          | 1 reference spot key    |
+-------------------+-----------------+-----------+---------+------------+-------------------------+
| ILLUSTRATIVE WEBSOCKET SUBSCRIPTION KEYS TOTAL                   | ~252 SUBSCRIPTION KEYS  |
+--------------------------------------------------------------------------------------------------+
```
*Note:* If fewer than 31 strikes are listed for monthly BANKNIFTY contracts, $N_{\text{resolved}}$ will dynamically reflect the actual available count (e.g. 210–240 keys).

---

## 4. Cross-Document Consistency Audit Results

All four architecture documents were subjected to an exhaustive consistency check:

| Checked Audit Dimension | Status Across All 4 Documents | Verification Result |
| :--- | :---: | :---: |
| **BANKNIFTY Weekly Expiry References** | **Completely Removed** | Realigned to monthly cycle per NSE Circular `NSE/FAOP/64506`. |
| **Fixed 252-Key Startup Gate** | **Completely Removed** | Replaced by dynamic universe validation (`HashedUniverseManifest`). |
| **Multi-Socket Operating Defaults** | **Reclassified** | Explicitly labeled as provisional planning heuristics. |
| **Feed Silence & Watchdog Logic** | **Harmonized** | Distinguishes feed-wide silence from single-contract inactivity. |
| **Lossless Ingestion Claims** | **Retracted** | Replaced with realistic 3-stage degradation and drop accounting. |
| **Credential Security Terminology** | **Corrected** | Separated disk `0600` permissions from process memory isolation. |
| **Event Provenance Classifications** | **Harmonized** | Spot indices = `EXCHANGE_INDEX_CALCULATION`; volume = `null`. |
| **Historical Spread Policy** | **Reconciled** | Modeled spread restricted strictly to exploratory research. |

---

## 5. Remaining Provider-Dependent Assumptions

The following items remain provider-dependent and must be confirmed via [`web/docs/UPSTOX_SUPPORT_TECHNICAL_QUESTIONNAIRE.md`](file:///Users/webanatomy/Desktop/upstox_analyzer%20(2)/web/docs/UPSTOX_SUPPORT_TECHNICAL_QUESTIONNAIRE.md):
1. Upstox single-socket instrument subscription limit for `full` mode (1,500 vs. 2,000 keys).
2. Maximum simultaneous WebSocket connections permitted per developer API key.
3. Upstox Greeks pricing model, underlying asset reference, interest rate, and day-count convention.
4. WebSocket tick conflation interval during active market hours.
5. Account plan API entitlements regarding historical expired options (`UDAPI1149`).
6. Upstox Developer Agreement terms regarding local Parquet archival for private research.

---

## 6. Remaining Owner Decisions

1. **Questionnaire Submission**: Authorize dispatch of [`web/docs/UPSTOX_SUPPORT_TECHNICAL_QUESTIONNAIRE.md`](file:///Users/webanatomy/Desktop/upstox_analyzer%20(2)/web/docs/UPSTOX_SUPPORT_TECHNICAL_QUESTIONNAIRE.md) to `api-support@upstox.com` (cc: `api@upstox.com`).
2. **Freshness Measurement Strategy**: Approve running the collector in **Passive Observation Mode** initially to record empirical latency distributions before approving hard gating thresholds.
3. **Session Acceptance Thresholds**: Formally approve the missing-instrument criteria: ATM CE/PE missing $\implies$ `INVALID`; outer wings missing $\implies$ `PARTIAL`.
4. **Historical Backtest Horizon**: Approve bounding BANKNIFTY historical backtests to post-June 2025.

---

## 7. Mandatory Safeguards & Safe State Confirmation

| Verification Check | Target Status | Actual Status | Result |
| :--- | :--- | :--- | :---: |
| **Source Code Implementation** | Strictly Zero | Verified (No source code files created or modified) | **PASS** |
| **Live Upstox API Calls / Tokens** | Strictly Zero | Verified (Zero network requests, zero auth tokens) | **PASS** |
| **WebSocket Connections / Streams** | Strictly Zero | Verified (Zero live connections opened) | **PASS** |
| **Orders / Paper Trading** | Strictly Zero | Verified (Paper supervisor unloaded) | **PASS** |
| **Schedulers / Background Daemons** | Strictly Zero | Verified (`com.upstox.paperlive` unloaded) | **PASS** |
| **Protected Evidence Archives** | 13/13 SHA-256 Valid | Verified against `MANIFEST.sha256` (`All OK: True`) | **PASS** |
| **Development Ports** | 3150 and 3123 Free | Verified via `lsof` (Both ports free) | **PASS** |
| **Git Working Tree** | Clean Index | Verified (Unstaged changes preserved; clean index) | **PASS** |
| **Production Readiness Scorecard** | STRICT HARD NO-GO | Maintained at **11.25% HARD NO-GO** | **PASS** |

The documentation corrections are complete, fully reconciled, and strictly verified. In accordance with the prompt's instructions, no code implementation has begun, and the agent has stopped to await owner review.

