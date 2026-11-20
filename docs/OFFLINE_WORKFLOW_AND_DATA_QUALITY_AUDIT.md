# Offline Workflow and Data-Quality Audit

Date: 2026-11-05 (IST). Written for: the project owner and reviewers.

Status labels: **DONE** (done and verified), **PARTIAL** (done, but a limit or open decision remains), **NOT DONE** (not attempted or not completed), **BLOCKED** (cannot be done safely without a decision, data, or access the project does not have).

This document has three parts. §1–§7 are the audit findings. §8 covers the execution-timing change and the Phase 1 hardening. Where a later pass corrected an earlier statement, it is marked **Correction**. Phase 1 is detailed in [PHASE1_RISK_HARDENING.md](PHASE1_RISK_HARDENING.md).

## 1. Scope and restrictions followed

- No Upstox or NSE requests, no OAuth refresh, no token generation, no historical collection, no paper runners, supervisors, canaries or schedulers, no live dashboard routes, no order code paths.
- Protected data (`web/.data/`, `web/.research-data/`) was read only. A metadata comparison of all 18,018 files against the start-of-pass baseline shows no additions, removals or changes (§9).
- Strategy 11.4 (`web/src/lib/engine/strategy.ts`) unchanged. SHA-256 `d0170b40a4b9fb6265697edda03917779b9b8acddcaddc4c43488a4b29eb3f18` matches, and git shows no diff.
- No credential was rotated, refreshed, regenerated or replaced. No secret value was printed. Secret checks reported counts only.
- No `git reset`, `git clean` or destructive checkout was run. Unrelated working-tree changes were not touched. Nothing was committed.

## 2. Status by requirement

| Requirement | Status | Note |
|---|---|---|
| Delete approved build caches (3 exact paths) | DONE | All three absent after the final build and checks (§3). |
| Secret recheck (counts only) | DONE | 0 matches for either key in every build folder and in the repo (excluding `.env.local`). |
| Credential rotation | NOT DONE | Requires your approval (§3). |
| Run Backtest, offline | BLOCKED | Needs Upstox historical candles; no 2026 index candles exist locally (§4.1). |
| Compare Execution Models, offline | BLOCKED | Same data requirement. The comparison table now shows costs, slippage and performance claims (§8.6). |
| Stored-run recomputation | DONE | All four stored runs reproduced from their trade lists (§4.2). |
| Stored-run display on `/performance` (GET only) | DONE | Matches the stored JSON; shows the legacy label, the CLOSE_ONLY claim notice and the performance-claim row (§8.5). |
| Same-candle execution | DONE in code, PARTIAL in data | The engine fills at the next bar's open. Four defects were fixed in the review, and tick-aligned fills were added in Phase 1 (§8). The stored runs are unchanged and labelled `LEGACY_SAME_CANDLE`. They have not been re-run on real candles. |
| Phase 1: offline risk hardening | DONE | Gap audit, charge validation, engine-level multi-leg test, tick and premium-floor audit, labelling, route re-verification. See [PHASE1_RISK_HARDENING.md](PHASE1_RISK_HARDENING.md). |
| Phase 2: validate the corrected backtest on historical data | BLOCKED | Needs authorised historical candles (§4.1, §10). |
| Phases 3–5: stock and options recommendation engines, controlled release | NOT STARTED | Need new market data, independent validation periods, and your approval (§10). |
| Stock V2 data-quality audit | DONE | Structure clean. Closing placeholders labelled at load time, prices kept (§5). Excluding them is a decision for you. |
| Options six-index data-quality audit | DONE | Not recommendation-grade (§6). |
| `npm test` script | DONE | Fixed. Runs the full suite. |
| Test suite | DONE | 1,944 pass, 0 fail, 0 skipped (via `npm test`). |
| Typecheck | DONE | `tsc --noEmit` exit 0. |
| ESLint | DONE | 0 errors, 88 warnings (baseline; none in files touched). |
| Production build | DONE | In-tree build exit 0. No secret values in its output. 33 tracing warnings, classified and not changed (§7). |
| Browser verification | DONE | 18/18 on the production build across the six research routes at 1366/834/390 px; 9/9 run-page checks (§8.5). |
| Final safety verification | DONE | §9. |

## 3. Security and credentials

**Cache state: clean.** The three approved directories are all absent now.
- `web/.next/dev/cache` had been recreated by the running dev server. The server was stopped, and the folder was removed.
- `web/.next-prod-verify/cache` was created by the production build in this pass. It was removed after its contents were checked (Turbopack cache only, no secret values).
- `web/.next/cache` was already absent.
- The parent folders (`web/.next/`, `web/.next-prod-verify/`) were kept, as approved.

**Secret recheck (counts only).**

| Value | Matches in build folders | Matches in repo, excluding `.env.local` and `node_modules` |
|---|---|---|
| `NEWS_API_KEY` | 0 | 0 |
| `UPSTOX_ANALYTICS_TOKEN` | 0 | 0 |

Both values remain in `web/.env.local`, which is git-ignored.

**Credential rotation: not performed.**
- `NEWS_API_KEY`: rotate as a precaution. It was present in the earlier compile caches, and this pass cannot establish whether those caches were copied elsewhere.
- `UPSTOX_ANALYTICS_TOKEN`: no match in any build output. Rotation is your call.
- An environment-variable value was printed once earlier in the session by a process listing (disclosed in the previous report). It was not used or stored. Consider rotating it if it was visible to anyone else.

## 4. Offline workflows (Parts 3–5)

### 4.1 Run Backtest and Compare Execution Models: BLOCKED

- **Code path.** `POST /api/backtest/run` and `/api/backtest/scenarios` read `backtestRequest.ts`. Without an Upstox token the route returns HTTP 503 by design. With a token it fetches candles from Upstox.
- **Attempt.** A POST test to the backtest endpoints was denied by the automated-action classifier earlier in this session. It was not retried. The browser Run and Compare buttons were not clicked.
- **Offline data.** Local data does not cover the window. `web/.data/history/` has index files for Nifty 50 and Bank Nifty only at daily resolution, for 2000–2019. No 2026 intraday index candles exist, and there is no India VIX series. The default PHASE10 model needs VIX and constituent context.
- **Decision needed.** Either approve a live Upstox historical fetch for these two workflows, or supply an offline candle set for a stated window. Either way, a re-run should write to an isolated `APP_DATA_DIR`, never to `web/.data/`.

### 4.2 Stored-run recomputation: DONE

Recomputed from each run's `trades` and `equityCurve`, read only:

| Run | Model | Trades | Net P&L (stored) | Max drawdown |
|---|---|---|---|---|
| `bt_482207d9` | CLOSE_ONLY | 435 | −₹8,76,730.44 | matches equity curve |
| `bt_5ad11e54` | INTRABAR_MODEL_DERIVED | 816 | −₹6,40,179.29 | matches equity curve |
| `bt_6093f183` | INTRABAR_MODEL_DERIVED | 521 | −₹9,15,825.53 | matches equity curve |
| `bt_f817dfc2` | CLOSE_ONLY | 698 | +₹2,02,257.07 | matches equity curve |

Totals: 2,470 trades, starting capital ₹10,00,000 in each run.

Checks that pass for every trade and every run:
- **Costs.** Per-trade fees sum to `costSummary.totalCosts`. Gross P&L minus slippage minus fees equals net P&L.
- **Sizing.** `quantity = lots × lotSize`. No trade risks more than 1% of starting capital.
- **Equity.** Starting capital plus summed net P&L equals the last equity-curve point.

Interpretation: three of the four runs are heavily negative. The one positive run is a single data point with no out-of-sample test. All four were produced with same-candle execution (§4.3), so they are not valid evidence of next-bar performance.

### 4.3 Same-candle execution: DONE in code (see §8)

Every stored trade (2,470 of 2,470) has entry time equal to signal time. The engine priced the entry at the signal bar's close. §8 describes the fix. The stored files are not rewritten and are labelled `LEGACY_SAME_CANDLE` on read.

### 4.4 Labelling in comparison output: DONE (Phase 1)

The comparison table previously showed neither the cost breakdown nor the synthetic-data label. It now shows gross P&L, slippage, transaction costs, net P&L after all costs, the performance claim per model, and the option-price status (§8.6). The table's rendering has not been checked in a browser, because it appears only after a comparison POST.

## 5. Stock V2 data-quality audit (Part 6): DONE

Dataset: `web/.research-data/intraday-bars-historical/`. Read-only.

**Structure: clean.**
- 3,000 session files = 60 trading dates (2026-08-06 to 2026-11-03) × 50 symbols.
- Each file has 375 one-minute bars, 09:15 to 15:29 IST.
- Filenames, `date`, `symbol` and bar timestamps agree.
- No duplicate or non-monotonic timestamps, no nulls, no non-positive prices, no OHLC inconsistencies, no negative volume, no weekend dates, no overnight move above 15%.
- Three non-session files sit in the same folder (a constituents snapshot and two coverage reports). The session parser rejects them correctly.

**Defect: flat zero-volume closing bars (Correction).** In every file, bars from 15:15 to 15:29 IST include exactly 14 bars with volume 0, and each of them is flat (open = high = low = close). The one remaining bar in that window carries volume: it is 15:28 in 1,700 files and 15:29 in 1,300 files. An earlier version of this audit said 15:29 always carries volume and that 15:15–15:28 is the window. Both statements were wrong. The window is 15:15–15:29 in every file. The total is 42,000 placeholder bars.

**Effect on Stock V2 results (measured).** I simulated the development dataset (60 sessions, 50 symbols, base cost scenario, `TREND_RECLAIM`) twice: once with the placeholders as stored, and once with them removed before simulation.
- With placeholders: 2,765 trades.
- Without placeholders: 2,770 trades (+5, about 0.18%).

The placeholders do affect results, because the EMAs run continuously through them. Their effect on entries and exits is not zero.

**What was done.** The loader now labels each placeholder bar (`placeholder: true`) and counts them on the dataset (`closingPlaceholderBars`). Prices are not changed, so the simulated trades are identical (2,765) and the pre-registered baseline stays valid. Excluding the placeholders would change the results and needs a new pre-registration. That is decision 5 in §10.

**Stock V2 status (unchanged):** NO-GO. Failed candidates have not been tuned. Validation needs new independent data: point-in-time constituents, historical India VIX, NIFTY ATR inputs, event history, and broker cost schedules.

## 6. Options data-quality audit (Part 7): DONE

Source: `web/.data/options-audit-research/rounds-research.jsonl` (127 rounds, read-only).

**Rounds.**
- 127 rounds. Six are error rows ("not attempted: no valid Upstox token on disk") and are excluded.
- 121 valid rounds: NIFTY 21, BANKNIFTY 20, FINNIFTY 20, MIDCPNIFTY 20, SENSEX 20, BANKEX 20.
- Sessions: 2026-10-27 (12 rounds), 2026-10-28 (66), 2026-11-05 (43). Three sessions in total.

**Samples (2,662 total).**

| Measure | Result |
|---|---|
| Live (fresh) | 55.2% |
| Classified STALE | 44.8% (1,192 samples) |
| Quote age, median / p90 / max | 8 s / 5,387 s / 447,598 s (about 5.2 days) |
| Quote LTP present | 82.9% |
| Bid and ask present | 99.7% |
| Zero bid or zero ask | 299 samples |
| Crossed book (bid > ask) | 56 samples |
| Chain IV present | 80.9% |
| Price agreement (standard) false | 634 samples (23.8%) |
| Book classification OUTSIDE_SPREAD | 1,557 samples (58.5%) |

**Per index.**

| Index | Liquid | Chain IV | Bid/ask |
|---|---|---|---|
| NIFTY | 100% | 100% | 100% |
| BANKNIFTY | 100% | 100% | 100% |
| MIDCPNIFTY | 95% | 100% | 100% |
| SENSEX | 97.7% | 99.3% | 100% |
| FINNIFTY | 65% | 77% | 98% |
| BANKEX | **9.3%** | **8.0%** | 100% |

**Findings.**
- Less than half the samples are fresh enough to use. Staleness is the main limit.
- Crossed books and zero bid/ask values need a rule before any quote is used.
- BANKEX has almost no liquid or IV-bearing contracts in this data.
- The 58.5% OUTSIDE_SPREAD classification is unusually high. Its meaning was not verified and needs a check before the field is trusted.
- Research samples carry no open interest, volume, lot size or trend (`storedResearch.ts` sets them to null). The options engine's recommendation gates need these.

**Options status (unchanged):** NO-GO for recommendations. Only three sessions exist, against five required.

## 7. Automated tests and build (Part 8): DONE

### 7.1 `npm test` script: DONE (fixed)

The `test` script in `web/package.json` now passes `--experimental-strip-types`. Before the fix, every test file failed to load on Node 22.16.0 and no test ran.

### 7.2 Results

| Check | Command | Result |
|---|---|---|
| Full suite | `npm test` (Node 22.16.0) | **1,944 pass, 0 fail, 0 skipped** |
| Phase 1 hardening | `phase1Hardening.test.ts` (new) | 8 pass |
| Next-bar execution | `nextBarExecution.test.ts` | 10 pass |
| Next-bar regression | `nextBarExecutionRegression.test.ts` | 18 pass |
| Backtest engine (existing) | `backtest`, `phase10`, `phase9`, `performance`, `dashboard`, `phase2316Hardening` | 5 + 69 + 43 + 45 + 25 + 22 = 209 pass |
| Stock V2 | `stockV2.test.ts`, `stockV2Research.test.ts`, `closingPlaceholders.test.ts` | 35 + 16 + 6 = 57 pass |
| Options engine | `options.test.ts` | 30 pass |
| Route isolation | `route-isolation.test.ts` | 4 pass |
| Readiness audit | `productionReadinessAudit.test.ts` | 21 pass |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| ESLint | `npx eslint .` | 0 errors, 88 warnings (baseline) |

Assertions changed in this phase, each for a stated reason (the reasons are in the test files and in [PHASE1_RISK_HARDENING.md](PHASE1_RISK_HARDENING.md) §1):
- **R1** (phase10): expected sizing per unit 54 → 54.05, because the exit estimate now includes one tick per leg. The formula is otherwise unchanged.
- **24b** (phase9): the stop-loss bound now states the exit tick explicitly (one tick per unit).
- **RG2** (regression): comment only. Its assertions are unchanged.

### 7.3 Production build: DONE, with 33 warnings classified

- In-tree: `NEXT_DIST_DIR=.next-prod-verify npx next build`. Exit 0.
- The 33 warnings are classified in the verification report (§7): 27 dynamic-filesystem tracing warnings from seven store and collector modules, and 6 file-pattern warnings over `.data` and `.research-data`. None comes from the backtest engine, the timing module or the Stock V2 loader. Not changed: removing them would mean changing how the stores locate their data.
- Secret check on the output: 0 matches for either key.

## 8. Execution (exec-next-bar-open-v1) and Phase 1 hardening

### 8.1 Rule

A signal decided on bar N, at its close, is filled at bar N+1's open. The fill is priced at that open, not at bar N's close. A signal can never fill on the bar that produced it. This matches the Stock V2 simulator, which already enters at the next bar's open.

### 8.2 How the engine does it

- **Pending entry.** A decision on bar N stores a plan. It does not book a trade.
- **Fill at bar N+1's open.** Each leg is repriced with the chain's option model at that open, using the decision-time IV (`repriceAtFill`).
- **Tick-aligned, adverse executable prices (Phase 1).** Entries, exits and decision sizing use `adverseFill`. Prices move to the adverse ₹0.05 tick, never below one tick. A round trip at the ₹0.05 floor loses one tick, so it is never free.
- **Stop and target stay at the strategy's levels.** A level already passed at the open is booked as an exit at the open (`GAP_EXIT`, or `TARGET`), with `exitAtFill` set.
- **Sizing at fill.** Open positions: planned distance at the fill, within the decision-time budget. Positions closed at the open: exact tick-aligned round trip. Estimated charges, with a 1.1 margin, are inside the budget in both cases.
- **Next bar must exist.** The next bar must start exactly one timeframe after the signal bar. A missing bar cancels the entry and is counted (`PENDING_NEXT_BAR_MISSING`).
- **Session, expiry and concurrency.** Re-checked at the fill.
- **End of data.** A decision on the last bar is counted as `PENDING_NO_NEXT_BAR`.

### 8.3 Review findings (earlier pass)

Four defects were found and fixed (D1–D4, verification report §2): shifted levels hid gaps; a missing bar filled from a later one; the budget excluded charges; positions closed at the open were sized on a stop distance that did not matter.

### 8.4 Phase 1 findings

- **Premium floor.** Before Phase 1, a round trip at the ₹0.05 floor was exactly flat (free execution). Fixed by tick-aligned adverse fills.
- **Charges.** The fill-time estimate was exceeded by realized charges on 6 of 134 trades, by at most 0.6% of recorded risk (with the 1.1 margin).
- **Gaps.** Gap-through-stop at the fill: worst −0.96R. Gap-through-stop after the fill (INTRABAR): worst −4.09R on the spread fixture, which a budget cannot cap. CLOSE_ONLY stop overshoot: worst −1.25R on the plain spread fixture.
- **Multi-leg.** Spread trades are now produced and tested through the engine.

Full detail: [PHASE1_RISK_HARDENING.md](PHASE1_RISK_HARDENING.md).

### 8.5 Labels, stored runs and UI

- **Performance claim** (derived on read; nothing stored): CLOSE_ONLY is **DISABLED**; INTRABAR is **RESEARCH ONLY** (synthetic option prices). Shown on the run page and in the comparison table.
- **New runs** carry `metadata.executionTiming = "NEXT_BAR_OPEN"` and `execution.entryTiming`. New run IDs include the timing version (RG14).
- **Stored runs** have neither field. They are labelled `LEGACY_SAME_CANDLE` on read and are never rewritten. Their SHA-256 hashes are checked in RG13 and are unchanged.
- **UI.** Verified on the production build: all four stored runs show the legacy label and notice, and the two stored CLOSE_ONLY runs show the claim notice (9/9 run-page checks, plus 18/18 route checks).

### 8.6 Comparison table

Shows gross P&L, slippage, transaction costs, net P&L after all costs, the performance claim and the option-price status. The comparison appears only after a comparison is run (a POST), so its rendering has not been checked in a browser. Its data shape is checked by a unit test.

### 8.7 What is not done

- The four stored runs have not been re-run under the new rules. That needs real candles (§4.1).
- The effect of the new rules on performance is unknown until that re-run.
- The stop and target rule (absolute levels) has a sensitivity: on the 100,000 fixture run it removed a TARGET exit (12 trades with 1 target, to 13 trades with none). That is a small-sample effect, and it should not be read as an edge.
- Slippage (1%) and the charge schedule are assumptions to be validated against broker statements and market data.

## 9. Final safety verification (Part 10): DONE

- **Strategy 11.4.** `web/src/lib/engine/strategy.ts` matches the expected SHA-256. No git diff.
- **Protected data.** `web/.data/` and `web/.research-data/` contain 18,018 files. A size and mtime comparison with the start-of-pass baseline shows no differences. The four stored legacy records are byte-identical (SHA-256 checked).
- **Flags.** `OPTION_QUOTE_LTT_ENABLED` and `OPTION_QUOTE_CANARY_ENABLED` are not set to true in any repo env file.
- **Processes.** No paper runner, supervisor, canary, scheduler or collector from this repo is running. The servers used for checks were stopped. Another project's dev server was left untouched.
- **LaunchAgent.** `com.upstox.paperlive.plist` is installed but **not loaded**.
- **Earlier modification times.** Files in `web/.research-data/stock-v2/` have mtimes from 2026-11-05 16:12–16:14 IST, are in the baseline, and are unchanged since. This session did not write them, and it cannot establish which earlier process did.

## 10. Decisions needed from you

1. **Credential rotation.** Approve, or not, rotation of `NEWS_API_KEY` (recommended as a precaution). `UPSTOX_ANALYTICS_TOKEN` is your call.
2. **Historical data (Phase 2).** Approve a live Upstox historical fetch, or supply an offline candle set for a stated window. Writes go to a separate data directory; the four stored runs are preserved.
3. **CLOSE_ONLY.** Performance claims are now disabled. Decide whether to keep the model as it is (for process review only), or change it to fill stops at the level (this alters every CLOSE_ONLY result).
4. **Stop and target rule.** Keep absolute strategy levels (the current, conservative rule), or evaluate re-planning at fill as a strategy change with its own evidence.
5. **Stored results.** Keep the four `LEGACY_SAME_CANDLE` results as reference only, or delete them. Do not overwrite them.
6. **Charges and slippage.** Provide broker statements or a validated slippage source before any performance claim is considered.
7. **Stock V2 closing placeholders.** Keep labelled (the current state, and the basis of the pre-registered baseline), or exclude them. Excluding them changes 5 of 2,765 trades and needs a new pre-registration.
8. **Options data.** Accept the NO-GO, or collect fresher samples with open interest and volume.
9. **Phases 3–5.** Approve the data sources needed (point-in-time constituents, India VIX, NIFTY ATR, events, breadth, historical options) before they start.

## 11. Next priority

Phase 2: once authorised candles are available (decision 2), re-run the stored backtests under the new rules in a separate data directory, and compare the results with the four legacy runs. Do this before any strategy tuning, and before any performance claim.

