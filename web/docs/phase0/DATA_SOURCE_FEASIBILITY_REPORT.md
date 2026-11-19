# Data-source feasibility report (Phase B)

Date: 2026-11-13. Method: web research and official documentation only, via search summaries and cited pages. **No Upstox API calls, no token operations, no subscriptions, no purchases.** Pages cited below were identified by search and were not all opened in full. Every claim is labelled:

- **Documented:** stated on a page identified in search (page still needs opening and checking before use).
- **Claimed:** stated by a vendor or third party, not verified.
- **Unknown:** not found.

No recommendation rests on marketing claims. Pricing and licensing are **Unknown** for every provider unless noted.

## 1. Requirements (from the completion plan)

Historical bid/ask; full-chain historical OI; change in OI; historical Greeks or the raw inputs for them; 15-minute and daily underlying candles; underlying and futures volume (for VWAP); contract master with expiries and strikes; historical depth; API limits; pricing; licensing.

## 2. Providers and what the sources say

### 2.1 NSE Data & Analytics (official, sells NSEIL data)
- **Documented:** the F&O product specifications list two historical products, End of Day Data and Historical Data, alongside real-time feeds. Source: [Snapshot MDR RT FAO V1.7 PDF](https://nsearchives.nseindia.com//web/mediaattachment/2026-08/Snapshot_MDR_RT_FAO_V1.7.pdf) and [Snapshot MDR RT FAO V15 PDF](https://nsearchives.nseindia.com//web/mediaattachment/2026-01/Snapshot_MDR_RT_FAO_V15_20260105111342.pdf).
- **Documented:** option Greeks appear on the real-time Analytical Feed, not the historical products. Source: [Snapshot 15 FAO v1.7 PDF](https://nsearchives.nseindia.com//web/mediaattachment/2026-08/Snapshot_15_FAO_v1.7.pdf).
- **Documented:** the EOD F&O subscription page points to a tariff, a technical specification and sample files, with contact marketdata@nse.co.in. Source: [NSE EOD historical data subscription](https://www.nseindia.com/market-data/eod-historical-data-subscription) (page last updated 18/06/2025 per the search summary).
- **Documented:** Level 1 provides best bid and ask, and Level 2 provides up to five levels of depth. These are real-time products. Source: [NSE real-time data subscription](https://www.nseindia.com/market-data/real-time-data-subscription).
- **Unknown:** whether the historical products include historical bid/ask, full-chain OI or Greeks. The specification PDFs must be read to confirm.
- **Unknown:** the price. The tariff document must be obtained.

### 2.2 Free NSE bhavcopy (official archives)
- **Documented:** daily F&O bhavcopy files are downloadable. Source: [R package nser documentation](https://rdrr.io/cran/nser/f/inst/doc/fobhav1.Rmd).
- **Documented (via the same source):** bhavcopy contains end-of-day contract data without bid/ask or Greeks. This limits its use for execution-quality research.
- **Usefulness:** EOD expiry and contract master, and an audit cross-check. Not sufficient alone.

### 2.3 Fyers (broker API)
- **Documented:** an expired F&O API returns candles, open interest and Greeks for expired contracts. Source: [Fyers expired F&O data docs](https://fyers.in/api-docs/v3/api/market-data/expired-fo-data/get-expired-fo-data/).
- **Claimed:** the option-chain API returns bid, ask and open interest per strike for live data. Source: [Fyers option chain docs](https://fyers.in/api-docs/v3/api/market-data/option-chain/). The summary says rate limits differ by plan.
- **Unknown:** whether the expired data includes bid/ask or full-chain snapshots; historical depth; pricing; licence for research or redistribution. Requires an account and the terms.
- **Requirement:** a Fyers account and a separate data agreement, which is a decision for the owner.

### 2.4 StockMojo
- **Claimed:** a minute-level historical option-chain replay with Greeks and IV, covering multiple years for major indices and F&O stocks, with thinner coverage for newer stocks. Sources: [StockMojo timeseries option chain](https://stockmojo.in/timeseries-option-chain.md) and [StockMojo historical chart](https://stockmojo.in/historical-chart.md).
- **Unknown:** whether bid/ask and full-chain OI are included; the licence; the price; the reliability of the data. Not verified.

### 2.5 TrueData (commercial)
- **Claimed:** streaming feeds for OHLC, bid/ask, volume and OI. Source: [TrueData market data APIs](https://www.truedata.in/market-data-apis).
- **Claimed:** pricing depends on exchange selection, the number of instruments and the data type, plus separate exchange fees. No historical-specific tier was listed in the search summary.
- **Unknown:** historical depth; whether historical bid/ask and Greeks exist; licence.

### 2.6 NiftyTrader
- **Claimed:** a historical page describing strike-wise OI, volume, IV, LTP and bid-ask. Source: [NiftyTrader historical option data](https://www.niftytrader.in/nse-option-historical-data).
- **Unknown:** API, pricing, licence, depth and whether the bid/ask is per snapshot. Not verified.

### 2.7 Upstox (current provider, verified in this project)
- **Verified:** expired-option candles with OI on Plus (35-request test, 30-minute and other intervals). Historical bid/ask is not in the candle response.
- **Verified:** V3 quotes give five-level depth and bid/ask quantities for live legs (Phase 8).
- **Unverified for this account:** V3 Full-mode entitlement (portal check blocked; UNCONFIRMED).
- **Verified limit:** no historical bid/ask, historical Greeks or full-chain snapshot endpoint has been found in this project's tests.

## 3. Comparison against the requirements

| Requirement | Upstox (verified) | NSE Data & Analytics | NSE bhavcopy | Fyers | StockMojo | TrueData | NiftyTrader |
|---|---|---|---|---|---|---|---|
| Historical option prices | Yes (candles, Plus) | Documented (EOD/historical products) | Yes, EOD only | Documented (expired) | Claimed | Unknown | Claimed |
| Historical bid/ask | **No** | Unknown | **No** | Unknown | Unknown | Unknown | Claimed |
| Full-chain historical OI | Per-contract only | Unknown | EOD only | Unknown | Unknown | Unknown | Claimed |
| Historical Greeks | **No** | **Not on historical products (documented)** | **No** | Documented (expired) | Claimed | Unknown | Claimed (IV) |
| 15-minute underlying candles | Yes | Unknown | No | Unknown | Unknown | Unknown | Unknown |
| Futures/underlying volume | Unknown for futures | Unknown | EOD | Unknown | Unknown | Unknown | Unknown |
| Expiry and contract master | Yes (expiries and contracts) | Unknown | Yes | Unknown | Unknown | Unknown | Unknown |
| Historical depth | About 2 years observed (expiries list) | Unknown | Long (archive) | Unknown | Claimed multi-year | Unknown | Unknown |
| API limits | Rate limit unknown | Unknown | File download | Plan-dependent (claimed) | Unknown | Unknown | Unknown |
| Pricing | Plus subscription; per-request not established | **Tariff not read** | Free | **Unknown** | **Unknown** | **Unknown** | **Unknown** |
| Licence for research | Upstox terms (not reviewed here) | Unknown | Public archive | Unknown | Unknown | Unknown | Unknown |

**Reading the table:** no source is documented as providing all of historical bid/ask, full-chain OI and Greeks together. The strongest documented items are NSE's EOD and historical product list (contents unverified) and Fyers' expired-F&O data (Greeks documented, bid/ask unknown). Several entries rest only on vendor claims.

## 4. Feasibility conclusions

1. **No single verified provider satisfies every requirement.** A combination may be needed. Whether a combination is technically and legally workable is **Unknown** until the licence and data specifications are read.
2. **The most valuable next evidence is documentary:** the NSE Data & Analytics historical product specifications and tariff, and the Fyers expired-F&O documentation (including terms). Both are free to read.
3. **Pricing cannot be estimated** until those documents or quotes are available. Any budget must wait for them.
4. **Greeks may need to be calculated** from raw inputs (spot, strike, expiry, rate, implied volatility or price) under an approved pricing model. That is a modelling assumption and must be labelled as such.

## 5. Recommended next steps (no spending)

1. Read the NSE Data & Analytics historical F&O specification and tariff. Ask marketdata@nse.co.in for written confirmation of historical bid/ask, full-chain OI and Greeks coverage, depth and price. The owner should send this request.
2. Read Fyers' expired-F&O documentation and terms, including research licensing and rate limits.
3. Request written quotes from TrueData and StockMojo, covering historical bid/ask and Greeks.
4. Confirm the Upstox licence for research use and whether any historical quote endpoint exists beyond those already tested.
5. Decide, with the owner, whether a model-based Greeks approach is acceptable under the methodology rules.

## 6. Decisions requiring the owner

- Authorise the owner to contact NSE Data & Analytics and the other providers for written quotes (outbound contact is an owner action).
- Choose whether to pursue a multi-provider architecture or wait for the NSE quote.
- Decide whether model-calculated Greeks are acceptable for a validation methodology.

No API key, subscription or purchase was made for this report.
