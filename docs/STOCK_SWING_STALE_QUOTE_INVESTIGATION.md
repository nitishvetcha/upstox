# Stock Swing Path: Stale Quote Investigation

Date: 2026-11-06 (IST). Written for: the project owner. Investigation only. No code, threshold or record was changed.

## 1. Summary

**Confirmed.** The swing scan (`scanStocks("swing")`) does not exclude stale stock quotes. For each quote it appends a "today" daily bar whose close is the quote's last traded price, stamped with the current trading session's date. The guard that should catch old data (`checkDailyCandles`, a 6-day limit) therefore never sees the age of the quote, because the synthetic bar is always dated today.

**Impact is limited, by design.** Every swing opportunity is graded `REJECT` with the note "Retired strategy: lost money in a 5-year backtest … Shown for observation only — not a trade signal." The top-opportunities route marks the swing section `retired: true`. So a stale price can appear as an observation with an entry, stop and target, but it is not a recommendation. Whether an observation that looks like a setup is acceptable is a product decision.

**The intraday stock path is protected.** It rejects any quote that is not `LIVE`, or whose session is not today (`stockOpportunityEngine.ts:424`). The swing path does not have this check. The brief said not to assume protection from the intraday path; this confirms that.

## 2. Data flow (swing)

| Step | Location | Behaviour |
|---|---|---|
| Quote batch | `stockService.ts:116–134` | Freshness from the exchange trade time. `AGING` is mapped to `STALE`. Missing or future timestamps fail closed. |
| Available set | `stockOpportunityEngine.ts:356` | `available` = quotes with an LTP and freshness not `UNAVAILABLE`. **`STALE` quotes are included.** |
| Session date | `stockOpportunityEngine.ts:375` | `today = latestTradingSessionDate(now)`. |
| Daily history | `stockOpportunityEngine.ts:371–374`, `marketHistory.ts` | Completed daily candles for each symbol. |
| Synthetic today bar | `stockOpportunityEngine.ts:382`, `positionalTrend.ts:149–154` | `withTodayBar` appends `{ timestamp: <today>T09:15:00+05:30, close: q.ltp, open/high/low: quote }`. Past bars on the same date are removed. **The quote's own timestamp is discarded.** |
| Age guard | `positionalTrend.ts:45–55` | `checkDailyCandles` rejects a series whose last bar is more than `MAX_STALE_DAYS = 6` old (`positionalTrend.ts:38`). The synthetic bar is today-dated, so this never triggers for a quote. |
| Liveness flag | `stockOpportunityEngine.ts:382`, `positionalTrend.ts:69` | `liveQuote = q.freshness === "LIVE"` changes only wording ("Trading above" vs "Closed above") and a data-quality score (0.5 when live) plus a "still forming" reason line. |
| Usability | `stockOpportunityEngine.ts:385` | `const usable = q.freshness === "LIVE" \|\| q.freshness === "END_OF_DAY"` is **computed and never read**. |
| Output | `stockOpportunityEngine.ts:386–403` | Every scored signal is pushed. `freshness: q.freshness` is attached. `grade: "REJECT"`, reason prefixed with the retired note. Top three returned. |
| Route | `api/opportunities/stocks/swing/route.ts`, `api/opportunities/top/route.ts` | Top route includes `stockSwing` with `retired: true`. |

## 3. Intraday path, for comparison

`stockOpportunityEngine.ts:424`: `if (q.freshness !== "LIVE" || quoteSessionDate !== istToday(now)) { rejected++; continue; }`. Non-live quotes never become opportunities. The grade also forces REJECT for non-LIVE quotes (`liveSourcesCount`, line 441).

## 4. Scenarios (code-level; not executed offline)

These follow from the code. They were not run, because the swing path calls `getAccessToken` and `dailyCandles`, which would need stubbing. Running them is a next step.

| Quote | Path result | Grade | Shown as |
|---|---|---|---|
| LIVE, today's session | Included; LTP = today's close; wording "Trading above" | REJECT (retired) | observation |
| STALE, quote from 2 h ago, session today | Included; LTP presented as today's close; wording "Closed above" | REJECT (retired) | observation with `freshness: STALE` |
| STALE, quote from a previous session | Included; synthetic bar dated today; age guard passes | REJECT (retired) | observation with `freshness: STALE`; the date is misrepresented |
| END_OF_DAY (closed market) | Included with today's date and yesterday's close presented as today's | REJECT (retired) | observation |
| UNAVAILABLE | Excluded (`available`) | — | — |

## 5. Confirmed findings

1. **Stale quotes enter the swing scan** (`stockOpportunityEngine.ts:356`).
2. **The age guard is bypassed** because the synthetic bar is dated today (`positionalTrend.ts:151`, `:52`).
3. **The quote's timestamp is discarded** when the synthetic bar is built.
4. **`usable` is dead code** (`stockOpportunityEngine.ts:385`).
5. **The output is observation-only** (REJECT grade, retired note), which limits the trade impact.
6. **The top route presents the swing section** with `retired: true`, not hidden.

## 6. Options and trade-offs (need owner approval)

Each option changes stock output, so each needs approval under Group B.

| Option | Behaviour | Trade-off |
|---|---|---|
| A. Exclude non-LIVE quotes from the swing scan (mirror the intraday path) | Stale or END_OF_DAY quotes never become rows | Fewer rows, most likely none outside live hours. Consistent with intraday. |
| B. Keep rows but blank the setup for non-LIVE quotes (entry, stop, target = null; reason "quote not live") | Rows visible with their freshness; no price-based setup | Observation list stays populated but carries no levels. |
| C. Use the quote's own session date for the synthetic bar, and fail the age guard when it differs from today | Stale quotes are rejected by the existing 6-day guard only if the date is old enough | Weak: a quote one session old passes the 6-day guard. |
| D. Retire the swing path entirely from the top route | Hides the observation section | Removes information; does not fix the logic. |

**Recommendation:** Option A, because it mirrors the intraday rule the project already applies to stocks, uses no new threshold, and needs no new public code. Option B is an alternative if the owner wants stale rows kept visible. Option D is not a fix.

## 7. Risks

- Option A may leave the swing section empty outside live hours. That is correct, but the owner should expect it.
- Option B keeps stale rows visible; the UI must then show freshness clearly.
- Any change alters `scanStocks` output, which the top route and the dashboard read.

## 8. Tests needed

- Swing scan with LIVE, STALE, AGING, END_OF_DAY, UNAVAILABLE and missing-timestamp quotes, using the existing `ScanDeps` injection (`deps.quotes`) and stubbed `getAccessToken` and `dailyCandles`.
- Assert no STALE row produces a setup under Option A (or a null setup under Option B).
- Assert the top route's `stockSwing` section for an all-stale universe.
- Regression: the intraday scan unchanged.

## 9. Owner approval

**Required** before any change, because the swing output changes. Question: "Apply Option A (exclude non-LIVE quotes from the swing observation scan), or Option B (keep rows, blank the levels)?"

## 10. Status

- Investigation: complete (code-level). Offline execution: not yet done.
- Implementation: **awaiting owner approval** (Group B).
- Confirmed defect: yes. Trade impact: low, because the output is REJECT. Display impact: real, because levels are shown.
