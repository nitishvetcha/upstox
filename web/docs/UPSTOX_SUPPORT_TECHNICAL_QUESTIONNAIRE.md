# Technical Questionnaire for Upstox Developer Support & API Engineering

**Document Reference:** `web/docs/UPSTOX_SUPPORT_TECHNICAL_QUESTIONNAIRE.md`  
**Target Recipient:** Upstox Developer Support / API Engineering Team (`api-support@upstox.com` / `api@upstox.com` / Developer Portal Support)  
**Author:** Quantitative Systems Engineering Team, Upstox Options Analyzer Project  
**Date:** November 16, 2026  
**Status:** DRAFT FOR OWNER REVIEW ONLY — DO NOT SEND  
**Purpose:** Neutral, technically precise inquiry to obtain authoritative factual confirmation on Upstox API v2/v3 derivative data capabilities, retention schedules, WebSocket feed specifications, and licensing terms.

---

## Ready-to-Send Email Draft (Pending Project Owner Approval)

**To:** `api-support@upstox.com` (cc: `api@upstox.com` or submit via Upstox Developer Portal Support Ticket)  
**Subject:** [Technical Inquiry] Upstox API v2/v3: Derivative Data Retention, WebSocket Feed Specifications, and Pricing Conventions

```text
Dear Upstox API Support & Engineering Team,

We are developing an algorithmic options research and execution analysis engine (Upstox Options Analyzer) utilizing the Upstox API v2 and v3. Our system evaluates intraday index option structures on NIFTY 50 and BANK NIFTY (specifically analyzing delta-based strike selection, bid-ask spread liquidity, and open interest distribution).

To establish an authoritative quantitative research and forward paper-trading architecture without relying on external third-party data vendors, we are conducting a technical audit of Upstox API capabilities. We have reviewed the official documentation and observed specific behaviors in our preliminary development tests. However, several critical technical details regarding historical data retention, feed endpoints, calculation methodologies, and subscription limits require official clarification.

Could you kindly review the 12 technical questions detailed below and provide authoritative engineering responses?

Thank you for your time and continued support of the algorithmic developer ecosystem.

Sincerely,
Quantitative Systems Engineering Team
Upstox Account / Client ID: [OWNER_ACCOUNT_ID_OR_API_KEY]
Project: Upstox Options Analyzer
```

---

## Technical Inquiry Modules

---

### Category 1: Historical Expired Contract Retention by Underlying Asset

* **Specific Technical Questions:**
  1. What is the official historical retention period for expired index and equity derivative contracts accessible via `GET /v2/expired-instruments/expiries` and `GET /v2/historical-candle/expired/...`?
  2. While the developer documentation states that the expired expiries endpoint returns records for *"up to six months"*, our empirical tests retrieved 111 historical expiries for NIFTY dating back to October 3, 2024 (over 25 months). Is historical contract data beyond 6 months an officially supported, permanently accessible archive, or is it an uncommitted/ephemeral cache that may be pruned without notice?
  3. What is the exact historical candle retention depth for **NIFTY** versus **BANK NIFTY**? Specifically, our tests showed that while contract metadata exists back to October 2024 for both indices, 1-minute historical candle queries for October 2024 returned populated bars for NIFTY but zero bars (`count: 0`) for BANK NIFTY. From what specific historical date is continuous 1-minute candle data available for BANK NIFTY?
* **Why It Matters to Our Application:**
  * Statistical backtesting requires continuous, multi-regime sample data across at least 12–18 months. Knowing the guaranteed retention depth by underlying asset prevents building models on data that may disappear or vary between NIFTY and BANK NIFTY.
* **Empirical Observation in Development:**
  * NIFTY returned 111 expiries back to `2024-10-03` with 128 valid 30-minute bars retrieved for `2024-10-03`. BANK NIFTY returned metadata back to `2024-10-01` but returned empty candle arrays (`[]`) for dates prior to mid-2025.
* **API Endpoints Referenced:**
  * `GET https://api.upstox.com/v2/expired-instruments/expiries`
  * `GET https://api.upstox.com/v2/expired-instruments/contracts`
  * `GET https://api.upstox.com/v2/historical-candle/expired/{expired_instrument_key}/{interval}/{to_date}/{from_date}`

---

### Category 2: Historical Candle Response Structure & Retention of Inactive Contracts

* **Specific Technical Questions:**
  1. For historical candle responses from `GET /v2/historical-candle/expired/...`, does the tuple structure adhere strictly to:
     `[timestamp, open, high, low, close, volume, oi]`?
     Specifically, does the **seventh value** (zero-based array index `6`) always represent contract Open Interest at bar close?
  2. Does Upstox retain and return historical candles for contracts and minutes where **zero trades** occurred? Specifically:
     - If an option contract experienced zero trades during a specific 1-minute window, is a synthetic bar generated (e.g. forward-filling the last traded price or carrying forward OI), or is that timestamp completely omitted from the candles array?
     - If an out-of-the-money contract had zero trades throughout an entire trading session, does the endpoint return HTTP 200 with an empty array (`"candles": []`), HTTP 404, or an error code?
* **Why It Matters to Our Application:**
  * Our candle ingestion parser must confirm whether index `6` is guaranteed to be integer Open Interest across all derivative segments, and our time-series engine needs to know whether the candle series is dense (all minutes present) or sparse (trade-only events).
* **Empirical Observation in Development:**
  * Traded option candles in our test sample contained 7 elements with integer OI at index `6`. Untraded deep OTM strikes returned empty candle arrays.
* **API Endpoints Referenced:**
  * `GET https://api.upstox.com/v2/historical-candle/expired/{expired_instrument_key}/1minute/{to_date}/{from_date}`

---

### Category 3: Historical Full-Chain Open Interest & Synchronization

* **Specific Technical Questions:**
  1. What is the historical date range supported by the `GET /v2/market/oi` and `GET /v2/market/change-oi` endpoints when querying with the `date=YYYY-MM-DD` parameter?
  2. Does `GET /v2/market/oi` return a synchronized, complete snapshot of all listed strikes (active and inactive) for the specified historical date at End-of-Day (EOD)?
  3. Does Upstox provide any REST endpoint or bulk download facility for **intraday full-chain Open Interest snapshots** (e.g. at 09:30, 10:00, or 15-minute intervals) on historical dates, or is historical full-chain OI strictly available as an EOD settlement snapshot?
* **Why It Matters to Our Application:**
  * Our strategy models both Day-1 closing Put-Call Ratio (PCR) and intraday morning institutional buildup. If intraday full-chain snapshots do not exist historically, our research pipeline cannot compute historical intraday PCR or chain-wide max pain, and must restrict historical backtests to EOD positioning metrics.
* **Empirical Observation in Development:**
  * The documentation specifies `spot_closing_price` and accepts a calendar `date`, indicating `GET /v2/market/oi` is an EOD settlement snapshot. No historical intraday full-chain snapshot endpoint was identified.
* **API Endpoints Referenced:**
  * `GET https://api.upstox.com/v2/market/oi`
  * `GET https://api.upstox.com/v2/market/change-oi`

---

### Category 4: Availability of Historical Bid/Ask Quotes and Order Book Depth

* **Specific Technical Questions:**
  1. Does Upstox archive or provide access to historical Level 1 bid/ask quotes (top of book), bid-ask spreads, or Level 2 market depth (top 5 bids/asks) for expired option contracts at any historical interval (tick, 1-second, or 1-minute)?
  2. If historical bid/ask quotes are not currently available via REST API, is there an alternate enterprise data feed, tick archive, or batch export service available for algorithmic backtesting?
* **Why It Matters to Our Application:**
  * Strategy 11.4 enforces a mandatory execution guard: **Reject any trade where the bid-ask spread exceeds 5.0% of the price or where bid/ask depth is zero**. If historical bid/ask quotes are unavailable, this execution rule cannot be validated on historical data, and fill prices must rely on modeled assumptions rather than observed market quotes.
* **Empirical Observation in Development:**
  * All historical candle endpoints return OHLCV and OI only. No historical quote or order-book endpoint is listed in API v2 or v3 documentation.
* **API Endpoints Referenced:**
  * `GET https://api.upstox.com/v2/historical-candle/...`
  * `GET https://api.upstox.com/v3/market-quote/quotes` (Live only)

---

### Category 5: Historical and Live Option Greeks Methodology

* **Specific Technical Questions:**
  1. Does Upstox archive historical Option Greeks (Delta, Gamma, Theta, Vega) and Implied Volatility (IV) for expired contracts, or are Greeks strictly available in real time during live market sessions?
  2. For the live Greeks provided via `GET /v3/market-quote/option-greek`, `GET /v2/option/chain`, and the WebSocket feed in `full` mode:
     - Are these Greeks directly observed from an exchange feed, or are they calculated server-side by Upstox?
     - What mathematical model is used for the calculation (e.g. Black-Scholes-Merton 1973, Black-76, or a binomial model)?
     - What underlying price is used as the reference asset for index options: the live cash spot index (e.g. `NSE_INDEX|Nifty 50`), the near-month futures contract price, or a synthetic forward derived from put-call parity?
     - What interest rate ($r$) convention is used (e.g. fixed rate, RBI 91-day T-Bill, MIBOR), and what dividend yield ($q$) is assumed for index contracts?
     - What day-count convention is used for time-to-expiry ($T$) (e.g. calendar days/365, trading days/252, or continuous seconds remaining until 15:30 IST)?
* **Why It Matters to Our Application:**
  * Strategy 11.4 selects option strikes based on target Delta ranges (0.16–0.22 for short legs, 0.05–0.08 for long wings). If historical Greeks are unavailable, our research pipeline must compute synthetic Greeks locally. To ensure historical strike selection matches live production execution, the local model must replicate Upstox's server-side pricing methodology exactly.
* **Empirical Observation in Development:**
  * Live option chain and quote endpoints return populated Greek fields (`delta`, `gamma`, `theta`, `vega`, `iv`). No historical Greek endpoint was found.
* **API Endpoints Referenced:**
  * `GET https://api.upstox.com/v3/market-quote/option-greek`
  * `GET https://api.upstox.com/v2/option/chain`

---

### Category 6: WebSocket Feed Version and Connection Endpoint

* **Specific Technical Questions:**
  1. What is the authoritative WebSocket endpoint and feed version for real-time market data streaming? Is it Market Data Feed V3 (`wss://api.upstox.com/v3/feed/market-data-feed`) or V2?
  2. What is the official connection authorization workflow:
     - Does the client call `GET https://api.upstox.com/v3/feed/market-data-feed/authorize` to obtain an authorized redirect URL, or can an access token be passed directly in the WebSocket handshake headers / query parameters?
  3. Is the official Protocol Buffers schema file `MarketDataFeed.proto` (package `com.upstox.marketdatafeederv3udapi.rpc.proto`, SHA-256 `3e1c939dce2c83a3fef91405c5ca268dfa089aae973319f56685f12a5afcf612`) the current and active production schema for all binary feed messages?
* **Why It Matters to Our Application:**
  * Our prospective live collector implements a binary protobuf decoder. We must confirm that our client connects to the correct endpoint and decodes against the actively maintained production schema.
* **Empirical Observation in Development:**
  * The official schema downloaded from `https://assets.upstox.com/feed/market-data-feed/v3/MarketDataFeed.proto` defines package `com.upstox.marketdatafeederv3udapi.rpc.proto` and decodes mock binary frames successfully.
* **API Endpoints Referenced:**
  * `GET https://api.upstox.com/v3/feed/market-data-feed/authorize`
  * WebSocket Market Data Feed V3

---

### Category 7: WebSocket Subscription Limits and Mode Capacities

* **Specific Technical Questions:**
  1. What is the authoritative maximum number of instrument keys that can be subscribed simultaneously across a single WebSocket connection:
     - In `ltpc` mode?
     - In `full` mode (which streams LTP, 5-level market depth, volume, OI, and Greeks)?
     - Does documentation citing 1,500 instruments refer specifically to `full` mode, while 2,000 refers to `ltpc` mode, or are these different version limits?
  2. Can a single developer account / API key open multiple concurrent WebSocket connections to distribute instrument subscriptions across multiple sockets if needed? If so, what is the maximum number of concurrent connections permitted?
  3. Are there bandwidth, message-rate, or throughput throttling limits applied per WebSocket connection during market open spikes (09:15–09:30 IST)?
* **Why It Matters to Our Application:**
  * Our planned architecture requires tracking approximately 250 derivative instruments (NIFTY and BANK NIFTY front and next weekly options, ATM $\pm$ 15 strikes, plus near futures) and 2 spot index keys (totaling 252 subscription keys). We need to determine whether 252 simultaneous instruments in `full` mode can be supported on a single WebSocket connection, or whether our client architecture must implement multi-connection sharding (e.g. 50–100 keys per socket) to avoid message drops or disconnects.
* **Empirical Observation in Development:**
  * Available documentation contains unverified references to both 1,500 and 2,000 instruments, but neither limit has been empirically tested for binary `full` mode streaming in our environment. Authoritative confirmation of the single-connection cap is required for capacity planning.
* **API Endpoints Referenced:**
  * WebSocket Market Data Feed V3 subscription messages (`sub`, `change_mode`, `unsub`)

---

### Category 8: WebSocket Timestamp Semantics and Update Frequency

* **Specific Technical Questions:**
  1. Inside the binary `FeedResponse` protobuf structure, what exact time sources do the timestamps represent:
     - Does `ltpTs` represent the exchange trade execution timestamp or Upstox's feed gateway receipt timestamp?
     - Does `quoteTs` (or `currentTs`) represent the exchange order book update time, or the timestamp when Upstox serialized the protobuf frame?
     - What timezone and epoch format are used (e.g. UTC milliseconds, IST milliseconds)?
  2. What is the conflation or update frequency of the WebSocket stream during active market trading:
     - Are market depth updates pushed tick-by-tick on every order book change, or are they conflated at a fixed interval (e.g. 100ms, 250ms, 500ms)?
     - At what frequency are Option Greeks recalculated and pushed over the WebSocket stream?
  3. Does the Upstox market-data feed emit packet sequence numbers, exchange matching engine sequence numbers, or unique trade event identifiers at either the frame level or per-instrument level to enable unambiguous subscriber-side deduplication? Furthermore, does the server guarantee periodic server-side heartbeat frames during market hours when contracts experience no price or depth changes?
* **Why It Matters to Our Application:**
  * Our strategy uses strict quote freshness checks ($< 2.0$ seconds). Understanding whether timestamps reflect exchange generation time versus broker serialization time is critical for measuring network transport latency and preventing false staleness rejections.
* **Empirical Observation in Development:**
  * Decoded mock frames show 64-bit millisecond integers. Live conflation and update frequencies cannot be determined without vendor confirmation or live streaming.
* **API Endpoints Referenced:**
  * Protobuf definitions: `MarketDataFeed.proto` (`FeedResponse`, `LTPC`, `FullFeed`, `OptionGreeks`)

---

### Category 9: Underlying Index Traded Volume and VWAP Calculation

* **Specific Technical Questions:**
  1. Historical candles for cash spot indices (e.g. `NSE_INDEX|Nifty 50` and `NSE_INDEX|Nifty Bank`) return `volume = 0` across all historical intervals. Can you confirm that this is expected behavior because spot indices are mathematical computations rather than traded contracts?
  2. For algorithmic strategies requiring Volume-Weighted Average Price (VWAP) for index trend evaluation, is the official Upstox recommendation to compute VWAP from the corresponding near-month index futures contract (`NSE_FO|...FUT`)?
  3. Does Upstox provide an official intraday VWAP field in the WebSocket feed or historical candles for futures contracts, or should VWAP be accumulated locally from 1-minute OHLCV candles starting at 09:15 IST?
* **Why It Matters to Our Application:**
  * Strategy 11.4 uses intraday VWAP to confirm market trend before taking short credit spread positions. Confirming that spot indices naturally have zero volume ensures that our data-quality monitors do not flag spot index series as corrupted.
* **Empirical Observation in Development:**
  * All historical candles for `NSE_INDEX|Nifty 50` contain `volume: 0`. Index futures contracts in `NSE_FO` contain populated trade volumes.
* **API Endpoints Referenced:**
  * `GET https://api.upstox.com/v2/historical-candle/NSE_INDEX%7CNifty%2050/1minute/...`
  * `GET https://api.upstox.com/v2/historical-candle/expired/{futures_key}/1minute/...`

---

### Category 10: REST Fallback Behavior During Feed Disconnections

* **Specific Technical Questions:**
  1. In the event of a brief network disconnection from the WebSocket feed during market hours, if a client calls `GET /v2/option/chain` upon reconnecting, does the response reflect only the instantaneous market quote at the moment of the REST request, or is there any mechanism to retrieve quotes that occurred during the disconnected interval?
  2. What are the applicable REST rate limits (requests per second and per minute) for `GET /v2/option/chain` and `GET /v3/market-quote/quotes` on standard trading accounts versus developer accounts?
* **Why It Matters to Our Application:**
  * Our failover design must establish whether missed 15-minute decision intervals can be reconstructed via REST, or whether missed intervals must be permanently recorded as data gaps.
* **Empirical Observation in Development:**
  * REST option chain responses provide current snapshot quotes. Standard published rate limits are 50 req/s and 500 req/min for market data.
* **API Endpoints Referenced:**
  * `GET https://api.upstox.com/v2/option/chain`
  * `GET https://api.upstox.com/v3/market-quote/quotes`

---

### Category 11: Account Entitlements and Plan Parity (Basic vs. Plus)

* **Specific Technical Questions:**
  1. Are there any differences between the Upstox **Basic** brokerage plan and **Plus** brokerage plan regarding:
     - REST API rate limits or request quotas?
     - WebSocket subscription caps or available modes (`ltpc` vs. `full`)?
     - Access to historical expired contract discovery (`/v2/expired-instruments/...`)?
     - Access to live Option Greeks via REST or WebSocket?
  2. Does calling historical expired endpoints (`/v2/historical-candle/expired/...`) require an active Plus subscription, or is it accessible across all standard developer app accounts? Specifically, what does error code `UDAPI1149` indicate?
  3. Are there separate API subscription tiers or fees required for quantitative / algorithmic trading access, or is developer API access included with standard trading accounts?
* **Why It Matters to Our Application:**
  * Our software maintains strict account-plan safety rules. We must know whether our data collector and research tools require a specific brokerage plan to avoid unexpected `UDAPI1149` errors during operation.
* **Empirical Observation in Development:**
  * Preliminary tests with basic credentials previously encountered `UDAPI1149` on expired contract endpoints, suggesting certain historical derivative endpoints may be gated by account plan.
* **API Endpoints Referenced:**
  * Upstox Developer Portal & Pricing Pages

---

### Category 12: Data Archival and Internal Research Licensing Terms

* **Specific Technical Questions:**
  1. Under the Upstox API Terms of Service and applicable exchange regulations (NSE/BSE), are independent algorithmic traders permitted to store streaming market data (1-minute bars, quote snapshots, depth, OI, Greeks) locally in private databases (e.g. SQLite, Apache Parquet) solely for internal, non-commercial quantitative backtesting and algorithmic research?
  2. Are there any restrictions, retention time limits, or compliance audit requirements regarding locally archived market data when used exclusively by the account holder for personal strategy development?
* **Why It Matters to Our Application:**
  * Our prospective collector is designed to store approximately 10–12 MB/day of compressed 1-minute market data in local Parquet files to support walk-forward strategy validation over a 6-month period (~1.5 GB total). We require confirmation that private local research storage complies fully with Upstox developer agreements and exchange data policies.
* **API Endpoints Referenced:**
  * Upstox API Terms of Service & Developer Agreement

---

## Instructions for Project Owner

1. **Review Required:** Inspect all questions above to ensure they align with project goals.
2. **Account Details:** Insert registered Client ID / UCC and Developer App Client ID in the email header before sending.
3. **Dispatch:** Submit to `api@upstox.com` or create a developer support ticket via the Upstox Developer Portal.
4. **DO NOT MODIFY CODE:** This document is an informational inquiry only; no code changes or implementation steps should be taken prior to receiving vendor confirmation.
