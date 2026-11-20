# Master Engineering Audit

Date: 2026-11-06 (IST). Written for: the project owner. Scope: the whole application, audited in areas. Each area states what was checked, the evidence, what changed, and what was not checked.

**Overall status: PARTIAL (updated after the second pass).** Several areas are audited and corrected. Others are audited only in part, and some are not audited at all. Readiness stays **NO-GO** until the remaining areas and the release criteria are verified (see §12).

Evidence labels: **Fixed and tested** · **Verified by code reading** · **Confirmed defect, not changed (decision needed)** · **Not audited** · **Not verified live**.

---

## 1. Authentication

| Check | Result |
|---|---|
| Bearer tokens written to logs or responses | **Verified by code reading.** No token value reaches `console.*`, JSON responses or error text. Requests use `Authorization: Bearer` headers only. |
| Analytics token vs OAuth precedence | Fixed earlier (Issue 1). Not re-verified in this pass. |
| Canary bearer comparison | **Fixed and tested.** Was a plain string comparison (timing side channel). Now constant-time (`timingSafeEqual`). The 9 existing canary route tests pass. The canary is disabled by default and remains disabled. |
| Secrets exposed to the browser | **Verified by code reading.** No `NEXT_PUBLIC_` Upstox or secret variables; a test enforces this (SAFETY-04). |
| Secrets tracked by git | **Verified.** `.env*` is ignored except `.env.example`. No `.env` file is tracked. |

## 2. Market data

| Check | Result |
|---|---|
| Quote, chain and candle parsing | Covered by existing tests and this session's fixes (B5, B3/B7). |
| **Duplicate option strikes** | **Fixed and tested.** A duplicate strike doubled the candidate list and requested the same contract twice. The first occurrence now wins; non-positive strikes are dropped (`chainNormalization.test.ts`, 4 tests). |
| Timeouts | **Verified by code reading.** Every upstream request has `AbortSignal.timeout`. |
| Retries | **Verified by code reading.** No automatic retry on upstream reads. Failures fall back to UNAVAILABLE and are never cached. |
| Cache behaviour and freshness | Fixed under B5 and B6. |
| Future and invalid timestamps | Fixed under B5 (candles) and B4 (breadth). |
| Market holidays | **Confirmed limitation.** The holiday list is authoritative only to 2026-10-20; later dates come from the Upstox list (`time.ts:11–14`). A missed holiday fails closed because the intraday data is empty (NO_INTRADAY_CANDLES). Not changed. |

## 3. Technical indicators

| Check | Result |
|---|---|
| EMA, Wilder RSI and ATR, MACD | **Verified by code reading** against standard definitions. Warm-up returns null, never a partial value. |
| Session VWAP on zero-volume index candles | **Verified by code reading.** Index candles are set to null volume when all volumes are zero; VWAP returns null for null volume and for zero total volume. No index spot VWAP is computed from zero volume. |
| Futures VWAP | Covered by the futures path (completed candles only, B5). |
| Incomplete candles | Fixed under B5: only completed candles feed indicators. |

## 4. Market breadth

B4 policy preserved (every constituent fresh within 150 s; any stale or undated constituent makes the set STALE; 80% coverage unchanged). No further change.

## 5. News and event risk

| Check | Result |
|---|---|
| Failed or malformed feed | **Verified by code reading.** Returns UNAVAILABLE; never treated as fresh. |
| News freshness | Derived from article age: LIVE within 6 h, AGING within 24 h, otherwise STALE (`news.ts`). |
| No relevant articles | **Verified by code reading.** Status is STALE, never LIVE. Presentation note: the reason "No relevant articles" is shown under a STALE status, which reads as stale news rather than no news. Not changed (presentation only; recommend a clearer label). |
| Event risk | EXTREME event blocks new trades (`riskService.ts`, tested). |
| Relevance matching | **Verified by code reading.** Matching is whole-token, not substring. Ambiguous terms count only with finance context, which limits false positives. Sentiment quality was not measured. |

## 6. Risk management

| Check | Result |
|---|---|
| Sizing arithmetic | **Verified against a hand calculation** (RK-1: 2.02 per unit, 151.5 per lot, 5 lots, 758 total risk). |
| Non-finite inputs | **Fixed and tested.** NaN passed the reward-to-risk minimum and the stop check. Entry, stop, target, reward-to-risk and capital requirement are now checked for finiteness, using existing reason codes (`riskService.test.ts`, 15 tests). |
| Invalid configuration | **Verified.** Non-positive or non-finite values throw at load time. |
| Each limit | Daily loss, open risk, concurrent positions, EXTREME event, end-of-day price, wide spread, insufficient capital and minimum reward-to-risk each reject (tested). |
| **Transaction costs** | **Fixed and tested.** Brokerage (per order, with GST), STT, exchange charges, SEBI fee and stamp duty are in the net worst-case risk and the net reward-to-risk (`services/transactionCosts.ts`, `services/risk/riskService.ts`). Every rate is configurable (`COST_*` environment variables). The defaults are not verified against a broker's schedule. Not modelled: IPFT and STT on exercise. (`riskCosts.test.ts`, TC-1..8.) |
| **Gap risk** | **Accounted for; residual risk disclosed.** The worst stop fill is worsened by a configurable gap allowance (default 2% of the stop, an assumption). A larger gap is not capped: the paper engine exits at the gapped price (tested), so the realised loss can exceed the planned risk. |
| **Slippage** | **Fixed and tested.** Adverse slippage applies to both sides: the entry fill is worse, and so are the target and stop exit fills (default 1% per side, configurable). The default is an assumption. |
| **Net reward-to-risk gate (behaviour change)** | **Owner should confirm.** The 1.2 minimum now applies to the net ratio after slippage, gap and charges as well as to the gross ratio. On the mock snapshots, 7 of 20 Strategy 11.4 candidates pass the gross minimum but fail the net one (for example Long Call 1.43 gross, 1.11 net; Long Put 1.43 gross, 0.82 net on Wednesday). Blocked candidates are reported as NO TRADE with the net figure. The threshold is unchanged; this audit does not change it. |
| **Paper fill re-sizing** | **Fixed and tested.** The re-check at the simulated fill used gross risk, with no charges and no stop gap, so it could approve a size the plan had rejected. It now uses the plan's basis: realised entry, stop with gap, per-lot charges, and fixed charges taken off first. Ceiling: per-lot charges are the plan's own figures, not recomputed at the realised fill. |
| Wide-spread threshold | Risk uses 5% per leg; the options engine uses 12% (maximum) and 5% (actionable). Different thresholds for different purposes; consistent with the code, but worth stating to the owner. Not changed. |

## 7. Backend and APIs

| Check | Result |
|---|---|
| Index parameter validation | **Verified for the technical route only** (`isIndexId`, 404 for unknown values). Other index routes were not individually checked. |
| Record-ID routes (`/api/…/[id]`, `[runId]`) | **Verified by code reading.** Each file store sanitises the ID with `replace(/[^\w-]/g, "")` before building a path. |
| Path traversal | **Verified by code reading.** Every file read whose path depends on a request value is sanitised or fixed. No traversal found. |
| Date parameters (session evidence) | Sanitised the same way. |
| Error responses | Upstream error text may appear in 500 responses. It was checked for tokens (none). |
| Upstream concurrency | Concurrent identical requests share one promise (`cache.ts`). |

## 8. Frontend and dashboard

| Check | Result |
|---|---|
| Unsafe HTML injection | **Verified.** No `dangerouslySetInnerHTML` or `eval` in `src`. |
| Source and freshness labels | Fixed under B4, B5 and B6. The labels follow the data's own timestamp. |
| NO TRADE explanations | The panel renders blockers, so `NO_INTRADAY_CANDLES` and `NO_VALID_OPTION` appear. A window and leg-check block now shows verified, eligible and rejected counts, rejection reasons, and each leg's verdict. **Typechecked; not viewed in a browser.** |
| Dashboard fallback to simulated data | **Verified by code reading.** On an upstream failure the page shows simulated data, labelled `MOCK FALLBACK` with the reason. Mock data is never executable (the diagnostic blocks it). **Owner decision:** whether simulated prices should appear on a live dashboard at all. |
| Error states | **Verified by code reading.** The opportunities page renders a "Failed to load" state; the app has a root error boundary (`app/error.tsx`). |
| Responsive layout and visual states | **Checked in a headless browser (§14).** Nine routes at desktop, tablet and mobile widths: no horizontal overflow, no console errors, no outbound requests. Two mobile defects fixed. Interactive loading and error states were not exercised by clicking. |

## 9. Security and operations

| Check | Result |
|---|---|
| Secrets in git | None tracked. |
| Protected data writes in this audit | **None.** `.data/` and `.research-data/` checked by timestamp: no files written. |
| Protected processes | None started. LaunchAgent not loaded. Canary disabled. |
| Dependencies (vulnerability scan) | **Not audited.** Needs network access to an advisory database, which this audit does not make. |
| Memory and caching | The upstream cache is bounded by TTL per key (not by size). Not measured under load. |

## 10. Stock V2 (research path)

| Check | Result |
|---|---|
| Placeholder bars | **Research variant added; validation not run (§14).** An isolated comparison excludes the flat, zero-volume 15:15–15:29 closing bars before indicators (default off; stored records unchanged). Earlier text: flat, zero-volume 15:15–15:29 closing bars are labelled `placeholder: true` and counted (`stockV2/dataset.ts`). No consumer reads the label, so the bars feed the research EMAs and volume statistics unchanged. Excluding them changes research results, so it needs your decision and an isolated re-run. Stock V2 historical validation remains **BLOCKED**. |
| Point-in-time constituents and survivorship | **Confirmed limitation (documented elsewhere).** Constituent history is not point-in-time. Not changed; needs historical constituent data. |
| Live stock path | Intraday rejects non-LIVE quotes (protected). Swing excludes non-LIVE quotes (B5-adj). |

## 11. Options V2

| Check | Result |
|---|---|
| Candidate window and per-leg guard | Done under B3/B7 (`ISSUE2_B3_B7_B6_COMPLETION_REPORT.md`). |
| Price consistency | Done under B2 (tick-aware). |
| Full-chain analytics gate | **Confirmed limit, decision needed.** See the B3/B7 report, §5. |
| NIFTY and BANK NIFTY independently validated | **Offline checks per index done (§14):** instrument key, strike step from the chain, lot size from the chain, candidate window in strikes and points, expiry selection (13 tests). Live and historical behaviour not verified. |
| Expiry selection | **Verified by code reading and tests** (`expiryCalendar.test.ts`, EX-1..5). The live chain uses the nearest listed expiry after today's IST date, and today's expiry ends at 15:30. **Fixed:** an impossible date such as 2026-13-40 passed the shape check and could be selected; it is now rejected as a calendar date. Mock and backtest code use hard-coded expiry weekdays (NIFTY Tuesday, BANK NIFTY last Tuesday), which are **not verified** against the current NSE calendar. |
| Lot size | **Fixed and tested** (LS-1). Lot size comes from Upstox, never a hard-coded table. When the chain and the contract master disagree, lot size is now unknown and the risk layer blocks the trade. Previously the chain's value was silently preferred. |

## 12. Items outstanding before NO-GO can be lifted

1. Decisions for the owner: confirm the cost rates (defaults unverified), the 1% slippage per side and the 2% gap allowance; confirm the net reward-to-risk gate, which blocks 7 of 20 mock candidates; the full-chain analytics gate (options (a)/(b)/(c)); the Stock V2 placeholder method.
2. Not audited: frontend visual layout and states (needs a browser), dependency vulnerabilities, memory under load, news sentiment quality, mock and backtest expiry weekdays against the NSE calendar.
3. Stock V2 and Options V2 historical validation (blocked on data and authorisation).
4. Integration and an end-to-end offline suite. The production build passes (isolated directory); it must be re-run at the final stage.
5. Live verification of every freshness rule (requires authorisation).

## 13. Changes made in this audit

| Change | Files | Tests |
|---|---|---|
| Duplicate and non-positive option strikes removed at parse time | `services/upstoxMarket.ts` | `services/chainNormalization.test.ts` (4) |
| Non-finite risk inputs rejected with existing reason codes | `services/risk/riskService.ts` | `services/risk/riskService.test.ts` (15) |
| Constant-time bearer comparison in the canary route | `app/api/options-canary/route.ts` | existing `optionsCanaryRoute.test.ts` (9) |
| Expiry must be a real calendar date | `services/optionChainAnalytics.ts` | `services/expiryCalendar.test.ts` (5) |
| Lot-size disagreement resolves to unknown | `services/upstoxMarket.ts` (`resolveLotSize`) | `services/expiryCalendar.test.ts` (LS-1) |
| Diagnostic panel shows the window and leg checks | `components/RecommendationDiagnosticPanel.tsx` | typecheck only |
| Transaction costs, slippage on entry and exit, stop-gap allowance, net reward-to-risk gate | `services/risk/riskService.ts`, `riskConfig.ts`, `riskTypes.ts` (uses `services/transactionCosts.ts`) | `services/risk/riskCosts.test.ts` (8, new); `services/risk/riskService.test.ts` (updated); `services/risk.test.ts` (2 expectations moved to the net basis, hand-checked) |
| Paper fill re-sizing on the same basis as the plan | `services/paperEngine.ts` (post-fill sizing) | `paperTradingHardening.test.ts` (sizing test moved to capital 388,500, where the plan sizes 2 lots and the fill 1) |
| Fixture corrections (test data only): plan geometry matched to its declared reward-to-risk; a Wednesday position opened after settlement | tests only | `contractFreshnessSafeguards.test.ts`, `contractFreshnessReconciliation.test.ts`, `multiSessionPaperEvaluation.test.ts` |

No strategy, trading rule, threshold, risk parameter or protected record was changed. The cost, slippage and gap values are new configurable assumptions with defaults; the net reward-to-risk check uses the existing 1.2 minimum.

**Results (this pass):** full suite 2154 pass, 0 fail. `tsc --noEmit` exit 0. ESLint on changed files: 0 errors, 5 warnings (all pre-existing unused names). Production build (`NEXT_DIST_DIR=.next-prod-verify`) exit 0. Strategy 11.4 SHA-256 unchanged. `analysis.ts` zero diff. No protected file under `.data/` or `.research-data/` modified in the last five hours.

## 14. Pass 3: research correction, safeguards, index checks, expiry rules, browser and end-to-end

Date: 2026-11-06 (IST). Written for: the project owner. Readiness stays **NO-GO**.

| Area | What was done | Evidence | Not done / limits |
|---|---|---|---|
| Net reward-to-risk minimum | Kept at 1.2 on the net ratio. Restored the Wednesday BANKNIFTY Long Put as an explicit NO TRADE regression. Its NIFTY Bull Call Spread is a separate positive scenario. Fixture geometry checked: `rr` matches (target − entry)/(entry − stop) in every changed fixture; one straddle `rr` corrected from 1.48 to 1.43. | `multiSessionPaperEvaluation.test.ts` (19), changed risk fixtures (87 across four files) | Three opportunity-collector and delta-gate fixtures (`contractFreshnessSafeguards.test.ts` lines 273, 291, 708) still declare an `rr` that does not match their geometry. They do not pass through the risk layer and were not changed. |
| Stock V2 placeholders | Opt-in research variant excludes the labelled closing placeholders before EMAs and warm-up. Stored bars unchanged. Default off. Isolated development-only comparison written to `.research-data/stock-v2-placeholder-comparison/comparison.json`. | `stockV2/placeholderExclusion.test.ts` (6): equivalence to a dataset with the bars absent, EMA effect shown, no mutation, no trade on a placeholder minute | Validation sessions were not loaded or run. Development expectancy is negative with and without exclusion; no candidate is selected in either mode. The pre-registered protocol's code hash has changed, so validation cannot run on the existing `development.json`. The comparison script was edited once after its run, to round one delta column; the result is unaffected to 1e-6. |
| MOCK versus LIVE | Diagnostic: any simulated subsystem, even with a LIVE market, now makes the decision NO_TRADE and the overall label `PARTIAL MOCK`. Before, a MOCK option chain beside a LIVE market read as `LIVE`. | `mockLiveSafeguards.test.ts` (5) | The blocker for a partial mock reuses `INSUFFICIENT_FRESHNESS`, which is an approximation. |
| NIFTY and BANK NIFTY (Options V2) | Each index checked against its own fixture: key, strike step from the chain (50 and 100 points), lot size from the chain, window of ±7 listed strikes in points, expiry selection. | `services/optionsV2IndexChecks.test.ts` (13) | Lot sizes in the fixtures are test inputs. Live and historical behaviour not verified. |
| Expiry calendar | Weekday rules in the mock and backtest code checked against the holiday table, including two real holiday moves (2026-10-20 and 2026-11-24). Public secondary sources agree: NIFTY weekly on Tuesday, BANKNIFTY monthly on the last Tuesday. | `services/expiryCalendarRules.test.ts` (7); `services/expiryCalendar.test.ts` (6) | The NSE calendar itself is not verified against an authoritative source. The holiday table ends at 2026-12-25; 2027 expiries in the mock would not see holidays. The live path uses Upstox's listed expiries. |
| Dashboard, three widths | Playwright (headless Chromium, the Chrome extension was not connected). Nine routes × desktop 1440, tablet 834, mobile 390. Every outbound request aborted. Fixed: `/recommendation-debug` mobile horizontal overflow (grid track 502px) and the cramped mobile "WHY?" row. | 27 combinations: 0 problems in the final run | Interactive states (clicking, loading and error flows) not exercised. The mobile tab strip scrolls inside its own container, which is intended. |
| Integration and end to end | Offline chain: snapshot → analysis → diagnostic → paper engine → ledger, for MOCK (fails closed), labelled-LIVE (agrees, reconciles) and the net gate (reaches the operator). | `e2eOffline.test.ts` (3) | The LIVE inputs are labels on synthetic prices. No live data observed. API route handlers were exercised through the browser pages, not by direct handler tests. |

**Results (this pass):** full suite 2188 pass, 0 fail. `tsc --noEmit` exit 0. ESLint on the changed files: 0 errors. Production build (`NEXT_DIST_DIR=.next-prod-verify`) exit 0. Strategy 11.4 SHA-256 unchanged; `analysis.ts` zero diff. Protected data: no file under `.data/` or `.research-data/` modified in the last five hours except the new isolated comparison file. `development.json` untouched; no `validation.json` exists.

**Cost, slippage and gap assumptions (unvalidated):** brokerage, STT, exchange, SEBI, GST and stamp duty defaults are not verified against a broker's schedule; slippage is 1% per side; the stop-gap allowance is 2%. All are configurable (`COST_*`, `RISK_*`).

## 15. Pass 4: protected-data reconciliation, interaction testing, validation status

Date: 2026-11-06 (IST). Readiness stays **NO-GO**.

### 15.1 Protected-data write log (reconciliation)

| Item | Detail |
|---|---|
| Files written by this work | **One**: `.research-data/stock-v2-placeholder-comparison/comparison.json` (9,107 bytes; SHA-256 `6fd2a245acc457a58544b2d98548d0cd6d9cbdb5d9f5e48e103ccc0e71582d71`; created 2026-11-06 14:35 IST) |
| Written by | `web/scripts/stock-v2-placeholder-comparison.ts`, run once. Reads `.research-data/intraday-bars-historical/` (read-only) |
| Content | Development-session comparison only (40 dates, 50 symbols). Placeholders kept versus excluded. Provenance includes the current code hash and the validation dates **as not loaded**. Labelled "not a validation result" |
| Why this location | The standing rule permits new research outputs in isolated directories and forbids overwriting legacy results. This is a new directory and overwrites nothing. The earlier restriction was not explicit about the protected-data path, so the owner should confirm the reading |
| Action taken | File kept in place. Not deleted, moved or edited |
| Original records | No file under `.data/` or `.research-data/` has a modification time after 2026-11-06 00:00 apart from the comparison folder (checked by `find -newermt`). `stock-v2/development.json`, `development-superseded-sizing-defect.json` and `trades-development-base.json` were last written 2026-11-05 16:12–16:14. **Limit:** no hash baseline was recorded before this session, so the evidence is timestamp-based |
| Also not written | `validation.json` (does not exist); `development.json` (untouched) |

### 15.2 Interaction testing (Playwright, mock mode, Upstox blocked)

| Check | Result |
|---|---|
| Sidebar navigation (24 internal links) | All 200 and rendered. The export link starts a file download, which is expected |
| Re-evaluate on Recommendation Debug | Clicked. Recomputed without error |
| Loading state | Recommendation Debug shows "Evaluating NIFTY…" per index while the diagnostic loads |
| Injected 500 responses, malformed JSON, aborted requests | Pages now show a visible message and no page errors |
| **Fixed: Strategy Evidence** | A 500 body was stored as the report and crashed rendering ("Cannot read properties of undefined (reading 'replace')"). Now rejects non-OK and malformed responses and shows the server's message |
| **Fixed: Market History** | A failed request showed "The provider returned no candles for this range", which is untrue. Now shows "History unavailable: HTTP 500" |
| **Fixed: Price chart and recommendation evaluation** | Stored error bodies as data. Now rejected and shown as unavailable. Covered on the home page with injected faults |

**Not exercised, deliberately:** Reconnect (starts the Upstox OAuth flow); POST actions (generate recommendation, paper entry, backtest run), which write state; typing in stock search.

### 15.3 Validation status (not run)

| Item | Status |
|---|---|
| Stock V2 pre-registered validation | **Not run.** `development.json` was produced under code hash `c1285bb4…`. Current `src/lib/stockV2` hash is `a97537c7…`. The protocol's own check would refuse validation |
| Restarting the protocol | Needs a new development run on the current code, written to a new isolated directory, then one validation run. Writes to `.research-data/`, so it needs explicit authorisation |
| Options V2 historical validation | Blocked: authorised historical options data not available (§11) |
| Live behaviour | Not observed. Needs explicit authorisation |
| NSE expiry calendar | Public secondary sources agree; the NSE circular itself is not checked |

### 15.4 Results (this pass)

Full suite 2188 pass, 0 fail. `tsc --noEmit` exit 0. ESLint on the changed files: 0 errors (two pre-existing unused `eslint-disable` warnings remain, in files I touched but did not introduce them). Production build exit 0. Strategy 11.4 SHA-256 unchanged; `analysis.ts` zero diff.

### 15.5 Second protected-data write (disclosed), API smoke test, instrument guard, expiry

**Second protected-data write, not previously reported.** During the API smoke test, `GET /api/stocks/search` and `GET /api/stocks/[symbol]` in mock mode called `equityMaster()`. When the cached instrument file is older than a day, that function downloads Upstox's public instrument master (`assets.upstox.com`, not a market-data endpoint) and overwrites `.data/instruments/NSE_EQ.json`. The file was rewritten at 15:18 IST on 2026-11-06. **It is git-ignored and untracked, so the previous contents cannot be recovered.** The outbound request was not intended and violated mock mode's offline design.

**Fix:** mock mode now returns the offline constituent list with no download and no cache write. Live mode is unchanged. `stockMasterMockGuard.test.ts` (2) asserts no request and no write in mock mode, and that live mode still downloads and caches. Rebuilt; the mock-mode stock routes were then called and the file's SHA-256 and mtime were unchanged.

**Other outbound requests, disclosed.** The news routes (`/api/news`, `/api/news/[index]`, `/api/events`, `/api/sentiment/[index]`) fetch public RSS feeds in mock mode. These are not market-data requests, but they are outbound calls in mock mode. The market pipeline correctly uses mock news with mock market data. The owner should decide whether the news routes should serve mock news in mock mode. **Not changed in this pass.**

**API smoke test (mock mode).** 67 routes, 59 GET routes tested, 8 skipped because they may reach Upstox, OAuth or change state (`auth/login`, `auth/callback`, `auth/health`, `auth/status`, `paper-opportunities/collect`, `paper-opportunities/monitor`, `research/stock-candles`, `research/stock-candles-range`). Results: 42 HTTP 200, 16 HTTP 404 for unknown ids (correct), 1 HTTP 500 (`/options-canary` with no canary secret: pinned as intended by its tests). No response contained a bearer token or access-token field. No route took more than 5 seconds. The POST routes were not called.

**Expiry.** `expiryCalendarRules.test.ts` now has 9 tests. EX-M8 pins the week of 10 November 2026, a holiday, to Monday 9 November, and EX-M9 pins the November monthly to Monday 23 November. A public search confirms both dates. Public sources disagree on the date and reference of the NSE circular that moved expiries to Tuesday (25 June 2025 versus effective 1 September 2025). **The NSE circular itself was not retrieved, so NSE calendar verification remains open.**

**Results.** Full suite 2192 pass, 0 fail. `tsc --noEmit` exit 0. ESLint on the changed files: 0 errors. Production build exit 0. Strategy 11.4 SHA-256 unchanged.

### 15.6 Mock-mode news fix (completed)

**Change.** `getIndexNews` (the single function behind every news route) now returns deterministic MOCK news when `MARKET_DATA_PROVIDER` is not `upstox`. It makes no RSS or NewsAPI request in that case. A new `MOCK` status was added to the news type. Live mode runs the same code as before. The four routes (`/api/news`, `/api/news/[index]`, `/api/events`, `/api/events/[index]`, `/api/sentiment/[index]`) are served from this single path.

**Tests.** `newsMockMode.test.ts` (4): zero outbound requests in mock mode for both the pipeline and the route builders; expected MOCK responses across all six registered indices; determinism for a given clock; live mode still attempts the feeds. Eleven existing live-pipeline tests in `news.test.ts`, `rss.test.ts` and `technical.test.ts` had run with the environment unset, which is now mock. They now set live mode explicitly, and their assertions are unchanged.

**Server-level verification.** `scripts/verify-mock-news-offline.mjs` starts the production server with `scripts/outbound-recorder.cjs` preloaded. The recorder logs the host of every outbound HTTP(S) request and `fetch` call. A positive control confirms the recorder captures a request before the routes are tested. Build used: `NEXT_DIST_DIR=.next-prod-verify`, exit 0.
- All seven route requests returned HTTP 200 with MOCK-only statuses. `/api/news` and `/api/events` each cover all six indices, so they return six statuses.
- Hosts recorded: none. External hosts: none.
- A NewsAPI key was configured (`verify-dummy-key`), so the zero-request result holds even when a key is present.

**Limit.** The verification covers mock mode only. Live news is unchanged and has not been observed.

**Build incident.** The first build attempt in this session failed with `ENOSPC` (disk full). The user freed space, and the rebuild into the existing `.next-prod-verify` output then succeeded. No build cache was deleted.

**Results.** Full suite 2196 pass, 0 fail. `tsc --noEmit` exit 0. ESLint on the changed files: 0 errors, 2 warnings, both pre-existing unused `eslint-disable` directives. Strategy 11.4 SHA-256 `d0170b40…3eb3f18` unchanged. `analysis.ts` zero diff against HEAD.

**Protected data.** No new writes. The only protected-path change since midnight is the instrument-master file from the incident in §15.5. The comparison file from §15.1 is unchanged.

**Disk.** 4.1 GiB free at the end of this pass (75% used), down from 6.0 GiB after the build. The disk was full earlier in the session, so this should be watched.

### 15.7 Remaining offline items: fixed, and what is left

**Fixed in this pass.**
- **Paper post-fill charges.** Percentage charges at the post-fill sizing step are now recomputed at the realised entry and stop-exit prices. Before, the plan's figures were used (the §6 ceiling). Effect on the test case is about ₹0.003 per lot, so it's immaterial at this size. The code is now correct in principle. A test that tried to show the difference at two decimals was removed as false precision.
- **No relevant news.** A result with no relevant article is now UNAVAILABLE, with the reason "absence of news, not stale news". Before, it was STALE, with the reason "No relevant articles". Both statuses fail the same freshness checks in `analysis.ts`, so no decision changes. `NM-5` covers this.
- **Lint.** Two unused `eslint-disable` comments were removed from files changed this session. Those files now lint with zero warnings.
- **Index and id validation, all GET routes (§7 gap closed).** 28 GET routes with a dynamic parameter were sent unknown indices, path-traversal ids (`..%2F..%2F.env`, `%2e%2e%2f`), a null byte, and a 300-character id. Result: 112 of 112 requests returned 404. None returned a 500, and no body contained file or secret content. The earlier "verified by code reading" claim for record-ID routes is now a tested result, in mock mode.

**Left open (not fixed here).**
- **Project-wide lint: 85 warnings** in files not changed this session. They are mostly unused variables in older phase tests. Fixing them is churn with little value, so they're reported, not changed.
- **Dependency vulnerabilities.** `npm audit` needs registry access. Not run.
- **Memory under load.** Not measured.
- **Official calendar.** The NSE circular is not retrieved; holiday table ends 2026-12-25.
- **Stock V2 validation.** Needs a protocol restart. The development run's code hash no longer matches the current code.
- **Options V2 historical validation.** Blocked on authorised options data.
- **Live observation.** Not performed.
- **Owner decisions.** Whether the dashboard shows simulated data in live mode; whether the news and sentiment routes should keep live feeds in mock mode (now resolved in favour of mock).

**Results (this pass).** Full suite 2198 pass, 0 fail. `tsc --noEmit` exit 0. ESLint on the changed files: 0 warnings. Production build (`NEXT_DIST_DIR=.next-prod-verify`): exit 0, rebuilt for this pass. Offline news verification: 7 of 7 calls 200 with MOCK-only data, zero outbound hosts, with a positive control. Strategy 11.4 SHA-256 unchanged. `analysis.ts` zero diff. Protected data: no new writes; the only change since midnight is the instrument-cache incident in §15.5.

### 15.8 Simulation-mode safeguards, load, dependencies, and what each validation needs

**Simulation-mode defect (fixed).** The enricher decided TRADE from the engine status alone, so a snapshot with MOCK inputs could be a TRADE. `POST /api/recommendations/generate` then wrote that TRADE into the production journal as MONITORING. The diagnostic already blocked mock data, so this was a gap between two layers, not a diagnostic error. No mock entry exists in the current journal (26 entries, none MOCK-labelled; all from 2026-10-08).
- **Fix.** A single definition of simulated input (`services/mockInputs.ts`). The enricher returns NO_TRADE with a `MOCK_DATA` blocker for any simulated input. The generate route does not journal simulated runs, and its response says `journaled: false`.
- **Tests.** `mockExecutionGuard.test.ts` (3): the helper; a mock snapshot that the engine takes to TRADE is NO_TRADE with a MOCK blocker and no execution block; an all-LIVE snapshot keeps its TRADE. `recommendation.test.ts` REC15 was tightened: analysis blockers pass through in order, and the only addition permitted is the MOCK blocker.
- **Server check.** After the rebuild, a POST to `/api/recommendations/generate` in mock mode returned `decision: NO_TRADE`, `journaled: false`. The journal listing before and after was identical (26 files).

**Historical-probe code mislabel (fixed).** When a provider refusal carried no code, the adapter fell back to `UDAPI1149` (the Plus-plan code) and claimed the Plus plan was required. An unrecognised code was reported correctly. Fixed: only UDAPI1149 produces the Plus-plan capability and notes. The Option History page and the options-research page no longer present UDAPI1149 as the current result. `historicalProbeCodes.test.ts` (3) uses stubbed fetch.

**Paper and news items closed in §15.7** are unchanged.

**Load and memory (measured, mock mode).** Production server, 14 routes (pages and read-only APIs), about 3,500 requests over 12 rounds. Resident memory: 106 MB at baseline; about 320 MB after round 1 (warm-up); between 262 and 391 MB for rounds 2 to 12, ending at 376 MB. No sustained climb. **Limits:** a few minutes of mock traffic, not a long soak; live-mode caches not measured. The upstream cache (`services/cache.ts`) is a single `Map` bounded by TTL per key, with no size cap. It was not measured under live load.

**Dependency audit (`npm audit`, run this session).** 10 advisories: 1 critical, 1 high from `next`; 1 high from `zod`; 8 moderate, mostly lint tooling. The installed `next` is **16.3.8**, inside the vulnerable range `>=16.0.0 <=16.4.0`. The critical advisories are GHSA-2464-fhr4-w9xw (remote code execution through the Image Optimization API when SVG files are used) and GHSA-673q-mjm6-r5xr (remote code execution in `use cache` functions returning typed arrays). The high advisory is GHSA-p3m5-59mp-jv5r (denial of service through Server Actions). A fix is available by upgrading `next`. **Not applied:** this changes the framework and needs your authorisation and a full regression. The `zod` advisory (memory exhaustion on oversized constrained collections) has a fix available.

**Official NSE calendar (narrow search only).** Still secondary sources. They agree on the Tuesday move and the deferred Monday proposal, but cite different circular numbers and dates (103/2025 on 17 June; NSE/FAOP/68747 on 25 June; a 23 June reference) and different effective dates (28 August, 1 September, first Tuesday weekly on 2 September 2025). **Open.** The circular itself is needed: either the document, or permission to fetch the NSE circular page.

**Audit §12 items, reviewed.**

| Item | Status |
|---|---|
| Transaction-cost, slippage and gap assumptions | Unvalidated. Configurable. Owner decision on the defaults |
| Gap-risk policy | Accounted for; residual risk disclosed (§6) |
| Full-chain analytics gate (a/b/c) | Owner decision. Current behaviour is (a) |
| Stock V2 placeholder method | Research variant implemented; default off; protocol restart needed |
| Frontend visual layout and states | Done (§14, §15.2). Clicking through error states done for the listed fetches |
| Dependency vulnerabilities | Done (above). **Blocker: `next` critical advisories** |
| Memory under load | Done in mock mode (above) |
| News sentiment quality | **Not measurable offline.** Needs a labelled news dataset |
| Mock and backtest expiry weekdays | Tested against the holiday table (§15.5). NSE circular still needed |
| Stock V2 and Options V2 historical validation | Blocked (below) |
| Live verification of freshness rules | Blocked (below) |
| Integration and end-to-end offline suite | Done (`e2eOffline.test.ts`; route smoke tests). Final build re-run at each pass |
| Analytics-token vs OAuth precedence (§1) | **Verified by existing tests** (`upstoxAuthSources.test.ts`, 18 tests; A7: analytics wins when both are set) |
| Indicator maths (§3) | **Verified by existing reference tests** (`technical.test.ts` 5–8: RSI against StockCharts, EMA seeding, ATR, MACD, VWAP) |
| Option-chain and breadth freshness (§4, B6) | Unchanged policy; tested |
| Wide-spread thresholds (§6) | Documented. Owner should confirm 5% (risk) versus 12%/5% (options engine) |

**What each validation requires (derived from code).**

*Stock V2 historical validation.*
- Data: `.research-data/intraday-bars-historical/`, one file per symbol and session, named `YYYY-MM-DD-SYMBOL.json`. Each file must have status OK, a matching symbol and date, exactly 375 one-minute candles from 09:15 to 15:29 IST, and finite OHLCV. Currently 50 symbols and 60 sessions are loaded.
- Split: 40 development sessions, then 20 validation sessions, in date order.
- Gates: the protocol runs in CORE mode. Market state, event risk, India VIX, NIFTY ATR and verified live stocks are not evaluated, because the dataset does not contain them. The full specification is therefore not tested.
- Constituents: a fixed list of 50 symbols. There is no point-in-time constituent history, so survivorship bias is not controlled.
- Costs: the scenario parameters (base, conservative, adverse) are assumptions and unvalidated.
- Protocol: the development run must be made on the current code hash (currently `a97537c7…`, while the existing development run is `c1285bb4…`). The validation run is one-time and writes `validation.json`. **Both need your explicit authorisation.**

*Options V2 historical validation.*
- Data: expired-contract option candles at 1- or 5-minute resolution, for at least two years, with OHLC, volume, open interest, bid and ask, IV and Greeks, instrument identity, expiry and lot size. These are the 13 fields of the provider capability matrix (`historicalOptionsProvider.ts`).
- Current status: blocked. The probe was refused. The 2026-11 diagnostic report records the code as UDAPI100011; earlier notes linked the refusal to UDAPI1149 (Plus plan). This session did not re-probe the provider.
- Historical lot size: not available. Current lot sizes are used as a fallback (`historicalOptionDataAudit.ts`), so historical sizing cannot be validated.
- To unblock: an authorised plan that covers the endpoint, or a licensed NSE F&O historical vendor. Plus authorisation for the fetch.

*Live observation.*
- Requires: an authorised live credential, observation during market hours, and per-contract `last_trade_time` values from a live response. The diagnostic report's open item #1 (stale spot classification) can only be settled from a live response.
- The paper runner, supervisor, collector and canary are protected processes and remain stopped.

*Official NSE calendar.*
- Requires: the NSE circular for the expiry-day revision (one authoritative reference and date), and the NSE holiday list for 2027 onward. The current holiday table ends on 2026-12-25.

**Results (this pass).** Full suite 2204 pass, 0 fail. `tsc --noEmit` exit 0. ESLint on the changed files: 0 errors; 3 pre-existing warnings (`_params` in interface stubs of the historical options adapter, kept because removing them breaks typed callers). Production build exit 0. Offline news check: 7 of 7 routes 200 with MOCK-only data and no external host. Strategy 11.4 SHA-256 unchanged. `analysis.ts` zero diff. Protected data: no new writes since midnight except the instrument-cache incident (§15.5).

### 15.9 Disk inventory, upstream cache bound, Next.js upgrade proposal

**Disk inventory (read-only, nothing removed).** `docs/DISK_SPACE_INVENTORY.md`. Volume: 3.2 GiB available, 79% capacity. The project's largest items are protected (`web/.data` 2.33 GiB, `web/.research-data`), excluded by instruction (`.next`, `.next-prod-verify` with a 324 MiB Turbopack cache), or user-owned (Python `venv`, `venv311`). The recommended first cleanup, awaiting your approval of the exact path, is `~/Library/Caches/ms-playwright` (3.19 GiB). It is a tool cache that is re-installable over the network, and only the browser check uses it. A smaller optional set of generated files is listed there too.

**Upstream cache bound (fixed, offline).** `services/cache.ts` never removed expired entries, so keys that never repeat accumulated without limit. Now: expired entries are pruned on insert; the cache holds at most `MAX_ENTRIES` (500), evicting the least recently used; a hit refreshes recency; failures are still never cached. `cacheBounds.test.ts` (5 tests). The callers are unchanged. **The production build for this change has not been run**, because the disk is constrained. It waits for the approved cleanup.

**Next.js security upgrade (proposal only, not applied).** `docs/NEXT_SECURITY_UPGRADE_PROPOSAL.md`. `next` 16.3.8 is inside the affected range `>=16.0.0 <=16.4.0` for two critical remote-code-execution advisories (GHSA-2464-fhr4-w9xw, GHSA-673q-mjm6-r5xr) and one high denial-of-service advisory (GHSA-p3m5-59mp-jv5r). Proposed: `next` 16.4.5 and `eslint-config-next` 16.4.5. The `zod` high advisory comes through lint tooling only, and the app never imports `zod`; the same `eslint-config-next` upgrade removes that path. `npm audit fix` must not be used: it suggests a major downgrade of `eslint-config-next`. The proposal lists 14 regression gates. The app does not use `next/image`, SVG images, `use cache` or Server Actions, which lowers the practical exposure, but does not remove it.

**Results (this pass).** Full suite 2209 pass, 0 fail. `tsc --noEmit` exit 0. ESLint on the cache files: 0 errors. Production build: **not run** (disk constraint). Strategy 11.4 SHA-256 unchanged (checked in the previous pass; no engine file touched since).

**Status against your priority list.** (1) Next.js critical advisories: proposal ready, not applied, needs approval and network. (2) Safe disk space: inventory ready, awaiting approval of exact paths. (3) Upstream cache eviction: done, build pending. (4) Official NSE calendar: open, needs the circular. (5) Stock V2 and Options V2 validation: not authorised; requirements in §15.8. (6) Live observation: not started.

### 15.10 Approved actions executed: cache cleanup, Next.js upgrade, Stock V2 protocol run, Options V2 feasibility

**Cleanup (approved, Tier 1 only).** Removed exactly `/Users/webanatomy/Library/Caches/ms-playwright` (3,340,748 KB; 3.19 GiB). Nothing else was removed. Chromium 1248 was reinstalled afterwards with `npx playwright install chromium` (network, approved). Free space: 6.4 GiB after removal, 4.2 GiB after the final build.

**Next.js security upgrade (approved, applied).** `next` 16.3.8 → **16.4.5**; `eslint-config-next` 16.3.8 → **16.4.5** (both `--save-exact`). `package.json` changed on those two lines only; earlier uncommitted edits (test-script environment, engine pin, `lightweight-charts`, `@playwright/test`) were preserved and checked against backups. Release-note review: the bundled docs contain only the 15→16 migration guide, with no 16.3→16.4 notes. Checked against our code: `reactCompiler: true` is stable at the top level and `babel-plugin-react-compiler` 1.0.0 is installed; no middleware or proxy file; no `next lint` script; route handlers already await their params; flat ESLint config in use. Turbopack filesystem caching is on by default for builds, which explains the cache growth seen earlier.

**Gate result (first pass).** Gate 14 failed: `zod` 4.6.5 remained (high, transitive via `eslint-config-next` → `eslint-plugin-react-hooks`). Applied `npm update zod`, a lockfile-only change to 4.6.7 that the proposal (§4) already listed as expected. `package.json` unchanged. All gates were then rerun from the start.

**The 14 gates on the final lockfile.**

| # | Gate | Result |
|---|---|---|
| 1 | `npm test` | 2,209 pass, 0 fail |
| 2 | `tsc --noEmit` | exit 0 |
| 3 | ESLint, project-wide | 0 errors; 83 warnings (85 before; none added) |
| 4 | Production build on Next 16.4.5 | exit 0 |
| 5 | Offline news verification | 7 of 7 routes 200, MOCK-only, zero external hosts |
| 6 | API smoke, 59 GET routes | 42×200, 16×404, **1×500 (`/options-canary`, the documented fail-closed reply when no canary secret is configured; pinned by its tests)**; no token or secret in any body |
| 7 | Invalid-input check, 28 parameterised routes | 112 of 112 → 404; no 500; no leak |
| 8 | Browser check, 9 routes × 3 viewports | 27 of 27 clean; no overflow, no console error, no external request |
| 9 | Client fault injection | 18 runs; zero page errors; zero external requests; every fault shows a visible state |
| 10 | Load and memory, 4,200 requests | zero server errors; RSS 253–382 MB (earlier band 262–391 MB) |
| 11 | Strategy 11.4 SHA-256 | `d0170b40…3eb3f18` unchanged |
| 12 | `analysis.ts` diff vs HEAD | zero |
| 13 | Protected data | no legacy record modified; one new file in a new isolated directory (below); the instrument-cache incident (§15.5) unchanged |
| 14 | `npm audit` | **0 critical, 0 high.** `next` and `zod` clear. 8 **moderate** advisories remain, all lint tooling (`typescript-eslint`, `minimatch`, and `eslint-config-next` through them). Not in the gate's pass condition; reported as open |

**Stock V2 validation: development run executed; validation not run.** The protocol was restarted and pre-registered in `docs/STOCK_V2_PROTOCOL_RESTART.md` before the run. The runner now writes only to a new isolated directory (`STOCK_V2_OUT_DIR`) and refuses the legacy directory (checked: the guard fails as intended). Placeholder bars are excluded, the settled method. The selection rule and acceptance criteria are unchanged. Code hash `a97537c7…` (unchanged across the run).

| Candidate | Scenario | Trades | Win rate | Expectancy (R) | Profit factor |
|---|---|---|---|---|---|
| TREND_RECLAIM | BASE | 1,857 | 0.365 | −0.232 | 0.612 |
| TREND_RECLAIM | CONSERVATIVE | 1,788 | 0.306 | **−0.388** | 0.410 |
| TREND_RECLAIM | ADVERSE | 988 | 0.246 | −0.492 | 0.225 |
| PULLBACK_RECLAIM | BASE | 1,763 | 0.350 | −0.262 | 0.552 |
| PULLBACK_RECLAIM | CONSERVATIVE | 1,645 | 0.302 | **−0.389** | 0.397 |
| PULLBACK_RECLAIM | ADVERSE | 814 | 0.247 | −0.475 | 0.235 |

Development sessions: 40 (2026-08-06 to 2026-10-05), 50 symbols, 60 sessions loaded, 0 skipped files. Gate mode CORE (see limits). **Selected: NONE.** Both candidates fail the CONSERVATIVE-expectancy test. Under the pre-declared rule, validation does not run, and the 20 held-out sessions were not opened.

**What this means.** The software executes the protocol correctly. The strategies, as currently defined, lose money on the development sessions in every cost scenario, with and without placeholder exclusion. A negative result is not a reason to change rules, thresholds, the split or the scenarios. Any new strategy idea needs a new pre-registered protocol with new development data, and its validation then needs its own authorisation.

**Options V2 data feasibility (local, read-only; no provider request).** No historical option-chain data exists on disk. `.data/history` holds NSE equity candles only (daily from 2000, one-minute for 62 sessions per symbol). The only option data is forward-collected: `options-audit-research/rounds-research.jsonl` has 127 rounds, 3 sessions (2026-10-27 to 2026-11-05), 2–11 rounds per index and session, and 2,662 contract samples. Those samples carry bid, ask, IV and a last-trade time, but **no open interest, no volume and no option bars**. Conclusion: Options V2 historical validation cannot be done with local data. It needs provider access to the 13 historical option fields, or a licensed NSE F&O historical vendor. Both need your authorisation.

**Results and status.** Full suite 2,209 pass; TypeScript 0; lint 0 errors; build 0 on Next 16.4.5; security: no critical or high advisory; Strategy 11.4 unchanged. Readiness stays **NO-GO**: the candidate set fails its own development criteria, the official NSE calendar is still open, the moderate lint advisories remain, and Options V2 has no usable historical data.

### 15.11 Upstox historical collection (Phases A–B), coverage, and the first pre-registered strategy result (Phase C)

**Authorisation and scope.** The mission authorised Upstox historical-data discovery and collection under the existing analytics token. The OAuth token expired on 2026-11-03 and was not needed. No orders, plan changes or purchases were made. No credential or token value is printed or stored (checked: no token-shaped string in any output or log).

**Phase A: endpoint discovery (one attempt per probe; raw responses in `.research-data/upstox-discovery-2026-11-06/`).**

| Probe | Result |
|---|---|
| Expired-contract expiries (NIFTY) | 401, **UDAPI1149** (Upstox Plus plan required). Confirmed unchanged from 2026-10-24 |
| Index daily, 1990–2000 and 2000–2026 in one request | 400, **UDAPI1148 "Invalid date range"**: the v3 daily limit is 3,000 days per request. Chunked collection resolved it |
| Stock daily, RELIANCE, 2019-09-18 to 2021-12-31 | 200, 570 daily candles. **The 2019–2022 gap is fillable from Upstox** |
| Stock daily, RELIANCE, 1990–1999 | 200, 0 candles. No pre-2000 stock data |
| Stock 60-minute, December 2021 | 200, 0 candles. Intraday starts 2022-01-01 |
| Stock 15-minute and 5-minute, January 2022 | 200, populated |
| Corporate actions endpoint | 404, UDAPI100060. **Not available**: splits and bonuses must be detected from prices |

**Phase B: collection and quality (immutable raw store `.research-data/upstox-raw-2026-11-06-v1/`).** 1,274 requests, 0 failures, 0 skipped. Daily bars from 2000-01-01 for six indices (NIFTY 50, BANK NIFTY, FIN NIFTY, MIDCAP SELECT, SENSEX, BANKEX) and for 52 NSE equities. One-hour bars from 2022-01-01 for the 52 equities. Each chunk is stored unchanged, with its SHA-256, in an append-only manifest. The collector can resume.

Derived, cleaned dataset `.research-data/upstox-clean-2026-11-06-v1/` (prices not adjusted):
- Daily: 287,470 unique bars across 56 series. 15 missing sessions (a handful of real closures in the bank-index series). **43 candidate corporate actions or bad prints** (open versus previous close beyond 35%). BAJFINANCE alone has 39, so its history is unadjusted for splits and bonuses. Those dates are flagged, not corrected.
- One-hour: 415,928 unique bars across 50 equities. No missing sessions. 249 sessions with fewer bars than expected (to be checked against special-timing sessions).
- Calendar note: the NIFTY 50 daily series publishes zero-volume bars on exchange holidays (checked on 2003-03-22, 2003-10-25 and 2003-11-15, where only 4 of 52 stocks traded). The sessions are therefore derived from the equities. The app's holiday table covers only 2025–2026 and is not used for history.

**Options data (Phase A and B).** Historical option history is not available on this account. Expired contracts are refused (UDAPI1149). Active contracts have short history only. Bid and ask, historical IV and Greeks, option-chain snapshots and historical lot sizes are not provided. Options recommendations therefore cannot be backtested here. The plan upgrade or a licensed vendor is required, and neither was purchased.

**Universe.** 52 NSE equities and 6 indices, all current constituents. This is survivorship-biased (an upper bound). A point-in-time universe is not available from the endpoints checked.

**Phase C: first pre-registered strategy result (`docs/DAILY_EQUITY_PROTOCOL.md`, run in `.research-data/daily-equity-protocol-2026-11-06/`).** Three independent long-only daily hypotheses, next-open execution, adverse slippage, statutory delivery costs (assumptions to verify), a 1% risk budget per trade, and jump exclusion. Splits: development 2000–2015, validation 2016–2021, holdout 2022–2026-11-05.

| Stage | Candidate | Trades | Win rate | Expectancy BASE / CONSERVATIVE (R) | Profit factor (CONS) |
|---|---|---|---|---|---|
| Development | TREND_BREAKOUT_20 | 2,475 (CONS) | 0.45 | +0.044 / −0.022 | 0.96 |
| Development | PULLBACK_RSI2 | 7,943 (CONS) | 0.46 | −0.028 / −0.081 | 0.77 |
| Development | DONCHIAN_55 | 1,783 (CONS) | 0.40 | +0.119 / **+0.040** | 1.06 |
| Validation (selected) | DONCHIAN_55 | 1,045 (CONS) | 0.40 | +0.075 / +0.002 | 1.00 |
| **Holdout (opened because validation passed)** | DONCHIAN_55 | 897 (CONS) | 0.34 | −0.110 / **−0.185** | 0.75 |

**Result: REJECTED under the protocol.** The holdout CONSERVATIVE expectancy is negative. Validation passed only at +0.002 R, which is indistinguishable from zero. Survivorship bias favours these results, so the true figures are likely worse. No strategy is accepted, and none is integrated into the recommendation engine.

**Not done in this round, with reasons.** A point-in-time universe, 15-minute and 5-minute strategy research, options strategies, and index-level strategies all need further data work or a new protocol. The 1-hour data is collected but not yet researched. Each new hypothesis needs its own pre-registered protocol, and its holdout must not be used to tune it.

**Results and checks (this round).** Engine tests: 6 pass (causal indicators, next-open execution, adverse gap exit, jump exclusion, costs, risk budget). Protected data: no legacy record modified; the instrument-cache incident (§15.5) is unchanged; all new output is in new directories (108 MB). Disk: 3.9 GiB free.

### 15.12 Intraday one-hour research: I-1 and I-2 to I-8 (all rejected at validation)

**Protocols (registered before any run):** `docs/INTRADAY_PROTOCOL_I1_TREND_CONTINUATION.md` (I-1) and `docs/INTRADAY_PROTOCOLS_I2_TO_I8.md` (I-2 to I-8). Each hypothesis is tested separately. Data: the 52 NSE equities, one-hour standard grid (seven bars per session), 2022-01-03 to 2026-11-05, unadjusted prices, with flagged sessions excluded. Splits: development 2022–2023, validation 2024 to mid-2025, holdout mid-2025 to 2026-11-05 (opened only after validation passes). Costs and sizing as in the daily protocol, with intraday statutory-rate assumptions (verify before use).

| ID | Hypothesis | Dev trades (CONS) | Dev expectancy BASE / CONS (R) | Validation trades (CONS) | Validation expectancy BASE / CONS (R) | Holdout |
|---|---|---|---|---|---|---|
| I-1 | Trend continuation | 7,363 | −0.107 / −0.206 | 5,775 | −0.117 / **−0.206** | Not opened (rejected at validation) |
| I-2 | Breakout with volume | 1,207 | −0.078 / −0.167 | 969 | −0.077 / **−0.162** | Not opened |
| I-3 | Momentum pullback | 4,363 | −0.110 / −0.212 | 3,450 | −0.126 / **−0.219** | Not opened |
| I-4 | Relative strength (top quartile) | 5,529 | −0.121 / −0.211 | 4,258 | −0.113 / **−0.199** | Not opened |
| I-5 | Opening-range breakout | 2,988 | −0.090 / −0.182 | 2,583 | −0.085 / **−0.173** | Not opened |
| I-6 | VWAP reclaim | 11,068 | −0.098 / −0.193 | 8,600 | −0.114 / **−0.204** | Not opened |
| I-7 | Mean reversion, sideways | 224 | −0.044 / −0.147 | 196 | −0.120 / **−0.213** | Not opened |
| I-8 | Failed-breakdown reversal | 5,620 | −0.074 / −0.168 | 4,652 | −0.108 / **−0.197** | Not opened |

**Result: all eight hypotheses rejected at validation.** Every development and validation result is negative in both scenarios, and no holdout was read. The multiplicity rule therefore needs no holdout reporting.

**Diagnostic: gross edge before costs (zero slippage, validation window, not a protocol result).** Gross expectancy is −0.005 R to +0.036 R across the eight hypotheses (I-2 +0.036, I-5 +0.025, I-8 +0.009, I-6 +0.001, I-3 −0.005, I-4 −0.004, I-7 −0.005). The signals show essentially no gross edge. Costs and slippage then push every result below zero. The rejection is therefore not an artefact of cost assumptions. It reflects the signals themselves. A further finding: the shared exit design sends most trades to the session close (for I-1, 4,890 of 5,773 validation trades), so intraday targets are rarely reached.

**Data for the next step.** The 15-minute collection for the same 52 equities (2022-01-01 to 2026-11-05) started in the background into `.research-data/upstox-raw-2026-11-06-v2/`. It is immutable and uses the same collector.

**Options data discovery (free, no new source fetched).** No bhavcopy files are stored locally. NSE publishes daily F&O bhavcopy archives. These are free and would give daily OHLC, volume and open interest per contract, with no bid, ask, IV or Greeks. They need a one-file discovery probe against the exchange archive, which is a new external source, so that probe waits for owner approval.

**Corporate actions and constituents (not yet fetched).** Free public sources exist for corporate actions and index-change circulars (NSE and BSE). They need the same narrow discovery approval before use.



### 15.13 Phase 1–4 (2026-11-08): data verification, G-1 V2 diagnostics, options data

**Corrections to earlier entries.** The universe is **50 equities**, not 52: the earlier count included the two BSE index series (SENSEX, BANKEX). Entries that say 52 are superseded by this one. The 1-hour and 15-minute sample counts (1,274 and 3,200 requests) match 50 equities.

**Phase 1, verification** (`DATA_VERIFICATION_2026-11-08.md`). 15-minute: 3,200 of 3,200 files valid, zero missing, extra or temporary files, zero manifest mismatches. 1-hour and daily: 1,274 of 1,274 valid. Bar-level anomalies dropped and counted, never repaired (15-minute: 600 Muhurat off-grid bars, 4 OHLC-inconsistent). Hashes: the manifest's recorded hash is of raw response text, which was never stored, so it cannot be reproduced (26 of 3,200 match on re-serialisation). The verified reference is now each file's SHA-256 of stored bytes. Calendar: 6,629 sessions, derived from the equity series. Corporate actions: 42,972 records, 31 duplicate rows, 1,202 parsed split/bonus events, 231 unparsed subjects.

**Corporate-action adjustment: not applied.** 26 of 30 universe events (2006–2025) show no price step at the ex-date, so the vendor history is already back-adjusted; applying NSE factors would double-count. Four are ambiguous. Every split, bonus and face-value ex-date session is excluded instead.

**Phase 2, G-1 V2** (`PREDICTIVE_POWER_G1_PROTOCOL_V2.md`; V1 unchanged). Changes registered before the V2 runs: per-stock time-of-day baseline; volatility median within each period (V1 used the whole sample, including the holdout); regime labels from the previous session close (no same-day look-ahead); corporate-action ex-date and irregular-session exclusions; 1,000 draws (V1 200), seed 20261108; date-clustered intervals; a fifth decision criterion (cluster lower bound above zero). The interrupted V1 run's partial output was not reused. Three of its partial log lines were read before the corrections; the corrections followed the registered text and the code, not any value.

Gate: 50 of 50 series pass on both grids. Holdout not loaded.

**Result: no signal passes the V2 decision rule on either grid.** The closest are I-2 and I-5 at the 15-minute 1-hour horizon, which pass there and fail at session end. Gross excess is about +2 to +6 bps at that horizon, well below round-trip costs of roughly 20–30 bps. I-3 is significantly negative for the registered long direction (15-minute, session end). Full tables and regime and stock breakdowns: `G1_RESULTS_V2_2026-11-08.md`.

**Recommendation: no cost-adjusted validation is justified** by the predefined evidence. A bearish mirror of I-3 and a narrower I-2/I-5 hypothesis would each need their own registration and must not use the holdout as a tuning set.

**Phase 4, options data** (`OPTIONS_DATA_RESEARCH_2026-11-08.md`). Two trading days of bhavcopy are on disk. Open interest, volume and lot sizes are present in the 2026 file; bid/ask, IV and Greeks are absent. Historical option coverage is therefore two days. The bulk sweep stored zero archives and remains stopped. Expired Upstox option data needs the Plus plan (UDAPI1149). Licensing was not verified.

**Protected checks.** Strategy 11.4 SHA-256 `d0170b40…3eb3f18` unchanged. `analysis.ts` zero diff. Research engine tests 12 of 12. No existing `.data/` or `.research-data/` record modified; all new outputs are in new directories. Dirty Git state untouched.
