# Upstox Market Data Collector — Final Architecture Audit & Owner Approval Preparation Report

**Document Reference:** `web/docs/COLLECTOR_FINAL_ARCHITECTURE_AUDIT_REPORT.md`  
**Author:** Quantitative Systems Engineering Agent  
**Date:** November 16, 2026  
**Audit Mode:** STRICT DOCUMENTATION-ONLY AUDIT (Zero code implementation, zero live API calls, zero orders)  
**Strategy Alignment:** Strategy 11.4 Formulas and 1.0% Risk Limit FROZEN  
**Production Readiness:** STRICT HARD NO-GO (11.25% — Architecture specification stage only)

---

## 1. Audit Scope & Operational Boundaries

This audit constitutes the definitive architectural review of the proposed Upstox Market Data Collector prior to formal project owner sign-off. The scope is strictly bounded to validating the completeness, consistency, mathematical realism, and technical honesty of the collector architecture specifications.

### Operational Boundaries Observed:
1. **Zero Source-Code Modifications:** No application or collector source code was created, staged, or altered.
2. **Zero Live Upstox API Invocations:** No REST endpoints were queried; no tokens were generated or refreshed; no WebSocket connections were dialed; no subscriptions were initiated.
3. **Zero Scheduler / Background Daemon Activation:** LaunchAgents, cron jobs, and background workers remain strictly inert; `com.upstox.paperlive` remains unloaded.
4. **Zero Trading Activity:** No live or paper orders were generated, staged, or executed.
5. **Zero External Communication:** No questionnaires or emails were transmitted to Upstox support or external data providers.
6. **Strategy Preservation:** Strategy 11.4 parameters (0.16–0.22 short delta, 0.05–0.08 long delta, 5% max spread, 1% risk ceiling) remain completely unaltered.
7. **Protected Archive Immutability:** All 13 protected research evidence files remain bit-for-bit identical to their SHA-256 manifests.

---

## 2. Files Inspected & Updated

### Permitted Documents Inspected:
1. [`web/docs/COLLECTOR_ARCHITECTURE_SPECIFICATION.md`](file:///Users/webanatomy/Desktop/upstox_analyzer%20(2)/web/docs/COLLECTOR_ARCHITECTURE_SPECIFICATION.md)
2. [`web/docs/COLLECTOR_DATA_SCHEMA.md`](file:///Users/webanatomy/Desktop/upstox_analyzer%20(2)/web/docs/COLLECTOR_DATA_SCHEMA.md)
3. [`web/docs/COLLECTOR_FAILURE_AND_RECOVERY_DESIGN.md`](file:///Users/webanatomy/Desktop/upstox_analyzer%20(2)/web/docs/COLLECTOR_FAILURE_AND_RECOVERY_DESIGN.md)
4. [`web/docs/COLLECTOR_OPEN_DECISIONS.md`](file:///Users/webanatomy/Desktop/upstox_analyzer%20(2)/web/docs/COLLECTOR_OPEN_DECISIONS.md)
5. [`web/docs/COLLECTOR_ARCHITECTURE_CORRECTION_REPORT.md`](file:///Users/webanatomy/Desktop/upstox_analyzer%20(2)/web/docs/COLLECTOR_ARCHITECTURE_CORRECTION_REPORT.md)
6. [`web/docs/UPSTOX_SUPPORT_TECHNICAL_QUESTIONNAIRE.md`](file:///Users/webanatomy/Desktop/upstox_analyzer%20(2)/web/docs/UPSTOX_SUPPORT_TECHNICAL_QUESTIONNAIRE.md)
7. [`web/docs/UPSTOX_HISTORICAL_DATA_VERIFICATION.md`](file:///Users/webanatomy/Desktop/upstox_analyzer%20(2)/web/docs/UPSTOX_HISTORICAL_DATA_VERIFICATION.md)

### Permitted Documents Updated During This Audit:
- `web/docs/COLLECTOR_ARCHITECTURE_SPECIFICATION.md`: Updated Section 3 (Module 1, 3, 5, 9), Section 4, and Section 5.
- `web/docs/COLLECTOR_DATA_SCHEMA.md`: Updated `BaseEventHeader`, `ConnectionStatusEvent`, added `HashedUniverseManifest` and Section 3.1.
- `web/docs/COLLECTOR_FAILURE_AND_RECOVERY_DESIGN.md`: Updated Failure Modes 5, 7, and 9.
- `web/docs/COLLECTOR_OPEN_DECISIONS.md`: Expanded Section 4 detailing the four owner decisions.
- `web/docs/COLLECTOR_ARCHITECTURE_CORRECTION_REPORT.md`: Synchronized manifest terminology and recipient references.
- `web/docs/UPSTOX_SUPPORT_TECHNICAL_QUESTIONNAIRE.md`: Synchronized recipient address to `api-support@upstox.com` and added inquiry on sequence numbers/heartbeats.

---

## 3. Remaining Technical Weaknesses Identified

Prior to this final audit pass, four critical technical ambiguities and unsupported guarantees remained embedded in the documentation:

1. **Conflation of Transport Health with Market-Data Feed Health:**
   - *Weakness:* The architecture previously assumed that a responsive WebSocket ping/pong round-trip guaranteed that market data was actively flowing.
   - *Technical Reality:* An edge proxy, reverse proxy, or API gateway can respond to TCP and WebSocket ping frames with sub-millisecond latency while the upstream market data ticker plant or matching engine distributor is frozen, deadlocked, or stalled.
2. **Unsupported Deduplication Claims in the Absence of Sequence Numbers:**
   - *Weakness:* Earlier drafts included formulas referencing `sequenceNumber = cachedSeq` and claimed deterministic deduplication.
   - *Technical Reality:* Upstox `MarketDataFeed.proto` contains **no packet sequence IDs, no matching engine sequence numbers, and no unique trade transaction IDs**. Deduplication is strictly heuristic, and aggressive filtering risks destroying genuine trade volume where multiple market orders match at the identical price and size.
3. **Overstated Filesystem Immutability ("Tamper-Proof"):**
   - *Weakness:* POSIX mode `0444` and `MANIFEST.jsonl` were described using terms like "tamper-proof immutability."
   - *Technical Reality:* `chmod 0444` is accidental-write protection. Any process running under the same user UID can execute `chmod u+w` and alter files; root users bypass POSIX modes entirely.
4. **Ambiguous Manifest Terminology ("Signed UniverseManifest"):**
   - *Weakness:* The documentation referred to a "signed UniverseManifest" when only SHA-256 content hashing was specified, implying digital cryptographic signatures (e.g. Ed25519) that were never defined or implemented.

---

## 4. Corrections Made

| Area / Module | Previous Wording / Design | Corrected Architectural Specification |
| :--- | :--- | :--- |
| **Manifest Terminology** | "Output a signed `UniverseManifest`" | Renamed to **`HashedUniverseManifest`** (SHA-256 verified content digest). Cryptographic digital signing (Ed25519) documented as an unapproved future enhancement. |
| **Reproducibility Schema** | Only listed expected count, resolved count, and status. | Specified all 14 reproducibility fields: `masterSource`, `masterRetrievalDate`, `masterContentSha256`, `selectionRuleVersion`, `calendarReference`, `marketSessionDate`, `selectedExpiries`, `atmReference`, `selectedContracts`, `expectedKeysCount`, `resolvedKeysCount`, `missingKeys`, `universeStatus`, `manifestHash`. |
| **Missing Contract Thresholds** | Vague partial tolerance. | Formally partitioned: **Core ATM Strikes (ATM $\pm 3$) + Futures** are mandatory (`INVALID` if missing); **Outer Wings ($\pm 4$ to $\pm 15$)** are non-fatal (`PARTIAL` if unlisted). |
| **Transport vs Feed Health** | Single watchdog based on ping/pong. | Established **6 explicit operational states** and decoupled transport connectivity from data-flow stall detection. |
| **Deduplication Logic** | Formula assumed `sequenceNumber` existed; candidate duplicates dropped. | Confirmed absence of sequence numbers in `MarketDataFeed.proto`. Candidate duplicates are **preserved** in the raw dataset with `POSSIBLE_RETRANSMISSION` quality flag; consecutive trades preserved unconditionally. |
| **Storage Security & Threat Model** | Described as "tamper-proof". | Codified a **5-level taxonomy** (accidental-write, integrity, tamper evidence, cryptographic authenticity, privileged modification) and established an explicit Threat Model. |
| **Support Email Address** | Listed only `api@upstox.com`. | Synchronized to **`api-support@upstox.com`** (with `api@upstox.com` as secondary/cc). |

---

## 5. Five Mandatory Audit Areas & Outcomes

### Area A: WebSocket Transport Health vs. Market-Data Health
* **Audit Finding:** The previous architecture conflated socket reachability with data flow.
* **Outcome:** **PASS WITH SPECIFICATION UPGRADE**.
* **Six Explicit Health States Defined:**
  1. `STATE_TRANSPORT_HEALTHY_DATA_FLOWING`: Physical TCP/TLS open, protocol ping/pong active, live protobuf market data frames arriving at expected frequency.
  2. `STATE_TRANSPORT_HEALTHY_DATA_STALLED`: Physical TCP/TLS open, protocol ping/pong responding, but **zero market data frames** received across all assigned instruments for $> 15\text{--}30\text{ s}$ during active market hours (09:15–15:30 IST) while index spot/futures are actively trading.
  3. `STATE_TRANSPORT_UNHEALTHY`: Socket closed, TCP reset, TLS failure, or protocol ping timed out ($> 5,000\text{ ms}$) without pong response.
  4. `STATE_SUBSCRIPTION_PARTIALLY_REJECTED`: Socket open and healthy, but broker gateway rejected specific requested instrument keys.
  5. `STATE_MARKET_CLOSED_OR_HALTED`: Normal state outside 09:15–15:30 IST or during exchange trading halts; watchdog reconnects inhibited.
  6. `STATE_INDIVIDUAL_CONTRACT_INACTIVE`: Connection healthy, feed flowing, but an individual illiquid contract has zero updates (normal options microstructure; never triggers reconnect).
* **Feed-Wide Stall Detection Mechanism:**
  The collector maintains `lastMarketDataMessageMonoNs` across all assigned keys. If this timer exceeds `feedSilenceWatchdogMs` during active hours:
  1. A protocol `ping` is dispatched.
  2. If `pong` arrives within 5,000 ms, the system recognizes a **silent data freeze** (`STATE_TRANSPORT_HEALTHY_DATA_STALLED`).
  3. If silence persists beyond 45s, a diagnostic socket reconnect is forced to re-establish the upstream subscription pipeline.
  4. The outage is permanently recorded as `FEED_STALL_GAP` in `MANIFEST.jsonl`.
  - *Provider Heartbeat Guarantee*: **`PROVIDER CONFIRMATION REQUIRED / UNVERIFIED`**.

---

### Area B: Event Identity & Deduplication
* **Audit Finding:** Upstox Proto3 schema (`MarketDataFeed.proto`) was re-inspected. It contains **no sequence numbers, no packet IDs, and no unique trade event IDs**.
* **Outcome:** **PASS WITH LIMITATIONS (Heuristic Enacted)**.
* **Heuristic Deduplication Rules:**
  1. **Consecutive Legitimate Trades Protected:** In high-volume index options, multiple distinct market orders execute at the identical price and lot size within the same millisecond. The collector **must NEVER filter or discard trades** purely based on matching `(price, size)`.
  2. **Timestamp Ambiguity:** Provider gateway timestamps (`feedServerTs` / `FeedResponse.currentTs`) are integer milliseconds epoch and identical across all feeds in a decoded batch. `lastTradeTs` (`ltt`) changes only when a trade executes. Quote and market depth changes have no independent timestamps (`quoteSourceTs: "UNKNOWN"`).
  3. **Preservation of Ambiguous Duplicates:** An event is treated as an ambiguous duplicate candidate if and only if:
     $$\text{instrumentKey} = \text{cachedKey} \;\land\; \text{feedServerTs} = \text{cachedServerTs} \;\land\; \text{lastTradeTs} = \text{cachedTradeTs} \;\land\; \text{depthState} = \text{cachedDepthState}$$
  4. **Non-Destructive Principle:** Ambiguous duplicate events are **preserved in the raw Parquet store** and tagged with the quality flag **`POSSIBLE_RETRANSMISSION`**.
  5. **No False Perfection:** The architecture explicitly disclaims perfect deduplication until Upstox supplies upstream sequence identifiers (`PROVIDER CONFIRMATION REQUIRED`).

---

### Area C: File Integrity vs. Actual Immutability
* **Audit Finding:** POSIX `chmod 0444` and SHA-256 manifests provide write-protection against accidents and bit-rot, but not protection against privileged or adversarial actors.
* **Outcome:** **PASS (Taxonomy & Threat Model Enacted)**.
* **Five-Level Integrity Taxonomy:**
  1. *Accidental-Write Protection*: POSIX mode `0444` applied at session close prevents unprivileged software bugs, collector restarts, or local scripts from overwriting completed Parquet partitions.
  2. *File-Integrity Verification*: SHA-256 hashes recorded in `MANIFEST.jsonl` detect storage bit-rot, incomplete file transfers, and write truncations before downstream ingestion.
  3. *Tamper Evidence*: Comparing file digests against the manifest reveals unauthorized modifications.
  4. *Cryptographic Authenticity*: Digital signatures proving origin are an unapproved future enhancement (not currently implemented).
  5. *Protection Against Privileged Modification*: POSIX `chmod 0444` **DOES NOT protect against root or privileged users** modifying files. The architecture guarantees accidental-write protection and tamper evidence, not tamper-proof immutability against privileged actors.
* **Threat Model Boundaries:**
  - *In-Scope (Guaranteed)*: Accidental file overwrites, process race conditions, disk bit-rot, write truncations, unprivileged script clobbering.
  - *Out-of-Scope (Not Guaranteed)*: Root/superuser privilege escalation, intentional workspace owner tampering, compromised host OS, physical storage seizure.
  - *Strict Boundary*: No cloud storage, paid object locks, or external infrastructure without owner authorization.

---

### Area D: Manifest Signing & Reproducibility
* **Audit Finding:** The previous term "signed UniverseManifest" was inaccurate because only SHA-256 content hashing was specified.
* **Outcome:** **PASS (Renamed to `HashedUniverseManifest` & Fully Specified)**.
* **Cryptographic Signing (Unapproved Future Option):**
  - *Algorithm*: Ed25519 (RFC 8032) or ECDSA P-256.
  - *Key Management*: Private key generated offline; stored in OS Keychain / secure enclave; accessible only by collector service account (`0400`); public key embedded in research suite.
  - *Rotation & Recovery*: Annual key rotation schedule with 30-day dual-verification grace period.
  - *Verification Procedure*: Downstream ingestion scripts verify `MANIFEST.jsonl.sig` against the trusted public key before loading Parquet data into backtest engines.
  - *Failure Behavior*: Verification failure immediately flags session as `UNAUTHENTICATED_UNTRUSTED_SESSION` and aborts quantitative model training.
  - *Current Status*: STRICTLY UNAPPROVED FUTURE OPTION.
* **Full Reproducibility Specification:**
  Every `HashedUniverseManifest` includes:
  1. `masterSource`: Ingested instrument master source (e.g. `complete.csv.gz`).
  2. `masterRetrievalDate`: ISO-8601 download timestamp.
  3. `masterContentSha256`: SHA-256 digest of the ingested master file.
  4. `selectionRuleVersion`: Universe selection rule version (e.g. `v1.2-nifty-weekly-banknifty-monthly`).
  5. `calendarReference`: Regulatory calendar reference (NSE Circular `NSE/FAOP/64506`).
  6. `marketSessionDate`: Session date (`YYYY-MM-DD`).
  7. `selectedExpiries`: Array of selected expiry dates for NIFTY (weekly) and BANKNIFTY (monthly).
  8. `atmReference`: Method and reference price timestamp used to establish ATM strike.
  9. `selectedContracts`: Full array of resolved contract descriptors (key, token, strike, type, lot size).
  10. `expectedKeysCount`: $N_{\text{expected}}$.
  11. `resolvedKeysCount`: $N_{\text{resolved}}$.
  12. `missingKeys`: Specific strikes/legs not found in master.
  13. `universeStatus`: `COMPLETE`, `PARTIAL`, or `INVALID`.
  14. `manifestHash`: SHA-256 digest of the canonical JSON string of this manifest.

---

### Area E: Dynamic Universe, Contract Selection & Acceptance Criteria
* **Audit Finding:** Hardcoded key counts violate exchange regulatory realities and dynamic listing schedules.
* **Outcome:** **PASS (Dynamic Model & Partitioned Acceptance Criteria Enacted)**.
* **Regulatory Realignment:**
  - NSE Circular `NSE/FAOP/64506` dated October 10, 2024 discontinued BANKNIFTY weekly index options after November 13, 2024.
  - Contract selection dynamically resolves:
    - **NIFTY 50**: Front weekly + next weekly (or monthly when coinciding).
    - **BANK NIFTY**: Front monthly + next monthly (monthly cycle only).
  - Expiry dates are dynamically extracted from the daily instrument master each morning, never hardcoded.
* **Acceptance Criteria for Missing Contracts:**
  - **Core ATM Strikes (ATM $\pm 3$ strikes)** + Near-Month Futures: Essential for Strategy 11.4 delta selection and execution modeling. If any contract in this core tier is missing in the master $\implies$ Session **`INVALID`** (collector startup hard aborts).
  - **Outer Wings (ATM $\pm 4$ to $\pm 15$ strikes)**: Hedging and tail monitoring. If unlisted by exchange $\implies$ Session **`PARTIAL`** (collection proceeds with missing keys logged to manifest).
* **Count Distinctions:**
  - *Theoretical Formula*: $2 \times 2 \times 31 + 2 + 2 = 128$ keys.
  - *Provisional Planning Estimate*: 128 to 252 keys (accommodates historical 2-weekly configurations or wider wing listings).
  - *Resolved Runtime Universe*: Determined dynamically each morning from the master file.

---

## 6. Cross-Document Consistency Matrix

| Audit Dimension | Specification (`web/docs/COLLECTOR_ARCHITECTURE_SPECIFICATION.md`) | Data Schema (`web/docs/COLLECTOR_DATA_SCHEMA.md`) | Failure Design (`web/docs/COLLECTOR_FAILURE_AND_RECOVERY_DESIGN.md`) | Open Decisions (`web/docs/COLLECTOR_OPEN_DECISIONS.md`) | Questionnaire (`web/docs/UPSTOX_SUPPORT_TECHNICAL_QUESTIONNAIRE.md`) | Consistency Result |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **BANKNIFTY Expiries** | Monthly only (NSE/FAOP/64506) | Monthly only (NSE/FAOP/64506) | Monthly only (NSE/FAOP/64506) | Monthly only (Decision 1 & 17) | Questions 1 & 3 focus on monthly | **100% CONSISTENT** |
| **Manifest Terminology** | `HashedUniverseManifest` | `HashedUniverseManifest` | Hashed manifest & SHA-256 | `HashedUniverseManifest` | Neutral inquiry | **100% CONSISTENT** |
| **Health States** | 6 explicit states codified | `FeedTransportHealthState` (6 states) | Failure Mode 5 (6 states) | Watchdog heuristics configurable | Question Category 8 updated | **100% CONSISTENT** |
| **Deduplication Strategy** | Heuristic; preserves `POSSIBLE_RETRANSMISSION` | Section 3.1 & `qualityFlags` | Failure Mode 7 updated | Decision 2 & 14 aligned | Question Category 8 updated | **100% CONSISTENT** |
| **Storage Security** | 5-level taxonomy & Threat Model | Parquet append-only & SHA-256 | Failure Mode 9 updated | Decision 20 aligned | Question Category 12 aligned | **100% CONSISTENT** |
| **Missing Strike Gate** | Core ATM $\pm 3$ `INVALID`; wings `PARTIAL` | `tier: CORE_ATM \| OUTER_WING` | Failure Mode 3 aligned | Decision 3 detailed | N/A (Internal policy) | **100% CONSISTENT** |
| **Support Email** | `api-support@upstox.com` | N/A | N/A | `api-support@upstox.com` | `api-support@upstox.com` | **100% CONSISTENT** |

---

## 7. Verified Facts vs. Assumptions vs. Unresolved Provider Questions

```
+═════════════════════════════════════════════════════════════════════════════════════════════════════════+
| ARCHITECTURAL CERTAINTY MATRIX                                                                          |
+---------------------------------------+----------------------------------+------------------------------+
| VERIFIED FACTS (100% Proven)          | WORKING ASSUMPTIONS (Heuristics) | PROVIDER UNRESOLVED (Upstox) |
+---------------------------------------+----------------------------------+------------------------------+
| 1. Upstox Proto3 schema SHA-256 valid.| 1. 100 keys per socket chunking. | 1. Socket instrument limits  |
| 2. Proto lacks sequence numbers.      | 2. 3 concurrent account sockets. |    for full mode (1.5k vs 2k)|
| 3. BANKNIFTY weekly options abolished.| 3. 500 ms subscription stagger.  | 2. Max simultaneous sockets  |
| 4. Spot volume is permanently null.   | 4. 15–30s silence watchdog timer.|    per API key.              |
| 5. Historical candles tuple: 7 items  | 5. Core ATM strikes defined as   | 3. Server-side tick confla-  |
|    (OI at index 6, 7th value).        |    ATM ±3 strikes.               |    tion interval.            |
| 6. Pre-June-2025 BANKNIFTY candles    | 6. Blended 100–300 msgs/s        | 4. Greeks pricing parameters |
|    return empty arrays (count: 0).    |    steady-state tick rate.       |    (risk-free rate, model).  |
| 7. Modeled spread cannot substitute   | 7. 100–200 ms reorder buffer.    | 5. Historical expired candle |
|    observed bid/ask in Strat 11.4.    |                                  |    guaranteed retention.     |
+═════════════════════════════════════════════════════════════════════════════════════════════════════════+
```

---

## 8. Security & Integrity Limitations (Threat Model)

### What the Collector Storage Architecture CAN Guarantee:
1. **Accidental Clobber Protection:** Finalized Parquet partitions are protected by POSIX `0444` permissions, preventing accidental writes or script collisions.
2. **Bit-Rot & Transfer Truncation Detection:** SHA-256 hashes in `MANIFEST.jsonl` verify that files have not suffered disk corruption or truncated flushes prior to research replay.
3. **Tamper Evidence:** Any modification of a Parquet file after session closure produces a mismatched SHA-256 digest when validated against the session manifest ledger.
4. **Deterministic Universe Reproducibility:** Every session records the complete set of parameters and raw master hash required to reconstruct the exact instrument universe.

### What the Collector Storage Architecture CANNOT Guarantee:
1. **Protection Against Root / Privileged Users:** POSIX `0444` does not stop superusers or root processes from modifying files or altering permissions.
2. **Cryptographic Authenticity:** In the absence of an authorized asymmetric digital signing key (Ed25519), the system provides content integrity, not non-repudiation or origin authentication.
3. **Byzantine Fault Tolerance:** If the host system operating system or user account is compromised, files can be manipulated.
4. **Guaranteed Lossless Capture Under Infinite Stalls:** A bounded memory buffer (1.5 GB) cannot prevent dropped events if disk flush workers stall indefinitely.

---

## 9. Four Owner Decisions with Engineering Recommendations

### Decision 1: Dispatch of Technical Questionnaire to Upstox Support
* **Target:** `api-support@upstox.com` (cc: `api@upstox.com` / Developer Portal Support Ticket).
* **What Approval Means:** Authorizes the owner to submit the neutral inquiry in [`web/docs/UPSTOX_SUPPORT_TECHNICAL_QUESTIONNAIRE.md`](file:///Users/webanatomy/Desktop/upstox_analyzer%20(2)/web/docs/UPSTOX_SUPPORT_TECHNICAL_QUESTIONNAIRE.md) to obtain binding engineering answers for the 6 critical provider unknowns.
* **What It Does NOT Authorize:** Does NOT authorize automated email sending by agents; does NOT authorize purchasing data subscriptions; does NOT authorize testing live endpoints.
* **Risks & Limitations:** Broker support turnaround times vary (2–5 business days); Upstox may treat tick conflation intervals or internal Greeks algorithms as proprietary.
* **Technical Recommendation:** **APPROVE DISPATCH**. Essential to replace working assumptions with authoritative broker facts.
* **Additional Information Required:** None.

---

### Decision 2: Authorization of Passive Observation Mode for Controlled Initial Trials
* **What Approval Means:** Approves configuring the future collector to run in non-blocking observability mode initially, recording transit latency, quote inter-arrival percentiles, and spread distributions without rejecting trades or dropping signals.
* **What It Does NOT Authorize:** Does NOT authorize building collector code today; does NOT authorize live API dials or WebSocket sessions today; does NOT authorize automated paper trading.
* **Risks & Limitations:** Consumes network bandwidth and API quota without immediately executing trading strategies.
* **Technical Recommendation:** **APPROVE IN PRINCIPLE**. Enforcing arbitrary hard rejection thresholds (e.g. 2.0s quote age, 5.0s Greek age) without empirical baseline distribution measurements risks false-positive trade cancellations.
* **Additional Information Required:** None.

---

### Decision 3: Approval of Missing-Instrument Acceptance Thresholds
* **What Approval Means:** Approves the dynamic universe partition:
  - **Core ATM Strikes (ATM $\pm 3$) + Futures**: Mandatory (`INVALID` if missing).
  - **Outer Wings (ATM $\pm 4$ to $\pm 15$)**: Non-fatal (`PARTIAL` if unlisted).
* **What It Does NOT Authorize:** Does NOT authorize synthesizing missing strikes or changing Strategy 11.4 delta filters.
* **Risks & Limitations:** If NSE lists fewer strikes on monthly BANKNIFTY contracts, sessions will be marked `PARTIAL`.
* **Technical Recommendation:** **APPROVE**. Strategy 11.4 operates near ATM; halting collection because deep OTM strikes ($\pm 14$ or $\pm 15$) are unlisted by the exchange is mathematically unnecessary and operationally fragile.
* **Additional Information Required:** None.

---

### Decision 4: Approval of the Post-June-2025 BANKNIFTY Historical Research Boundary
* **What Approval Means:** Acknowledges that historical 1-minute candle queries for BANKNIFTY expired options prior to mid-2025 return empty arrays (`count: 0`), and restricts historical quantitative backtesting for BANKNIFTY to post-June 2025.
* **What It Does NOT Authorize:** Does NOT authorize purchasing third-party data or fabricating pre-June 2025 candles.
* **Risks & Limitations:** Reduces historical evaluation depth for BANKNIFTY to ~17 months, compared to 25+ months for NIFTY 50.
* **Technical Recommendation:** **APPROVE**. Running backtests against empty or zero-count historical candles produces invalid results. Bounding the historical window to verified data enforces quantitative integrity.
* **Additional Information Required:** Upstox response to Question 3 may clarify if pre-June 2025 BANKNIFTY data can be restored.

---

## 10. Explicit Implementation Readiness Assessment

To maintain strict scientific and engineering rigor, all major subsystem components are classified using five explicit categories:

```
+═════════════════════════════════════════════════════════════════════════════════════════════════════════+
| SUBSYSTEM READINESS SCORECARD                                                                           |
+----+----------------------------------------+-------------------------------+---------------------------+
| #  | Architecture Subsystem                 | Detailed Classification       | Technical Justification   |
+----+----------------------------------------+-------------------------------+---------------------------+
| 1  | Dynamic Universe & Regulatory Modeling | PASS                          | Dynamic master parsing;   |
|    |                                        |                               | NSE/FAOP/64506 codified.  |
+----+----------------------------------------+-------------------------------+---------------------------+
| 2  | Protobuf Decode & Normalization Engine | PASS                          | Official Proto3 schema    |
|    |                                        |                               | verified (51 unit tests). |
+----+----------------------------------------+-------------------------------+---------------------------+
| 3  | Secret Boundary & Memory Scrubbing     | PASS                          | POSIX 0600 on disk; heap  |
|    |                                        |                               | lifecycle minimized.      |
+----+----------------------------------------+-------------------------------+---------------------------+
| 4  | Ingestion Loss & Backpressure Policy   | PASS                          | 3-stage degradation; drop |
|    |                                        |                               | accounting in manifest.   |
+----+----------------------------------------+-------------------------------+---------------------------+
| 5  | Parquet Storage & Threat Model         | PASS WITH LIMITATIONS         | Accidental write & SHA-256|
|    |                                        |                               | valid; not root-proof.    |
+----+----------------------------------------+-------------------------------+---------------------------+
| 6  | Event Deduplication & Retransmission   | PASS WITH LIMITATIONS         | Heuristic enacted; ambigu-|
|    |                                        |                               | ous ticks preserved.      |
+----+----------------------------------------+-------------------------------+---------------------------+
| 7  | Transport vs Market-Data Health State  | PASS WITH LIMITATIONS         | 6 states defined; Upstox  |
|    |                                        |                               | heartbeat unverified.     |
+----+----------------------------------------+-------------------------------+---------------------------+
| 8  | Sharding & Multi-Socket Capacity       | PROVIDER CONFIRMATION REQUIRED| 1,500 vs 2,000 keys and   |
|    |                                        |                               | socket caps unconfirmed.  |
+----+----------------------------------------+-------------------------------+---------------------------+
| 9  | Live Greeks Pricing Convention         | PROVIDER CONFIRMATION REQUIRED| Upstox model & parameters |
|    |                                        |                               | unconfirmed by broker.    |
+----+----------------------------------------+-------------------------------+---------------------------+
| 10 | Passive Observation Mode Authorization | OWNER DECISION REQUIRED       | Awaiting owner decision 2.|
+----+----------------------------------------+-------------------------------+---------------------------+
| 11 | Missing Contract Acceptance Thresholds | OWNER DECISION REQUIRED       | Awaiting owner decision 3.|
+----+----------------------------------------+-------------------------------+---------------------------+
| 12 | Pre-June-2025 BANKNIFTY Horizon Gate   | OWNER DECISION REQUIRED       | Awaiting owner decision 4.|
+----+----------------------------------------+-------------------------------+---------------------------+
| 13 | Production Trading Authorization       | FAIL (STRICT HARD NO-GO)      | Collector is specification|
|    |                                        |                               | only; zero live readiness.|
+═════════════════════════════════════════════════════════════════════════════════════════════════════════+
```

### Overall Readiness Conclusion:
The collector architecture specification is **technically sound, microstructurally realistic, and ready for owner architectural review**. It is **NOT authorized for implementation or live data collection** until the owner signs off on the four decisions and Upstox support clarifies the pending capacity unknowns.

---

## 11. Exact List of Files Changed

1. `web/docs/COLLECTOR_ARCHITECTURE_SPECIFICATION.md` (Updated)
2. `web/docs/COLLECTOR_DATA_SCHEMA.md` (Updated)
3. `web/docs/COLLECTOR_FAILURE_AND_RECOVERY_DESIGN.md` (Updated)
4. `web/docs/COLLECTOR_OPEN_DECISIONS.md` (Updated)
5. `web/docs/COLLECTOR_ARCHITECTURE_CORRECTION_REPORT.md` (Updated)
6. `web/docs/UPSTOX_SUPPORT_TECHNICAL_QUESTIONNAIRE.md` (Updated)
7. `web/docs/COLLECTOR_FINAL_ARCHITECTURE_AUDIT_REPORT.md` (Created — This Document)

---

## 12. Confirmation of Strict Safety Boundaries

| Verification Item | Required State | Observed State | Status |
| :--- | :--- | :--- | :---: |
| **Source Code Created / Modified** | None | Exactly zero code files modified | **PASS** |
| **Live Upstox API Invocations** | None | Exactly zero API calls executed | **PASS** |
| **Authentication / Tokens** | None | Exactly zero tokens generated or refreshed | **PASS** |
| **WebSocket Feeds / Streams** | None | Exactly zero sockets dialed or subscribed | **PASS** |
| **Schedulers / Daemons** | None | `com.upstox.paperlive` remains unloaded | **PASS** |
| **Order Placement / Paper Trades** | None | Exactly zero orders executed | **PASS** |
| **Protected Evidence Archive** | 13/13 SHA-256 Valid | All 13 hashes match `MANIFEST.sha256` | **PASS** |
| **Git Working Tree** | Clean Index | Zero files staged; no commits made | **PASS** |
| **Port Conflicts (3150, 3123)** | Free | Both ports completely free | **PASS** |

