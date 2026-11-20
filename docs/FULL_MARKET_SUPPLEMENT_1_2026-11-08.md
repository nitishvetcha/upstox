# Full-market supplement 1: source-of-truth reconciliation, equity master, feasibility (2026-11-08)

Supplements `FULL_MARKET_UNIVERSE_REQUIREMENTS_2026-11-08.md`, which is kept unchanged. Where this document disagrees with it, the evidence is stated here.

## 1. Source-of-truth reconciliation

| Item | Status | Evidence |
|---|---|---|
| Research equities | **50** NSE EQ stocks. Corrects earlier "52" (the extra two were BSE index series) | Verified coverage files |
| Daily equity (2000–2026) | Collected and verified, 50 stocks | `upstox-verified-2026-11-08-v1` |
| 1-hour equity (2022–2026) | Collected and verified, 50 stocks | same |
| 15-minute equity (2022–2026) | Collected and verified, 50 stocks, 3,200 of 3,200 files | `upstox-verified-2026-11-08-15m` |
| Indices, daily | 6 indices collected and verified | v1 verified |
| Option bhavcopy history | **2 trading days** (2022-01-03, 2026-11-05). Not a full history | `nse-discovery-2026-11-06` |
| Corporate-action records | 27 year files, 42,972 records, 31 duplicate rows | `nse-bhavcopy-2026-11-06/corporate-actions` (verified in `corporate-actions-verified-2026-11-08`) |
| Bulk bhavcopy sweep | **Incomplete: zero archives stored.** Stopped on first request, not running | `nse-bhavcopy-2026-11-06/manifest.jsonl` |
| G-1 diagnostics | Completed on both grids under V2 protocol. No signal passes | `predictive-g1-*-2026-11-08` |
| Upstox expired option history | Refused (UDAPI1149, Plus plan) | Inventory of 2026-10-24 |
| Equity master (new) | **2,632 rows, 2,398 EQ**, from one approved request | `nse-equity-master-2026-11-08/EQUITY_L.csv`, SHA-256 `3675bb26…5970e` |

Not collected: the full equity history, F&O eligibility list (requires a second NSE request, not approved), BSE data, and any option history beyond the two days.

## 2. Equity master: findings

- All 50 research stocks are present in the master, as EQ series, with matching ISINs.
- Series: EQ 2,398; BE 200; BZ 34. The 234 non-EQ rows are excluded by the filter rule in the requirements document.
- Listing dates parse for all 2,398 EQ rows. Range 1995-02-08 to 2026-11-11. **One listing date (2026-11-11) is after today**: treat as a scheduled listing, not history.
- 900 EQ stocks listed on or after 2022-01-01, so their 15-minute history is shorter than the research set's.
- Three EQ rows have a market lot above 1; lot changes need the time-varying lot source, which the master does not provide.
- F&O eligibility is **not** in this file. It needs the NSE F&O lot-size file (second request), which was not approved.

## 3. Feasibility (measured sizes, stated assumptions)

Per-stock measured sizes from the collected store: 15-minute 2.0 MB (64 requests), hourly 0.58 MB (21 requests), daily 0.33 MB (4 requests).

| Collection | Requests (2,398 EQ, upper bound) | Storage (upper bound) | Collection time at the observed rate* |
|---|---|---|---|
| Daily 2000–2026 | ~9,600 | ~0.8 GB | ~25 min |
| 1-hour 2022–2026 | ~50,400 | ~1.4 GB | ~2.1 h |
| 15-minute 2022–2026 | ~153,500 | ~4.8 GB | ~6.4 h |
| NSE bhavcopy 2010–2026 (archive days) | ~4,100 days, 1–2 requests each | ~3.3–5.3 GB | ~2 h |

\* Observed collector spacing of 150 ms (about 6.7 requests per second). The true Upstox per-minute limit is not documented in the evidence and must be confirmed. Rates are estimates, not measurements of the full run.

**Disk: this is the binding constraint.** Free space is 12 GiB. Equity 15-minute, hourly and daily together need about 7 GB, and the bhavcopy sweep about 4–5 GB, so the total is roughly 11–12 GB before any derived datasets or the 2 GiB floor. The collection cannot run in full on the current volume without cleanup or more storage. Derived (cleaned) data is additional. **Decision needed.**

## 4. Licensing and provider alternatives (not verified in this session)

- NSE archives and the equity master are public files; redistribution or commercial use terms were not read or verified.
- Upstox: historical equity access is on the current account. Expired option history needs the Plus plan. Upgrading is a paid change and was not done.
- Third-party historical option data (licensed NSE F&O vendors) was not investigated, because investigating vendors involves contact or purchase.
- BSE: not investigated in this session. No BSE request was made, so BSE data reliability is unknown.

## 5. Corporate actions across more stocks

The NSE corporate-action file covers all instruments, so the event list can be extended to the full universe without a new request. Testing whether prices are back-adjusted needs each stock's daily series, which is only collected for the 50 research stocks. Current evidence (26 of 26 testable events, back-adjusted) applies to those 50. It must not be generalised to the full universe without the per-stock test.

## 6. Implementation roadmap and dependencies

1. **Decide storage.** Free space or an external volume is required before any bulk collection. Dependency for everything below.
2. **Obtain the F&O eligibility and lot-size file** (one NSE request, needs approval). Dependency for stock-option universe.
3. **Pilot collection.** A sample of about 50 listed-after-2022 and about 50 older stocks, measured against the estimates above before any full run. Needs approval.
4. **Full daily equity collection** (about 25 minutes, under 1 GB), then the per-stock back-adjustment test on the full universe.
5. **Hourly and 15-minute collection**, only if steps 1 and 3 pass.
6. **Index derivative and option universe**: discover the active contract master (needs the NSE contract master request, separate approval).
7. **G-1 style diagnostics per pipeline**, each with its own pre-registered protocol and gate. Pipelines stay separate: equity cash, index spot and futures, stock futures, index options, stock options.
8. **Instrument status fields** (live support, historical coverage, strategy validation, suitability) are stored per instrument. A recommendation requires all four to pass for its instrument class; otherwise the output is NO TRADE with the failing check.

## 7. What is not claimed

- No option chain history, IV, Greeks, bid or ask beyond the two sample days.
- No claim that any instrument is tradable or profitable.
- Survivorship bias remains until point-in-time constituent data exists.
