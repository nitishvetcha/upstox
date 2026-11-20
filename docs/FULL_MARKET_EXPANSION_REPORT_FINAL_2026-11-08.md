# Full-market expansion report, final (2026-11-08)

Supplements, and does not replace, `FULL_MARKET_UNIVERSE_REQUIREMENTS_2026-11-08.md`, `FULL_MARKET_SUPPLEMENT_1_2026-11-08.md` and the interim report. Confirmed facts, estimates and open questions are separated below.

## A. Confirmed facts

**Equity universe.** Source `https://archives.nseindia.com/content/equities/EQUITY_L.csv` (one request, 2,632 rows, SHA-256 3675bb26...5970e): 2,398 EQ, 200 BE, 34 BZ. All 50 research stocks are present as EQ with matching ISINs. One listing date (2026-11-11) is after today and is treated as scheduled.

**F&O universe.** Source `https://nsearchives.nseindia.com/content/fo/NSE_FO_contract_06112026.csv.gz` (MII contract file, one request, HTTP 200, 1,960,429 bytes, SHA-256 96580df7...e42c, last-modified 2026-11-06). The old `fo_mktlots.csv` was discontinued by NSE/FAOP/61157 (15 March 2024).
- 89,722 contract rows: OPTIDX 13,229, OPTSTK 75,520, FUTSTK 667, FUTIDX 18. 288 rows have DelFlg = Y (deleted), excluded.
- **Index derivative underlyings (six):** NIFTY (lot 65), BANKNIFTY (30), FINNIFTY (60), MIDCPNIFTY (120), NIFTYNXT50 (25), NIFTYFPI (1,100).
- **Stock F&O underlyings: 218 real.** 236 symbols are listed, of which 18 are NSE test instruments (names ending NSETEST) and are excluded. All 218 match an equity-master symbol.
- The file lists currently listed contracts. Expired contracts are not included.

**Pilot match to F&O.** Of the 100 pilot stocks, **12 are F&O-eligible** (360ONE, ADANIGREEN, BLUESTARCO, HAL, IREDA, NMDC, PAYTM, PGEL, POWERINDIA, PREMIERENE, SONACOMS, SYRMA) and 88 are not. No symbol or ISIN mismatches. Matching uses the symbol column, because the derivative rows leave ISIN blank.

**Pilot collection (100 stocks, `upstox-pilot-100-2026-11-08`).**
- Sample: stratified by listing era only (34 pre-2010, 33 for 2010–2021, 33 from 2022), with a fixed seed. Not balanced by sector, market cap, liquidity or F&O status.
- Requests: 8,900 planned, 8,900 made, 8,900 stored (HTTP 200), **0 failed, 0 rate-limited, 0 access-restricted**. Duration 1,777 s, average **5.0 requests per second**.
- Integrity (verification `upstox-pilot-verified-2026-11-08`): 8,900 of 8,900 expected files valid, 0 missing, 0 invalid, 0 extra, 0 temporary, 0 manifest mismatches, 0 duplicate stored rows. Raw candles: 3,236,732.
- Hashes: each file's SHA-256 of stored bytes is in `verification.json`. The manifest's recorded body hashes were not reproducible from stored JSON for 6,949 of 8,900 files (see limitations). The file-level hashes are the reference.
- No conflicting duplicate timestamps across chunks. Dropped bars: 3 daily, 316 hourly, 904 fifteen-minute, all counted and never repaired (mostly off-grid timestamps and a few OHLC-inconsistent bars).

**Coverage by interval** (expected sessions = calendar sessions from the stock's own first daily bar to 2026-11-05):

| Interval | Series | Expected sessions | Missing sessions | Partial sessions | Stocks with any missing |
|---|---|---|---|---|---|
| Daily, 2000–2026 | 100 | 216,921 | 5,386 | 0 | 20 |
| Hourly, 2022–2026 | 100 | 78,808 | 946 | 593 | 77 |
| 15-minute, 2022–2026 | 100 | 78,808 | 869 | 3,164 | 77 |

- Most missing sessions are in a few stocks, not spread across the sample. Daily examples: ELIN (1,794 missing sessions from its first bar in 2015), TARMAT (1,022), 360ONE (906). These gaps are on trading days with no bars, which is consistent with suspension or no trading. They are not filled.
- Partial sessions (fewer bars than the regular grid) are most common in the 15-minute and hourly series, and they match the thin trading of the same stocks. Upstox returns bars only for intervals with trades.
- Extra non-session bars: 8 daily, 4 hourly, 0 fifteen-minute.
- Storage: daily 0.17 MB per stock, hourly 0.41 MB, fifteen-minute 1.43 MB, about 2.0 MB per stock in total. The whole pilot raw store is 204.5 MB.

## B. Estimates (based on measured pilot numbers, not confirmed for the full run)

| Collection (2,398 EQ, upper bound) | Requests | Storage | Duration at 5.0 req/s |
|---|---|---|---|
| Daily 2000–2026 | ~9,600 | ~0.41 GB | ~32 min |
| Hourly 2022–2026 | ~50,400 | ~0.98 GB | ~2.8 h |
| 15-minute 2022–2026 | ~153,500 | ~3.4 GB | ~8.5 h |
| All three | ~213,400 | ~4.8 GB | ~11.9 h |
| NSE bhavcopy 2010–2026 (not approved) | ~4,100 days | ~3–5 GB | ~2 h |

- The estimates use the pilot's per-stock request count and size. The full universe includes about 900 stocks listed after 2022, which are smaller, so these are upper bounds.
- The collector ran as a single process at about 5 requests per second. Parallel collection is not tested and would need a measured rate limit check.
- Free disk is about 9 GiB. Daily plus hourly fit comfortably. All three intervals (4.8 GB) plus the 2 GiB floor is tight, and the bhavcopy sweep (3–5 GB) does not fit without more storage.

## C. Unresolved questions (not confirmed)

1. **Quantity-freeze field: UNCONFIRMED.** NSE/MSD/60315 (19 January 2024) could not be located by search. `MaxTradQty` looks like a freeze figure, and its index values are 1 more than the secondary-source freeze figures (NIFTY 1,801 against 1,800; BANKNIFTY 901 against 900). That is a hypothesis only. It is not used for trading or risk enforcement. The approved request has not been spent because no verified URL exists.
2. **Historical options.** Two bhavcopy days exist (2022-01-03 and 2026-11-05). Expired Upstox option candles are refused without the Plus plan (UDAPI1149). Bid/ask, IV and Greeks are not historically available from any source checked.
3. **Lot-size history.** The MII file gives current lot sizes only. Earlier lot sizes are not available.
4. **Liquidity and survivorship.** No liquidity field was used (no equity volume source was approved). The universe is today's constituents, so survivorship bias is present.
5. **Corporate actions.** Not verified across the full universe. The earlier price-evidence test (26 of 26 events back-adjusted) covers only the 50 research stocks.
6. **Body-hash reproducibility.** The manifest records a hash of raw response text, which was not stored. Only 1,951 of 8,900 pilot files reproduce it on re-serialisation. The file-level SHA-256 of stored bytes is the reference.

## D. Recommended infrastructure

- **Storage:** an external or second volume for full-universe raw data (about 5 GB for the three equity intervals, more with bhavcopy). Keep the 2 GiB floor on the working volume.
- **Format:** one raw file per instrument, interval and chunk, as now, with a manifest per collection. Derived series are separate versioned directories.
- **Throughput:** keep single-process collection at the measured rate. Parallel workers need a measured limit before use.
- **Verification:** run the verifier on every collection before any research uses it.

## E. Recommended collection order (research value first)

1. **Full-universe daily equity** (about 32 min, about 0.4 GB). This supports cross-sectional research: relative strength, market breadth, sector rotation and volatility regimes, which the research direction calls for. Needs approval.
2. **Hourly data for the liquid subset** only, chosen from the daily data by a pre-registered liquidity rule, not for all stocks.
3. **15-minute for the full universe** only if the daily cross-sectional research shows a reason. It costs about 8.5 hours and about 3.4 GB, and the G-1 results so far do not justify it.
4. **Options.** Historical options need either the NSE bhavcopy sweep (for daily option OI and volume, about 3–5 GB, needs approval) or a data-provider decision (Upstox Plus or a licensed vendor, paid, needs approval). Neither is started.

## F. Recommended next research phase

Run pre-registered cross-sectional daily hypotheses on the full daily universe: relative strength, breadth, volatility regimes and liquidity behaviour. Each hypothesis gets its own protocol, development and validation split, and an untouched holdout, following the existing G-1 gate and rules. G-1 results stay unchanged, and no failed hypothesis is tuned.

## G. Constraints kept

No full-universe collection, bulk bhavcopy, BSE collection, paid data, Upstox upgrade or broker orders was started. Strategy 11.4 is unchanged. Existing datasets, G-1 results and Git changes are untouched.
