# Master Project Completion Tracker

Date: 2026-11-06 (IST). Maintained per the master execution prompt, Part 3. Updated after each batch.

Statuses: NOT STARTED · INVESTIGATING · BLOCKED · AWAITING OWNER APPROVAL · IMPLEMENTING · TESTING · COMPLETE · NO-GO

Evidence labels: **Implemented** · **Tested** · **Verified offline** · **Verified historically** · **Verified live** · **Not verified** · **Blocked** · **Requires approval**.

**Overall readiness: NO-GO.** Not ready: B3/B7 implementation, B6 remainder, the full engineering audit, the Stock V2 and Options V2 audits, integration, the final dashboard, the production build, and all historical validation are outstanding. See the last section.

**Authority.** Technical decisions are delegated to the engineering lead under the most recent master instruction. Prohibited actions remain prohibited (Upstox/NSE requests, OAuth, Analytics Token, collectors, runners, schedulers, LaunchAgent, broker orders, Strategy 11.4 changes, changes to `.data/` or `.research-data/`).

## Current stage

**Stage 1 (B5) — COMPLETE (offline).** **Stage 2 (B6) — COMPLETE for actionable items (offline); residual mismatches documented.** **B2 — COMPLETE (offline).** **B3/B7 — COMPLETE (offline) for the candidate window and per-leg guard; one structural limit awaits your decision (full-chain analytics gate).** The full engineering audit and the Stock V2, Options V2 and integration stages have **not started**.

---

## Workstream status

| # | Workstream | Status | Evidence | Next action |
|---|---|---|---|---|
| 0 | Authentication (Issue 1) | COMPLETE (earlier) | Implemented and tested earlier. Not re-verified this session. | Re-verify in regression |
| B1 | Diagnostic classification | COMPLETE | 19 offline tests; full suite passing | Regression only |
| B4 | Breadth freshness | COMPLETE | Option A + PARTIAL display; 16 + 24 + 11 tests | Regression only |
| **B5** | Technical candle freshness | **COMPLETE (offline)** | 17-min rule, completed-only, fail-closed, sessions, cache re-judged, `NO_INTRADAY_CANDLES`. Policy 21 tests, attribution 8, diagnostic 10. `docs/ISSUE2_B5_COMPLETION_REPORT.md`. | Live verification needs approval |
| B5-adj | Stock swing stale quotes | **COMPLETE (offline)** | Only LIVE, current-session quotes reach the swing signal. 8 tests. `docs/STOCK_SWING_STALE_QUOTE_FIX_REPORT.md`. | None |
| B6 | Engine and diagnostic freshness consistency | **COMPLETE (offline), residuals documented** | Source freshness from the data timestamp; technical freshness from the candle classification; the frozen engine's 300 s fetch limit applied upstream (`STALE_FETCH`); explicit technical gate. 7 + 4 tests. `docs/ISSUE2_B3_B7_B6_COMPLETION_REPORT.md` §4. | Residuals: quote labels classified at fetch time (≤ one TTL old); chain freshness STALE without verification (by design) |
| B2 | Tick-aware option-price consistency | **COMPLETE (offline)** | Tolerance = max(2%, one ₹0.05 tick). 8 tests + existing 2% tests pass. | None |
| B3 / B7 | Option-chain verification and freshness | **COMPLETE (offline) — structural limit awaiting owner decision** | Shared ATM ±7 window (`optionCandidateWindow.ts`) used by engine, verifier summary and per-leg guard. Per-leg guard blocks any TRADE leg outside the window or not individually LIVE and consistent (`optionLegGuard.ts`, enricher). Window counts and rejection reasons in diagnostics. 21 tests. Full-chain request scope kept, because PCR/OI/volume are frozen-strategy inputs. | Owner decision (a)/(b)/(c) in `docs/ISSUE2_B3_B7_B6_COMPLETION_REPORT.md` §5 |
| **R1** | Transaction costs, adverse slippage, stop gap, net reward-to-risk | **COMPLETE (offline), owner to confirm assumptions** | Brokerage, STT, exchange, SEBI, GST and stamp duty in net worst-case risk and net reward-to-risk; configurable `COST_*` values, no broker-specific rates invented. 1% slippage each side on entry and exit; 2% stop-gap allowance, residual gap risk disclosed. Paper post-fill re-sizing on the same basis. 8 new cost tests, updated risk and paper tests. Behaviour change: 7 of 20 mock candidates now fail the net 1.2 minimum. `docs/MASTER_ENGINEERING_AUDIT.md` §6, §13. | Owner to confirm cost rates, slippage, gap and the net gate |
| **R2** | Net reward-to-risk minimum and fixture geometry | **COMPLETE (offline)** | Net 1.2 kept. Negative regression restored (Wednesday BANKNIFTY Long Put → NO TRADE); separate positive NIFTY Bull Call Spread. Changed fixtures verified against geometry. | Owner to review the 7-of-20 mock blocking effect |
| **R3** | Stock V2 placeholder exclusion (research variant) | **COMPLETE (development only)** | Opt-in exclusion; stored bars unchanged; 6 tests; isolated comparison in `.research-data/stock-v2-placeholder-comparison/`. Negative expectancy with and without; no selection. | Validation not run; protocol must be re-run before any validation |
| **R4** | MOCK versus LIVE safeguards | **COMPLETE (offline)** | Any MOCK subsystem now blocks execution and downgrades the overall label to PARTIAL MOCK (was LIVE with a mock option chain). 5 tests. | None |
| **R5** | NIFTY and BANK NIFTY Options V2 independent checks | **COMPLETE (offline)** | Per-index identity, strike step, lot size, window and expiry: 13 tests. | Live and historical behaviour not verified |
| **R6** | Expiry-calendar rules | **COMPLETE (offline)** | Mock and backtest weekday rules tested against the holiday table (7 tests). Public sources agree on NIFTY Tuesday and BANKNIFTY last Tuesday. | NSE calendar not verified authoritatively; holiday table ends 2026-12-25 |
| **R7** | Dashboard browser check (desktop, tablet, mobile) | **COMPLETE (Playwright; no interactive flows)** | 9 routes × 3 widths: 0 overflow, 0 errors, 0 outbound requests after 2 mobile fixes. | Chrome extension not connected; clicks and error flows not exercised |
| **R8** | Integration and end-to-end (offline) | **COMPLETE (offline)** | 3 chain tests: MOCK fails closed, labelled-LIVE reconciles, net gate reaches the operator. | LIVE inputs are labels; no live observation |
| **R9** | Protected-data reconciliation | **DOCUMENTED — owner to confirm the reading** | One new file: `.research-data/stock-v2-placeholder-comparison/comparison.json` (SHA-256 `6fd2a245…`). No other protected file modified since 2026-11-06 00:00. Legacy records last written 2026-11-05. Kept in place. `audit §15.1`. | Owner confirms that new isolated outputs are permitted |
| **R10** | Client error and loading states | **COMPLETE (Playwright, mock mode)** | Fixed three client fetches that stored error bodies as data (Strategy Evidence, Price Chart, Recommendation Evaluation), and market history's misleading empty message after a failed request. 24 links navigated; loading and error states checked. `audit §15.2`. | Interactive POST flows not exercised |
| **R11** | Stock V2 validation prerequisites | **BLOCKED — authorisation needed** | Development run hash `c1285bb4…` ≠ current `a97537c7…`. Validation not run. | Explicit authorisation for a protocol restart (new isolated dir) and for validation |
| **R12** | Second protected-data write (disclosed) and mock-mode instrument guard | **FIXED; prior file not recoverable** | `.data/instruments/NSE_EQ.json` (git-ignored) rewritten 15:18 by a mock-mode request to Upstox's public instrument master. Mock mode now never downloads or writes. 2 tests. `audit §15.5`. | Owner to accept that the earlier cache content is lost (cache only, re-creatable in live mode) |
| **R13** | API smoke test (mock mode) | **COMPLETE (59 of 67 routes)** | 42 × 200, 16 × 404 for unknown ids, 1 × 500 by design (canary). No token leakage. 8 routes skipped as possibly reaching Upstox or OAuth. | Owner decision: serve mock news from the news routes in mock mode (RSS currently fetched) |
| **R14** | NSE expiry calendar | **PARTIAL** | Nov 2026 holiday cases pinned to public sources (9 expiry tests). NSE circular itself not retrieved; sources disagree on its date. | Retrieve the NSE circular (authoritative source) |
| **R15** | Mock-mode news routes | **COMPLETE (offline; mock mode only)** | Four news routes (and `/api/news`) serve deterministic MOCK news with zero outbound requests. Live mode unchanged. Server-level verification via `scripts/verify-mock-news-offline.mjs` against the rebuilt production output: 7 of 7 calls 200 and MOCK-only, zero outbound hosts, with a positive control. `audit §15.6`. | Live news not observed |
| **R12 (incident detail)** | Instrument-master incident | **FIXED; prior file not recoverable** | Preserved in `audit §15.5`: `.data/instruments/NSE_EQ.json` rewritten by a mock-mode request; the mock-mode guard prevents recurrence. | Owner to accept that the earlier cache content is lost |
| **R16** | Remaining offline items | **COMPLETE for the listed offline items; remaining items are blocked or owner decisions** | Paper post-fill charges recomputed at the realised fill. No-relevant-news status UNAVAILABLE. Two unused lint directives removed. All 28 GET routes with a dynamic parameter: 112 of 112 invalid or traversal inputs return 404, no 500, no leaked content. `audit §15.7`. | 85 pre-existing project-wide lint warnings (unrelated files); npm audit; load memory; NSE circular; Stock V2 and Options V2 validation; live observation |
| **R17** | Simulation-mode execution guard | **FIXED (offline)** | Simulated inputs now NO_TRADE in the enricher (`MOCK_DATA` blocker). Generate route does not journal simulated runs. Server check: `journaled: false`, journal unchanged (26 files). `audit §15.8`. | None |
| **R18** | Historical-probe code mislabel | **FIXED (offline)** | Unknown or absent provider codes are no longer reported as UDAPI1149 or the Plus-plan requirement. 3 tests. | Owner to re-probe the provider to confirm the current code |
| **R19** | Load and memory (mock mode) | **MEASURED** | ~3,500 requests over 12 rounds; RSS 262–391 MB after warm-up, no sustained climb. Upstream cache has no size cap (documented). | Long soak test; live-mode cache measurement |
| **R20** | Dependency audit | **BLOCKER** | `next` 16.3.8 is inside the vulnerable range of two critical RCE advisories and one high DoS advisory. Fix: upgrade `next`. `zod` high advisory, fix available. Not applied. | Owner authorisation for the framework upgrade and a full regression |
| **R21** | Official NSE calendar | **OPEN** | Secondary sources only; circular references conflict. | The NSE circular, or permission to fetch it |
| **R22** | Validation prerequisites inventory | **DOCUMENTED** | Data requirements for Stock V2, Options V2 and live observation derived from code (`audit §15.8`). | Authorisation for each |
| **R23** | Disk-space inventory | **DOCUMENTED — awaiting approval of exact paths** | Read-only inventory in `docs/DISK_SPACE_INVENTORY.md`. Volume 3.2 GiB free (79%). Recommended first: `~/Library/Caches/ms-playwright` (3.19 GiB, re-installable). Protected and user data excluded. Nothing removed. | Owner approval of the exact paths |
| **R24** | Upstream cache bound | **FIXED (offline); build pending** | Expired entries pruned; LRU eviction at 500 entries; hits refresh recency; failures never cached. 5 tests (`cacheBounds.test.ts`). | Production build once disk is cleared |
| **R25** | Next.js security upgrade | **PROPOSED — not applied (blocker)** | `next` 16.3.8 is in the affected range of two critical RCE advisories and one high DoS advisory. Proposal: `next` and `eslint-config-next` to 16.4.5; 14 regression gates in `docs/NEXT_SECURITY_UPGRADE_PROPOSAL.md`. | Owner approval; network; disk; full regression |
| **R26** | Priority list status | **OPEN** | (1) R25; (2) R23; (3) R24 done; (4) official NSE calendar still open; (5) validation not authorised; (6) live observation not started. | As listed |
| **R27** | Approved Playwright cache cleanup | **DONE** | `~/Library/Caches/ms-playwright` removed (3.19 GiB), exact path only; Chromium reinstalled. | None |
| **R28** | Next.js security upgrade | **DONE — gates passed** | `next` and `eslint-config-next` 16.4.5; `zod` 4.6.7 (transitive, lockfile only). Audit: 0 critical, 0 high; 8 moderate lint-tooling remain. All 14 gates passed on the final lockfile. Exception: the documented `/options-canary` 500 in the smoke test. `audit §15.10`. | Moderate lint advisories (typescript-eslint, minimatch) |
| **R29** | Stock V2 protocol restart and development run | **DONE — NO-GO for the candidate set** | Pre-registered (`docs/STOCK_V2_PROTOCOL_RESTART.md`); new isolated run `.research-data/stock-v2-protocol-run-2/development.json`. Both strategies negative on CONSERVATIVE (−0.388, −0.389 R). Selected: none. Validation not run; held-out sessions not opened. | Failed result stands; any new strategy needs a new pre-registered protocol |
| **R30** | Options V2 data feasibility | **DONE — not feasible locally** | No historical option chains on disk. Forward-collected: 3 sessions, 2,662 samples, no OI or volume. | Provider access or licensed vendor; authorisation |
| **R31** | Stock V2 and Options V2 validation | **BLOCKED (Stock V2 result: candidate set failed development)** | Stock V2 validation not run under the selection rule. Options V2: no data. | Owner decision on any new protocol |
| **R32** | Upstox historical discovery (Phase A) | **DONE** | Expired options refused (UDAPI1149); index daily chunked (≤3,000 days, UDAPI1148 otherwise); stock daily 2019–2022 gap fillable; intraday from 2022; corporate-actions endpoint absent (404). `audit §15.11`. | Plan upgrade or vendor for historical options (owner decision) |
| **R33** | Historical collection and quality (Phase B) | **DONE** | 1,274 requests, 0 failed. Daily 2000–2026 for 6 indices and 52 equities; 1-hour from 2022 for 52 equities. Immutable raw store with hashes and manifest. 43 flagged corporate-action candidates (not adjusted). Survivorship-biased universe. | Point-in-time universe; corporate-action adjustment source |
| **R34** | Options historical data | **NOT AVAILABLE on this account** | No historical option chains or expired-contract bars. Local option data is 3 forward-collected sessions with no OI or volume. | Plan upgrade or licensed vendor |
| **R35** | First pre-registered daily equity protocol (Phase C) | **REJECTED** | DONCHIAN_55 selected on development (CONS +0.040 R); validation +0.002 R (barely positive); holdout CONS −0.185 R. Survivorship favours results; no strategy accepted. | New hypothesis needs a new pre-registered protocol |
| **R36** | Remaining mission items | **OPEN** | Point-in-time universe; 15-minute and 5-minute research; index and stock options; intraday strategies on the 1-hour data; integration only of strategies that pass. | Owner decisions on data sources and the next hypotheses |
| **R37** | One-hour intraday research I-1 to I-8 | **REJECTED (all eight at validation)** | Each hypothesis tested separately on the 52 equities. Every development and validation result negative in both scenarios. Gross edge before costs is ≈0 (−0.005 to +0.036 R). Holdouts not opened. `audit §15.12`. | None for these hypotheses; new hypotheses need new protocols |
| **R38** | 15-minute collection | **RUNNING** | Same 52 equities, 2022-01-01 to 2026-11-05, immutable raw store `upstox-raw-2026-11-06-v2`. | Coverage check, then research |
| **R39** | Options data (free discovery) | **PENDING APPROVAL** | NSE F&O bhavcopy would give daily option OHLC, volume and OI at no cost, but no bid, ask, IV or Greeks. One discovery probe needs owner approval. | Approval |
| **R40** | Corporate actions and historical constituents | **PENDING APPROVAL** | Free NSE and BSE sources to check. Not fetched. | Approval |
| — | Engineering regression (B1–B7) | PARTIAL | Full suite passing: 2209/2209 at the last run | Full regression with the production build at Stage 5 |
| — | Full engineering audit | **PARTIAL** | `docs/MASTER_ENGINEERING_AUDIT.md`. Fixed and tested: duplicate option strikes; non-finite risk inputs; constant-time canary auth; impossible expiry dates; lot-size disagreement; diagnostic panel block. Verified by reading: auth, secrets, path traversal, VWAP, indicator maths, news fail-safe. Not audited: expiry and calendar, frontend states, dependency vulnerabilities, load. | Owner decisions in §12 of the audit; remaining areas |
| — | Stock V2 complete audit | PARTIAL | Confirmed defect: placeholder closing bars are labelled but not excluded from research indicators (needs methodology decision). Point-in-time constituents: not available. Historical validation BLOCKED. | Owner decision on placeholder method |
| — | Options V2 complete audit | PARTIAL | Candidate window, per-leg guard, tick-aware price check done (B2, B3/B7). NIFTY and BANK NIFTY not independently validated. Full-chain analytics gate is an owner decision. | Owner decision (a)/(b)/(c); independent index validation |
| — | Historical data requirements | **BLOCKED** | Needs explicit authorisation to collect any data | Stage 10 |
| — | Integration and regression report | NOT STARTED | — | Stage 9 |
| — | End-to-end tests | NOT STARTED | Per-workstream tests exist; no end-to-end suite | Stage 10 |
| — | Final dashboard (stock and options sections) | NOT STARTED | — | Stage 9 |
| — | Production build | **PASS** (isolated `.next-prod-verify`) | All routes built. Build exit 0. | Re-run at final stage |
| — | Final readiness | **NO-GO** | See below | Stage 11 |

---

## Stage 1 — B5 detail (COMPLETE, offline)

| Decision | Chosen | Evidence |
|---|---|---|
| Maximum completed-candle age (15m) | 17 min = 15 min + 2 min delivery grace | Boundary tests B-1, B-2 |
| Interval awareness | 5m 7 min · 15m 17 min · 30m 32 min · 1h 62 min · 1d end-of-day | POL-1 |
| Completed candles only | Start + interval ≤ now | POL-2, B-3, B-17 |
| Malformed / missing / future newest candle | Block (DATA_QUALITY) | B-5, B-6, B-6b, B-7, POL-3 |
| Opening window and pre-open | UNAVAILABLE `NO_INTRADAY_CANDLES` / `PRE_OPEN`; no previous-session TRADE | B-9, B-10, B-11, b5 suite |
| Closed, weekend, holiday | END_OF_DAY, never eligible | B-12, B-13, B-14 |
| Cache hits | Re-judged at request time; original fetch time kept | B-15, B-16, CA-2, CA-3 |
| Pre-open / no-intraday diagnostic | New blocker `NO_INTRADAY_CANDLES` (diagnostic layer only; frozen engine untouched) | b5 suite |

Candle harness, 16 scenarios: no non-fresh, non-current candle produces a TRADE. The only TRADE rows are fresh completed candles (A1, H).

## Stock swing (B5-adj, COMPLETE offline)

Only LIVE, current-session quotes can become today's synthetic close. Excluded quotes are reported with their reason. Rows remain REJECT (retired, observation only). 8 tests.

## B2 (COMPLETE offline)

Rule: `|chain − quote| ≤ max(2% × LTP, ₹0.05)`. Low premiums: one tick passes, two ticks fail. High premiums: the 2% governs. 8 tests.

## B6 (COMPLETE offline; residuals documented)

Done: source freshness from the data timestamp (fetch time only as fallback); technical freshness from the candle classification; the frozen engine's 300 s technical fetch limit applied upstream as `STALE_FETCH`, so a LIVE technical label cannot coexist with an engine block.

Residuals (documented, not changed): quote labels are classified at fetch and cached for 5 s (spot) or 15 s (chain); the engine's 120 s market and chain fetch rules cannot fire under those TTLs; chain freshness is STALE without full verification (intentional, no chain timestamp).

## B3 / B7 (COMPLETE offline; structural limit)

Done: shared candidate window (ATM ±7, one definition); verifier window summary (verified, eligible, rejected counts, reasons, out-of-window count); per-leg guard in the recommendation layer, which previously checked only the first BUY leg, so spread short legs and condor wings were never checked; NO TRADE with a `NO_VALID_OPTION` reason per rejected leg.

Structural limit: the full-chain request scope is kept. PCR, OI and volume aggregate the entire chain and feed the frozen strategy, so narrowing the request scope would make full-chain analytics unverifiable and suppress all options recommendations. Consequently, a far illiquid contract can still stop actionable options grades. Owner options (a), (b) and (c) are in the report, §5.

## Owner decisions

No approval is outstanding for B5, B2, the stock swing change, or B6's completed parts. Delegated decisions are recorded in the reports above, with rationale.

Still needing an owner decision or authorisation:
1. Whether the B3/B7 verification window should be exactly the engine's ATM ±7 (recommended) or wider.
2. Authorisation for any live observation window (to verify forming-bar timing, feed lag and the frequency of malformed bars). Live verification of the 17-minute rule is not possible without it.
3. Authorisation before any historical-data collection (Stage 10).
4. Transaction-cost and slippage assumptions for recommendation sizing (the risk layer models neither costs nor gap risk).
5. Stock V2 placeholder-bar method (exclude from research indicators, in an isolated re-run).

## Protected actions — none performed

- No Upstox, NSE or broker requests. All tests and harnesses use stubs.
- No OAuth refresh; no Analytics Token.
- No runner, supervisor, canary, scheduler or collector started; no LaunchAgent loaded; no broker orders.
- `OPTION_QUOTE_LTT_ENABLED` and `OPTION_QUOTE_CANARY_ENABLED`: absent from `web/.env.local`; `.env.example` sets both to false. The canary requires the exact value `"true"`. Unchanged.
- `.data/` and `.research-data/`: not written this session (checked by file timestamp against the Group A report).

## Verification at the last full run

- Full suite: **2209 pass, 0 fail, 0 pending** (final run for this batch).
- TypeScript: exit 0.
- ESLint on changed files: 0 errors, 5 warnings (pre-existing unused names).
- Production build (`NEXT_DIST_DIR=.next-prod-verify`): exit 0.
- Strategy 11.4 SHA-256: `d0170b40a4b9fb6265697edda03917779b9b8acddcaddc4c43488a4b29eb3f18` — unchanged; `strategy.ts` and `analysis.ts` have zero diff against HEAD.

## Readiness: NO-GO, with exact reasons

| Criterion (Part 15) | Status | Reason |
|---|---|---|
| B1–B7 resolved | Mostly | B3/B7 complete except the owner-decided full-chain gate; B6 complete with documented residuals |
| Authentication correct | Partly | Fixed earlier; not re-verified this session |
| Freshness handling consistent | Mostly | B5 and B6 main items done; frozen-engine fetch-age rule documented |
| Market data validation correct | NO | Full audit not started |
| Risk calculations verified | Partly | Sizing checked by hand (RK-1, legacy tests); costs, slippage and gap integrated and tested. Owner to confirm the assumptions and the net gate. |
| Stock and options engines function independently | NO | Audits not started |
| Dashboard accurately reports data status | Mostly | Technical and source freshness now consistent with the data; the dashboard components were not re-tested end-to-end |
| No critical known engineering defects | NO | B3/B7 open; audits not done |
| Regression passes | Yes at last run (2209/2209) | — |
| Production build succeeds | Yes (exit 0, isolated directory, re-run this batch) | Re-run at final stage |
| Strategy hash unchanged | Yes | `d0170b40…3eb3f18` |
| Protected data preserved | Yes | No protected files written |
| Stock readiness | NO | Stock V2 audit and historical validation not done |
| Options readiness | NO | Options V2 audit and historical validation not done |
| Release readiness | NO | Above criteria unmet |

Nothing in this tracker is a GO decision. No historical validation has been performed, and no live behaviour has been verified.


| **R41** | Data verification (Phase 1) | **DONE** | 15m 3,200/3,200 valid; 1h and daily 1,274/1,274 valid. Universe 50 equities (not 52). Calendar 6,629 sessions. `DATA_VERIFICATION_2026-11-08.md`. | Raw hashes not reproducible from stored JSON; file-level SHA-256 is the new reference |
| **R42** | Corporate actions | **DONE: not applied** | Vendor history already back-adjusted (26 of 30 events, no step). Split and bonus ex-date sessions excluded instead. | Owner decision if adjusted data is wanted from another source |
| **R43** | G-1 V2 diagnostics, 1h and 15m | **DONE: no signal passes** | Gate PASS both grids. Closest: I-2 and I-5 at 15m 1h (pass there, fail at session end). Gross excess +2 to +6 bps, below costs. I-3 negative (long). `G1_RESULTS_V2_2026-11-08.md`. | Any new hypothesis needs registration. No cost-adjusted run justified |
| **R44** | Options data (Phase 4) | **BLOCKED on data** | Two bhavcopy days on disk. Bulk sweep stopped with zero archives. IV, Greeks, bid/ask absent. Expired Upstox data needs Plus plan. | Owner approval to resume the bhavcopy sweep, and a decision on the Plus plan or a vendor |
| — | Engineering regression (B1–B7) | PARTIAL | Full suite passing at last full run; research engine tests 12/12 this round | Full regression with the production build at Stage 5 |
