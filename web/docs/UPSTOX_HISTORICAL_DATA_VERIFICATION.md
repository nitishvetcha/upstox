# Upstox Historical Data Coverage & Collector Readiness Specification
## Deep Verification & Evidence-Based Readiness Review for Strategy 11.4

**Document ID:** `UPSTOX_HISTORICAL_DATA_VERIFICATION.md`  
**Location:** `web/docs/UPSTOX_HISTORICAL_DATA_VERIFICATION.md`  
**Date:** November 16, 2026  
**Investigator:** Quantitative Systems & Engineering Agent  
**Operational Status:** STRICT READ-ONLY INVESTIGATION (Zero code modifications, zero live API calls, zero token refreshes, zero purchases, zero Git state changes)  
**Strategy Evaluated:** Strategy 11.4 (`bcdd18a` committed baseline, `web/src/lib/engine/strategy.ts`)  
**Production Readiness:** STRICT HARD NO-GO (11.25%)  
**Related Documents:**
- `web/docs/UPSTOX_SUPPORT_TECHNICAL_QUESTIONNAIRE.md`
- `web/docs/UPSTOX_ONLY_DEEP_RESEARCH_REPORT.md`
- `web/docs/HISTORICAL_DATA_PROVIDER_FEASIBILITY_REPORT.md`

---

## 1. Executive Summary & Review Scope

This specification provides a rigorous, evidence-based correction and audit pass on the Upstox API data capabilities, resolving technical contradictions in earlier reports, removing unsupported accuracy claims, and establishing clear readiness boundaries for Strategy 11.4 under an Upstox-only architecture.

### Key Corrections & Evidence Baselines Established:
1. **Historical OI Indexing Ground Truth:**
   - The Upstox historical candle tuple is: `[timestamp, open, high, low, close, volume, oi]`.
   - Open Interest is the **seventh value** in human-readable order, located at **zero-based array index `6`**.
   - Code inspection reveals that `web/scripts/lib/intraday-core.mjs` correctly destructures index `6` (`const [ts, open, high, low, close, volume, oi] = raw`), whereas `web/src/lib/services/candles.ts` deliberately parses only indices `0..5` for spot index candles (which do not have OI).
   - **Crucial Boundary:** A correctly parsed OI field in traded candles does **not** equal complete historical option-chain coverage.
2. **Greek Provenance & Retraction of Accuracy Claims:**
   - Strict three-way taxonomy enforced:
     - **Exchange-Observed Market Prices:** Exchange-matched trade prints and best bid/ask orders from the NSE matching engine.
     - **Upstox-Supplied Greeks:** Real-time broker calculations delivered over live REST/WebSocket feeds. Exact pricing model, interest rate, dividend schedule, and underlying reference are **unconfirmed by official documentation**.
     - **Model-Generated Historical Greeks:** Locally calculated mathematical estimates in backtests. Classified strictly as **exploratory research inputs**.
   - Previous statements claiming locally calculated Black-Scholes Greeks achieve $R^2 > 0.99$ against live Greeks are **unsupported by empirical data in this repository and are formally retracted**. Marked **`UNVERIFIED`**.
3. **Historical Full-Chain OI Limitations & Aggregate Distortions:**
   - Individual contract candles **cannot** reconstruct a complete historical option chain. Inactive or non-traded strikes have no candle records (Upstox does not backfill zero-volume synthetic bars).
   - Reconstructing full-chain Put-Call Ratio (PCR) or support/resistance from sparse contract candles introduces severe survivorship and liquidity distortions.
   - Full-chain intraday OI snapshots are **`NOT AVAILABLE`** historically from Upstox. EOD full-chain OI is available via `GET /v2/market/oi`.
4. **Instrument Count vs. Collector Capacity Boundary:**
   - **Confirmed Instrument Count:** 248 options (NIFTY & BANKNIFTY front and next weekly expiries, ATM $\pm$ 15 strikes, CE/PE) + 2 near-month futures = **250 tradable derivatives**. Adding 2 underlying spot index keys = **252 required WebSocket subscription keys**.
   - **Confirmed Protocol:** Upstox Feed V3 binary Protocol Buffers (`MarketDataFeed.proto`) with UTF-8 JSON subscription requests in binary frames.
   - **Unverified Provider Capacity:** Single-connection instrument limits (claims of 1,500 vs. 2,000 instruments) are **`VENDOR CONFIRMATION REQUIRED`**; capacity to stream 252 keys in `full` mode on a single connection is **unverified**.
   - **Provisional Architecture Rule:** The collector architecture must be designed with **configurable subscription limits and multi-socket chunking**; single-socket operation is an unverified provisional assumption.
5. **Freshness Threshold Audit & Dual-Timestamping Architecture:**
   - All proposed freshness thresholds (2.0s quote age, 5.0s Greek age, 180s OI age, 1.0s clock skew) are strictly **engineering assumptions awaiting empirical baseline measurement and owner approval**. None are validated production rules.
   - Bid/ask quote freshness is completely decoupled from last-trade timestamp (`ltt`).
   - A dual-timestamping recording architecture is specified (`source_ts` vs. `local_receipt_mono_ns`) to measure actual network latency distributions during future collection before enforcing drop thresholds.
6. **Tick-Volume & Storage Sizing Audit:**
   - The 100–300 updates/second heuristic is audited and explicitly classified as an **illustrative planning assumption** based on theoretical market microstructure heuristics, not measured data.
   - Storage estimates are segregated into measured data (none), provider figures (none), planning baselines, and stress-test scenarios. No estimated number is presented as measured usage.

---

## 2. Investigation A: Historical OI Indexing & Candle Response Structure

### 2.1 Actual Upstox Historical Candle Response Schema
Upstox API v2/v3 historical candle endpoints return candles as an array of tuples in newest-first order:
```json
{
  "status": "success",
  "data": {
    "candles": [
      ["2024-10-03T15:29:00+05:30", 112.5, 114.0, 112.0, 113.2, 8500, 4215000],
      ["2024-10-03T15:28:00+05:30", 111.0, 113.0, 110.5, 112.5, 6200, 4218500]
    ]
  }
}
```

### 2.2 Precise Tuple Field Mapping

| Human-Readable Position | Zero-Based Array Index | Field Name | Data Type | Example Value | Description |
| :---: | :---: | :--- | :--- | :--- | :--- |
| **1st** | `0` | `timestamp` | ISO String | `"2024-10-03T15:29:00+05:30"` | Bar start time in IST (+05:30) |
| **2nd** | `1` | `open` | Number (Float) | `112.5` | Opening traded price |
| **3rd** | `2` | `high` | Number (Float) | `114.0` | Highest traded price |
| **4th** | `3` | `low` | Number (Float) | `112.0` | Lowest traded price |
| **5th** | `4` | `close` | Number (Float) | `113.2` | Closing traded price |
| **6th** | `5` | `volume` | Number (Integer) | `8500` | Traded contracts/quantity |
| **7th** | `6` | `open_interest` | Number (Integer) | `4215000` | Open interest at bar close |

### 2.3 Repository Parser Audit
1. **`web/scripts/lib/intraday-core.mjs` (Line 41):**
   ```javascript
   export function normalizeCandle(raw) {
     if (!Array.isArray(raw) || raw.length < 6) return null;
     const [ts, open, high, low, close, volume, oi] = raw;
     ...
     return { timestamp: ts, open, high, low, close, volume, openInterest: typeof oi === "number" ? oi : 0 };
   }
   ```
   *Audit Finding:* Correct. Destructuring correctly assigns `oi` to index `6` (the 7th value).
2. **`web/src/lib/services/candles.ts` (Lines 33–37):**
   ```typescript
   const [open, high, low, close] = [c[1], c[2], c[3], c[4]].map(num);
   out.push({ timestamp: c[0], open, high, low, close, volume: num(c[5]) });
   ```
   *Audit Finding:* Deliberately ignores index `6`. This parser is used for spot index series (`NSE_INDEX|Nifty 50`), which have zero OI and no contract volume.
3. **`web/src/lib/adapters/upstoxHistoricalOptionsAdapter.ts` (Line 147):**
   ```typescript
   optionOI: "NOT_AVAILABLE", // OI not in Upstox historical candle endpoint
   ```
   *Audit Finding:* This reflects an earlier offline assessment before the Phase 0 expired probe. While the expired candle endpoint `/v2/historical-candle/expired/...` *does* populate index `6` for traded contracts, the adapter was never updated because live requests are blocked and the engine is NO-GO.

### 2.4 Fundamental Boundary: Parsed OI $\neq$ Full-Chain Coverage
A correctly parsed `oi` value in an individual candle tuple indicates only the open interest of **that specific contract during a minute in which a trade executed**. It does **not** provide:
- Open interest for strikes that did not trade during that minute.
- Synchronized open interest across all strikes at 09:30:00 IST.
- Total market put/call aggregates.

---

## 3. Investigation B: Greek Provenance & Retraction of Accuracy Claims

### 3.1 Strict Three-Way Greek & Price Taxonomy
To avoid conflating exchange trade facts with broker or local mathematical models, all documentation and future code must adhere strictly to this three-way taxonomy:

1. **Exchange-Observed Market Prices:**
   - Source: National Stock Exchange (NSE) trade matching engine and order books.
   - Fields: Last Traded Price (`ltp`), Last Traded Quantity (`ltq`), Best Bid Price/Qty (`bid_price`, `bid_quantity`), Best Ask Price/Qty (`ask_price`, `ask_quantity`), traded volume, and exchange OI.
   - Property: Direct market facts. The exchange **does not** compute or broadcast Option Greeks.
2. **Upstox-Supplied Greeks:**
   - Source: Upstox API live feeds (`GET /v3/market-quote/option-greek`, `GET /v2/option/chain`, and WebSocket `full` / `option_greeks` mode).
   - Fields: `delta`, `gamma`, `theta`, `vega`, `iv`.
   - Property: Calculated server-side by Upstox. **The exact calculation methodology (Black-Scholes vs. Black-76 vs. binomial), underlying price reference (spot vs. futures), interest rate, dividend schedule, and day-count convention are UNCONFIRMED by official documentation.**
   - Classification: Broker-calculated model outputs. They must **never** be described as "observed market Greeks".
3. **Model-Generated Historical Greeks:**
   - Source: In-house mathematical models computed locally within our research scripts or backtest engine.
   - Fields: Locally computed implied volatility and Greek partial derivatives.
   - Property: **Exploratory research inputs only.** They must **never silently substitute for observed Greeks** in primary Strategy 11.4 validation.

### 3.2 Formal Retraction of Unsupported Accuracy Claims
In earlier preliminary notes, it was suggested that a locally computed Black-Scholes model achieved "$R^2 > 0.99$ accuracy" against live Upstox Greeks.

**This claim is unsupported by any empirical dataset in this workspace and is hereby formally retracted.**

* **Evidence Audit:** A comprehensive audit of all test outputs, fixtures, and scripts confirms that **zero paired observation datasets exist** comparing local model output to Upstox live Greeks ($N = 0$).
* **Required Data Missing:** No error distribution, Mean Absolute Error (MAE), Root Mean Square Error (RMSE), or underlying price alignment has been established.
* **Status:** Marked **`UNVERIFIED / RETRACTED`**.

---

## 4. Investigation C: Historical Full-Chain OI Limitations & Aggregate Distortions

### 4.1 Four Inherent Structural Distortions in Historical Reconstructions
Querying individual 1-minute historical candles cannot reconstruct a faithful historical option chain due to four severe structural distortions:

1. **Omission of Inactive Contracts (Survivorship / Liquidity Bias):**
   - Upstox historical candle endpoints only archive bars for minutes in which an exchange trade occurred.
   - Out-of-the-money (OTM) options frequently have zero trades during the opening 15 minutes of trading.
   - These contracts return empty candle arrays (`[]`). If omitted from chain totals, total call/put OI is systematically underestimated.
2. **Asynchronous Timestamps (Lack of Point-in-Time Synchronization):**
   - If Strike A traded at 09:30, Strike B last traded at 09:18, and Strike C last traded at 09:08, assembling an "09:30 chain" requires forward-filling stale OI from 09:18 and 09:08.
   - Forward-filled data is a **synthetic construct**, not an observed synchronized exchange state.
3. **Severe PCR Distortion:**
   - Put-Call Ratio is defined as $\text{PCR} = \frac{\sum \text{Put OI}}{\sum \text{Call OI}}$.
   - Because put and call liquidity is asymmetric across strikes, unobserved non-traded strikes distort the numerator and denominator differently, producing artificial PCR swings.
4. **Distortion of Support, Resistance, and Max Pain:**
   - Max Put OI (Support) and Max Call OI (Resistance) depend on full-chain ranking. If an inactive strike holds large institutional open interest carried over from prior sessions but does not trade between 09:15 and 09:30, it will be completely missing from candle-based reconstruction, resulting in erroneous support/resistance identification.

### 4.2 Separation of Discovery, Candles, and Full-Chain OI by Asset

| Evaluation Dimension | NIFTY 50 Evidence | BANK NIFTY Evidence | Guaranteed SLA Retention? |
| :--- | :--- | :--- | :---: |
| **Contract / Expiry Discovery** | 111 expiries returned back to 2024-10-03 (25.5 months). | 31 expiries returned back to 2024-10-01. | **NO** (Docs cite 6 months; older discovery is empirical, not SLA). |
| **Returned Candle History** | Populated 128-bar series retrieved for 2024-10-03. | `count: 0` (empty arrays) for Oct 2024; continuous bars begin mid-2025. | **NO** (Traded contracts only; secondary index retention differs). |
| **EOD Full-Chain OI** | Available via `GET /v2/market/oi` for historical dates. | Available via `GET /v2/market/oi` for historical dates. | **PARTIALLY VERIFIED** (Retention depth unconfirmed by vendor). |
| **Intraday Full-Chain OI** | **NOT AVAILABLE** historically. | **NOT AVAILABLE** historically. | **NO** (Zero historical endpoint exists). |

*Critical Governance Rule:* Local probe success on 2026-11-12 demonstrates historical availability at that point in time, but **does not prove an ongoing SLA or guaranteed retention**. Data beyond 6 months must be treated as an uncommitted archive subject to upstream pruning until clarified in writing by Upstox.

---

## 5. Investigation D: Instrument Universe & Reconciled Counts

### 5.1 Exact Universe Sizing for Strategy 11.4
To eliminate conflicting totals across project documentation, the exact universe of instruments required by Strategy 11.4 is detailed below:

```
+--------------------------------------------------------------------------------------------------+
| STRATEGY 11.4 UNIVERSE BREAKDOWN                                                                |
+-------------------+----------+-----------+---------+------------+--------------------------------+
| Underlying Asset  | Expiries | Strikes   | Types   | Multiplier | Total Instruments              |
+-------------------+----------+-----------+---------+------------+--------------------------------+
| NIFTY 50 Options  | 2        | 31 (±15)  | CE & PE | 2×31×2     | 124 option contracts           |
| BANK NIFTY Options| 2        | 31 (±15)  | CE & PE | 2×31×2     | 124 option contracts           |
| NIFTY Futures     | 1 (Near) | N/A       | FUTIDX  | 1          | 1 futures contract             |
| BANK NIFTY Futures| 1 (Near) | N/A       | FUTIDX  | 1          | 1 futures contract             |
+-------------------+----------+-----------+---------+------------+--------------------------------+
| SUB-TOTAL TRADABLE DERIVATIVE INSTRUMENTS                             | 250 INSTRUMENTS                |
+-------------------+----------+-----------+---------+------------+--------------------------------+
| NIFTY 50 Spot     | N/A      | N/A       | INDEX   | 1          | 1 underlying reference key     |
| BANK NIFTY Spot   | N/A      | N/A       | INDEX   | 1          | 1 underlying reference key     |
+-------------------+----------+-----------+---------+------------+--------------------------------+
| TOTAL WEBSOCKET FEED SUBSCRIPTIONS (DERIVATIVES + SPOT REFERENCE)     | 252 SUBSCRIPTION KEYS          |
+--------------------------------------------------------------------------------------------------+
```

### 5.2 Clarification of Roles:
* **250 Tradable Derivatives:** The execution engine monitors and trades 248 options and uses 2 futures for volume and VWAP.
* **2 Reference Spot Keys:** Spot indices (`NSE_INDEX|Nifty 50` and `NSE_INDEX|Nifty Bank`) are non-tradable mathematical baskets with zero volume. If streamed over WebSocket for real-time spot reference, they count as 2 subscribed keys.
* **Consistency Rule:** When discussing **market instruments traded or modeled**, the count is **250**. When discussing **total WebSocket subscription keys**, the count is **252**.

---

## 6. Investigation E: WebSocket Protocol, Limits, and Capacity Corrections

### 6.1 Confirmed Protocol vs. Unverified Provider Capacity

To resolve earlier overstatements regarding collector capacity, the distinction between confirmed facts and unverified assumptions is codified below:

```
+----------------------------------------------------------------------------------------------------+
| COLLECTOR CAPACITY ARCHITECTURE BOUNDARIES                                                        |
+---------------------------------------+------------------+-----------------------------------------+
| Architecture Component                | Evidence Status  | Technical Finding                       |
+---------------------------------------+------------------+-----------------------------------------+
| Required Subscription Key Count       | CONFIRMED (252)  | 250 derivatives + 2 spot reference keys.|
| WebSocket Protocol & Wire Format      | CONFIRMED (V3)   | Proto3 package com.upstox.marketdata-   |
|                                       |                  | feederv3udapi.rpc.proto (SHA-256 ok).   |
| Subscription Request Mechanism        | CONFIRMED        | UTF-8 JSON sent inside binary frame.    |
| Single-Socket Subscription Capacity   | UNVERIFIED       | Provider claims of 1,500 vs. 2,000 keys |
|                                       |                  | have NOT been empirically tested.       |
| Multi-Socket Sharding Architecture    | PROVISIONAL      | Collector MUST implement configurable   |
|                                       | REQUIREMENT      | subscription chunking (e.g. 100/socket).|
+---------------------------------------+------------------+-----------------------------------------+
```

### 6.2 Correction of the Capacity Conclusion
* **Previous Flawed Conclusion:** Claimed that because Strategy 11.4 requires 252 keys, it is "confirmed within capacity" of a single connection.
* **Authoritative Correction:** Because Upstox's single-connection limit for `full` mode (streaming 5-depth order books and Greeks) is **unverified**, we **cannot claim capacity is verified**.
* **Provisional Design Mandate:**
  1. Operating 252 instruments on a single socket is a **provisional planning hypothesis**, not a verified capability.
  2. The prospective collector architecture must include a **configurable subscription batching and socket-sharding manager** (`maxKeysPerConnection = Config.MAX_KEYS_PER_SOCKET ?? 100`).
  3. If Upstox enforces an undisclosed lower limit on `full` mode feeds, the system must seamlessly split subscriptions across multiple connections without architectural redesign.

---

## 7. Investigation F: Storage Sizing & Tick-Volume Assumptions Audit

### 7.1 Explicit Separation of Data Categories
To prevent confusing speculative capacity planning models with actual measured data, storage calculations are partitioned into four distinct categories:

```
1. Measured Data Volume:      NONE in this workspace (zero live option tick streams recorded).
2. Provider-Confirmed Figures: NONE published by Upstox (no bandwidth or tick rate SLAs).
3. Planning Estimates:         Calculations based on theoretical market microstructure heuristics.
4. Stress-Test Scenarios:      Worst-case upper bounds for hardware and disk headroom.
```

### 7.2 Audit of the 100–300 Updates/Second Heuristic
The figure of 100–300 quote updates/second is an **illustrative planning assumption** derived from theoretical market microstructure estimates across the 252-key universe:
* **4 ATM Option Contracts** (NIFTY/BANKNIFTY ATM CE/PE): ~10–25 updates/sec each $\implies$ ~40–100 updates/sec.
* **16 Near-the-Money Contracts** (ATM $\pm$ 1–2 strikes): ~2–5 updates/sec each $\implies$ ~32–80 updates/sec.
* **228 Out-of-the-Money / Wing Contracts**: ~0.1–0.5 updates/sec each $\implies$ ~23–114 updates/sec.
* **2 Index Futures + 2 Index Spot**: ~2–5 updates/sec each $\implies$ ~8–20 updates/sec.
* **Blended Total:** $\approx 103 - 314\text{ updates/sec}$ (rounded to **100–300 updates/second**).

*Classification:* This is **NOT an empirical measurement or provider-guaranteed figure**. Actual rates vary dramatically based on market volatility, news events, and exchange matching engine throughput.

### 7.3 Storage Footprint Models (Estimates vs. Stress Boundaries)

| Sizing Model | Technical Basis | Session Footprint (6.25 hrs) | 6-Month Footprint (125 sessions) | Status |
| :--- | :--- | :---: | :---: | :---: |
| **1-Minute Parquet Bars** | 252 keys $\times$ 375 bars @ 110 B/row | **~11–12 MB/day** | **~1.4–1.5 GB** | Planning Baseline (Model) |
| **1-Minute SQLite Bars** | 252 keys $\times$ 375 bars @ 500 B/row | **~52 MB/day** | **~6.5 GB** | Planning Baseline (Model) |
| **Typical Tick Stream** | Blended 100–300 ticks/sec (Parquet) | **~90–120 MB/day** | **~11–15 GB** | Illustrative Planning Model |
| **High Volatility Spike** | Blended 600 ticks/sec (Parquet) | **~270–350 MB/day** | **~34–44 GB** | Stress-Test Scenario |
| **Worst-Case Stress Cap** | 1,000 ticks/sec peak (Parquet / Raw JSON) | **~450 MB** (Parquet) / **~4.5 GB** (JSON) | **~56 GB** (Parquet) / **~560 GB** (JSON) | Worst-Case Stress Cap |

*Rule:* No estimated number in this table may be cited as "measured data usage."

---

## 8. Investigation G: Freshness Threshold Audit & Dual-Timestamping Architecture

### 8.1 Evidence Audit of the 8-Field Freshness Matrix
The proposed freshness thresholds are subjected to rigorous quantitative governance audit below:

| # | Timestamp Field | Proposed Threshold | Empirical Evidence? | Official Upstox Doc? | Engineering Status | Governance Classification |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| **1** | **Best Bid Quote** (`bidTs`) | $\le 2.0\text{ s}$ | **NONE** | **NONE** | Engineering Assumption | **AWAITING OWNER APPROVAL** |
| **2** | **Best Ask Quote** (`askTs`) | $\le 2.0\text{ s}$ | **NONE** | **NONE** | Engineering Assumption | **AWAITING OWNER APPROVAL** |
| **3** | **Last Traded Price** (`ltpTs` / `ltt`) | Session bounds | **NONE** | **NONE** | Engineering Assumption | **AWAITING OWNER APPROVAL** |
| **4** | **Feed Transit Clock** (`currentTs`) | Skew $\le 1.0\text{ s}$ | **NONE** | **NONE** | Engineering Assumption | **AWAITING OWNER APPROVAL** |
| **5** | **Underlying Spot** (`spotTs`) | $\le 2.0\text{ s}$ | **NONE** | **NONE** | Engineering Assumption | **AWAITING OWNER APPROVAL** |
| **6** | **Near Futures** (`futTs`) | $\le 2.0\text{ s}$ | **NONE** | **NONE** | Engineering Assumption | **AWAITING OWNER APPROVAL** |
| **7** | **Option Greeks** (`greeksTs`) | $\le 5.0\text{ s}$ | **NONE** | **NONE** | Engineering Assumption | **AWAITING OWNER APPROVAL** |
| **8** | **Open Interest** (`oiTs`) | $\le 180.0\text{ s}$ | **NONE** | **NONE** | Engineering Assumption | **AWAITING OWNER APPROVAL** |

*Explicit Finding:* **None of the proposed thresholds (2.0s, 5.0s, 180s, 1.0s) are validated production rules.** They represent preliminary engineering proposals. They must not be implemented as hard filters until an empirical latency and quote-interval baseline is gathered during prospective testing and formally approved by the project owner.

### 8.2 Separation of Bid/Ask Quote Freshness from Last-Trade Freshness
In options markets, out-of-the-money contracts frequently adjust quotes every 100–500ms as spot moves, even if no trades execute for hours:
* Using `lastTradeTime` (`ltt` / `ltpTs`) to judge quote freshness causes **false staleness rejections of perfectly fresh quotes**.
* Conversely, if an option traded 5 seconds ago but quotes stopped updating 30 seconds ago, using trade time masks a dead book.
* **Architectural Rule:** Quote freshness (`bidTs` and `askTs`) and trade recency (`ltpTs`) must be tracked by separate timers and separate validation rules.

### 8.3 Recommended Dual-Timestamp Recording Architecture
To establish an empirical baseline before enforcing drop/block gates, the prospective collector should implement a non-intrusive dual-timestamping schema:

```
+--------------------------------------------------------------------------------------------------+
| DUAL-TIMESTAMP INGESTION RECORD SPECIFICATION                                                    |
+--------------------------+-----------------------+-----------------------------------------------+
| Field Name               | Time Source           | Exact Implementation Mechanism                |
+--------------------------+-----------------------+-----------------------------------------------+
| `source_ts`              | Provider / Exchange   | Decoded millisecond epoch from protobuf payload|
|                          |                       | (`FeedResponse.currentTs` or `ltpc.ltt`).      |
| `local_receipt_mono_ns`  | Local Host Monotonic  | `process.hrtime.bigint()` in Node.js captured  |
|                          |                       | at the exact moment the socket event fires.    |
|                          |                       | (Immune to NTP adjustments or clock leaps).   |
| `local_receipt_utc_iso`  | Local Host UTC        | `new Date().toISOString()` for audit logs.     |
+--------------------------+-----------------------+-----------------------------------------------+
| DERIVED OBSERVABILITY METRICS (RECORDED, NOT ENFORCED AS GATES INITIALLY):                       |
| 1. Transport Latency:    | delta_transport_ms    | `Number(local_receipt_utc_ms - source_ts)`    |
| 2. Inter-Arrival Time:   | delta_inter_arrival_ms| `Number(current_mono_ns - prev_mono_ns)/1e6`  |
| 3. Quote Age at Bar Close| delta_quote_age_ms    | `Number(bar_close_utc_ms - quote_source_ts)`  |
+--------------------------------------------------------------------------------------------------+
```
*Recommendation:* During initial collection, log these metrics without discarding data. Once a multi-day empirical baseline is established, present the latency percentiles (p50, p95, p99) to the owner to set authoritative production thresholds.

---

## 9. Strategy 11.4 Non-Compromise Policy

Strategy 11.4 formulas and the 1% risk limit remain **strictly frozen**. The strategy must never be weakened or modified to fit provider shortcomings:

| Strategy 11.4 Requirement | Treatment Under Quantitative Governance |
| :--- | :--- |
| **Historical Bid / Ask Quotes** | **Required for faithful historical spread & fill validation.** Since Upstox history lacks bid/ask data, historical backtests cannot validate the 5% spread rule or true fill slippage. |
| **Historical Full-Chain OI** | **Required for faithful full-chain OI analysis.** Intraday snapshots are unavailable historically; individual candle OI cannot substitute due to severe aggregate distortion. |
| **Historical Observed Greeks** | **Required for faithful observed-Greek validation.** Completely unavailable from Upstox history. |
| **Model-Derived Greeks** | **Exploratory research only.** Cannot silently replace observed Greeks in primary validation. |
| **Option OHLCV** | Useful for price context, but **does not replace bid/ask quotes**. |
| **Futures Volume** | **Required for Futures VWAP.** Futures candles carry valid exchange volume. |
| **Spot Index Volume** | Spot volume is zero (not traded). **Do not fabricate or substitute.** |
| **Missing Data** | Must **fail-closed / report as unavailable**; never silently treat as neutral. |
| **Strategy Formulas** | **Strictly unchanged.** |
| **Risk Limit** | **Strictly unchanged at 1% capital risk per trade.** |

---

## 10. Evidence & Discrepancy Register

| Item | Previous Claim | Evidence Inspected | Finding | Status | Required Next Action |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **Historical Expiry Horizon** | Strictly capped at 6 months. | `web/docs/phase0/historical-coverage-probe.json` | 111 expiries returned for NIFTY back to 2024-10-03 (25.5 months). | **VERIFIED (EMPIRICAL)** | Clarify with Upstox whether retention $> 6\text{ months}$ is an SLA or ephemeral. |
| **Secondary Index Retention** | Expiries exist back to late 2024. | `historical-coverage-probe.json` | BANKNIFTY contracts listed back to Oct 2024, but candle queries return `count: 0` before mid-2025. | **PARTIALLY VERIFIED** | Restrict secondary index historical testing to post-June 2025. |
| **Historical Candle OI Indexing** | OI is "the 6th element" of candle tuple. | Response schema & `intraday-core.mjs:41` | Tuple has 7 elements. OI is the 7th value, zero-based array index `6`. | **CONTRADICTED (PHRASING ERROR)** | Corrected documentation to distinguish 7th value from index `6`. |
| **Local Black-Scholes Accuracy** | Local BS achieves $R^2 > 0.99$ vs. live Greeks. | Repository audit of all test logs and scripts. | Zero empirical datasets exist comparing local BS to live Greeks in this repo. | **UNVERIFIED / RETRACTED** | Claim retracted. Model Greeks restricted to exploratory status. |
| **Historical Full-Chain OI Reconstruction** | Individual candles reconstruct historical option chain. | Contract-level trade sparsity analysis. | Inactive strikes have zero bars; forward-filling distorts PCR and support/resistance. | **CONTRADICTED** | Reclassified intraday full-chain OI as UNAVAILABLE historically. |
| **Live Greeks Classification** | Classified as "observed Greeks". | Upstox docs & NSE feed specifications. | NSE disseminates no Greeks; Greeks are calculated server-side by Upstox Black-Scholes. | **CONTRADICTED** | Reclassified as `UPSTOX_SUPPLIED_GREEKS`. |
| **Instrument Count** | Conflicting claims: 252 vs. 250 instruments. | `strategy.ts`, `analysis.ts`, `optionChainAnalytics.ts` | 248 options + 2 futures = 250 tradable derivatives. Adding 2 spot reference keys = 252 WebSocket subscriptions. | **VERIFIED** | Reconciled consistently: 250 derivatives, 252 socket keys. |
| **WebSocket Feed Version** | Inconsistent mentions of V2 vs. V3. | `web/src/lib/liveEvidence/proto/MarketDataFeed.proto` | Package is `com.upstox.marketdatafeederv3udapi.rpc.proto` (V3 feed). | **VERIFIED** | Pinned feed version as V3 across all documentation. |
| **WebSocket Single-Connection Capacity** | 252 keys confirmed within single-socket capacity. | `PHASE8_API_CAPABILITY_VERIFICATION.md` | Instrument caps (1,500 vs 2,000) are unverified provider claims; capacity is not proven. | **UNVERIFIED (PROVISIONAL ONLY)** | Corrected conclusion. Require configurable multi-socket sharding. |
| **Quote Freshness Thresholds** | Blanket 2.0s/120s thresholds presented as standards. | Quantitative governance audit. | Thresholds are engineering assumptions without empirical support. | **UNVERIFIED (ASSUMPTIONS)** | Labeled as unverified proposals awaiting owner approval. |
| **Storage & Tick Volumes** | Unconditioned claims of 12 MB/day or 300 ticks/sec. | Explicit mathematical modeling across row sizes. | 100–300 ticks/sec is an illustrative heuristic; storage numbers are planning models. | **PARTIALLY VERIFIED** | Replaced with explicit assumption models. |

---

## 11. Final Readiness Decisions

The six project readiness dimensions are evaluated independently below. They must **not** be blended into an aggregate percentage:

```
+----------------------------------------------------------------------------------------------------+
| READINESS EVALUATION DIMENSIONS (INDEPENDENT ASSESSMENTS — NOT BLENDED)                           |
+----+----------------------------------------------+--------------------+---------------------------+
| #  | Evaluation Dimension                         | Decision           | Core Technical Basis      |
+----+----------------------------------------------+--------------------+---------------------------+
| 1. | Upstox-Only Research Feasibility             | GO                 | Verified expired contract |
|    |                                              |                    | discovery, historical 1m  |
|    |                                              |                    | OHLCV+OI, and EOD chain OI|
|    |                                              |                    | support exploratory study.|
+----+----------------------------------------------+--------------------+---------------------------+
| 2. | Partial Historical Market-Structure Research | QUALIFIED GO       | Verified for NIFTY (>2yr);|
|    |                                              |                    | secondary indices bounded |
|    |                                              |                    | to mid-2025; model Greeks |
|    |                                              |                    | remain exploratory only.  |
+----+----------------------------------------------+--------------------+---------------------------+
| 3. | Faithful Historical Strategy 11.4 Validation | HARD NO-GO         | Missing historical bid/ask|
|    |                                              |                    | quotes, intraday chain OI,|
|    |                                              |                    | and observed Greeks       |
|    |                                              |                    | prevent execution audit.  |
+----+----------------------------------------------+--------------------+---------------------------+
| 4. | Market-Data Collector Implementation         | READY FOR PROVI-   | V3 Protobuf schema verified|
|    |                                              | SIONAL DESIGN      | offline; sharded/chunked  |
|    |                                              | REVIEW             | socket architecture must  |
|    |                                              |                    | be designed before build. |
+----+----------------------------------------------+--------------------+---------------------------+
| 5. | Paper-Trading Readiness                      | BLOCKED            | Requires implemented and  |
|    |                                              |                    | calibrated live collector |
|    |                                              |                    | with dual-timestamp logs. |
+----+----------------------------------------------+--------------------+---------------------------+
| 6. | Production Trading Readiness                 | STRICT HARD NO-GO  | Acceptance scorecard is   |
|    |                                              | (11.25%)           | 11.25%; requires 60-day   |
|    |                                              |                    | forward live paper trial. |
+----+----------------------------------------------+--------------------+---------------------------+
```

---

## 12. Verification & Governance Safeguards Confirmation

All mandatory safeguards have been maintained throughout this review:
1. **Source Code Modifications:** None (`git status` confirms zero code changes).
2. **Git State:** Clean index; zero commits or staging operations.
3. **Network Activity:** Zero live Upstox API calls, zero token refreshes, zero WebSocket connections.
4. **Daemon State:** `com.upstox.paperlive` remains completely unloaded.
5. **Vendor Contact:** No data purchased; technical questionnaire held for owner review.
6. **Protected Evidence Integrity:** All 13 protected archive files verified against `MANIFEST.sha256`.
7. **Port Availability:** Ports 3150 and 3123 verified free.
8. **Implementation Boundary:** Collector implementation has **not** begun; stopped for owner review.
