# Stock V2 — Historical Data Audit

Scope: `web/.research-data/intraday-bars-historical/`. Read-only. Original files were not modified. Date of audit: 2026-11-05.

## 1. Result

The dataset is structurally complete and internally consistent for **stock 1-minute OHLCV**. It is **not sufficient on its own** for the V2 specification: it contains no NIFTY index candles, no India VIX, no event-risk history, no exchange market-state history and no point-in-time constituent history. These are listed as missing dependencies in §6 and in the strategy spec. The V2 backtest must not start until they are resolved or explicitly waived.

## 2. Verified facts (from the files themselves)

| Check | Result |
|---|---|
| Files | 3,000 `2026-MM-DD-SYMBOL.json` files, 0 unreadable |
| Sessions (dates) | 60, from 2026-08-06 to 2026-11-03 |
| Stocks per session | 50 for every date |
| Candles per stock/session | 375 for all 3,000 files (09:15–15:29 IST) |
| Total candles on disk | 1,125,000 |
| Status field | `OK` on all 3,000 files |
| Duplicate timestamps | 0 |
| Out-of-window candles (outside 09:15–15:29 IST) | 0 |
| Candles dated outside their session | 0 |
| OHLC invalid (high < max(open,close,low), etc.) | 0 |
| Negative volume | 0 |
| Gaps longer than 60 s | 0 |
| Timezone | Every timestamp carries `+05:30`. Session boundaries verified in IST |
| Zero-volume candles | 42,001 (3.73%); about 14 per session per stock. Kept, not rejected |
| Flat candles (O=H=L=C) | 45,609 (4.05%): 42,001 zero-volume plus 3,608 with volume. Concentrated in illiquid names (e.g. APOLLOHOSP 975, COALINDIA 966). Consistent with real low-activity minutes, not synthetic fill |
| Identical candle payloads across files | 0 |
| Instrument key vs constituent snapshot | 0 mismatches across 3,000 files (50 keys) |
| Minute-open gap > 5% vs prior close | 0 |
| Overnight open vs prior close move > 15% | 0 (this does not prove the absence of corporate actions; see §5) |

Calendar: the 60 dates equal exactly the 60 trading days in the span per the holiday list in `src/lib/time.ts`. No holiday appears in the data and no trading day is missing.

## 3. Discrepancies found

1. **Candle total.** The brief states about 1,087,500 candles. Disk holds 1,125,000. The difference is 37,500 = 100 files (2 sessions × 50 stocks) from the availability test (`--sessions 2 --from 2026-08-06`, rangeFrom 2026-11-02, rangeTo 2026-11-03, run 11:28 IST on 2026-11-04). The full backfill (run 11:31–11:32) skipped those two dates (`skip (exists)`), so its coverage report counts 2,900 newly written sessions (2,900 × 375 = 1,087,500). Both runs fetched the same range, so the data is the same, but the file metadata differs.
2. **`sessionsOk` counting.** The coverage report counts the 100 skipped-existing records as `sessionsOk`. The total of 3,000 "OK" sessions therefore includes 100 that were not written by the full run. This is a reporting nuance, not a data error.
3. **Stray file.** `coverage-report-2026-11-04-test-backup.json` is the report from the two-session availability test. It is not a dataset record. Keep it, and do not treat it as session data.
4. **Provenance.** The historical files were produced by `scripts/backfill-intraday-bars.mjs` against `/api/research/stock-candles-range` (Upstox V3 `historical-candle/minutes/1`). The backfill was run before this session, not by this session. The records carry `backfill.source = backfill-intraday-bars.mjs`.

## 4. Development and validation split

Chronological, no overlap:
- **Development (40 sessions):** 2026-08-06 → 2026-10-05.
- **Out-of-sample validation (20 sessions):** 2026-10-06 → 2026-11-03.

The split is a date-ordered partition. It is available now. The split is only as good as the sessions are complete, and they are.

## 5. Limitations that cannot be resolved from this dataset

- **Survivorship and membership.** The 50 stocks are the constituent list snapshotted on 2026-11-04 (`constituents-snapshot-2026-11-04.json`). The same list is applied to all 60 sessions. Index membership in August–October may have differed. No point-in-time membership source is in the repository. Survivorship bias is therefore **present and unquantified**. No accuracy claim about point-in-time constituents can be made.
- **Corporate actions.** Upstox V3 historical candles are not documented here as split-adjusted. No known split or bonus is confirmed in the window. The checks in §2 found no price discontinuity above 15% overnight, which lowers but does not remove the risk.
- **Holiday calendar provenance.** `NSE_HOLIDAYS` is hand-entered from the Upstox holiday API, cross-checked to 2026-10-05 for weekdays with no daily candle. The 2026-10-20 onward entries are from the list only.
- **Bar timestamps are the minute start.** A bar stamped 09:15 is assumed to cover 09:15:00–09:15:59. This is the usual Upstox convention; it is an assumption and is used by the execution rule (§6 of the spec).

## 6. Missing dependencies for the V2 specification

| # | Input required by the spec | In this dataset? | Consequence |
|---|---|---|---|
| D1 | NIFTY index 1-min candles (for NIFTY ATR % gate) | No | Gate cannot be evaluated |
| D2 | India VIX (or equivalent) history | No | VIX gate cannot be evaluated |
| D3 | Event-risk history (HIGH/EXTREME/MEDIUM per day) | No | Event gate and 0.5R sizing cannot be evaluated |
| D4 | Exchange market state history (NORMAL_OPEN per minute/day) | No (only the time window is known) | Market-state gate cannot be verified; the 09:30–14:00 window is assumed normal trading |
| D5 | "Verified LIVE stocks" count per session | No (only file `status: OK`) | Historical OK is not LIVE. The count of 50 can be derived, but "LIVE" cannot be claimed for historical data |
| D6 | V1 score definition and inputs (score ≥ 40 threshold) | Partly | V1 score uses live quote fields (`ltp`, `prevClose`, `open`, `high`, `low`, volume) and a NIFTY change proxy (`niftyProxyChange`). Prior-close and proxy are derivable from the dataset; the V1 score as implemented is not defined for V2 indicators. Needs a decision |
| D7 | V1 strong-momentum flag (RS > 1.5×, move > 2.5%) | Partly | Needs NIFTY change and relative strength; NIFTY index candles absent (see D1) |
| D8 | Brokerage, STT, exchange, GST, stamp duty, SEBI tariffs | No | Assumptions are documented in the spec; they must be checked against the broker schedule before any result is quoted |

## 7. Suitability recommendation

- **Suitable now:** indicator and signal development on stock candles (EMA, VWAP, ATR for stocks), session boundary logic, look-ahead tests, execution-model tests, and metric code. These use only data that is verified.
- **Not suitable yet:** the full V2 backtest as specified. Three of the five market-condition gates (VIX, NIFTY ATR, event risk) and the score threshold cannot be evaluated from the dataset. A backtest that silently ignores them would not test the specification.
- **Strategy finding:** under the V1 stop/target methodology, the 1.5 reward-to-risk minimum is met only close to the session low (measured in `stockV2.test.ts`). Accepting or changing this is a strategy decision, not a data question.
- **Decision needed:** either (a) supply D1–D3 and D6–D7 data, or (b) approve an explicitly documented substitute for each (for example, NIFTY ATR % computed from the 50 constituents). A substitute changes the strategy and must be recorded as such. No substitute has been applied.
