# Issue 2 — B5: Technical Candle Freshness (Investigation Only)

Date: 2026-11-06 (IST). Written for: the project owner, reviewing before any change. **No application code, test, threshold or record was changed.**

## 1. Executive summary

**The suspected defect is confirmed.** The technical candle source is classified LIVE whenever the merged candle series contains at least one bar. Nothing checks the age of the newest completed bar, whether the newest bar is still forming, or whether a bar lies in the future.

Run offline through the real candle loader, the real indicator code and the real engine, the defect produces a **TRADE with eligibility = true** in these cases while the market is open:

- the newest completed bar closed 135 minutes earlier (scenario C);
- a forming bar sits on top of a 2 h 15 min gap (scenario E);
- the newest bar is dated one hour in the future (scenario G).

The diagnostic reports the same LIVE / TRADE in each case, so the two paths agree with each other, and both are wrong.

Three further defects are confirmed: closed-session candles are labelled LIVE (so closed-market blockers are mislabelled as "not enough comparable data"); pre-open and no-intraday states produce a misleading "Market closed" message; and the 1d series reports the call time as its fetch time. Stock recommendations do not use the 15-minute technical source, but the stock swing path has its own unfiltered-quote issue (§8).

**Live behaviour is not verified.** The offline results show what the code permits. Whether Upstox actually returns stale or forming bars during the session is unknown and needs a live observation window, which this task does not make.

**Owner approval is required** before a fix, because every reasonable correction needs a new interval-aware threshold or changes indicator values (§9).

## 2. Confirmed defects, suspected issues, unverified live behaviour

| Class | Item | Status |
|---|---|---|
| Confirmed defect (offline, real code) | Technical source LIVE from presence alone; stale last bar in open session → TRADE | **Confirmed** (scenarios C, E) |
| Confirmed defect (offline) | Future-dated bar accepted; TRADE on a bar 1 h ahead | **Confirmed** (G) |
| Confirmed defect (offline) | Malformed latest bar dropped silently; series ends 30 min earlier with no signal | **Confirmed** (F1, F2) |
| Confirmed defect (offline) | Forming bar's close is the price used by indicators and by the engine | **Confirmed by code** (`technicalAnalysis.ts:197–198`); magnitude not measured |
| Confirmed defect (offline) | Closed-session candles labelled LIVE; closed-market technical factors then unavailable by source mismatch | **Confirmed** (J, M, N) |
| Confirmed mislabel (offline) | Open/pre-open with no intraday bars → "Market closed: latest candles are from <previous session>" and END_OF_DAY code | **Confirmed** (D, K) |
| Confirmed defect (offline + code) | 1d series `fetchedAt` = call time, not the time the cached history was fetched | **Confirmed** (dailyCacheHit: fetched 09:20, reported 09:35, same stale data) |
| Confirmed design gap (code) | Technical source can only be LIVE, UNAVAILABLE or MOCK; never END_OF_DAY, STALE or PARTIAL | **Confirmed by code** (`getCandles`, `upstoxMarket.ts:262–266`) |
| Confirmed design gap (code) | The 300 s engine technical rule is fetch-time based and cannot fire for the 15m path (fetch age is bounded by the 60 s intraday TTL) | **Confirmed by reasoning from TTLs**; not tested live |
| Confirmed adjacent defect (code) | Stock swing path builds a "today" bar from the quote regardless of quote freshness; its `usable` flag is never read | **Confirmed by code** (`stockOpportunityEngine.ts:382, 385`); see §8 |
| Suspected | Upstox intraday response includes the currently forming bar | **Unverified.** Scenario A2 assumes it does |
| Suspected | Upstox 1d request with `to = today` includes today's partial daily bar | **Unverified.** Matters only for the 1d API route, not the engine |
| Unverified live behaviour | Whether intraday bars lag or stop mid-session during OPEN | **Unknown.** Needs a live observation window |
| Unverified live behaviour | Holiday calendar accuracy after 2026-10-20 | **Unknown.** `time.ts:14` notes it is from the Upstox list only |

## 3. Relevant file paths and line numbers

Line numbers are from the working tree on this date.

| Topic | Location |
|---|---|
| Candle plan: intraday TTL per timeframe (15m = 60 s) | `web/src/lib/services/candles.ts:15–21` |
| History TTL 1 h; daily TTL 15 min | `candles.ts:22–23` |
| Normalisation: drops unparseable/missing timestamps and bad OHLC; sorts ascending; no completion check | `candles.ts:27–41` (skip at 32 and 34, sort at 40) |
| Merge: history + intraday, de-duplicated by timestamp, intraday wins | `candles.ts:44–48` |
| Cache: TTL and expiry use the **real** clock (`Date.now()`), not the injected `now()` | `web/src/lib/services/cache.ts:11–19` (12, 14, 16) |
| Candle load: history (cached 1 h or 15 min, keyed by IST date) + intraday (cached per plan) | `web/src/lib/services/upstoxMarket.ts:238–256` (history 244–246, intraday 247–253) |
| 1d path: no intraday request; `fetchedAt` set to call time | `upstoxMarket.ts:249` |
| Technical source label: LIVE if any candle; UNAVAILABLE if none | `upstoxMarket.ts:262–266` (`getCandles`) |
| Technicals: indicators, analysis, source returned | `upstoxMarket.ts:296–323` (empty → "MARKET CLOSED / NO DATA" at 313; source at 323) |
| Indicator input: closes of **all** bars, including a forming bar; price = last close | `web/src/lib/services/technicalAnalysis.ts:197–198` |
| Session date from the last bar (not from `now`) | `technicalAnalysis.ts:200` |
| `marketClosed` = session date ≠ today; `lastCandleAt` recorded | `technicalAnalysis.ts:217, 219` |
| Completed-day filter (excludes the session's own bars) | `technicalAnalysis.ts:206` |
| Opening range: uses `now` for the window | `technicalAnalysis.ts:90–96` |
| Market session windows, holidays | `web/src/lib/time.ts:14` (holiday note), `:52` (`isTradingDay`), `:59` (`sessionWindow`), `:66–72` (`marketStatus`) |
| Future-timestamp tolerance (5 s), used for trade timestamps | `time.ts:131` |
| Fetch-time freshness (120 s base, × slow) | `time.ts:95–100` (`freshnessOf`) |
| Engine: technical fetch-age rule (300 s, fetch-time) | `web/src/lib/engine/strategy.ts:179` |
| Engine: "Market closed: latest candles are from <date>" blocker | `strategy.ts:184` |
| Engine: any stale item or missing factor → NO TRADE | `strategy.ts:283` |
| Engine: factor available only if its source equals the market source | `web/src/lib/engine/analysis.ts:212–213` |
| Snapshot assembly (technical source = `tech.source`) | `web/src/lib/services/market.ts:98, 117` |
| Display freshness from fetch time | `market.ts:141–147` (`sourceMeta`); `web/src/app/api/technical/[index]/route.ts:20–24` |
| Diagnostic: technical freshness = raw source label only | `web/src/lib/recommendationDiagnostic.ts:344` |
| Diagnostic: "market closed" text → END_OF_DAY code | `recommendationDiagnostic.ts:175` |
| Stock intraday path: rejects non-LIVE quotes | `web/src/lib/engine/stockOpportunityEngine.ts:424` |
| Stock swing path: daily-candle age check (6 days) | `web/src/lib/engine/positionalTrend.ts:38, 45–55` |
| Stock swing path: synthetic "today" bar from the quote | `positionalTrend.ts:149–154` (`withTodayBar`); called at `stockOpportunityEngine.ts:382` |
| Stock swing path: `usable` computed, never read | `stockOpportunityEngine.ts:385` |

## 4. Complete data flow

1. **Request.** `getTechnicals` (engine path: `market.ts:98`, timeframe 15m by default) calls `getCandles` for the 15m series, the 1d series, and (not for 15m) the opening series.
2. **History.** `loadCandles` requests completed bars from `/v3/historical-candle/…/minutes/15/<yesterday>/<from>`, cached 1 h under `candles:NIFTY:15m:history:<IST date>`. Its fetch time is **not stored**.
3. **Intraday.** It then requests today's bars from `/v3/historical-candle/intraday/…`, cached for the plan TTL (60 s for 15m). Its fetch time **is** stored.
4. **Merge.** `mergeCandles` de-duplicates by timestamp and sorts ascending. The intraday bar wins on a clash.
5. **Normalise.** Bars with unparseable or missing timestamps, or bad OHLC, are **dropped silently** (`candles.ts:32, 34`). If every bar is bad the call throws, which makes technicals UNAVAILABLE.
6. **Source label.** `getCandles` returns LIVE if the merged series is non-empty, otherwise UNAVAILABLE. The fetch time used is the intraday fetch time (`upstoxMarket.ts:266`).
7. **Indicators.** `analyzeTechnicals` takes the session date from the **last bar** (`technicalAnalysis.ts:200`), uses every bar's close (`:197`), and sets `marketClosed` when the session date is not today (`:217`).
8. **Engine.** The snapshot carries the technical source and analysis. The factors `trend`, `price` and `technical` are available only if their source equals the market source (`analysis.ts:212–213`). `staleness` adds a fetch-time 300 s technical check (`strategy.ts:179`) and a session-date check (`:184`). Any stale item or missing factor forces NO TRADE (`:283`).
9. **Diagnostic.** `freshness.technicals` is the raw label (`recommendationDiagnostic.ts:344`). Blocker codes come from the engine text (`:175`).
10. **Dashboard.** The API route and `MarketCard` show the source label and a freshness computed from the fetch time (`market.ts:141–147`, `route.ts:20`).

**Where LIVE, AGING, STALE, END_OF_DAY, PARTIAL, MOCK or UNAVAILABLE are assigned to technical data:**

| Value | Assigned at | Basis |
|---|---|---|
| LIVE | `upstoxMarket.ts:266` | non-empty series (no age check) |
| UNAVAILABLE | `upstoxMarket.ts:266, 302, 313` | empty series, request error, or no candles |
| MOCK | `mockMarket.ts:25` | mock mode only |
| AGING, STALE (fetch-based) | `time.ts:95–100` via `market.ts:141–147` and `route.ts:20` | fetch age only |
| STALE (engine) | `strategy.ts:179` | fetch age > 300 s |
| END_OF_DAY, PARTIAL | **never assigned to technical data** | — |

## 5. Existing freshness thresholds and their actual use

| Threshold | Value | Where | Actual use for technical candles |
|---|---|---|---|
| Intraday cache, 15m | 60 s | `candles.ts:17` | Bounds how old a **fetch** can be on the 15m path. Not a candle-age check. |
| Intraday cache, 5m / 30m / 1h | 45 s / 120 s / 300 s | `candles.ts:16, 18, 19` | Same |
| History cache | 1 h | `candles.ts:22` | Completed prior sessions only; no freshness check |
| Daily cache | 15 min | `candles.ts:23` | 1d path; its `fetchedAt` is misattributed (§6, J-d) |
| Engine technical fetch-age | 300 s | `strategy.ts:179` | Fetch time, not candle time. Since the 15m fetch age is at most 60 s, this rule **cannot fire** on the 15m path. |
| Session-date check | session date ≠ today | `technicalAnalysis.ts:217` → `strategy.ts:184` | Catches previous-session candles only; blind to a stale bar within today's session |
| Fetch-time freshness | 120 s (× slow) | `time.ts:95–100` | Display only (`market.ts:141`, `route.ts:20`) |
| Trade-time freshness | 120 s (× slow), future 5 s | `time.ts:131, 139–190` | Not applied to candles at all |
| Future-timestamp tolerance | 5 s | `time.ts:131` | Not applied to candle timestamps |

**Conclusion on cache versus candle age:** the two are **evaluated independently and only cache age is evaluated**. Candle age is never checked against `now`.

## 6. Scenario matrix (observed)

Harness: offline, fixed clock, deterministic bars, every fetch stubbed. It runs the real `getCandles`, the real `analyzeTechnicals`, the real `analyze` and `diagnose`. It omits futures VWAP and breadth, which are not candle-classified. Market, chain and breadth were set to LIVE (or END_OF_DAY for closed-session rows) and fresh, so the technical input is the only variable. "Cache" is a cache miss for every row; cache behaviour is in §6.1.

Notes for reading the table: "last bar" is the bar's **start** time. A 15m bar is completed when start + 15 min ≤ now. Scenario N is Friday 2026-10-02, an NSE holiday (the harness label says "Mon", which is wrong).

| # | Scenario | Last bar (start) | Last completed bar: age since close | Fetch time | Market session | Candle source | Technical factors (trend/price/technical) | Engine permits recommendation | Diagnostic reports |
|---|---|---|---|---|---|---|---|---|---|
| A1 | Latest completed bar within window (12:30:20) | 12:15, completed | 0 min | 12:30:20 | OPEN | LIVE | on | **Yes (TRADE)** | LIVE, TRADE |
| A2 | As A1 plus the forming 12:30 bar | 12:30, **forming** | 0 min (12:15 bar) | 12:30:20 | OPEN | LIVE | on | **Yes (TRADE)** | LIVE, TRADE |
| B | Last completed bar slightly old (bars stop 11:45) | 11:45 | 30 min | 12:30:20 | OPEN | LIVE | on | **Yes (TRADE)** | LIVE, TRADE |
| C | Significantly stale (bars stop 10:00) | 10:00 | **135 min** | 12:30:20 | OPEN | LIVE | on | **Yes (TRADE) — defect** | LIVE, TRADE |
| D | Non-empty history, no intraday (open) | 2026-10-01 15:15 (previous session) | 5,580 min | 12:30:20 (intraday fetch) | OPEN | LIVE | on | No: "Market closed: latest candles are from 2026-10-01" | LIVE, NO_TRADE, code END_OF_DAY — **misleading** |
| E | Recent forming bar, last completed 10:00 (gap 10:15–12:15) | 12:30, forming | **135 min** (10:00 bar) | 12:30:20 | OPEN | LIVE | on | **Yes (TRADE) — defect** | LIVE, TRADE |
| F1 | Missing timestamp on latest bar (12:15 dropped) | 12:00 | 15 min | 12:30:20 | OPEN | LIVE | on | Yes (TRADE); bar dropped silently | LIVE, TRADE |
| F2 | Invalid timestamp on latest bar (12:15 dropped) | 12:00 | 15 min | 12:30:20 | OPEN | LIVE | on | Yes (TRADE); bar dropped silently | LIVE, TRADE |
| G | Future-dated latest bar (13:30, one hour ahead) | 13:30 (future) | completed bar 12:15 (0 min) | 12:30:20 | OPEN | LIVE | on | **Yes (TRADE) — defect** | LIVE, TRADE |
| H | Out-of-order delivery | 12:15 | 0 min | 12:30:20 | OPEN | LIVE | on | Yes (TRADE); reorder handled | LIVE, TRADE |
| I | Empty intraday and history | none | n/a | 12:30:20 | OPEN | UNAVAILABLE | off (no technicals; engine not run) | No (inferred: source UNAVAILABLE ≠ market LIVE) | not run |
| J | Closed 16:51, bars to 15:15 | 15:15 (today) | 81 min | 16:51 | CLOSED | **LIVE** (should be END_OF_DAY) | **off** (source ≠ market END_OF_DAY) | No | LIVE, NO_TRADE; codes MARKET_CLOSED, END_OF_DAY, **INSUFFICIENT_TECHNICAL_DATA** — mislabel |
| K | Pre-open 09:05, no intraday | 2026-10-01 15:15 | 5,375 min | 09:05 | PRE-OPEN | LIVE | on | No: "Market closed: latest candles are from 2026-10-01" | LIVE, NO_TRADE, END_OF_DAY — **misleading** |
| L | First session bar only (09:20, 09:15 forming) | 09:15, **forming** | 2026-10-01 15:15 (previous session): 5,390 min | 09:20 | OPEN | LIVE | on | No: WAIT (opening window) | LIVE, WAIT |
| M | Saturday 2026-10-03 12:30, no intraday | 2026-10-01 15:15 | 2,700 min | 10-03 12:30 | CLOSED | **LIVE** | off (mismatch) | No | LIVE, NO_TRADE — label mismatch |
| N | Friday 2026-10-02 (holiday) 12:30, no intraday | 2026-10-01 15:15 | 1,260 min | 10-02 12:30 | CLOSED | **LIVE** | off (mismatch) | No | LIVE, NO_TRADE — label mismatch |

Holiday handling itself is correct: scenario N skipped the holiday and used Thursday 2026-10-01 as the last session.

### 6.1 Cache behaviour (separate offline run)

| Test | Observed | Reading |
|---|---|---|
| **Intraday cache hit** 50 s after a fetch at 12:29:30, with newer bars upstream | Returned the earlier payload (last bar 12:15, not 12:30); `fetchedAt` = 12:29:30 | Correct about the fetch time, but the payload was not refreshed. The candle age is not evaluated, so this is invisible. |
| **Intraday cache expiry** after the 60 s TTL | Refetched (last bar 12:30, `fetchedAt` 12:31:30) | Expiry works, but on the real clock |
| **1d history cache hit** 15 min TTL: fetched 09:20, called 09:35, upstream now has a new bar | Same candles as before; `fetchedAt` reported as **09:35** | **Defect.** The data is 15 min older than the reported fetch time, and the new bar is missing. |

### 6.2 Market-session handling

| Session | Behaviour | Correct? |
|---|---|---|
| OPEN, bars present | Session from last bar; LIVE | Partly: the session is right, the age is not checked (C, E, G) |
| OPEN, no intraday bars | Previous session used; `marketClosed` true; NO TRADE with "Market closed" text (D) | Fail-closed, but the text and END_OF_DAY code are wrong |
| PRE-OPEN | Same as D (K) | Fail-closed; text wrong |
| First bar only | Works (L) | Yes |
| CLOSED, today's bars | Source LIVE (J) | Label wrong; the NO TRADE comes from market EOD mismatch |
| Weekend / holiday | Previous session; NO TRADE with "Market closed" (M, N) | Fail-closed; label LIVE is wrong |

### 6.3 Other scenario checks

| Scenario | Result |
|---|---|
| Out-of-order (H) | Correct: sorted before use |
| Empty (I) | Correct: UNAVAILABLE |
| Missing / invalid timestamp (F1, F2) | Bar dropped silently; no signal that the latest bar is missing |
| Future-dated bar (G) | Accepted; becomes the session's last bar; engine TRADE |

## 7. Engine versus diagnostic comparison

In every row the diagnostic and the engine **agree** on the decision (TRADE/WAIT/NO TRADE). They are the same underlying condition, reported twice:

- The **diagnostic** reports the raw label (`freshness.technicals`, `recommendationDiagnostic.ts:344`). It never checks candle age, so it reports LIVE in C, E and G, and LIVE with a mismatched factor in J, M and N.
- The **engine** adds two checks the diagnostic lacks: the session-date check (which catches D, K, M, N) and the fetch-time 300 s rule (which cannot fire on the 15m path). It has no candle-age check either.

So the two use the **same source of freshness evidence**: the candle source label, with no candle time. Neither uses candle timestamps for freshness, so there is no divergence to fix between them; the fix belongs in the shared source classification.

## 8. Impact on stock and options recommendations (separately)

### 8.1 Options (index) recommendations

These use the engine path (`market.ts:98` → `analyze`), so every row in §6 applies directly:

- **Permitted on stale candles while OPEN:** C (2 h 15 min old), E (forming bar on a 2 h gap) and G (future-dated). These are the defects.
- **Mislabelled but blocked:** D and K. No trade, but the reason and diagnostic code are wrong.
- **Blocked by label mismatch, with a misleading reason:** J, M, N. The actual cause is that the candle label is LIVE while the market is END_OF_DAY, so the diagnostic reports "insufficient technical data". The block itself is correct, but for a reason the operator would misread.

### 8.2 Stock recommendations

Stock recommendations do **not** use the 15m technical source or the intraday technical analysis. They are two separate paths:

- **Intraday stock path** (`stockOpportunityEngine.ts:424`): rejects any quote that is not LIVE, or whose session is not today. This path is protected.
- **Swing (positional) path** (`stockOpportunityEngine.ts:356–392`): uses daily candles (`checkDailyCandles`, `positionalTrend.ts:45–55`, a 6-day staleness limit at day granularity) and appends a "today" bar built from the **quote** (`withTodayBar`, `positionalTrend.ts:149–154`). That quote is included whatever its freshness: `available` excludes only null or UNAVAILABLE quotes (`:356`), and the `usable` flag (`:385`) is computed but never read. So a **stale quote's LTP becomes today's close** in the signal. The LIVE flag only changes wording ("Trading" vs "Closed"). This is a real issue, but it is in the stock swing path, not the candle source this brief covers. It needs its own investigation and is recorded as an adjacent finding.

## 9. Recommended correction and alternatives (not implemented)

No threshold is chosen here. Each option below states what it needs.

**Principle.** Candle freshness should be judged on the **completed bar's close time**, against `now`, at **request time** (not fetch time), using the interval of the timeframe.

| Option | What it changes | Trade-off | Needs approval |
|---|---|---|---|
| **1. Interval-aware candle age** (last completed bar must close within one interval plus a grace) | Adds a candle-age check to `getCandles` and label assignment | The grace is a **new threshold**. Reusing the existing 300 s rule on bar close would reject a 15m bar for most of its interval (a bar is legitimately up to 15 min old), suppressing valid recommendations. | **Yes** (grace value) |
| **2. Completed-bars only** (drop any bar whose end > now before computing indicators) | Removes the forming bar from the price and indicator inputs (`technicalAnalysis.ts:197–198`) | No new threshold. It **changes indicator values and therefore engine decisions** on every open-session call (A2 vs A1 shows the forming bar is currently used). Expected to reduce false TRADEs; the size of the change is unmeasured. | **Yes** (decision impact) |
| **3. Reject future-dated bars** beyond the existing 5 s tolerance | Adds a check on bar start vs `now` | Reuses `FUTURE_TIMESTAMP_TOLERANCE_MS` (existing constant, `time.ts:131`). No new number. Blocks only impossible bars. | No, if reusing the existing tolerance |
| **4. Surface dropped bars** (count them; treat a dropped latest bar as UNKNOWN) | Stops silent truncation (F1, F2) | Needs a policy: how many dropped bars is acceptable. Dropping a bad bar is safer than keeping it; the gap is the issue. | **Yes** (policy) |
| **5. Session-aware labelling** (technical source END_OF_DAY when the session is closed; not LIVE) | Changes closed-session labels (J, M, N) | **Interaction risk:** factors need source equality with the market. If the market is END_OF_DAY and technicals become END_OF_DAY, technical factors become **available on end-of-day data**. The engine still returns WAIT (`strategy.ts:283` area, `isEod`) rather than TRADE, but candidates and diagnostic blockers would change. Needs analysis before any change. | **Yes** (semantics) |
| **6. Distinct messages** for pre-open and no-intraday, not "Market closed"; no END_OF_DAY code | Text and code only (D, K) | No decision change. A new blocker message would need the classifier updated (B1 mapping). | No (presentation), but review the code mapping |
| **7. Cache: check candle age on every call; store the history fetch time; fix the 1d `fetchedAt`** (`upstoxMarket.ts:249`) | Correct freshness attribution | No threshold. Fixes J-d (§6.1). | No |
| **8. Stock swing: exclude or mark non-LIVE quotes before `withTodayBar`** | Stops stale LTPs becoming today's close (§8.2) | Changes stock swing output (fewer or relabelled opportunities). Separate task. | **Yes** |

**Recommended order:** 7 (no approval needed, fixes attribution), then 3 and 6 (existing constants or presentation only), then 2 and 1 together (the forming-bar and grace decisions are linked), then 5 only after its analysis. Option 8 is a separate stock-path task.

**Reusable existing thresholds:** only the 5 s future tolerance (option 3) and the 6-day daily staleness (stock path). Neither fits intraday candle age. **A new candle-age threshold is required**, and needs approval.

**Could a fix suppress valid recommendations?** Yes, options 1 and 2 can, and the grace value controls how much. Under option 2, the first minutes of a session and any lagging intraday feed would produce fewer bars.

**Could a fix permit stale recommendations?** Not if options 1 and 2 are implemented; the defects in §2 are exactly the permitting cases.

## 10. Tests needed before implementation

Offline, fixed clock, stubbed fetch, one test per row of §6:

1. A1, A2 (forming bar excluded from indicators and price), B, C, E, G, H, I (existing behaviour preserved where correct).
2. F1, F2: a dropped latest bar is reported, not silently ignored.
3. D, K: distinct message; no END_OF_DAY code; still NO TRADE.
4. J, M, N: label END_OF_DAY (if option 5 approved); technical factors' availability; holiday handling (N) unchanged.
5. Cache: hit returns old payload; candle age evaluated at call time; 1d `fetchedAt` equals the history fetch time (fixed clock and an injected cache clock, which the current `cache.ts` does not allow; an injectable clock would need a small change, itself needing approval).
6. Boundary tests at the grace value (approved value) and the 5 s future tolerance.
7. Regression: all existing technical tests (`technical.test.ts`, `phase*` tests that build technicals) and the Phase 30 freshness tests unchanged, except where the decision changes are intended.
8. Strategy 11.4 hash unchanged; `analysis.ts` and `strategy.ts` unchanged.

## 11. Risks and unresolved questions

- **Whether Upstox returns the forming bar, and whether it lags.** The entire §6 result depends on what the API returns during OPEN. If it never returns stale or forming bars, defects C, E and G do not occur live, but the code still permits them.
- **Holiday calendar after 2026-10-20** comes from the Upstox list only (`time.ts:14`); not verified.
- **Clock accuracy.** Session classification and candle age both use the local clock. The local clock was previously checked against NTP (about +5 ms on 2026-11-06, `ISSUE2_STALE_CLASSIFICATION_INVESTIGATION.md` §3), which is good but not a guarantee.
- **1d `to = today`** may include today's partial bar. Not used by the engine (`technicalAnalysis.ts:206` excludes the session's own bars), but visible in the 1d API route.
- **Indicator magnitude** of the forming bar is unmeasured. A2 and A1 both gave TRADE in the offline run.
- **Options and stock paths share no candle code.** A fix to `getCandles` affects options only; the stock intraday path has its own quote check.
- **Live observation is needed** to measure how often each scenario occurs. That needs a separately authorised window.

## 12. Owner approval

**Yes, approval is required.** Specifically:

1. The candle-age grace value (option 1). This is a new threshold.
2. Whether indicators use completed bars only (option 2). This changes engine decisions.
3. The dropped-bar policy (option 4).
4. The closed-session source label (option 5), after the analysis in §9.
5. Whether the stock swing path should exclude stale quotes (option 8), which changes stock output.

Options 3, 6 and 7 need no approval beyond review.

## 13. Safety restrictions — confirmation

- **No application code, test, threshold, record or document was changed by this investigation** other than this report. Verified: 0 files under `web/src` modified after the B4 finalisation report; `strategy.ts` and `analysis.ts` have zero diff against HEAD.
- **Strategy 11.4 SHA-256** unchanged: `d0170b40a4b9fb6265697edda03917779b9b8acddcaddc4c43488a4b29eb3f18`.
- **No Upstox, NSE or broker request.** Every fetch in the harnesses was stubbed; the scripts ran only against offline fixtures. The NTP check cited in §11 was made earlier, in the stale-classification investigation (`ISSUE2_STALE_CLASSIFICATION_INVESTIGATION.md` §3).
- **No live dashboard route** was requested.
- **No OAuth refresh or Analytics Token** was generated; no credentials were read or changed.
- **No paper runner, supervisor, canary, scheduler or collector** was started. No LaunchAgent was loaded or restored.
- **No broker order** was placed or implemented.
- **No `.data/` or `.research-data/` record** was written, repaired, migrated or deleted: 0 files modified after the B4 finalisation report.
- **No production record or historical run** was modified.
- **Git:** nothing was staged, committed, reset, cleaned or checked out. Existing dirty changes are untouched.
- **Node:** `/usr/local/bin/node` v22.16.0. The global Homebrew Node was not touched.
- **Scratch material** (harnesses and outputs) lives outside the repository in the session scratchpad. None is committed.

## 14. Concise recommendation

The suspected defect is real. A technical series is treated as LIVE whenever it is non-empty, and open-session stale, forming or future-dated bars can produce a TRADE.

Do not implement anything yet. First approve a candle-age grace value and the completed-bars-only rule, since they change decisions. In the meantime, option 7 (correct attribution in the cache and on 1d) needs no approval and can proceed when you say so.

I'll wait for your review and approval before implementing anything.
