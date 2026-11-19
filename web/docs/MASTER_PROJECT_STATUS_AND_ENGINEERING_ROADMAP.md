# Upstox Options Analyzer — Master Project Status, Three-Workstream Engineering Roadmap & Execution Plan

**Document Reference:** `web/docs/MASTER_PROJECT_STATUS_AND_ENGINEERING_ROADMAP.md`  
**Author:** Quantitative Systems Engineering Agent  
**Date:** November 16, 2026  
**Operational Mode:** PROJECT-WIDE REVIEW AND ENGINEERING PLANNING ONLY  
**Implementation Status:** NOT AUTHORIZED (Zero code created or modified)  
**Live Feeds & Trading:** STRICTLY DISABLED  
**Production Readiness:** STRICT HARD NO-GO (11.25%)  
**Strategy Alignment:** Strategy 11.4 Formulas and 1.0% Risk Limit FROZEN

---

## 1. Executive Project Status

The Upstox Options Analyzer project is an advanced algorithmic research and trade execution platform designed for index derivatives (NIFTY 50 and BANK NIFTY). The system incorporates automated technical scanning, breadth computation, multi-factor trade recommendation scoring, strict capital risk management (1.0% account risk ceiling), paper-trading execution simulation, and an immutable audit trail.

### 1.1 Current Scorecard & Readiness Baseline
Following the comprehensive engineering closeout and the final architecture audit of the Upstox Market Data Collector, the authoritative project status is:

```
+═════════════════════════════════════════════════════════════════════════════════════════════════════════+
| UPSTOX OPTIONS ANALYZER: MASTER READINESS SCORECARD (Verified November 16, 2026)                        |
+------------------------------------+------------------+-------------------------------------------------+
| Dimension                          | Score / Status   | Authoritative Baseline Finding                  |
+------------------------------------+------------------+-------------------------------------------------+
| 1. Application Engineering         | 66.50% / 100     | 2,876 automated tests pass (0 fail, 288 suites).|
|                                    |                  | Clean production webpack build. 86 API routes.  |
+------------------------------------+------------------+-------------------------------------------------+
| 2. Strategy Validation             | 28.75% / 100     | Strategy 11.4 formulas FROZEN. Primary          |
|                                    |                  | validation BLOCKED by lack of observed quotes.  |
+------------------------------------+------------------+-------------------------------------------------+
| 3. Production Readiness            | 11.25% / 100     | STRICT HARD NO-GO. Unattended live trading is   |
|                                    | (HARD NO-GO)     | strictly prohibited. Engine remains offline.    |
+------------------------------------+------------------+-------------------------------------------------+
| 4. Collector Architecture          | AUDITED & READY  | Complete 4-tier specification, failure design,  |
|                                    | FOR APPROVAL     | data schema, and open decisions register ready. |
+═════════════════════════════════════════════════════════════════════════════════════════════════════════+
```

### 1.2 Core Architectural Principle: Collector Role & Context
The recent completion of the **Upstox Market Data Collector Final Architecture Audit** (`COLLECTOR_FINAL_ARCHITECTURE_AUDIT_REPORT.md`) represents a major engineering milestone: it resolves protocol ambiguities, codifies regulatory constraints, establishes a 5-level storage integrity model, and specifies a dynamic universe selection algorithm.

However, **the collector architecture audit does NOT represent completion of the overall Upstox project**. 
The collector was designed specifically because retrospective historical data from Upstox REST APIs is fundamentally incapable of validating Strategy 11.4. The collector is an infrastructural data producer designed to feed the research and validation engine; it sits within a broader ecosystem of three independent engineering workstreams.

---

## 2. Status of the Original Three Engineering Workstreams

The project was historically partitioned into three independent engineering tracks:

```
+─────────────────────────────────────────────────────────────────────────────────────────────────────────+
| THREE-WORKSTREAM ARCHITECTURE MAP                                                                       |
|                                                                                                         |
|  [WORKSTREAM 1]                       [WORKSTREAM 2]                    [WORKSTREAM 3]                  |
|  Options Research &                   Stock Monitoring &                Option-Chain Freshness &        |
|  Strategy Validation                  Recovery Architecture             Data Reliability                |
|  ───────────────────                  ─────────────────────             ────────────────────────        |
|  - Strategy 11.4 Formulation (Frozen) - Stock Scanner Engine (Stock V2) - REST Option Chain Normalization|
|  - Path Simulation & Capital Models   - Breadth & Sentiment Pipeline    - Contract Freshness Safeguards |
|  - Historical Candle Feasibility      - Paper Ledger Atomic Store       - Mock Execution Guard          |
|  - Sealed Holdout Governance          - Disk Crash Recovery Design      - Offline WebSocket Client      |
|                                                                                                         |
|                                    ▲                                 ▲                                  |
|                                    │                                 │                                  |
|                                    └─────────────────┬───────────────┘                                  |
|                                                      │                                                  |
|                                            [COLLECTOR ARCHITECTURE]                                     |
|                                            Streaming Tick, Depth & Greeks Ingestion                     |
+─────────────────────────────────────────────────────────────────────────────────────────────────────────+
```

---

### Workstream 1: Options Research & Strategy Validation

#### 1. Implementation Baseline
- **Strategy 11.4 Specification:** Frozen and codified in `web/src/lib/engine/strategy.ts` (SHA-256: `d0170b40a4b9fb6265697edda03917779b9b8acddcaddc4c43488a4b29eb3f18`).
- **Core Parameters:** Short delta 0.16–0.22, long delta 0.05–0.08, maximum bid/ask spread $\le 5.0\%$, entry window 09:30 IST, credit spread structure, maximum position loss ceiling 1.0% of total account capital.
- **Capital Feasibility:** Formally established in `CAPITAL_FEASIBILITY_RESEARCH.md` that under the 1% risk rule and realistic transaction costs, trading at ₹1.0 lakh or ₹1.7 lakh capital produces **NO TRADE** (0 lots). Minimum capital required for a 1-lot 50-point spread is ~₹1.85 lakh; production rule (200-point width) requires ~₹5.5 lakh.
- **Transaction Costs Schedule:** Updated and verified against official circulars:
  - STT: 0.15% on sell-side option premium (effective April 1, 2026); 0.15% on intrinsic value for cash-settled ITM exercised options.
  - NSE Transaction Charges: ₹3,553.00 per crore of traded value (Exchange: ₹3,552.99 + IPFT: ₹0.01) per NSE Circular `NSE/FA/73061` (effective March 1, 2026).
  - Plus Plan (₹30/order) adopted as the conservative research fallback.

#### 2. Research Collections Completed to Date
- **Historical Pilot Dataset:** 4,859 historical 30-minute expired option candle bars collected across 40 option contracts covering October 2024 expiries (`.research-data/historical-pilot-raw/candles.csv`).
- **Index History Clean Dataset:** Continuous daily OHLC series for 6 benchmark indices (NIFTY 50 back to 2000, BANK NIFTY back to 2006, FINNIFTY back to 2013, MIDCPNIFTY back to 2022, SENSEX back to 2000, BANKEX back to 2004) stored in `web/.research-data/upstox-clean-2026-11-06-v1/`.

#### 3. Empirical Findings & Structural Gaps
An exhaustive offline feasibility audit (`HISTORICAL_ACQUISITION_FEASIBILITY_AUDIT.md`) established that **historical REST candle data is structurally incapable of validating Strategy 11.4**:
- **Bid/Ask Quotes Absent:** Historical candles contain only traded OHLCV and EOD Open Interest. Bid and ask quotes do not exist in historical candles. Strategy 11.4's mandatory 5% bid/ask spread filter cannot be tested.
- **Option Greeks Absent:** Neither IV nor Delta exists in historical candles. Local Black-Scholes modeling relies on unverified interest rate, dividend yield, and volatility assumptions ($N=0$ paired empirical samples in this workspace).
- **Index Traded Volume Absent:** Historical cash spot index candles (`NSE_INDEX|Nifty 50`) return `volume = 0` across all intervals (spot indices are non-traded mathematical baskets). Index VWAP cannot be computed without near-month index futures candles.
- **Full-Chain Open Interest Absent:** Only single-contract periodic OI is returned; synchronized full-chain intraday Open Interest snapshots do not exist in Upstox REST APIs.
- **BANKNIFTY Historical Candle Void:** Historical 1-minute candle queries for expired BANKNIFTY options prior to mid-2025 return empty arrays (`count: 0`).

#### 4. Sealed Holdout & Research Integrity Governance
- Holdout access is strictly audited (`HOLDOUT_ACCESS_AUDIT_2026-11-11.md`).
- All sealed holdout datasets remain completely uninspected and intact.
- **Current Blocker:** Primary validation of Strategy 11.4 is **FROZEN AND BLOCKED** until forward-streaming market depth and quotes can be captured via the collector.

---

### Workstream 2: Stock Monitoring & Recovery Architecture

#### 1. Architecture Overview
- Dedicated stock scanner and swing opportunity pipeline (`web/src/lib/stockV2/`, `web/src/lib/engine/stockOpportunityEngine.ts`, `web/src/lib/stockV2Dashboard.ts`).
- Market breadth engine tracking constituent advance/decline ratios across NIFTY 50 and sectoral indices (`src/lib/services/breadthService.ts`).
- Paper-trading execution ledger (`src/lib/services/paperLedgerStore.ts`, `src/lib/paperEngine.ts`).

#### 2. Previously Identified Defects & Remediations
- **Incident 2026-11-09 (Unintended Live Requests):** A local dev server in default configuration made 67 live Upstox requests. Remediated by installing central network gates:
  - `upstoxNetworkGate.ts`: Blocks outbound HTTP requests unless `MARKET_DATA_PROVIDER=upstox`.
  - `newsNetworkGate.ts`: Blocks news fetching in mock mode.
  - `collectionGuard.mjs`: Added fail-closed pre-execution guard to 17 collector and maintenance scripts.
- **Stock Scanner Mock Gate Defect:** `scanStocks` previously read `upstox-token.json` in mock mode. Remediated and verified with 6 dedicated unit tests (`stockScanGuard.test.ts`, SG-1 to SG-6 pass; 149 scanner fixture tests pass).
- **Background Daemon Persistence Risk:** The LaunchAgent `com.upstox.paperlive.plist` was identified as an operational risk (attempting to run paper trading unattended at 09:10 IST). Remediated by moving the file out of `~/Library/LaunchAgents/` into `~/Library/LaunchAgents.disabled/`. It remains completely unloaded.

#### 3. Current Recovery Status & Remaining Gaps
- **Atomic File Store:** `paperLedgerStore.ts` writes `trades.json` atomically via temporary file and rename, preserving `trades.json.bak` and appending to `events.jsonl`.
- **Remaining Gap (Disk Crash Recovery Specification):** A detailed specification exists in `web/docs/disk_crash_recovery_specification.md` requiring:
  1. Addition of `eventId` (UUID v4), `sequenceNumber` (monotonic integer), and `ledgerVersion` to every paper event.
  2. Crash replay engine to automatically detect orphaned `.tmp-*` files and reconcile `events.jsonl` against `trades.json.bak`.
  - *Current Status:* Specification written; full implementation and automated recovery test suite pending.
- **Independence:** Workstream 2 is **architecturally independent** of the options collector and can be finalized using mock fixtures and offline replay suites.

---

### Workstream 3: Option-Chain Freshness & Data Reliability

#### 1. Existing Option-Chain Acquisition & Normalization
- Option chain snapshots are acquired via `getOptionChain` in `web/src/lib/services/upstoxMarket.ts`, fetching `/v2/option/chain` from Upstox.
- Normalization logic (`normalizeChain`) builds a structured representation with ATM strike anchoring, strike step resolution, and lot sizes.

#### 2. Freshness & Safeguard Architecture
- **Separation of Quote vs. Trade Freshness:** Formally codified in `web/src/lib/services/chainFreshness.ts`. The system recognizes that a successful HTTP 200 response proves nothing about exchange-side freshness (`CHAIN_SNAPSHOT_UNVERIFIED`).
- **Contract-Level Freshness Safeguards:** Verified in `web/src/lib/services/contractFreshnessSafeguards.test.ts` (899 lines of regression tests). Proves that:
  - One fresh strike cannot make an unverified contract eligible.
  - An unverified contract cannot receive an executable paper-entry decision.
  - Open positions are never revalued or exited using untrusted stale LTPs.
- **Mock Execution Guard:** Verified in `web/src/lib/services/mockExecutionGuard.test.ts` (MX-1 to MX-3). If any subsystem input is mock or if `withFallback` reruns against mock data:
  - `hasMockInput(snapshot)` returns `true`.
  - The recommendation engine forces `decision: "NO_TRADE"`.
  - An explicit `MOCK_DATA` blocker is attached; `execution` block is set to `null`.
  - The recommendation is marked `journaled: false` and excluded from the production trade journal.

#### 3. Remaining Data Reliability Defects & Collector Dependency
- **REST Protocol Blind Spot:** Upstox REST endpoint `/v2/option/chain` does not provide quote generation timestamps or matching engine sequence numbers. Contract freshness is inferred from `lastTradeTime`, which creates false staleness rejections on illiquid contracts.
- **Dependency on Collector:** To obtain genuine top-of-book quotes (bid/ask), 5-depth order books, broker-calculated Greeks, and high-resolution arrival timestamps, **Workstream 3 requires direct integration with the streaming WebSocket collector**.

---

## 3. Collector Architecture — Current Status & Governance Position

The final architecture audit (`COLLECTOR_FINAL_ARCHITECTURE_AUDIT_REPORT.md`) verified that the collector specification is complete, consistent, and ready for owner review.

```
+═════════════════════════════════════════════════════════════════════════════════════════════════════════+
| COLLECTOR ARCHITECTURE MATURITY MATRIX                                                                 |
+----+----------------------------------------+-------------------------------+---------------------------+
| #  | Architectural Dimension                | Maturity Classification       | Implementation Status     |
+----+----------------------------------------+-------------------------------+---------------------------+
| 1  | Proto3 Binary Deserialization          | PASS                          | Offline schema verified.  |
| 2  | Regulatory Cycle Model (NSE/FAOP/64506)| PASS                          | Dynamic master parsing.   |
| 3  | Secret Boundary & Memory Protection    | PASS                          | POSIX 0600 on disk.       |
| 4  | Bounded Memory Degradation Policy      | PASS                          | 3-stage drop accounting.  |
| 5  | Parquet Storage & Threat Model         | PASS WITH LIMITATIONS         | Accidental write & SHA-256|
| 6  | Event Deduplication & Retransmission   | PASS WITH LIMITATIONS         | Heuristic; raw preserved. |
| 7  | Transport vs Market-Data Health States | PASS WITH LIMITATIONS         | 6 states; ping watchdog.  |
| 8  | Sharding & Multi-Socket Capacity       | PROVIDER CONFIRMATION REQUIRED| Awaiting Upstox answers.  |
| 9  | Live Greeks Pricing Conventions        | PROVIDER CONFIRMATION REQUIRED| Awaiting Upstox answers.  |
| 10 | Passive Observation Mode Authorization | OWNER DECISION REQUIRED       | Decision Gate 2.          |
| 11 | Missing Contract Acceptance Thresholds | OWNER DECISION REQUIRED       | Decision Gate 3.          |
| 12 | Pre-June-2025 BANKNIFTY Horizon Gate   | OWNER DECISION REQUIRED       | Decision Gate 4.          |
+═════════════════════════════════════════════════════════════════════════════════════════════════════════+
```

### The Four Owner Decision Gates:
1. **Decision Gate 1 (Questionnaire Submission):** Authorizing submission of [`UPSTOX_SUPPORT_TECHNICAL_QUESTIONNAIRE.md`](file:///Users/webanatomy/Desktop/upstox_analyzer%20(2)/web/docs/UPSTOX_SUPPORT_TECHNICAL_QUESTIONNAIRE.md) to `api-support@upstox.com`.
2. **Decision Gate 2 (Passive Observation Mode):** Authorizing future non-blocking empirical observation runs (capturing latency, quote arrival cadence, and spread distributions).
3. **Decision Gate 3 (Missing-Instrument Acceptance Thresholds):** Formally approving that missing Core ATM strikes (ATM $\pm 3$) invalidates a session (`INVALID`), while missing outer wings ($\pm 4$ to $\pm 15$) marks a session as `PARTIAL`.
4. **Decision Gate 4 (Post-June-2025 BANKNIFTY Historical Boundary):** Formally bounding historical BANKNIFTY backtesting to post-June 2025 due to empty candle arrays in earlier periods.

### The Six Provider-Confirmation Items:
1. Upstox single-socket key capacity in `full` mode (1,500 vs. 2,000 keys).
2. Maximum concurrent WebSocket connections permitted per developer API key.
3. Server-side tick conflation and broadcast interval during active market hours.
4. Live Option Greeks pricing conventions ($r$, $q$, underlying reference asset, day-count basis).
5. Official historical expired option candle retention schedule.
6. Local data archival compliance terms under the Upstox Developer Agreement.

---

## 4. Workstream Interdependency Matrix & Critical Path

To optimize engineering progress, tasks must be divided into those that can progress independently in parallel and those constrained by external dependencies.

```
+═════════════════════════════════════════════════════════════════════════════════════════════════════════+
| WORKSTREAM INTERDEPENDENCY MATRIX                                                                       |
+------------------------------------+------------------+---------------------+---------------------------+
| Task / Subsystem                   | Owning Stream    | External Dependency | Execution Mode            |
+------------------------------------+------------------+---------------------+---------------------------+
| 1. Paper Ledger Crash Recovery     | Workstream 2     | None (Offline)      | INDEPENDENT PARALLEL      |
| 2. Stock Scanner Indicator Audits  | Workstream 2     | None (Offline)      | INDEPENDENT PARALLEL      |
| 3. SQLite Dry-Run Storage Tests    | Workstream 2     | None (Offline)      | INDEPENDENT PARALLEL      |
| 4. Questionnaire Dispatch          | Governance       | Owner Decision 1    | IMMEDIATE OWNER ACTION    |
| 5. Collector Offline Skeleton      | Collector / WS 3 | Owner Arch Approval | INDEPENDENT PARALLEL      |
| 6. Mock Socket Stress & Disconnect | Collector / WS 3 | None (Offline)      | INDEPENDENT PARALLEL      |
| 7. Multi-Socket Sharding Rules     | Collector / WS 3 | Upstox Confirmation | BLOCKED ON VENDOR         |
| 8. Passive Observation Collector   | Collector / WS 3 | Owner Decision 2    | CONTROLLED LIVE TRIAL     |
| 9. Empirical Spread Calibration    | WS 1 & WS 3      | 10–15 Live Sessions | CRITICAL PATH             |
| 10. Streaming Data Accumulation    | WS 1 & WS 3      | 30+ Live Sessions   | CRITICAL PATH             |
| 11. Strategy 11.4 Primary Backtest | Workstream 1     | Accumulated Parquet | CRITICAL PATH             |
| 12. Sealed Holdout Verification    | Workstream 1     | Frozen Holdout Data | FINAL VALIDATION GATE     |
| 13. Production Go/No-Go Decision   | Master Project   | All Streams Pass    | FINAL GOVERNANCE GATE     |
+═════════════════════════════════════════════════════════════════════════════════════════════════════════+
```

### The Critical Path
The primary constraint of the entire project is the **empirical validation of Strategy 11.4**. Because historical REST data cannot supply the required quotes and Greeks, the critical path runs directly through the collector:

$$\text{Owner Approval} \longrightarrow \text{Collector Build} \longrightarrow \text{Passive Observation} \longrightarrow \text{Streaming Accumulation} \longrightarrow \text{Strategy 11.4 Validation} \longrightarrow \text{Production Review}$$

Any delay in authorizing the collector or gathering streaming market sessions directly extends the project timeline. Conversely, Workstream 2 (Stock Monitoring and Ledger Recovery) can proceed entirely in parallel without blocking or being blocked by the collector.

---

## 5. Engineering Execution Roadmap (12 Detailed Phases)

The remaining engineering work is structured into twelve discrete, sequential, and parallelizable phases:

```
+─────────────────────────────────────────────────────────────────────────────────────────────────────────+
| ENGINEERING ROADMAP TIMELINE & PHASING                                                                  |
|                                                                                                         |
|  [PHASE 1: Governance & Owner Approvals]                                                                |
|      │                                                                                                  |
|      ├──────────────────────────────────────────────┬──────────────────────────────────────────┐        |
|      ▼                                              ▼                                          ▼        |
|  [PHASE 2: Vendor Clarification]            [PHASE 3: Workstream 2 Hardening]        [PHASE 4: Collector Build|
|  - Submit questionnaire                     - Ledger crash recovery                  - Core daemon engine     |
|  - Upstox API team engagement               - Monotonic event sequencing             - Proto3 pipeline        |
|      │                                      - SQLite dry-run audit                   - Sharding manager       |
|      │                                              │                                          │        |
|      ▼                                              │                                          ▼        |
|  [PHASE 5: Offline Stress Testing]                  │                                [PHASE 6: WS3 Reliability|
|  - Injected socket failures                         │                                - Parquet writer bridge  |
|  - Ring buffer overflow simulation                  │                                - Freshness integration  |
|      │                                              │                                          │        |
|      └──────────────────────────────────────────────┴──────────────────────────────────────────┘        |
|                                                     │                                                   |
|                                                     ▼                                                   |
|                                     [PHASE 7: Passive Observation Mode]                                 |
|                                     - Non-blocking live streaming trial                                 |
|                                     - Empirical latency & spread logging                                |
|                                                     │                                                   |
|                                                     ▼                                                   |
|                                     [PHASE 8: Empirical Calibration]                                    |
|                                     - Evaluate p50/p95/p99 distributions                                |
|                                     - Establish verified gating thresholds                              |
|                                                     │                                                   |
|                                                     ▼                                                   |
|                                     [PHASE 9: Streaming Data Accumulation]                              |
|                                     - 30–60 session forward Parquet archive                             |
|                                     - Daily HashedUniverseManifest verification                         |
|                                                     │                                                   |
|                                                     ▼                                                   |
|                                     [PHASE 10: Ingestion Bus Integration]                               |
|                                     - Parquet-to-Strategy replay pipeline                               |
|                                     - Deterministic tick replay engine                                  |
|                                                     │                                                   |
|                                                     ▼                                                   |
|                                     [PHASE 11: Strategy 11.4 Primary Validation]                        |
|                                     - Walk-forward backtest on observed quotes                          |
|                                     - Uncompromised sealed holdout evaluation                           |
|                                                     │                                                   |
|                                                     ▼                                                   |
|                                     [PHASE 12: Production Readiness Verification]                       |
|                                     - Final scorecard review & release sign-off                         |
+─────────────────────────────────────────────────────────────────────────────────────────────────────────+
```

---

### Phase 1: Architecture Sign-Off & Governance Decisions
* **Objective:** Formal owner sign-off on collector architecture and open governance gates.
* **Workstream:** Governance / All Streams.
* **Tasks:**
  1. Owner review of `COLLECTOR_FINAL_ARCHITECTURE_AUDIT_REPORT.md`.
  2. Determination on Decision Gates 1, 2, 3, and 4.
* **Deliverables:** Signed decision record in `web/docs/COLLECTOR_OWNER_DECISION_RECORD.md`.
* **Acceptance Criteria:** Explicit approval/rejection recorded for all four gates.
* **Estimated Effort:** 1–2 hours (Owner review).

---

### Phase 2: Upstox Vendor Clarification & Questionnaire Closure
* **Objective:** Obtain written broker clarification on the 6 critical capacity and modeling items.
* **Workstream:** Provider Integration.
* **Tasks:**
  1. Owner submits `UPSTOX_SUPPORT_TECHNICAL_QUESTIONNAIRE.md` to `api-support@upstox.com`.
  2. Log ticket ID and track broker engineering response.
  3. Reconcile broker answers against configuration defaults.
* **Deliverables:** `web/docs/UPSTOX_VENDOR_CONFIRMATION_LOG.md`.
* **Acceptance Criteria:** Binding answers received for socket limits, conflation intervals, and Greeks conventions.
* **Estimated Effort:** 1 hour administrative dispatch; 2–5 business days vendor latency.

---

### Phase 3: Workstream 2 Hardening — Paper Ledger Crash Recovery
* **Objective:** Implement durable, crash-resilient event sourcing for the paper trading ledger.
* **Workstream:** Workstream 2 (Stock Monitoring & Recovery).
* **Tasks:**
  1. Update `PaperTradeEvent` schema with `eventId` (UUID), `sequenceNumber`, and `ledgerVersion`.
  2. Implement crash-recovery reader in `src/lib/services/paperLedgerStore.ts`:
     - Scan for orphaned `.tmp-*` files on startup.
     - Detect inconsistencies between `trades.json` and `events.jsonl`.
     - Automatic rollback/forward-replay from `trades.json.bak`.
  3. Author comprehensive recovery test suite (`paperCrashRecovery.test.ts`).
* **Deliverables:** Updated `paperLedgerStore.ts`, new test suite.
* **Acceptance Criteria:** 100% pass across simulated kill -9 scenarios during write operations.
* **Estimated Effort:** 8–12 engineering hours.

---

### Phase 4: Collector Core Implementation (Offline Engine)
* **Objective:** Build the decoupled market data collector daemon and Proto3 decoding engine.
* **Workstream:** Collector Architecture / Workstream 3.
* **Tasks:**
  1. Scaffold independent collector process (`web/src/collector/` or dedicated CLI runner).
  2. Implement Module 1 (Dynamic Instrument Master Ingestion & `HashedUniverseManifest`).
  3. Implement Module 2 (Strict Secret Boundary & POSIX `0600` Token Isolation).
  4. Implement Module 3 & 4 (WebSocket Connection Pool & Configurable Sharding Manager).
  5. Implement Module 5 (Protobuf Decoding & Event Normalization via `MarketDataFeed.proto`).
* **Deliverables:** Collector daemon source code, configuration interfaces.
* **Acceptance Criteria:** Collector compiles cleanly; decodes offline mock binary streams with zero drops.
* **Required Tests:** Ingest existing 51 test cases from `wsClient.test.ts`.
* **Estimated Effort:** 15–20 engineering hours.

---

### Phase 5: Offline Stress Testing & Failure Injection Suite
* **Objective:** Validate collector robustness under extreme simulated network collapse and memory pressure.
* **Workstream:** Collector Architecture.
* **Tasks:**
  1. Build mock WebSocket server supporting configurable tick conflation, dropped frames, and zombie stalls.
  2. Simulate Failure Mode 4 (1.5 GB memory ring buffer overflow $\implies$ verify 3-stage degradation and drop accounting).
  3. Simulate Failure Mode 5 (Silent feed stall with responsive ping/pong $\implies$ verify diagnostic reconnect).
  4. Simulate Failure Mode 7 (Consecutive trades matching price/size $\implies$ verify `POSSIBLE_RETRANSMISSION` retention).
* **Deliverables:** `web/src/collector/__tests__/collectorStress.test.ts`.
* **Acceptance Criteria:** Zero unhandled exceptions; all 12 failure modes pass cleanly in simulation.
* **Estimated Effort:** 10–14 engineering hours.

---

### Phase 6: Storage Engine & Option-Chain Reliability Integration
* **Objective:** Implement append-only Parquet writer and integrate stream reliability with the analyzer.
* **Workstream:** Workstream 3 & Collector.
* **Tasks:**
  1. Implement Module 9 (`parquetStore.ts`): daily partitioned writing, Snappy compression, `MANIFEST.jsonl` generation, and `chmod 0444` post-session finalization.
  2. Implement non-blocking telemetry exporter (Module 11).
  3. Connect collector health state broadcasts to the web analyzer's `DataStatus` indicators.
* **Deliverables:** Parquet storage module, dashboard bridge.
* **Acceptance Criteria:** Parquet files validate cleanly via Apache Arrow; SHA-256 hashes match manifest.
* **Estimated Effort:** 10–12 engineering hours.

---

### Phase 7: Controlled Passive Observation Mode (Live Trial)
* **Objective:** Execute supervised, non-blocking market data collection during live trading hours.
* **Workstream:** Collector Architecture / Live Ops.
* **Dependencies:** Requires Phase 1 (Decision 2 approval) and Phase 2 (vendor confirmation).
* **Tasks:**
  1. Run collector in `PASSIVE_OBSERVE` mode during active market hours (09:15–15:30 IST).
  2. Stream target universe (~128 to 252 keys across NIFTY and BANKNIFTY).
  3. Record empirical transport latency, quote arrival intervals, and bid/ask spread percentiles.
  4. Zero order placement; zero trade filtering.
* **Deliverables:** Empirical telemetry logs across 10–15 market sessions.
* **Acceptance Criteria:** Continuous collection across full session without process crashes or memory leaks.
* **Estimated Effort:** 10–15 sessions (passive monitoring; ~10 engineering hours for supervision and log audit).

---

### Phase 8: Data-Quality Analysis & Threshold Calibration
* **Objective:** Transition from heuristic proposals to empirically verified data-quality thresholds.
* **Workstream:** Workstream 1 & Workstream 3.
* **Tasks:**
  1. Analyze recorded p50, p95, and p99 percentiles for quote freshness, Greek recalculation cadence, and transport delay.
  2. Calibrate verified gating rules (e.g. replace provisional 2.0s quote age with empirical p99 cutoff).
  3. Formal owner sign-off on calibrated gating rules.
* **Deliverables:** `web/docs/EMPIRICAL_DATA_QUALITY_CALIBRATION_REPORT.md`.
* **Acceptance Criteria:** Gating thresholds backed by $N > 1,000,000$ empirical live ticks.
* **Estimated Effort:** 6–8 engineering hours.

---

### Phase 9: Long-Horizon Streaming Data Accumulation
* **Objective:** Build an uncompromised, high-fidelity quantitative research archive of live market sessions.
* **Workstream:** Workstream 1 (Options Research).
* **Tasks:**
  1. Daily automated collection across 30 to 60 consecutive trading sessions.
  2. Verify daily `HashedUniverseManifest` and session manifests (`MANIFEST.jsonl`).
  3. Maintain complete gap audit; flag any session with dropped frames as `PARTIAL_DATA_SESSION`.
* **Deliverables:** 30–60 session days of raw tick, depth, and Greek Parquet archives.
* **Acceptance Criteria:** Minimum 30 uncompromised `COMPLETE` market sessions accumulated.
* **Estimated Effort:** 6–12 calendar weeks (daily operational health checks: ~15 mins/day).

---

### Phase 10: Ingestion Bus & Replay Interface Integration
* **Objective:** Connect the Parquet research archive to Strategy 11.4 backtesting engines.
* **Workstream:** Workstream 1.
* **Tasks:**
  1. Implement Module 12 (Deterministic Tick Replay Engine).
  2. Replay Parquet sessions in exact monotonic sequence (`localReceiptMonoNs`).
  3. Stream replayed events directly into Strategy 11.4's 09:30 decision window evaluator.
* **Deliverables:** `web/src/lib/research/parquetReplayEngine.ts`.
* **Acceptance Criteria:** Two consecutive replays of the same session produce bit-identical strategy signals.
* **Estimated Effort:** 12–16 engineering hours.

---

### Phase 11: Strategy 11.4 Primary Execution & Holdout Validation
* **Objective:** Rigorous statistical backtesting and uncompromised holdout out-of-sample evaluation.
* **Workstream:** Workstream 1.
* **Tasks:**
  1. Execute walk-forward optimization across accumulated training sessions using real observed spreads.
  2. Evaluate profit factor, Sharpe ratio, maximum drawdown, and capital feasibility under 1% risk rule.
  3. Unseal the frozen holdout dataset and execute one single, uncompromised holdout evaluation.
* **Deliverables:** `web/docs/STRATEGY_11_4_FAITHFUL_VALIDATION_REPORT.md`.
* **Acceptance Criteria:** Strategy meets or fails predefined quantitative criteria without post-hoc curve fitting.
* **Estimated Effort:** 15–20 engineering hours.

---

### Phase 12: Master Production Readiness & Go/No-Go Verification
* **Objective:** Definitive multi-workstream readiness audit prior to any live capital deployment.
* **Workstream:** Master Project Governance.
* **Tasks:**
  1. Full application security audit (dependencies, token lifecycles, route authentication).
  2. End-to-end disaster recovery drill.
  3. Reconcile master scorecard: Application Engineering, Strategy Validation, Production Readiness.
  4. Submit final release recommendation to project owner.
* **Deliverables:** `web/docs/MASTER_PRODUCTION_RELEASE_ACCEPTANCE_REPORT.md`.
* **Acceptance Criteria:** Unanimous PASS across all regulatory, quantitative, and engineering dimensions.
* **Estimated Effort:** 8–10 engineering hours.

---

## 6. Timeline, Effort Estimates & Underlying Assumptions

### 6.1 Estimated Engineering Effort by Milestone

```
+═════════════════════════════════════════════════════════════════════════════════════════════════════════+
| TIMELINE & EFFORT ESTIMATE SUMMARY                                                                      |
+----+----------------------------------------------+--------------------+--------------------------------+
| #  | Engineering Milestone                        | Engineering Effort | Calendar Duration              |
+----+----------------------------------------------+--------------------+--------------------------------+
| M1 | Governance Sign-Off & Questionnaire Dispatch  | 2–3 hours          | 1–3 business days (Owner/API)  |
| M2 | Workstream 2 Ledger Crash Recovery Hardening | 8–12 hours         | 1–2 calendar weeks             |
| M3 | Collector Daemon & Proto3 Pipeline Build     | 15–20 hours        | 2–3 calendar weeks             |
| M4 | Offline Stress Testing & Failure Simulation  | 10–14 hours        | 1–2 calendar weeks             |
| M5 | Storage Engine & Analyzer Reliability Bridge | 10–12 hours        | 1–2 calendar weeks             |
| M6 | Controlled Passive Observation Mode          | 10 hours (superv.) | 10–15 market sessions (3 weeks)|
| M7 | Data-Quality Calibration & Gating Rules      | 6–8 hours          | 1 calendar week                |
| M8 | High-Fidelity Data Accumulation              | 15 hours (ops)     | 30–60 market sessions (6–12 wks|
| M9 | Ingestion Bus & Deterministic Replay Engine  | 12–16 hours        | 2 calendar weeks               |
| M10| Strategy 11.4 Primary Validation & Holdout   | 15–20 hours        | 2–3 calendar weeks             |
| M11| Master Production Readiness Review           | 8–10 hours         | 1 calendar week                |
+----+----------------------------------------------+--------------------+--------------------------------+
|    | TOTAL ACTIVE ENGINEERING TIME                | 111–140 HOURS      | ~16–22 CALENDAR WEEKS          |
+═════════════════════════════════════════════════════════════════════════════════════════════════════════+
```

### 6.2 Key Assumptions Governing Estimates
1. **Developer Availability:** Assumes part-time engineering allocation of approximately 10–15 hours per week.
2. **Market Hours Constraint:** Live observation and data accumulation are bounded by NSE market trading hours (09:15–15:30 IST, Monday to Friday, excluding exchange holidays). Calendar duration cannot be accelerated by adding developer hours.
3. **Upstox API Stability:** Assumes Upstox developer APIs remain operational without unannounced breaking Protobuf schema updates or token gateway outages.
4. **No Third-Party Purchases:** Assumes zero external data subscriptions (TrueData, FYERS, NSE Data); all data is sourced via existing Upstox accounts.

---

## 7. Comprehensive Risk & Governance Review

### 7.1 Five Critical Technical Blockers

```
+═════════════════════════════════════════════════════════════════════════════════════════════════════════+
| TOP FIVE TECHNICAL BLOCKERS & MITIGATIONS                                                               |
+----+-----------------------------------+--------------------------------+-------------------------------+
| #  | Critical Blocker Description      | Impact on Project              | Engineering Mitigation        |
+----+-----------------------------------+--------------------------------+-------------------------------+
| 1  | Historical REST Quotes Void       | Strategy 11.4 cannot be        | Build WebSocket collector to  |
|    | (No bid/ask or Greeks in candles) | backtested retrospectively.    | capture forward streaming.    |
+----+-----------------------------------+--------------------------------+-------------------------------+
| 2  | Upstox Schema Lacks Sequence IDs  | Subscriber-side deduplication  | Preserves ambiguous duplicate |
|    | (No matching engine sequence nos) | is strictly heuristic.         | events with POSSIBLE_RETRANSM.|
+----+-----------------------------------+--------------------------------+-------------------------------+
| 3  | BANKNIFTY Pre-June 2025 Void      | Historical candle queries      | Bound BANKNIFTY research to   |
|    | (Empty arrays for older candles)  | return count: 0.               | post-June 2025 (Decision 4).  |
+----+-----------------------------------+--------------------------------+-------------------------------+
| 4  | Unconfirmed Account Socket Limits | Multi-socket sharding limits   | Configurable sharding design; |
|    | (1,500 vs 2,000 keys unknown)     | are unverified by broker.      | submit support questionnaire. |
+----+-----------------------------------+--------------------------------+-------------------------------+
| 5  | Unverified Live Greeks Model      | Broker interest rate, model,   | Log UPSTOX_SUPPLIED provenance|
|    | ($r, q, spot/fut ref unstated)    | and day-count convention unprov| submit technical inquiry.     |
+═════════════════════════════════════════════════════════════════════════════════════════════════════════+
```

### 7.2 Security & Operational Integrity Risks
- **Secret Handling:** Plaintext tokens in memory heap are minimized; POSIX `0600` protects credentials on disk; regex scrubbing on logs.
- **Root Modification Boundary:** POSIX `0444` protects finalized Parquet files against accidental clobbering, but not against superuser manipulation. Tamper evidence is guaranteed via SHA-256 manifests.
- **Execution Safeguard:** `hasMockInput()` unconditionally blocks mock or fallback snapshots from generating executable trade recommendations.

---

## 8. Summary of Required Owner Actions & Decisions

To transition from architectural planning to engineering execution, the project owner must review and act on the following:

1. **Architecture Approval:** Formally approve [`COLLECTOR_FINAL_ARCHITECTURE_AUDIT_REPORT.md`](file:///Users/webanatomy/Desktop/upstox_analyzer%20(2)/web/docs/COLLECTOR_FINAL_ARCHITECTURE_AUDIT_REPORT.md).
2. **Decision Gate 1 (Questionnaire Dispatch):** Approve sending [`UPSTOX_SUPPORT_TECHNICAL_QUESTIONNAIRE.md`](file:///Users/webanatomy/Desktop/upstox_analyzer%20(2)/web/docs/UPSTOX_SUPPORT_TECHNICAL_QUESTIONNAIRE.md) to `api-support@upstox.com`.
3. **Decision Gate 2 (Passive Observation):** Approve future non-blocking observation trials.
4. **Decision Gate 3 (Acceptance Criteria):** Approve Core ATM ($\pm 3$) mandatory vs Outer Wings ($\pm 15$) partial tolerance.
5. **Decision Gate 4 (Historical Boundary):** Approve bounding BANKNIFTY historical backtests to post-June 2025.
6. **Roadmap Sign-Off:** Review and authorize Phase 3 (Ledger Crash Recovery) and Phase 4 (Collector Core Build) to begin offline.

---

## 9. Final Safety & Safe-State Confirmation

| Verification Check | Required State | Actual Empirical State | Status |
| :--- | :--- | :--- | :---: |
| **Source Code Modifications** | Strictly Zero | Exactly 0 source files created or modified | **PASS** |
| **Live Upstox API Requests** | Strictly Zero | Exactly 0 network requests executed | **PASS** |
| **Authentication / Tokens** | Strictly Zero | Zero tokens refreshed or generated | **PASS** |
| **WebSocket Connections** | Strictly Zero | Zero connections dialed or subscribed | **PASS** |
| **Schedulers / Background Daemons** | Inert / Unloaded | `com.upstox.paperlive` remains unloaded | **PASS** |
| **Trading Orders (Live / Paper)** | Strictly Zero | Exactly 0 orders placed | **PASS** |
| **Strategy 11.4 Formulas & Risk** | Frozen | Unchanged; 1% risk limit intact | **PASS** |
| **Sealed Holdouts** | Unopened | All holdout datasets remain sealed | **PASS** |
| **Protected Evidence Archive** | 13/13 SHA-256 Valid | Verified OK against `MANIFEST.sha256` | **PASS** |
| **Git Working Tree** | Clean Index | Zero staged changes; existing user work preserved | **PASS** |
| **Ports 3150 and 3123** | Free | Verified via `lsof`: Both ports completely free | **PASS** |
