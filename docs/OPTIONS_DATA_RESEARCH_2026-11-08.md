# Options data research, 2026-11-08 (Phase 4)

Written for: the project owner. Scope: data already collected, plus the Upstox inventory record from 2026-10-24. No new downloads, no provider requests, no purchases, no plan changes. The NSE bulk bhavcopy collector was not restarted.

## 1. What is on disk

| Source | Coverage | Status |
|---|---|---|
| NSE F&O bhavcopy, 2022-01-03 (old format) | One trading day | Verified: zip CRC ok, 67,883 option rows |
| NSE F&O bhavcopy, 2026-11-05 (new format) | One trading day | Verified: zip CRC ok, 38,351 option rows |
| NSE F&O bulk sweep (`nse-bhavcopy-2026-11-06/`) | **Zero archives stored.** Stopped on its first request (a 403 for 2000-01-03, a missing archive). A later probe returned 503 for a file that worked earlier. | Not running. Not restarted, per instruction |
| Upstox historical option candles | Expired contracts refused (UDAPI1149, Plus plan required). Active contracts: 16 inventoried, minute bars from 2026-09-28 | Record from 2026-10-24. Not re-probed |
| Forward-collected option audit rounds (`options-audit-research/`) | 3 sessions (2026-10-27 to 2026-11-05), 2,662 contract samples | Live snapshots, not history |

## 2. Fields in the NSE archives

Both archives carry the contract identity (underlying, expiry, strike, CE/PE), OHLC, settlement price, contracts traded, value traded and open interest with change in OI.

| Field | 2022-01-03 | 2026-11-05 |
|---|---|---|
| Underlying, expiry, strike, option type | yes | yes |
| Open, high, low, close, settlement | yes | yes |
| Volume (contracts) | yes (populated on 7,860 of 67,883 option rows) | yes (14,586 of 38,351) |
| Open interest | yes (populated on 9,655 of 67,883, about 14%) | yes (19,295 of 38,351, about 50%) |
| Lot size | **not present** | yes (e.g. NIFTY 65, BANKNIFTY 30) |
| Bid, ask, IV, Greeks | **not present** | **not present** |
| Index option rows | 5,833 (NIFTY 1,983, BANKNIFTY 2,312, FINNIFTY 1,538) | 6,295 (NIFTY 2,050, BANKNIFTY 975, FINNIFTY 564, MIDCPNIFTY 934, NIFTYNXT50 1,222, NIFTYFPI 550) |
| Distinct expiries in the file | 31 | 18 |

The open-interest population rate differs sharply between the two days (14% against 50%). Open interest has not been checked for consistency across days, so it should not be used as a complete series.

## 3. Coverage limits

- **Historical options coverage is two trading days.** No option time series can be built from what is on disk. There are no historical option chains, no expired-contract candles, and no option data for the 2022–2026 window beyond these two days.
- **Bid/ask, IV and Greeks are absent** from every historical source checked. IV and Greeks could be derived from daily settlement prices with stated assumptions (rate, dividend, expiry convention), but that would be a model output and must be labelled as derived.
- **Lot size history** is absent for 2022. The 2026 lot sizes cannot be assumed for earlier periods, because lot sizes have changed over time.
- **Intraday execution simulation** is impossible from bhavcopy. It has no intraday prices.

## 4. Access and licensing (not verified)

- NSE archives are public, but their terms of use were not read or verified in this session. Commercial or redistribution use would need a check.
- Upstox historical option data for expired contracts requires the Plus plan (UDAPI1149, confirmed on 2026-11-06). Buying that plan is a paid action and needs your approval.
- A licensed NSE F&O historical vendor is the other route. Its cost, coverage and licence were not investigated, because it would be a purchase.

## 5. What would unblock index and stock options research

1. **Daily option research (OHLC, OI, volume, expiry, strike):** resume the NSE bhavcopy sweep for 2010–2026. Estimated about 4,000 trading days, roughly 0.8–1.3 MB per zip (about 3–4 GB), at the collector's throttle that is a few hours. **Needs your approval.** The 2000–2009 archives appear to be absent (403 on the first request), so the sweep would confirm that before spending requests on them.
2. **Intraday option research:** the Upstox Plus plan or a licensed vendor covering expired minute bars with OI and volume. **Needs your approval and a cost decision.**
3. **IV and Greeks:** either a vendor field or a derived calculation with the assumptions written down. Derived values would be labelled as derived.
4. **Stock options:** the same routes. The two sample days include stock options (STO rows), but coverage is equally limited.

Nothing in this document is a trading result. It establishes only what data exists.
