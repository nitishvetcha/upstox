# Full-market expansion report, interim (2026-11-08)

Supplements the baseline requirements (unchanged) and supplement 1. The 100-stock pilot is still running; this report is not final.

## 1. Verified NSE equity universe
- Source: https://archives.nseindia.com/content/equities/EQUITY_L.csv (one approved request), 2,632 rows, SHA-256 3675bb26...5970e.
- 2,398 EQ, 200 BE, 34 BZ. All 50 research stocks present as EQ with matching ISINs.
- One listing date (2026-11-11) is after today and is treated as scheduled.

## 2. Verified F&O universe (MII contract file)
- Source: https://nsearchives.nseindia.com/content/fo/NSE_FO_contract_06112026.csv.gz (one approved request, HTTP 200, 1,960,429 bytes, gzip valid, SHA-256 96580df7...e42c). Last-modified 2026-11-06.
- The old fo_mktlots.csv is discontinued (NSE F&O circular FAOP/61157, 15 March 2024), so the MII file is the current source.
- 89,722 contract rows: OPTIDX 13,229; OPTSTK 75,520; FUTSTK 667; FUTIDX 18; 288 deleted rows (DelFlg = Y).
- Index derivative underlyings (active): NIFTY (lot 65), BANKNIFTY (30), FINNIFTY (60), MIDCPNIFTY (120), NIFTYNXT50 (25), NIFTYFPI (1100).
- Stock F&O underlyings: 236 listed, of which 18 are NSE test instruments (names ending NSETEST, for example 011NSETEST). **218 real stock F&O underlyings.** Lot sizes and expiries are in `mii-active-contracts-2026-11-06.csv`.
- The file contains currently listed contracts; expired contracts are not included. Expiry and start dates are seconds from 1980-01-01.
- Quantity-freeze limits: not a column in this file. The circular says they are in the MII file, but no column with that name was found. This is a limitation until the field is located.
- Consistency check against the 2,398 equity master: the 218 F&O underlyings are a subset to be matched by symbol in the next step. Not yet cross-checked.

## 3. Pilot collection (in progress)
- 100 EQ stocks, stratified by listing era only (34 pre-2010, 33 2010–2021, 33 from 2022). Not balanced by sector, market cap, liquidity or F&O status.
- At 15:08 IST: 2,630 manifest rows, all HTTP 200 and STORED, zero failures. Throughput about 5 requests per second. Free disk 12 GiB. Collector alive, not modified.
- Planned total up to about 8,900 requests (100 stocks × 89 chunks). Verification has not been run.

## 4. Pending before this report can be final
1. Pilot completion, then `scripts/upstox-verify-clean.ts pilot` on `.research-data/upstox-pilot-100-2026-11-08` into a new output directory.
2. Coverage per interval, storage per stock, measured request rate and failure rate from the final manifest.
3. Matching the 218 F&O underlyings to the pilot sample to report F&O status of the pilot.

## 5. Constraints kept
No full-universe download, no bulk bhavcopy, no BSE, no paid data, no Upstox plan change, no broker orders. Strategy 11.4 and existing research data untouched.
