# NSE F&O bhavcopy, new-host collection: verification record (2026-11-08)

Written for: the project owner, as the record for the NSE collection and its verification.

## Scope
- Range: 2024-06-03 to 2026-11-05 (603 NSE trading sessions, from the Upstox daily-universe calendar).
- Host: nsearchives.nseindia.com only. The legacy archive host (archives.nseindia.com) was refused with HTTP 403 ("Access Denied") and was not retried.
- Collector: `scripts/nse-bhavcopy-sweep-v2.py --hosts new`. Started by hand with nohup, not by launchd. It is no longer running.

## Collection result
- 603 of 603 days STORED. Zero BLOCKED, zero NOT_FOUND, zero network errors.
- No stop record in the manifest.
- Storage: 689 MB for the directory; ZIP bytes total 721,148,507.

## Verification (authoritative: `nse-bhavcopy-newhost-verify-2026-11-08-r2`)
| Check | Result |
|---|---|
| Days verified (ZIP test and CSV parse) | 603 / 603 |
| Bad or corrupt ZIPs | 0 |
| Duplicate contract rows | 0 |
| Negative prices | 0 |
| Contract rows | 22,472,487 |
| Index options (IDO) | 3,197,854 |
| Stock options (STO) | 18,895,267 |
| Stock futures (STF) | 370,144 |
| Index futures (IDF) | 9,222 |
| Rows by year | 2024: 5,238,317; 2025: 8,772,732; 2026: 8,461,438 |
| Unique symbols | 291 |
| Unique symbol-strike pairs | 29,747 |
| Unique expiries | 256 |
| Rows with volume and open interest | 22,472,487 each |
| Invalid OHLC (after no-trade rule) | 321 |
| No-trade placeholder rows (open, high, low = 0; close > 0) | 13,423,075 |

## Corrections to earlier reporting
1. The first verifier report (`nse-bhavcopy-newhost-verify-2026-11-08`, SHA-256 `35b42dc7…44140`) is preserved unchanged. It counted all 13,423,075 no-trade placeholders as invalid OHLC, which was wrong. Do not use its invalid-OHLC figure.
2. The corrected report (`-r2`, `coverage.json` SHA-256 `e080a3f2…c671`) separates the no-trade placeholders from invalid OHLC. The 321 remaining invalid rows are real violations and need a separate look before any use. They are not yet explained.
3. Header variants: the verifier reports 2. The 13 early files (2024-06-03 to 2024-06-20) name the reserved columns `Rsvd01`–`Rsvd04`, and the 590 later files (2024-06-21 onward) use `Rsvd1`–`Rsvd4`. Column count and all required fields are the same. (An earlier draft of this record had the direction reversed; this is the corrected statement, verified against the 2024-06-03, 2024-06-20, 2024-06-21 and 2026-11-05 files.) Normalisation is in a processing-only mapping: `web/.research-data/nse-bhavcopy-processing-2026-11-08/header_normalisation.json`.

## Fields not present
Bid, ask, bid and ask quantity, implied volatility, Delta, Gamma, Theta and Vega do not appear in any file. Do not infer them from OHLC.

## Hashes
- `manifest.jsonl` (collection): `d85fae99647e7a97564c96e41794ffe1ed94e81d00d5b15a6d712641a409e7dc`
- `RUN_STATUS.json` (separate status record): `aec99f4fea72eb164585b1cf0c4962bd3df73cee40ccf4cee2562d2a9d868990`
- Corrected verifier output, `SHA256SUMS.txt` (lists the SHA-256 of every ZIP): `0e7be4511da94c870f5122ccbae809e47e947db8a92f58be5ca23dd62cfd8e53`
- Interrupted 2010 collection manifest (unchanged): `ad0697c91b8dec9cc9b3a77a111366d4a2452fb44b2f30596f467c23d2abe33d`

## Interrupted 2010 run
`nse-bhavcopy-sweep-2010-2026-INTERRUPTED-2026-11-08` holds the earlier run, stopped on the instruction of 2026-11-08 because HTTP 403 had been counted as "missing". Its 172 day records are not evidence of missing archives. They are preserved and must not be merged into the new collection without a reconciliation report.

## Limits
- Coverage starts 2024-06-03 because the new host returned 404 for 2020 and 2010 dates. Earlier history is not covered by this collection.
- Survivorship: the calendar and symbols come from the current universe; delisted contracts appear only where NSE published them in this window.
