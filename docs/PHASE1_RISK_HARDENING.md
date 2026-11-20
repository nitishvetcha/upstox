# Phase 1: Offline Engineering and Risk Hardening

Date: 2026-11-05 (IST). Written for: the project owner and reviewers.

Scope: the roadmap's Phase 1 items, which need no new market data or broker access. Phases 2–5 are not started (§7).

Companion documents: [NEXT_BAR_EXECUTION_VERIFICATION.md](NEXT_BAR_EXECUTION_VERIFICATION.md) (execution review, earlier), [PROJECT_COMPLETION_REPORT.md](PROJECT_COMPLETION_REPORT.md), [OFFLINE_WORKFLOW_AND_DATA_QUALITY_AUDIT.md](OFFLINE_WORKFLOW_AND_DATA_QUALITY_AUDIT.md).

## 0. Summary

| Phase 1 item | Result |
|---|---|
| CLOSE_ONLY risk-model limitation | **Resolved by explicit disabling.** CLOSE_ONLY results carry "performance claims DISABLED" on every surface. The model itself is unchanged, because changing it would alter every CLOSE_ONLY result. |
| Gap-through-stop and gap-through-target audit | **Done.** Four behaviours audited and tested (§2). One residual risk is inherent and reported (§2.4). |
| Charges and slippage validated against the cost model | **Done for charges, with measured error** (§3). Slippage (1%) is an assumption; it is not validated against market data. |
| Complete multi-leg execution, not just pricing | **Done.** Spreads produced by the engine and tested end to end (§4). |
| Synthetic-data and cost labelling in comparison tables | **Done.** Costs, slippage, performance claim and option-price labels added (§5). |
| Premium rounding and minimum-price audit | **Done, and fixed.** Executable prices are now tick-aligned and adverse; a round trip at the floor is never free (§6). |
| Six research routes verified again | **Done.** 18/18 routes and 9/9 run-page checks on the production build (§8). |

## 1. Files changed

| File | Change |
|---|---|
| `web/src/lib/backtestExecution.ts` | `OPTION_TICK` and `adverseFill()`: tick-aligned, adverse executable prices. |
| `web/src/lib/backtestEngine.ts` | Entry fills, exit fills and decision sizing use `adverseFill`. Exit tick allowance in the sizing rule. At-open sizing on the exact tick-aligned round trip. Charge-estimate margin `CHARGE_ESTIMATE_MARGIN = 1.1`. |
| `web/src/lib/backtestTiming.ts` | `performanceClaimOf()`: derived on read from the execution model. Dependency-free. |
| `web/src/lib/services/backtestScenarios.ts` | Comparison rows carry `performanceClaim`, `optionPrices`, `slippage`. |
| `web/src/components/performance/WhatIfTables.tsx` | Gross P&L, slippage, transaction costs, net P&L (after all costs), performance claim and option-price rows; synthetic and claim note. |
| `web/src/app/(research)/performance/page.tsx` | "Performance claim" row; CLOSE_ONLY notice. |
| `web/src/lib/services/phase1Hardening.test.ts` | New: 8 tests (PH1–PH8). |
| `web/src/lib/services/phase9.test.ts` | Test 24b: bound states the exit tick explicitly. |
| `web/src/lib/services/phase10.test.ts` | Test R1: expected sizing value updated for the exit tick (54 → 54.05), formula otherwise unchanged. |
| `web/src/lib/services/nextBarExecutionRegression.test.ts` | RG2 comment corrected (a floor round trip now loses one tick; the test's assertions are unchanged). |

Nothing was written under `web/.data/` or `web/.research-data/`. The four stored records are byte-identical (§7).

## 2. Gap-through-level audit

The engine has four gap cases. Each is now explicit, tested, and labelled.

### 2.1 Gap through the stop at the fill open (`GAP_EXIT`, `exitAtFill = true`)

The fill bar opens with the position already beyond its stop. The position is closed at the open. The loss is the round trip at the fill price: two adverse ticks plus charges. Sizing uses that exact round trip, so the budget holds (worst measured −0.96R). Tests: RG2, RG15, PH2.

### 2.2 Gap through the target at the fill open (`TARGET`, `exitAtFill = true`)

The fill bar opens beyond the target. Buying there and selling at the same open is a round trip that loses. This is the conservative result. A profit can only come from a move after the fill, which the normal exits handle. Tests: RG3 (loss required), PH2.

### 2.3 Gap after the fill, through the stop (INTRABAR model, `GAP_EXIT` at a later bar)

The stop is booked at the open of the gap bar, at the open price, not at the level. Tested: PH4 (exit mid equals the gap bar's open valuation). Measured on the spread fixture with a 1% alternating gap: 33 gap exits, worst −4.09R, 19 beyond the budget. **This residual risk is inherent**: a budget cannot cap a gap. It is reported as a limit, and the comparison rows show lossesBeyondPlannedRisk.

### 2.4 Gap after the fill, through the target (INTRABAR model)

Booked at the target level, within bisection and the mark rounding. Tested: PH5.

### 2.5 CLOSE_ONLY stops

CLOSE_ONLY checks stops only at the bar close. A premium that falls through the stop inside the bar is exited at a worse close, so the exit can sit beyond the stop by several R (fixture: 7 of 22 stop exits beyond budget, worst −1.25R on the plain spread fixture, PH6). The model is kept unchanged. Its performance claims are disabled (§5). Its stored results (two runs) are labelled accordingly.

## 3. Charges: validated against the cost model

**Method.** The engine estimates charges at the fill, using the same cost model as the close (`costsFor`). Entry legs are at the fill prices. Exit legs are estimated at the entry mids, because the exit premium is unknown at the fill. The estimate is multiplied by `CHARGE_ESTIMATE_MARGIN = 1.1` and used in the budget. The recorded `riskAmount` includes it.

**Measured** (134 trades with charges, plain and gap fixtures, VIX-20 spread fixture):
- Realized charges exceeded the margined estimate on **6 of 134** trades.
- The worst excess was **0.6% of recorded risk**. The median difference was −1.2% of risk (the estimate is conservative on the typical trade).
- Before the margin, on the larger 304-trade spread set, the worst under-estimate was 4.7% of risk (14% of trades were under-estimated). The margin removes most of that gap.

**Not validated.** The statutory schedule in `transactionCosts.ts` is the model under test, and the test compares the estimate against the same model. That shows the estimate is consistent with the model. It does not show the model matches the exchange and broker's actual charges. That needs a broker statement, which is not available here.

**Slippage.** 1% of the mid per fill is a stated assumption, unchanged. It is not validated against market data.

## 4. Multi-leg execution through the engine

Spreads are produced by the engine when the IV percentile is high (a VIX of 20 in the fixture). Previously no engine-level multi-leg trade existed in any fixture, so multi-leg behaviour was tested only as a pure function.

**Test PH1** (`phase1Hardening.test.ts`): on the spread fixture (plain and gapped), multi-leg trades exist, and each leg is repriced at the fill open with the decision IV. Each leg carries the trade quantity, and the net entry price equals the sum of the legs' signed executable prices.

**Also covered.** PH2 (tick alignment and adverse direction on every leg), PH7 (charges on single- and multi-leg trades), RG4–RG5 (repricing of debit and credit structures as pure functions).

**Not covered.** Credit structures through a full engine run (iron condor, credit spread): the fixtures never produce one. The pure repricing for credit is tested (RG5).

## 5. Labelling: performance claims, costs and synthetic prices

**Performance claim** (derived on read from the execution model; nothing is stored):
- `CLOSE_ONLY`: **DISABLED** (stops checked at the bar close only).
- `INTRABAR_MODEL_DERIVED`: **RESEARCH ONLY** (synthetic option prices; no observed option data exists in this project).
- Unknown or missing model: treated as disabled, never as claimable (PH8).

**Where shown:**
- Run page: "Performance claim" row on the Execution card, plus a notice on CLOSE_ONLY runs. Verified on the production build for both stored CLOSE_ONLY runs.
- Comparison table: performance-claim row, option-price row, gross P&L, slippage, transaction costs, and net P&L after all costs. The note states that option prices are model-derived in both columns.

**Not browser-verified.** The comparison table appears only after a comparison is run, which needs a POST. The rows are checked by PH8 (data shape) and by the typecheck. Its rendering has not been seen in a browser.

## 6. Premium rounding and minimum-price audit

**Findings before this phase:**
1. Executable prices (fills and exits) were rounded to two decimals after slippage. They were not on the exchange tick (₹0.05).
2. Premiums are floored at ₹0.05 (`priceOption`). At that size, 1% slippage rounds to zero at two decimals. A round trip at the floor was **exactly flat**: free execution.
3. The chain's LTPs are tick-aligned (`r05`), but fills were not, so the decision and fill prices used different grids.

**Fix:** `adverseFill(side, mid, slip)` moves each executable price to the adverse tick (up for a buy, down for a sell) and never below one tick. Entries, exits and decision sizing all use it. A buy at the floor pays ₹0.10. A sell at the floor cannot go below ₹0.05, so the round trip loses one tick. Tests: PH2 (tick alignment, adverse direction), PH3 (floor round trip never free).

**Remaining limitation.** Valuation marks (mid-to-mid, used for equity and mark-to-market) keep two decimals and are not tick-aligned. This affects equity curves, not executed P&L. The chain's own LTPs remain tick-aligned, so decision prices and fill prices now share a grid for the executable side.

**Sizing rule change.** The exit estimate in `slippageAwareSizing` includes one tick per leg, because an exit fill can now pay a tick of rounding. This changed one exact expectation (test R1: 54 → 54.05 per unit) and one bound (phase9 test 24b, which now states the tick). Both changes are documented in the tests themselves.

## 7. Protected data, legacy records, and blocked phases

**Protected data.** `web/.data/` and `web/.research-data/` (18,018 files): size and mtime comparison with the start-of-pass baseline shows **no differences**.

**Stored legacy records.** The four runs are byte-identical (SHA-256 checked by RG13 and at the end of this phase):
- `bt_482207d9.json`: `d5a8a4fc…db9a6`
- `bt_5ad11e54.json`: `ef00d533…561e`
- `bt_6093f183.json`: `1f6815f1…7ff7`
- `bt_f817dfc2.json`: `08da26bb…ac90`

**Phase 2 (validate the corrected backtest on historical data): BLOCKED.** It needs authorised historical candles. None are available offline, and no new run has been created. The four old runs remain untouched. Creating new runs in a separate data directory requires those candles first. This phase cannot produce the requested comparison (trade counts, entry and exit differences, net P&L after charges, drawdown, win rate, profit factor, expectancy in R, consecutive losses, gap losses, rejected entries) without them.

**Phase 3 (stock recommendation engine): NOT STARTED.** It needs point-in-time constituents, India VIX, NIFTY ATR, events and breadth, plus independent development and validation periods. None of these are available here.

**Phase 4 (options recommendation engine): NOT STARTED.** It needs fresh observed quotes, open interest and volume, and historical options data.

**Phase 5 (recommendation readiness and controlled release): NOT STARTED.** It depends on Phases 2–4 passing, and on your approval of any recommendation-only trial.

## 8. Verification

| Check | Result |
|---|---|
| `npm test` (full suite, Node 22.16.0) | **1,944 pass, 0 fail, 0 skipped** (1,936 before Phase 1, plus 8 PH tests) |
| Phase 1 tests (`phase1Hardening.test.ts`) | 8 pass |
| Execution regression (`nextBarExecutionRegression.test.ts`) | 18 pass |
| Typecheck (`tsc --noEmit`) | exit 0 |
| ESLint | 0 errors, 88 warnings (baseline; none in files touched) |
| Production build (in-tree) | exit 0; 33 tracing warnings, unchanged in count and classes |
| Secret check on build output and repo (counts) | 0 matches for either key |
| Browser, six research routes, 1366/834/390 px, production build | **18/18 pass** (HTTP 200, no horizontal overflow, zero console errors, zero Upstox or NSE requests) |
| Run pages (`bt_482207d9`, `bt_f817dfc2`, `bt_5ad11e54`), three widths | **9/9 pass**; CLOSE_ONLY claim disabled and notice shown |
| Protected data | 0 differences from the baseline |
| Strategy 11.4 | SHA-256 matches; no git diff |
| Option flags | not set to true in any repo env file |
| Processes and LaunchAgent | no runner from this repo running; `com.upstox.paperlive` installed, not loaded |

Caches: the build cache created by the production build was removed. `.next/cache` and `.next/dev/cache` are absent. Parent folders kept.

## 9. Limitations that remain

1. **Gap risk beyond the budget** (§2.3): inherent; reported, not capped.
2. **CLOSE_ONLY overshoot** (§2.5): documented; performance claims disabled.
3. **Charges**: validated only against the project's own cost model, not against broker statements (§3).
4. **Slippage**: a 1% assumption, not validated against market data.
5. **Valuation marks** keep two-decimal precision, so equity curves are not on the tick grid (§6).
6. **Credit structures** are not exercised through a full engine run (§4).
7. **Comparison table** is not seen in a browser (§5).
8. **No historical validation**: no stored result has been re-run under the new rules.
