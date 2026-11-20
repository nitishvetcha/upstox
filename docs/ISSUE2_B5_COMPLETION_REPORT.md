# B5 Completion Report — Technical Candle Freshness

Date: 2026-11-06 (IST). Written for: the project owner, who delegated these technical decisions. Each decision below records the alternatives considered and why the chosen one was made.

**Status: COMPLETE (offline).** Every relevant scenario has a passing test. Live behaviour is not verified: all evidence is offline with stubbed upstream responses.

## 1. Decisions made under delegated authority

| # | Question | Options considered | Decision | Why |
|---|---|---|---|---|
| D1 | Maximum age of the newest completed 15m candle | (a) 15 min only; (b) interval + grace; (c) reuse the 300 s fetch-age rule | **17 min = 15 min interval + 2 min grace** | A completed bar is legitimately up to one interval old. (c) would reject most of every bar's life. The 2 min grace covers normal feed delivery. This is an engineering safety threshold, **not** a claim of market-data validation. |
| D2 | Which timestamp ages | fetch time, candle open, candle close | **candle close, against request time** | Fetch age is not data age. Open time ignores the bar's own length. |
| D3 | Interval awareness | one threshold for all timeframes, or per timeframe | **per timeframe**: 5m = 7 min, 15m = 17 min, 30m = 32 min, 1h = 62 min | Other timeframes must not inherit the 15m value. 1d is end-of-day and is not aged. |
| D4 | Forming candle | use it, or exclude it | **exclude** (completed = start + interval ≤ now) | A forming bar's close is not a settled price. Indicators and the recommendation price now use completed bars only. |
| D5 | Newest candle malformed, missing timestamp, or future-dated beyond 5 s | keep an older candle, or block | **block the cycle** (`DATA_QUALITY`) | Fail-closed. An older candle must not stand in for a bar that should exist. The existing 5 s skew is used; no new tolerance. |
| D6 | Opening window (no completed candle for today yet) | previous session's candles, or a clear wait | **UNAVAILABLE `NO_INTRADAY_CANDLES`**; no indicators | Prevents a current-session TRADE from previous-session data and prevents the market being reported as closed. |
| D7 | Pre-open | as above, or a distinct state | **UNAVAILABLE `PRE_OPEN`** with its own message | Distinct from the opening window and from closed. |
| D8 | Closed session (after close, weekend, holiday) | LIVE, or END_OF_DAY | **END_OF_DAY** | Closed-session candles are end-of-day data. Never eligible for a live TRADE (§3). |
| D9 | Warm-up history | keep, or discard | **kept for indicator warm-up; freshness judged on the newest completed candle only** | Separates warm-up from current-session freshness. |
| D10 | Cache hit | trust the cached verdict, or re-judge | **re-judged at request time** | Cache age is not candle age. The payload keeps its original fetch time. The verdict is never cached. |
| D11 | Empty series message | keep "MARKET CLOSED / NO DATA", or report precisely | **`NO_CANDLES`, "No completed candles are available"** | The old message said "market closed" when the market could be open. One existing test expectation was updated to match. |
| D12 | New blocker code for pre-open and no-intraday | new code, or reuse | **new code `NO_INTRADAY_CANDLES`** in the diagnostic layer | The engine text is in the frozen `strategy.ts`, which cannot change. The code is mapped in `recommendationDiagnostic.ts` only. Engine decisions are unchanged. |

## 2. Implementation

| File | Change |
|---|---|
| `web/src/lib/services/candleFreshness.ts` | **New.** Pure policy: intervals, grace, completed-candle filter, newest-row shape, classification. |
| `web/src/lib/services/upstoxMarket.ts` | Loader returns data and the newest row's shape (cached); freshness judged at request time; `getCandles` returns completed candles and a classified source with reason; `getTechnicals` carries the reason and computes analysis only for usable series; futures VWAP uses completed candles and respects the data-quality check. History cache key `history:v2`. |
| `web/src/lib/services/market.ts` | Snapshot carries `technicalReasonCode` and `technicalReason`. New `technicalMeta` labels technical freshness from the candle classification and reports candle age. |
| `web/src/app/api/technical/[index]/route.ts` | Uses `technicalMeta`. |
| `web/src/lib/types.ts` | Optional fields only: `CandleSeries.unavailableReason/reasonCode`, `Technicals.reasonCode`, `Snapshot.technicalReasonCode/technicalReason`. |
| `web/src/lib/recommendationDiagnostic.ts` | `NO_INTRADAY_CANDLES` blocker (added to the "Technical warmup" stage). Explicit technical-candle gate: STALE → `INSUFFICIENT_FRESHNESS`; END_OF_DAY → `END_OF_DAY` (never eligible); UNAVAILABLE → reason-specific code. |

**Not changed:** `strategy.ts`, `analysis.ts` (SHA-256 `d0170b40…3eb3f18` verified after the batch; zero diff against HEAD).

## 3. Source classification (the rule set)

| Condition | Source | Reason code |
|---|---|---|
| Newest expected row malformed, missing timestamp, or future beyond 5 s | UNAVAILABLE | DATA_QUALITY |
| No completed candles | UNAVAILABLE | NO_CANDLES |
| Market OPEN, newest completed candle is from a previous session | UNAVAILABLE | NO_INTRADAY_CANDLES |
| Market PRE-OPEN, newest completed candle is from a previous session | UNAVAILABLE | PRE_OPEN |
| Market OPEN, today's newest completed candle closed more than the limit ago | STALE | STALE_CANDLE |
| Market OPEN, today's newest completed candle within the limit | **LIVE** | — |
| Market CLOSED (after close, weekend, holiday) | END_OF_DAY | — |
| 1d (completed daily candles) | END_OF_DAY | — |

PRE-OPEN and MOCK are distinguished by reason and mode rather than by new source values, so the `DataSource` type is unchanged.

## 4. Test coverage against the required scenarios

File: `web/src/lib/services/candleFreshnessPolicy.test.ts` (21 tests), `candleFreshnessAttribution.test.ts` (8), `web/src/lib/recommendationDiagnostic.b5.test.ts` (10).

| Required scenario | Test(s) |
|---|---|
| Fresh completed candle | B-3 |
| Candle at the 17-minute boundary | B-1 (exactly 17:00 → LIVE) |
| Candle beyond the boundary | B-2 (17:01 → STALE) |
| Forming candle | B-3, B-17, CA-6 |
| Stale candle | B-4 |
| Future candle (beyond 5 s) | B-5, CA-8, CA-7 (6 s dropped), CA-6 (4 s accepted) |
| Missing timestamp | B-6b, POL-3 |
| Malformed latest candle | B-6, B-7 |
| Empty series | B-8 |
| Pre-open | B-9 |
| Opening window | B-10, B-11 (first completed candle at 09:31 → LIVE again) |
| Closed market | B-12 |
| Weekend | B-13 |
| Holiday | B-14 |
| Intraday cache hit | B-15 (same payload LIVE at 12:30, STALE at 12:50), CA-3 |
| Daily cache hit | B-16, CA-2 |
| Original fetch-time attribution | CA-1, CA-4 |
| Diagnostic and engine per condition | b5 suite: 10 tests (STALE, END_OF_DAY, opening window, pre-open, malformed, no candles, frozen engine never TRADE on a stale technical source, stage 4 blocked) |

**Test results:** full suite **2095 pass, 0 fail, 0 pending** at the time of the last full run; the policy file has since gained one test (21/21 passing).

## 5. Before and after (16 offline scenarios)

| Scenario | Before B5 completion | After B5 completion |
|---|---|---|
| A1 completed candle fresh | LIVE, TRADE | LIVE, TRADE |
| A2 forming bar present | LIVE, TRADE (forming bar in indicators) | LIVE, TRADE (forming excluded) |
| B completed candle 30 min old | LIVE, TRADE | **STALE, NO TRADE** |
| C bars stop 10:00 | LIVE, TRADE | **STALE, NO TRADE** |
| D history only, open | LIVE, NO TRADE, "market closed", END_OF_DAY code | **UNAVAILABLE `NO_INTRADAY_CANDLES`**, NO TRADE |
| E forming bar on a 2 h gap | LIVE, TRADE | **STALE, NO TRADE** |
| F1 / F2 malformed latest | LIVE, TRADE (silent) | **UNAVAILABLE `DATA_QUALITY`**, NO TRADE |
| G future-dated latest | LIVE, TRADE | **UNAVAILABLE `DATA_QUALITY`**, NO TRADE |
| H out of order | LIVE, TRADE | LIVE, TRADE |
| I empty | UNAVAILABLE | UNAVAILABLE (`NO_CANDLES`) |
| J closed, bars to 15:15 | LIVE, mislabelled | **END_OF_DAY**, NO TRADE |
| K pre-open | LIVE, NO TRADE, "market closed" | **UNAVAILABLE `NO_INTRADAY_CANDLES`** (pre-open message), NO TRADE |
| L first bar only, 09:20 | LIVE, WAIT | UNAVAILABLE `NO_INTRADAY_CANDLES`, opening-window reason, NO TRADE |
| M weekend | LIVE, NO TRADE | **END_OF_DAY**, NO TRADE |
| N holiday | LIVE, NO TRADE | **END_OF_DAY**, NO TRADE |

**Principle check:** no scenario that is not a fresh, completed, current-session candle produces a TRADE. The only TRADE rows are A1 and H, which are fresh.

## 6. Limitations

1. **Live behaviour not verified.** Whether Upstox returns the forming bar, how late the intraday feed is, and how often a bar is malformed are unknown. The 2 min grace is a safety margin I chose, not a measured value.
2. **Opening window.** The first completed 15m candle arrives at 09:30 IST. Recommendations therefore wait until then. This is intended.
3. **1d daily candles.** Only sessions before today are treated as completed, so today's daily bar appears after the next session. The engine does not use the 1d series for eligibility.
4. **Cache TTLs run on the real clock** (`cache.ts`). Expiry combined with a request-time clock change cannot be tested without waiting; the back-to-back tests cover hit behaviour, and expiry is covered by reasoning.
5. **Fail-closed side effect.** A malformed newest bar blocks the whole technical series for that cycle, including the warm-up history. This is intended; it trades availability for safety.
6. **The frozen engine's own 300 s technical rule** (`strategy.ts:179`) is fetch-time based and cannot change. It cannot fire on the 15m path (fetch age bounded by the 60 s TTL). Candle freshness is now enforced by the classification above, so the engine does not rely on it.
7. **Engine blocker text still reads "Not enough comparable data"** when a technical factor is unavailable, in addition to the explicit diagnostic code. Both are true; the explicit code is the primary reason.

## 7. Verification

- Typecheck: exit 0.
- ESLint on all changed files: 0 errors; the warnings present are pre-existing or belong to B3 (`_maxStrikesAtm`, reported in §B3/B7 status).
- Strategy 11.4 hash: `d0170b40a4b9fb6265697edda03917779b9b8acddcaddc4c43488a4b29eb3f18`, unchanged.
- Protected data: 0 files written in `web/.data` or `web/.research-data`.
- No network: all tests and harnesses use stubs.
