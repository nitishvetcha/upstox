# Full-universe daily collection and coverage report (2026-11-08)

Written for: the project owner. Scope: daily (1d) only, as approved. No hourly or 15-minute data for the full universe, no options bhavcopy sweep, no paid data, no Upstox upgrade.

## 1. Universe

- Source: NSE equity master `EQUITY_L.csv` (SHA-256 3675bb26...5970e), 2,632 rows, 2,398 EQ.
- Collected: 2,397 EQ instruments. One EQ row (listing date 2026-11-11, after today) was excluded from collection.
- The earlier figure of 52 research equities was an error, now corrected. The research set is 50 stocks.

## 2. Collection

| Item | Value |
|---|---|
| Planned requests | 9,588 (2,397 instruments × 4 chunks of 3,000 days, 2000-01-01 to 2026-11-05) |
| Made | 9,588 |
| Stored (HTTP 200) | 9,588 |
| Failed, rate-limited, access-restricted | 0, 0, 0 |
| Duration | 1,910 s (31.8 min) |
| Throughput | 5.0 requests per second, single process |
| Stop conditions | none triggered |
| Free disk at end | about 18 GiB (floor 2 GiB) |

## 3. Verification (`scripts/upstox-verify-clean.ts daily-universe`, output `upstox-daily-universe-verified-2026-11-08`)

- Files: 9,588 expected, 9,588 valid, 0 missing, 0 invalid, 0 extra, 0 temporary, 0 manifest mismatches, 0 duplicate stored rows.
- Raw candles: 6,485,741. Conflicting duplicate timestamps across chunks: 0.
- Dropped bars: 778 (OHLC inconsistent or off-grid). Counted, never repaired.
- Extra bars on non-session dates: 416 (mainly index-like or holiday bars in individual series).
- Hashes: the SHA-256 of each stored file is recorded in `verification.json` (`fileHashes`). The manifest's body hashes cannot be reproduced from stored JSON, so the file hashes are the reference.
- One series has no bars at all: **BRIGHTOUTD** (Upstox returned no candles for its ISIN). It is recorded as unavailable.

## 4. Coverage

Expected sessions are counted from each series' own first bar, to 2026-11-05.

- Expected sessions: 4,977,778. Missing: 160,716 (3.2%). Partial: 0.
- Stocks with zero missing sessions: 1,996 of 2,397.
- Stocks with more than 5% missing sessions: 163.

**Important limitation: first-bar dates are vendor history starts, not necessarily listing dates.** Many stocks share the same first bar:

| First bar | Stocks | Note |
|---|---|---|
| 2008-03-18 | 748 | Many listed in 1995–2007 per the master. History before this date is not collected |
| 2024-08-21 | 663 | Same pattern |
| 2026-11-05 | 575 | Only one day of history available |
| 2016-06-03 | 302 | Same pattern |

The "missing sessions" count does not capture history before each first bar, because that history is not expected by the verifier. For cross-sectional research, usable history therefore depends on the cohort. Stocks with first bars after 2024 cannot support multi-year research.

A separate cohort with first bars in 2014–2015 has a median of about 1,200 missing sessions. This has not been explained and needs its own investigation before those stocks are used.

## 5. Storage

- Daily raw store: 398.4 MB total, 0.166 MB per stock.
- The pre-collection estimate was about 0.4 GB, and the measured figure matches it.

## 6. Limitations

- Survivorship bias: the universe is today's listed EQ set. Delisted stocks are absent.
- Unadjusted prices. Corporate-action adjustment has been tested only for the 50 research stocks (26 of 26 testable events show no price step, so the vendor history appears back-adjusted). Its status for the full universe is unverified.
- No liquidity or volume filter has been applied yet.
- HTTP 200 is not treated as proof of data: every file was checked for structure, timestamps, duplicates and the manifest cross-check.

## 7. Status

Collection complete and verified for daily data. Hourly and 15-minute data for the full universe have not been collected. The next step is the pre-registered cross-sectional research proposal in `DAILY_CROSS_SECTIONAL_RESEARCH_PROPOSAL_2026-11-08.md`. It is a proposal only, and it has not been registered or run.
