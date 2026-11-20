# Stock Swing Stale-Quote Fix Report

Date: 2026-11-06 (IST). Follows `STOCK_SWING_STALE_QUOTE_INVESTIGATION.md`. Written for: the project owner.

**Status: COMPLETE (offline).** Option A from the investigation was implemented under delegated authority.

## Decision

Option A: exclude non-LIVE quotes from the swing signal, mirroring the intraday rule. A stale or end-of-day LTP must never become today's synthetic close.

Why not Option B (keep rows with blank levels): the retired swing output would still show a stale price in its rows. Excluding the quote removes the stale input entirely, and the reason is still reported.

## Change

`web/src/lib/engine/stockOpportunityEngine.ts`, swing loop:

- A quote is usable only if `freshness === "LIVE"` **and** its session equals the current trading session (`latestTradingSessionDate`). The session uses the same fallback chain as the intraday path: `sessionDate`, then `exchangeTimestamp`, then `timestamp`.
- Unusable quotes are counted as rejected with the reason `Quote not live for this session (<freshness>)`. An empty result therefore says why.
- `withTodayBar` is called only for usable quotes. The `usable` flag, previously dead code, now controls the path.
- `checkDailyCandles` (the 6-day daily validation) is unchanged and still applies.
- Every row is still graded `REJECT` with the retired note. The retired strategy stays observation-only.

## Tests

`web/src/lib/stockSwingFreshness.test.ts` (8 tests, all passing):

| Test | Proves |
|---|---|
| SW-1 | All LIVE and current → rows produced; all REJECT with retired note |
| SW-2 | All STALE → no rows; reason names STALE |
| SW-3 | Mixed → no stale symbol ever appears; excluded quotes counted |
| SW-4 | END_OF_DAY excluded |
| SW-5 | UNAVAILABLE excluded before scoring |
| SW-6 | LIVE quote from another session excluded (invalid session) |
| SW-7 | Daily validation intact: short history still rejected |
| SW-8 | Output LTPs are finite |

Full suite passing; typecheck clean. Strategy hash unchanged.

## Limitations

- The retired swing strategy's own signal logic is unchanged. This fix only controls which quotes reach it.
- Real LIVE quotes carry an exchange timestamp; the fixture universe exercises the `timestamp` fallback.
