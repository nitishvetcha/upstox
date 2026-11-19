# Market Data Collector Open Decisions Register
## Classification of Architecture Decisions, Provider Dependencies, and Governance Gates

**Document ID:** `COLLECTOR_OPEN_DECISIONS.md`  
**Location:** `web/docs/COLLECTOR_OPEN_DECISIONS.md`  
**Author:** Quantitative Systems Engineering Agent  
**Date:** November 16, 2026  
**Operational Status:** PROVISIONAL DECISIONS SPECIFICATION ONLY (Zero code implementation, zero live connections)  
**Companion Documents:**
- `web/docs/COLLECTOR_ARCHITECTURE_SPECIFICATION.md`
- `web/docs/COLLECTOR_DATA_SCHEMA.md`
- `web/docs/COLLECTOR_FAILURE_AND_RECOVERY_DESIGN.md`
- `web/docs/COLLECTOR_ARCHITECTURE_CORRECTION_REPORT.md`
- `web/docs/UPSTOX_HISTORICAL_DATA_VERIFICATION.md`
- `web/docs/UPSTOX_SUPPORT_TECHNICAL_QUESTIONNAIRE.md`

---

## 1. Classification Taxonomy

To prevent speculative assumptions from masquerading as engineering facts, all decisions and parameters in this document are strictly partitioned into four categories:

1. **`VERIFIED`**: Proven by empirical testing in this workspace, official pinned schema files, exchange circulars, or mathematically established requirements.
2. **`UNVERIFIED`**: Plausible heuristics or preliminary engineering estimates that lack empirical verification in this workspace.
3. **`VENDOR CONFIRMATION REQUIRED`**: Provider-dependent boundaries that require written confirmation from the Upstox API engineering team.
4. **`OWNER DECISION REQUIRED`**: Strategic, risk, or resource decisions that require explicit sign-off from the project owner.

---

## 2. Master Decision & Classification Register

```
+══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════+
| MASTER DECISION & CLASSIFICATION REGISTER                                                                                                |
+----+---------------------------------------------+------------------------------------+--------------------------------+-----------------+
| #  | Decision / Parameter Item                   | Current Architecture Design        | Evidence / Technical Finding   | Status          |
+----+---------------------------------------------+------------------------------------+--------------------------------+-----------------+
| 1  | Dynamic Universe & Regulatory Contract Cycle| Dynamic resolution from daily      | NSE Circular NSE/FAOP/64506    | VERIFIED        |
|    |                                             | master; NIFTY has weekly options,  | discontinued BANKNIFTY weekly  |                 |
|    |                                             | BANKNIFTY has monthly options only.| options after Nov 13, 2024.    |                 |
+----+---------------------------------------------+------------------------------------+--------------------------------+-----------------+
| 2  | WebSocket Wire Protocol & Response Schema   | Pinned to Upstox Feed V3           | Verified proto3 package:       | VERIFIED        |
|    |                                             | (`MarketDataFeed.proto`).          | com.upstox.marketdatafeeder-   |                 |
|    |                                             |                                    | v3udapi.rpc.proto (SHA-256 ok).|                 |
+----+---------------------------------------------+------------------------------------+--------------------------------+-----------------+
| 3  | Subscription Request Protocol               | UTF-8 JSON sent in binary frame    | Confirmed by official docs     | VERIFIED        |
|    |                                             | (`{"guid":"...","method":"sub"}`). | and tested in wsClient.test.ts.|                 |
+----+---------------------------------------------+------------------------------------+--------------------------------+-----------------+
| 4  | Historical Candle Response Tuple Format     | 7 values: [ts, o, h, l, c, v, oi]. | Confirmed in probe JSON and    | VERIFIED        |
|    |                                             | OI is 7th value, zero index `6`.   | intraday-core.mjs parser.      |                 |
+----+---------------------------------------------+------------------------------------+--------------------------------+-----------------+
| 5  | Historical Full-Chain Intraday OI           | Classified as UNAVAILABLE.         | No historical intraday full-   | VERIFIED        |
|    |                                             | Backtests must not fabricate chain.| chain endpoint exists in v2/v3.|                 |
+----+---------------------------------------------+------------------------------------+--------------------------------+-----------------+
| 6  | Historical Bid/Ask Spread Governance        | Modeled spread restricted strictly | Modeled spread CANNOT replace  | VERIFIED        |
|    |                                             | to exploratory research. Primary   | observed quotes in primary     |                 |
|    |                                             | Strategy 11.4 validation BLOCKED.  | Strategy 11.4 validation.      |                 |
+----+---------------------------------------------+------------------------------------+--------------------------------+-----------------+
| 7  | Spot Index Traded Volume                    | Explicitly `null` (not traded).    | Spot indices are non-traded;   | VERIFIED        |
|    |                                             | Provenance: EXCHANGE_INDEX_CALC.   | historical candles volume = 0. |                 |
+----+---------------------------------------------+------------------------------------+--------------------------------+-----------------+
| 8  | Single-Connection Instrument Limit          | Provisional chunking (default 100);| Provider claims of 1,500 vs.   | VENDOR CONFIR-  |
|    |                                             | maxKeysPerSocket is configurable.  | 2,000 keys unverified for full.| MATION REQUIRED |
+----+---------------------------------------------+------------------------------------+--------------------------------+-----------------+
| 9  | Multi-Connection Account Limits             | Configurable (maxConnections: 3).  | Permitted simultaneous sockets | VENDOR CONFIR-  |
|    |                                             | Fallback to single socket if gated.| per API key not confirmed.     | MATION REQUIRED |
+----+---------------------------------------------+------------------------------------+--------------------------------+-----------------+
| 10 | Live Greeks Calculation Methodology         | Classified as UPSTOX_SUPPLIED;     | Exact model (BS/Black-76), $r$,| VENDOR CONFIR-  |
|    |                                             | exact parameters unassumed.        | $q$, and spot vs fut unstated. | MATION REQUIRED |
+----+---------------------------------------------+------------------------------------+--------------------------------+-----------------+
| 11 | WebSocket Conflation & Update Cadence       | Telemetry measures inter-arrival;  | Conflation rate during market  | VENDOR CONFIR-  |
|    |                                             | no fixed update rate assumed.      | hours unconfirmed by Upstox.   | MATION REQUIRED |
+----+---------------------------------------------+------------------------------------+--------------------------------+-----------------+
| 12 | Basic vs. Plus Account API Entitlements     | Strict plan safety; require Plus   | Historical expired access code | VENDOR CONFIR-  |
|    |                                             | if UDAPI1149 is triggered.         | UDAPI1149 unconfirmed as SLA.  | MATION REQUIRED |
+----+---------------------------------------------+------------------------------------+--------------------------------+-----------------+
| 13 | Local Parquet Storage Compliance Terms      | Storage isolated to local disk;    | Upstox API Terms permit caching| VENDOR CONFIR-  |
|    |                                             | zero third-party redistribution.   | for private internal research. | MATION REQUIRED |
+----+---------------------------------------------+------------------------------------+--------------------------------+-----------------+
| 14 | Blended Ingestion Tick Rate (100–300/s)     | Illustrative planning heuristic;   | Theoretical microstructure sum;| UNVERIFIED      |
|    |                                             | buffer sized for 1,000/s peak cap. | zero live tick logs recorded.  |                 |
+----+---------------------------------------------+------------------------------------+--------------------------------+-----------------+
| 15 | Local Black-Scholes Accuracy ($R^2 > 0.99$) | Formally RETRACTED; model Greeks   | Zero paired empirical datasets | UNVERIFIED /    |
|    |                                             | restricted to exploratory research.| exist in this workspace ($N=0$)| RETRACTED       |
+----+---------------------------------------------+------------------------------------+--------------------------------+-----------------+
| 16 | Freshness Rejection Thresholds (2.0s, 5.0s) | Passive observation stage first;   | Preliminary engineering values;| OWNER DECISION  |
|    |                                             | no hard drop gates initially.      | require baseline calibration.  | REQUIRED        |
+----+---------------------------------------------+------------------------------------+--------------------------------+-----------------+
| 17 | Historical Bank Nifty Horizon (Mid-2025)    | Bound Bank Nifty backtests to      | Oct 2024 candle queries        | OWNER DECISION  |
|    |                                             | mid-2025+ due to candle sparsity.  | returned count: 0 for BankNifty| REQUIRED        |
+----+---------------------------------------------+------------------------------------+--------------------------------+-----------------+
| 18 | Technical Questionnaire Dispatch            | Ready-to-send draft finalized;     | Review web/docs/UPSTOX_SUPPORT_| OWNER DECISION  |
|    |                                             | awaiting owner authorization.      | TECHNICAL_QUESTIONNAIRE.md     | REQUIRED        |
+----+---------------------------------------------+------------------------------------+--------------------------------+-----------------+
| 19 | Dual-Timestamp Schema Implementation        | Record source_ts, mono_ns, utc_iso;| Non-intrusive latency logging  | OWNER DECISION  |
|    |                                             | observe p50/p95/p99 before gating. | specified in architecture doc. | REQUIRED        |
+----+---------------------------------------------+------------------------------------+--------------------------------+-----------------+
| 20 | Parquet Daily Storage Adoption              | Isolated collector Parquet store;  | JSON remains active dashboard  | OWNER DECISION  |
|    |                                             | permanent 1m bars, 30d raw ticks.  | store; zero migration risk.    | REQUIRED        |
+══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════+
```

---

## 3. Separation of Decisions: Immediate vs. Provider-Dependent

### 3.1 Architecture Decisions That CAN Be Made Now (Frozen Principles)
The following decisions are entirely within our engineering control and are formally established:
1. **Decoupled Architecture:** The collector operates as an independent daemon/process with zero knowledge of trading strategy logic or execution rules.
2. **Exchange-Aware Dynamic Universe:** Instrument selection is driven dynamically by daily instrument master parsing, respecting NSE Circular `NSE/FAOP/64506` (NIFTY weekly options, BANKNIFTY monthly options only). No fixed 252-key startup rule.
3. **Zero Fabrication Enforcement:** Missing bids, asks, Greeks, and trade intervals must remain explicitly `null` or `UNKNOWN`. No synthetic forward-filling or retrospective patching.
4. **Dual-Timestamp Recording:** Every event records provider-asserted epoch time (`source_ts`), host high-resolution monotonic time (`local_receipt_mono_ns`), and ISO-8601 UTC time.
5. **Isolated Parquet Daily Partitions:** Data is stored in `web/.data/collector/parquet/year=YYYY/month=MM/day=DD/` with write-once SHA-256 manifests (`MANIFEST.jsonl`). Existing JSON application storage is completely preserved.
6. **Passive Observation Stage:** The data-quality and freshness monitor initially records latency and quote-age percentiles passively without rejecting trades or dropping opportunities.
7. **Multi-Socket Sharding Capability:** The subscription manager supports configurable key chunking across multiple connections rather than assuming a single socket can hold all subscriptions.

---

### 3.2 Provider-Dependent Decisions That MUST Remain Configurable
The following parameters depend on external Upstox API policies, network realities, and account entitlements. They must be implemented as **runtime configuration options** rather than hardcoded constants:

```typescript
export interface ConfigurableCollectorOptions {
  // ── Provider Subscription Capacity (Unverified Heuristics) ──
  /** Target instrument keys subscribed per WebSocket connection. Provisional example: 100 */
  maxKeysPerSocket: number;
  /** Maximum concurrent WebSocket connections permitted per account. Provisional example: 3 */
  maxConnections: number;
  /** Delay between consecutive subscription requests in ms (prevents throttling). Provisional example: 500 ms */
  subscriptionStaggerMs: number;

  // ── Network Transport Tolerances (Unverified Heuristics) ──
  /** Connection dial timeout in ms. Provisional example: 10,000 ms */
  connectTimeoutMs: number;
  /** Feed-wide silence watchdog threshold in ms. Provisional example: 15,000 ms */
  feedSilenceWatchdogMs: number;
  /** Max consecutive reconnect attempts before halting. Default: 5 */
  maxReconnectAttempts: number;

  // ── Data Quality & Freshness Thresholds (Awaiting Owner Sign-Off) ──
  /** Operating Mode: 'PASSIVE_OBSERVE' (default) or 'ENFORCE_HARD_GATES' */
  freshnessMode: "PASSIVE_OBSERVE" | "ENFORCE_HARD_GATES";
  /** Proposed max bid quote age in seconds. Provisional proposal: 2.0 s */
  maxBidAgeSec: number;
  /** Proposed max ask quote age in seconds. Provisional proposal: 2.0 s */
  maxAskAgeSec: number;
  /** Proposed max Greek age in seconds. Provisional proposal: 5.0 s */
  maxGreekAgeSec: number;
  /** Proposed max OI age in seconds. Provisional proposal: 180.0 s */
  maxOiAgeSec: number;
  /** Proposed max clock skew tolerance in seconds. Provisional proposal: 1.0 s */
  maxClockSkewSec: number;

  // ── Storage Retention Policies (Owner Configurable) ──
  /** Days of raw tick-by-tick buffers to retain in circular storage. Default: 30 days */
  rawTickRetentionDays: number;
  /** Target Parquet row-group size in records. Default: 50,000 */
  parquetRowGroupSize: number;
}
```

---

## 4. Detailed Specification of the Four Owner Decisions

The project owner's explicit determination is required on four specific architecture governance gates prior to any implementation:

### Decision 1: Dispatch of Technical Questionnaire to Upstox Support
* **Target Address:** `api-support@upstox.com` (and `api@upstox.com` / Developer Portal Ticket).
* **What Approval Means:**
  - Authorizes the project owner to send the neutral, technical inquiry documented in [`web/docs/UPSTOX_SUPPORT_TECHNICAL_QUESTIONNAIRE.md`](file:///Users/webanatomy/Desktop/upstox_analyzer%20(2)/web/docs/UPSTOX_SUPPORT_TECHNICAL_QUESTIONNAIRE.md).
  - Initiates official vendor verification for the 6 critical provider unknowns (socket limits, conflation rate, Greeks model, expired retention depth, plan gates, and storage terms).
* **What It Does NOT Authorize:**
  - Does NOT authorize agent-automated email dispatch.
  - Does NOT authorize purchasing any paid plans, Upstox API add-ons, or third-party data subscriptions.
  - Does NOT authorize making API calls or testing endpoints.
* **Risks & Limitations:**
  - Upstox API support response latency is unpredictable (typically 2–5 business days).
  - Broker engineering may decline to commit contractually to internal tick conflation rates or proprietary Greeks modeling conventions.
* **Technical Recommendation:** **APPROVE DISPATCH**. Official broker confirmation is the only risk-free path to establish definitive capacity boundaries without empirical trial-and-error that could risk account rate limits.
* **Additional Information Required:** None. The questionnaire draft is finalized and ready for owner review.

---

### Decision 2: Authorization of Passive Observation Mode for Controlled Initial Trials
* **What Approval Means:**
  - Authorizes the collector architecture to run in non-blocking observability mode if implementation is later approved.
  - Collector passively ingests feed frames, records transit latency percentiles (p50, p95, p99), logs quote inter-arrival times, and benchmarks empirical spread distributions.
  - No trades, paper orders, or signals are filtered, gated, or rejected during observation.
* **What It Does NOT Authorize:**
  - Does NOT authorize immediate collector code implementation.
  - Does NOT authorize live API calls, token refreshes, or WebSocket dial-in today.
  - Does NOT authorize automated paper trading or order execution.
* **Risks & Limitations:**
  - Consumes API rate quota and network bandwidth without directly producing trading signals.
  - Requires active market hours (09:15–15:30 IST) to gather valid empirical distributions.
* **Technical Recommendation:** **APPROVE IN PRINCIPLE**. Enforcing arbitrary hard rejection thresholds (e.g. 2.0s quote age, 5.0s Greek age) without baseline empirical distribution measurements risks false-positive signal rejection during normal market bursts.
* **Additional Information Required:** Owner confirmation that early trial runs will be evaluated against passive metrics before hard gates are activated.

---

### Decision 3: Approval of Missing-Instrument Acceptance Thresholds
* **What Approval Means:**
  - Formally approves the dynamic acceptance criteria partitioning the contract universe into:
    1. **Core ATM Strikes (ATM $\pm 3$ strikes)** + Near-Month Index Futures: Mandatory. Missing key $\implies$ Session **`INVALID`** (hard abort).
    2. **Outer Wings (ATM $\pm 4$ to $\pm 15$ strikes)**: Missing key $\implies$ Session **`PARTIAL`** (collection proceeds with missing keys logged to `HashedUniverseManifest`).
* **What It Does NOT Authorize:**
  - Does NOT authorize synthesizing missing contracts or forward-filling missing prices.
  - Does NOT authorize changing Strategy 11.4's delta-selection logic or risk limits.
* **Risks & Limitations:**
  - If the exchange fails to list strikes within the outer $\pm 15$ wing (common in monthly BANKNIFTY during low-volatility regimes), sessions will be flagged `PARTIAL`.
  - Backtesting engines must handle `PARTIAL` datasets appropriately and avoid training wing models on unlisted strikes.
* **Technical Recommendation:** **APPROVE**. Strategy 11.4 trades strictly near ATM (short delta 0.16–0.22, long delta 0.05–0.08). Halting collection because deep OTM strikes ($\pm 14$ or $\pm 15$) are unlisted by NSE is overly rigid and counter-productive.
* **Additional Information Required:** None. Boundaries are mathematically and microstructurally sound.

---

### Decision 4: Approval of the Post-June-2025 BANKNIFTY Historical Research Boundary
* **What Approval Means:**
  - Acknowledges that historical 1-minute candle queries for BANKNIFTY expired options prior to mid-2025 returned empty arrays (`count: 0`) in empirical probes.
  - Establishes a formal research boundary restricting BANKNIFTY historical backtesting to post-June 2025 datasets.
  - Prevents quantitative research pipelines from generating misleading results based on sparse or absent historical data.
* **What It Does NOT Authorize:**
  - Does NOT authorize purchasing external historical data (TrueData, FYERS, NSE).
  - Does NOT authorize backfilling pre-June 2025 BANKNIFTY data with synthetic interpolations.
* **Risks & Limitations:**
  - Limits historical sample size for BANKNIFTY to approximately 17 months (mid-2025 to Nov 2026), compared to 25+ months available for NIFTY 50.
* **Technical Recommendation:** **APPROVE**. Attempting to run backtests on empty or zero-count historical candles is mathematically invalid. Bounding the research window to empirically verified data ensures quantitative rigor.
* **Additional Information Required:** Response to Question 3 of the Support Questionnaire may clarify whether pre-June 2025 BANKNIFTY data can be restored by Upstox.

---

## 5. Next Actions for Project Owner

1. **Review and Dispatch Support Questionnaire:**
   - Inspect [`web/docs/UPSTOX_SUPPORT_TECHNICAL_QUESTIONNAIRE.md`](file:///Users/webanatomy/Desktop/upstox_analyzer%20(2)/web/docs/UPSTOX_SUPPORT_TECHNICAL_QUESTIONNAIRE.md).
   - Insert Client ID and submit to `api-support@upstox.com` (cc: `api@upstox.com`) to resolve vendor items.
2. **Review the Four Governance Decisions (Section 4 above)**.
3. **Implementation Gate:**
   - Maintain the strict implementation freeze until vendor feedback is reviewed and architecture approval is signed off.
