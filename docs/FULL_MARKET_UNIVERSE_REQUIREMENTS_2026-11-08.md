# Full Indian market coverage: requirements, availability, storage, limits (2026-11-08)

Written for: the project owner. A requirements and feasibility document. It starts no downloads, bulk collection, purchases or plan changes. Each unknown is marked as unknown, not estimated as fact.

## 1. Current state (verified)

- Research universe: 50 NSE equities (verified daily, 15-minute and 1-hour data) plus 6 indices (daily).
- Options: no historical option chains. Two bhavcopy sample days on disk. Bulk sweep stopped with zero archives. Expired Upstox option data needs the Plus plan.
- Strategy 11.4 is frozen and unaffected.

## 2. Equity universe discovery (requires a new authorised source)

- Source needed: the complete NSE equity instrument master (ISIN, symbol, series, listing date, lot/tick, F&O eligibility). The Upstox instrument file in `.data/instruments/` covers only the current set and must be checked for completeness before reuse.
- Count, categories and eligibility: **unknown until the master is read.** Not estimated here.
- Filters to define before any data is pulled: series (EQ only), listing age, minimum history, liquidity (traded value over 60 days), price band, data quality, and surveillance or suspension status.
- Exclusions must be logged with the exact rule, the value that failed, and the date.
- BSE equities: a separate expansion. Reliable historical data was not verified.

## 3. Index derivatives (discover, do not hardcode)

- Known from the bhavcopy samples: NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY, NIFTYNXT50, NIFTYFPI, all with index-option rows. The active set must come from the live contract master on each run.
- Historical depth per underlying: only two trading days verified.

## 4. Stock options

- Active F&O set: discovered from the contract master, not hardcoded.
- Lot size: present in the 2026 bhavcopy only.
- Per-contract checks: volume, open interest, expiry and strike coverage, and quote freshness. Bid, ask, IV and Greeks are not historically available.

## 5. Data availability summary

| Data | Historical | Status |
|---|---|---|
| Equity daily | Verified for 50 stocks, back to 2000 | Expansion needs a source per symbol |
| Equity 15m and 1h | Verified for 50 stocks, from 2022 | Expansion is a bulk collection, needs approval |
| Index daily | Verified for 6 indices | Discover the full index set |
| Index and stock options, OI and volume | Two bhavcopy days | Full sweep needs approval |
| Bid/ask, IV, Greeks | None | Derived only, labelled as derived |
| Corporate actions | 2000–2026 NSE records | Parsed; price evidence checked |

## 6. Storage and API limits (to measure, not assumed)

- Bhavcopy: roughly 0.8–1.3 MB per trading day, so about 3–4 GB for 2010–2026. Actual size depends on the archive years that exist.
- Equity 15m for 50 stocks used about 3,200 requests and fits comfortably on disk. A full universe multiplies this by the stock count and needs a measured estimate first.
- Upstox historical limits observed: 3,000 days per daily request, 28 days per 15m request, 85 days per hourly request, and an intermittent 429 or 503 pattern on bulk runs.
- NSE archives: throttled at about 1.5 s per request, with intermittent 503 responses.
- A collection requires approval before the first bulk call.

## 7. Architecture for a dynamic universe

- Instrument master ingested on each run, with a version stamp.
- Universe rules applied as data, not code: eligibility, liquidity, freshness and data-quality thresholds, each versioned.
- Each instrument carries four status fields: live supported, historically verified, strategy validated, and suitability. A status can be true without implying a recommendation.
- Research and recommendation output separate the instrument families: index spot and futures, index options, stock spot and futures, stock options.
- Recommendations return NO TRADE with the failing check when any gate fails.

## 8. Proposed phases (each needs approval before it spends)

1. Read the NSE equity instrument master (a single authorised file request) and log the count and exclusion rules.
2. Measure the storage and request estimate for the full universe, from the master and a sample.
3. Approved bulk collection, one family at a time, starting with the daily equity series.
4. G-1 style predictive diagnostics per family, using the same gate and protocol rules.
5. Dashboard filters: index, stock, instrument type, liquidity, strategy, expiry, market conditions.

## 9. Decisions and limits

- Strategy 11.4 frozen. No broker order execution. No purchases, plan upgrades, or bulk collection without separate approval.
- Survivorship bias remains until point-in-time constituent data is available.
- Historical option chains, IV and Greeks remain unavailable on the current access.
