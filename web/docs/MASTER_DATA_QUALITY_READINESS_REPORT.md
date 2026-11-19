# Master Data Quality Readiness Report
## Market Data Integrity Standards, Contract-Second Metrics, Quote Freshness & Storage Schema Governance

**Document ID:** `MASTER_DATA_QUALITY_READINESS_REPORT.md`  
**Location:** `web/docs/MASTER_DATA_QUALITY_READINESS_REPORT.md`  
**Author:** Principal Market Data Engineer & Quantitative Systems Architect  
**Date:** November 17, 2026  
**Revision:** 1.0.0 (Master Data Quality Authority)  
**Governance Status:** RECONCILED & AUDITED (Ready for Gate 3 Collection)  
**WBS Reference:** Workstream 5 / Data Engineering & Quality (WBS 9.0)  
**Strategy Alignment:** Strategy 11.4 Formulas and 1.0% Risk Limit **STRICTLY FROZEN** (Commit `bcdd18a`)  
**Production Readiness:** **11.25% — STRICT HARD NO-GO** (Live Trading Prohibited)  
**Execution Boundaries:** Strictly Offline; Zero Live API Calls, Zero Capital Allocation  

---

## 1. Executive Summary

This report establishes the comprehensive data quality standards, mathematical formulas, explicit denominators, and storage validation protocols for the **Upstox Options Analyzer** market data infrastructure.

High-fidelity quantitative research requires an absolute guarantee that input data accurately reflects real-world market microstructure without survivorship bias, synthetic price fabrication, or hidden data loss. This document formalizes the rigorous criteria by which prospective trading sessions are certified as **`FULL_FIDELITY_VALID_SESSIONS`** during Gate 3 and Gate 4.

```
+═════════════════════════════════════════════════════════════════════════════════════════════════════════+
| MASTER DATA QUALITY CRITERIA SUMMARY                                                                    |
+----+-----------------------+-----------------------------+-----------------------+----------------------+
| #  | Data Quality Metric   | Mathematical Formulation    | Reconciled Denominator| Minimum Pass Gate    |
+----+-----------------------+-----------------------------+-----------------------+----------------------+
| 1  | 375-Minute Continuous | T_session = T_close - T_open| 22,500 seconds        | T_net >= 22,320s     |
|    | Session Duration      | Net Active = 22,500s - Gaps | (09:15:00 to 15:30:00)| Outage <= 180s total;|
|    |                       |                             | IST)                  | Single gap <= 60s    |
+----+-----------------------+-----------------------------+-----------------------+----------------------+
| 2  | Universe Quote Quality| Q_universe =                | 22,500 seconds *      | Q_universe >= 95.0%  |
|    | (Freshness <= 3.0s)   | Sum(N_valid(c)) / (22,500*|U|) | Total Subscribed Keys | Across all subscribed|
|    |                       |                             | in Active Universe |U|| contracts            |
+----+-----------------------+-----------------------------+-----------------------+----------------------+
| 3  | Per-Contract Quote    | Q_contract(c) =             | 22,500 seconds per    | Q_c >= 90.0% for     |
|    | Quality (ATM +/- 3)   | N_valid_sec(c) / 22,500     | individual contract   | EVERY individual core|
|    |                       |                             |                       | ATM +/- 3 strike     |
+----+-----------------------+-----------------------------+-----------------------+----------------------+
| 4  | Internal Storage      | P_ratio =                   | Total frames read at  | P_ratio >= 99.0%     |
|    | Persistence Ratio     | N_persisted / N_transp_read | local transport socket| Stage 3 drops = 0;   |
|    |                       |                             | boundary              | Stage 2 shed <= 1.0% |
+----+-----------------------+-----------------------------+-----------------------+----------------------+
| 5  | Spread Data-Quality   | Spread % =                  | Mid-Market Price      | Spread <= 20.0%      |
|    | Liquidity Filter      | (Ask - Bid) / Mid * 100%    | (Bid + Ask) / 2       | (Filters corrupt/test|
|    |                       |                             |                       | or crossed prints)   |
+----+-----------------------+-----------------------------+-----------------------+----------------------+
| 6  | Strategy Execution    | Spread % =                  | Quoted Premium        | Spread <= 5.0%       |
|    | Liquidity Gate        | (Ask - Bid) / Premium * 100%| (Ask price)           | (Strict entry gate   |
|    |                       |                             |                       | for Strategy 11.4)   |
+═════════════════════════════════════════════════════════════════════════════════════════════════════════+
```

---

## 2. Granular Data Quality Mechanics & Mathematical Definitions

### 2.1 375-Minute Session Duration & Gap Accounting
A standard trading session on the National Stock Exchange (NSE) spans from **09:15:00 IST to 15:30:00 IST**, comprising exactly:
$$\text{Nominal Session Duration} = 6 \text{ hours } 15 \text{ minutes} = 375 \text{ minutes} = 22,500 \text{ seconds}$$

To qualify as a valid session:
1. **Session Boundary Invariants:**
   - Ingestion must commence at or before **09:15:05 IST** ($t_{\text{open}} \le 09:15:05$).
   - Ingestion must persist until at or after **15:30:00 IST** ($t_{\text{close}} \ge 15:30:00$).
2. **Outage Budget Limits:**
   - Cumulative transport disconnection time $\sum \Delta t_{\text{gap}} \le 180\text{ seconds}$ (maximum 0.8% of session duration).
   - Maximum single contiguous disconnection interval $\Delta t_{\text{gap\_max}} \le 60\text{ seconds}$.
   - Minimum net active listening time:
     $$T_{\text{net}} = 22,500\text{ s} - \sum \Delta t_{\text{gap}} \ge 22,320\text{ seconds}$$

---

### 2.2 Contract-Second Quote Quality & Freshness Evaluation
Rather than counting raw message volume—which can be distorted by bursty ticks on a single contract—quote quality is evaluated using **contract-second buckets**:

1. **Contract-Second Bucket Definition:**
   For every subscribed contract $c \in U$ and every integer second $t \in [1, 22500]$ of the trading session, the bucket $S(c, t)$ evaluates as valid ($1$) if and only if:
   - At least one quote update was received for contract $c$ on or before second $t$.
   - The elapsed time since the most recent quote update satisfies the **freshness rule**:
     $$\text{Quote Age} = t_{\text{local\_ms}} - t_{\text{quote\_local\_ms}} \le 3,000\text{ ms}$$
   - The quote contains valid Level 1 market depth: $\text{best\_bid} > 0, \text{best\_ask} > 0, \text{best\_bid\_qty} > 0, \text{best\_ask\_qty} > 0$.
   - The order book is uncrossed: $\text{best\_bid} < \text{best\_ask}$.
   - The relative bid/ask spread satisfies the data-quality threshold:
     $$\frac{\text{best\_ask} - \text{best\_bid}}{\frac{1}{2}(\text{best\_bid} + \text{best\_ask})} \le 0.20 \quad (20.0\%)$$
2. **Invalid Bucket Assignment:**
   If no quote update has arrived within the last 3.0 seconds, or if the book is crossed or missing depth, the bucket evaluates as invalid ($0$).
3. **Per-Contract Reporting Invariant:**
   Individual contract coverage $Q_c = \frac{1}{22,500} \sum_{t=1}^{22,500} S(c, t)$ must be calculated and persisted for every contract $c$.
   - High activity in ATM strikes cannot mask missing data in outer hedge wings.
   - For all Core ATM $\pm 3$ strikes, $Q_c \ge 90.0\%$ is mandatory.

---

### 2.3 Post-Receipt Internal Persistence Ratio
To monitor the health and throughput of our local ingestion pipeline:
$$P_{\text{ratio}} = \frac{N_{\text{persisted}}}{N_{\text{transport\_read}}} \times 100\%$$

- **$N_{\text{transport\_read}}$:** Total Protobuf frames read from the TCP socket boundary.
- **$N_{\text{persisted}}$:** Total normalized market tick records written to disk.
- **Stage 2 Telemetry Shedding:** Non-critical diagnostic telemetry events may be shed under buffer backpressure ($\le 1.0\%$).
- **Stage 3 Buffer Overflow Drops:** Market tick drops due to buffer exhaustion must be **EXACTLY ZERO**.

---

## 3. Parquet Storage Schema & Serialization Standards

All captured market data is stored using Apache Parquet columnar storage with **Snappy compression**.

```
+═════════════════════════════════════════════════════════════════════════════════════════════════════════+
| NORMALIZED PARQUET STORAGE SCHEMA DEFINITION                                                            |
+----+-----------------------+---------------------+-------------------+----------------------------------+
| #  | Column Name           | Physical Data Type  | Logical Schema    | Storage Description              |
+----+-----------------------+---------------------+-------------------+----------------------------------+
| 1  | instrument_key        | Utf8 (String)       | Dictionary Encoded| Canonical Upstox instrument key  |
+----+-----------------------+---------------------+-------------------+----------------------------------+
| 2  | exchange_timestamp_ms | Int64               | Timestamp (ms)    | Exchange matching engine time    |
+----+-----------------------+---------------------+-------------------+----------------------------------+
| 3  | feed_server_ts        | Int64               | Timestamp (ms)    | Broker gateway broadcast time    |
+----+-----------------------+---------------------+-------------------+----------------------------------+
| 4  | local_receipt_mono_ns | Int64               | Nanoseconds       | Local monotonic clock (hrtime)   |
+----+-----------------------+---------------------+-------------------+----------------------------------+
| 5  | local_receipt_utc_ms  | Int64               | Timestamp (ms)    | Local wall clock (Date.now())    |
+----+-----------------------+---------------------+-------------------+----------------------------------+
| 6  | ltp                   | Float64             | Decimal (18, 4)   | Last traded price                |
+----+-----------------------+---------------------+-------------------+----------------------------------+
| 7  | ltt                   | Int64               | Timestamp (ms)    | Last trade timestamp             |
+----+-----------------------+---------------------+-------------------+----------------------------------+
| 8  | ltq                   | Int64               | Int64             | Last trade quantity              |
+----+-----------------------+---------------------+-------------------+----------------------------------+
| 9  | volume                | Int64               | Int64             | Day cumulative traded volume     |
+----+-----------------------+---------------------+-------------------+----------------------------------+
| 10 | open_interest         | Int64               | Int64             | Current open interest            |
+----+-----------------------+---------------------+-------------------+----------------------------------+
| 11 | best_bid              | Float64             | Decimal (18, 4)   | Top-of-book best bid price       |
+----+-----------------------+---------------------+-------------------+----------------------------------+
| 12 | best_bid_qty          | Int64               | Int64             | Top-of-book best bid quantity    |
+----+-----------------------+---------------------+-------------------+----------------------------------+
| 13 | best_ask              | Float64             | Decimal (18, 4)   | Top-of-book best ask price       |
+----+-----------------------+---------------------+-------------------+----------------------------------+
| 14 | best_ask_qty          | Int64               | Int64             | Top-of-book best ask quantity    |
+----+-----------------------+---------------------+-------------------+----------------------------------+
| 15 | iv                    | Float64 (Nullable)  | Decimal (10, 4)   | Broker-supplied implied vol.     |
+----+-----------------------+---------------------+-------------------+----------------------------------+
| 16 | delta                 | Float64 (Nullable)  | Decimal (10, 4)   | Broker-supplied option delta     |
+----+-----------------------+---------------------+-------------------+----------------------------------+
| 17 | theta                 | Float64 (Nullable)  | Decimal (10, 4)   | Broker-supplied option theta     |
+----+-----------------------+---------------------+-------------------+----------------------------------+
| 18 | gamma                 | Float64 (Nullable)  | Decimal (10, 4)   | Broker-supplied option gamma     |
+----+-----------------------+---------------------+-------------------+----------------------------------+
| 19 | vega                  | Float64 (Nullable)  | Decimal (10, 4)   | Broker-supplied option vega      |
+----+-----------------------+---------------------+-------------------+----------------------------------+
| 20 | provenance_tag        | Utf8 (String)       | Category Tag      | PROVENANCE_BROKER_FEED_V3        |
+═════════════════════════════════════════════════════════════════════════════════════════════════════════+
```

---

## 4. Partitioning & Directory Layout Hierarchy

Parquet files are partitioned by trading session date and underlying symbol to optimize query scanning and prevent operating system inode exhaustion:

```
web/.data/collector/parquet/
├── date=2026-11-18/
│   ├── NIFTY/
│   │   ├── part-00000.parquet
│   │   └── manifest.json
│   └── BANKNIFTY/
│       ├── part-00000.parquet
│       └── manifest.json
└── session_catalog.jsonl
```

### Manifest Integrity Invariant:
At the close of each session (15:30:30 IST), the collector writes `manifest.json` containing:
- Record count $N_{\text{persisted}}$.
- Cryptographic SHA-256 hash of each Parquet partition file.
- Net active duration, gap count, and maximum gap duration.
- Calculated quote-quality metrics ($Q_{\text{universe}}$ and $Q_c$ for all contracts).
- Internal persistence ratio $P_{\text{ratio}}$.

---

## 5. Certification & Readiness for Gate 3

The market data quality specification is mathematically rigorous, fully auditable, and implemented in the prototype collector. The data layer is ready to support live stream collection upon owner approval of Gate 3.
