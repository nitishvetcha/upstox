# Next-Bar Execution: Verification Report

Date: 2026-11-05 (IST). Written for: the project owner and reviewers.

Scope: the `exec-next-bar-open-v1` execution path in the backtest engine, reviewed end to end, with the gaps it had closed, the tests added, and the limits that remain.

Companion documents: [PROJECT_COMPLETION_REPORT.md](PROJECT_COMPLETION_REPORT.md) and [OFFLINE_WORKFLOW_AND_DATA_QUALITY_AUDIT.md](OFFLINE_WORKFLOW_AND_DATA_QUALITY_AUDIT.md).

> **Update (Phase 1, 2026-11-05):** This report describes the execution review at the time it was written. Later changes supersede parts of it: fills are now tick-aligned and adverse (§3, §5); the fill-time charge estimate carries a 1.1 margin (§3); CLOSE_ONLY performance claims are disabled, and INTRABAR is research only; the suite is at 1,944 tests. The current risk figures, the charge validation and the gap audit are in [PHASE1_RISK_HARDENING.md](PHASE1_RISK_HARDENING.md). The risk table in §5 and the test count in §4.3 below are historical.


## 0. Summary

- **Code correctness: substantially improved, verified on fixtures.** The review found four defects in the previous implementation, and all four are fixed (§2). The engine now follows the stated execution rules for every case tested, which includes gaps, missing bars, expiry and session boundaries, and multi-leg repricing.
- **Known model limits remain.** Two of them are material for risk: CLOSE_ONLY stop exits can overshoot the risk budget by several R, and gap risk beyond the stop cannot be capped by any budget (§5).
- **Historical-data validation: not done.** The four stored backtests were produced with same-candle execution and have not been re-run, because the candles needed are not available offline. No profitability claim is made.
- **Trading recommendation readiness: NOT READY.** Stock V2 and the options engine remain NO-GO (§8).

## 1. Files changed

| File | Change |
|---|---|
| `web/src/lib/backtestEngine.ts` | Fill-time repricing extracted into `repriceAtFill()`. Stop and target kept at the strategy's own levels. Gap exits booked at the open. Missing-bar check. Charges in the fill budget. At-open sizing on round-trip slippage. `exitAtFill` marker. |
| `web/src/lib/backtestTypes.ts` | `exitAtFill?` on trades. `signalBarTimestamp`, `entryBarTimestamp`, `entryTiming` (earlier pass). |
| `web/src/lib/backtestTiming.ts` | Timing constants and `executionTimingOf()` (earlier pass; no imports). |
| `web/src/app/(research)/performance/page.tsx` | "Entry timing" row and legacy notice (earlier pass). |
| `web/src/lib/services/nextBarExecution.test.ts` | NB6 re-scoped (§4). Otherwise unchanged. |
| `web/src/lib/services/nextBarExecutionRegression.test.ts` | New: 18 regression tests (§3). |
| `web/src/lib/services/performance.test.ts` | Test 36: the both-exit-types requirement moved to a larger run; the premium-sign rule still runs on both runs (§4). |
| `web/src/lib/stockV2/dataset.ts`, `indicators.ts`, `closingPlaceholders.test.ts` | Closing-placeholder labelling (earlier pass). No computation change. |
| `web/package.json` | `npm test` flag (earlier pass). |
| `docs/*.md` | This report; the two updated reports. |

No file under `web/.data/` or `web/.research-data/` was written. The four stored legacy records are byte-identical (§7).

## 2. Defects found in the previous implementation and fixed

| # | Defect | Effect | Fix |
|---|---|---|---|
| D1 | Stop and target were shifted by the fill's premium change. | An adverse opening gap was absorbed by moving the stop, so it was never booked. This assumed favourable execution. | Stop and target stay at the strategy's own levels. A level already passed at the open is booked as an exit at the open (`GAP_EXIT`, or `TARGET`). |
| D2 | A signal whose next bar was missing filled from a later bar. | An invented fill, priced at a later open, in breach of the one-bar rule. | The next bar must start exactly one timeframe after the signal bar. Otherwise the entry is cancelled and counted (`PENDING_NEXT_BAR_MISSING`). |
| D3 | The fill budget excluded charges. | Realized loss could exceed the budget, since brokerage and statutory fees are a fixed cost per lot. (R6 caught this: a stop exit at −1.06R.) | Estimated round-trip charges are inside the budget, and recorded in `riskAmount`. |
| D4 | A position closed at its fill open was sized on the old stop distance. | Its whole loss is the round-trip slippage at the fill price, which was not budgeted (worst −2.56R). | Such positions are sized on 2 × slippage × fill premium plus charges. Worst is now −1.00R (TARGET) and −1.03R (GAP, the charge-estimate error). |

Each defect was found by reading the code or by a measurement, and each fix is covered by a test in §3.

## 3. Exact execution methodology (current rule)

**Decision (bar N).** Signal, risk and sizing use only the candles up to and including bar N. The decision time is bar N's close. The decision IV is the point-in-time IV at N.

**Pending entry.** The plan (strikes, expiry, leg mids, stop, targets, decision IV, decision capital, decision lots) is stored. It is not booked.

**Fill (bar N+1), checks in this order:**
1. Same IST session as the signal bar. Otherwise `PENDING_SESSION_ENDED`.
2. Next bar starts exactly one timeframe after the signal bar. Otherwise `PENDING_NEXT_BAR_MISSING`.
3. Fill instant before the expiry cutoff (09:45 UTC on expiry day, 15:15 IST). Otherwise `EXPIRY_CUTOFF`.
4. Open positions below the concurrency limit. Positions that exit at bar N+1's close still count, which is conservative. Otherwise `MAX_CONCURRENT_POSITIONS`.

**Repricing.** Each leg is priced at bar N+1's open (the underlying open) with the decision IV, using the same option model as the chain.

**Level check.** For debit, the position value is the net mid. For credit, it is the negative of the net mid (the cost to close). The stop is checked first. If the stop is already passed, or the target is passed, the position is closed at the open (`GAP_EXIT` or `TARGET`, `exitAtFill = true`), and it is never held.

**Sizing at fill.**
- Positions that stay open: slippage-aware sizing on the planned distance |value − stop| at the fill, capped at the decision lots, and reduced until risk + estimated charges fit the decision-time budget. A fill whose budget cannot fund one lot is rejected and counted.
- Positions closed at the open: sized on round-trip slippage at the fill price (2 × slip × Σ|mid|) plus estimated charges, within the same budget.

**Charges.** Estimated with the same cost model as the close, at the fill mids with the same slippage. The estimate is the basis of the budget. The realized charges are computed at close.

**Exits after fill.** Unchanged from the previous implementation: CLOSE_ONLY checks at the close, INTRABAR_MODEL_DERIVED walks the assumed OHLC path (stop wins when both are touched).

**Recorded fields.** `signalBarTimestamp`, `entryBarTimestamp`, `entryTimestamp` (bar open), `signalTimestamp` (bar close), `stopLoss`, `target1`, `target2` (strategy levels, not re-based), `riskAmount` (includes estimated charges), `exitAtFill`, `exitGap`.

**Stop and target methodology: current rule and its alternatives.**

- *Current rule (absolute levels).* The strategy's own premium levels are kept. The planned distance from the fill is therefore whatever the fill makes it, and sizing adapts to that distance. This is internally consistent across structures, because the stop and target are in position-value units for every structure: debit (net value) and credit (cost to close). It treats a gap as real. Its consequence is that an opening gap can pass a level before the position is held, and that a target passed at the open produces a round trip at a loss.
- *Previous rule (shift by the fill's premium change).* Keeps the planned distance. It hides adverse gaps by construction, so it is not conservative. It was replaced (D1).
- *Re-planning at the fill* (recomputing stop and target with the strategy's rule at the open). The strategy's stop and target are premium levels derived from the decision-time move, and that move is not available at the fill without spot-based rules. Re-planning would be a strategy change, not an execution fix, and it has not been done.

Implication of the current rule, measured: on the 1% alternating-gap fixture, about half of all trades close at the open. Gap-through-target fills are common, and all of them lose. The shift-to-absolute change also moved a small-sample result (the 100,000 run lost its only TARGET exit: 12 trades, 1 target, to 13 trades, 0 targets, after a 0.3-point target shift). That sensitivity is real and should not be read as an edge.

## 4. Tests

### 4.1 Tests added (`nextBarExecutionRegression.test.ts`, 18 tests)

| Test | Case |
|---|---|
| RG1 | Gap-up and gap-down entries priced at the actual fill-bar open (both directions must occur). |
| RG2 | Adverse opening gap through the stop: booked at the open, never a profit, losses required in the set. |
| RG3 | Opening gap already beyond the target: booked at the open as a round trip, which loses. |
| RG4 | Multi-leg debit spread (bull call spread): each leg repriced at the open; net and value follow the leg signs. |
| RG5 | Multi-leg credit structure (iron condor): net = buys − sells; value = −net. |
| RG6 | Level passed at the open is detected for debit and credit. |
| RG7 | For a valid plan (stop below target), stop and target are never both passed at the open. |
| RG8 | Minimum one-lot budget: sizing returns 0 lots and the engine books no trade; the rejection is counted. |
| RG9 | Missing next candle: no fill from a later bar, and the case is counted. |
| RG10 | No fill at or after the expiry cutoff, on four fixtures. |
| RG11 | Open positions never exceed the concurrency limit at any fill. |
| RG12 | Deterministic: identical trades, equity curves and run IDs on gapped and missing-bar fixtures. |
| RG13 (×4) | Each stored legacy record: SHA-256 unchanged, labelled `LEGACY_SAME_CANDLE`, no new marker. Skipped if a file is absent. |
| RG14 | A new run ID is never a stored ID. |
| RG15 | A position closed at its fill open loses no more than its recorded budget (tolerance 5%). |

### 4.2 Existing tests changed, and why

- **NB6** (`nextBarExecution.test.ts`): previously asserted the open-position side rule on every trade. Trades closed at the open are now checked against the level they passed (GAP_EXIT beyond the stop; TARGET beyond the target). Open positions keep the original assertion. Legacy same-bar exits, which are stamped at the bar open, make no open-level claim.
- **Test 36** (`performance.test.ts`): the premium-sign rule (TARGET trades profit, STOP_LOSS trades lose) runs on both the 100,000 and the 1,000,000 run. The "both exit types present" requirement moved to the 1,000,000 run, because the 100,000 run has no TARGET exit under the absolute-level rule (§3). The assertion was not weakened: the same two conditions are still required, on a run with enough trades for them to be meaningful.

No other existing assertion was changed.

### 4.3 Results

| Suite | Result |
|---|---|
| `npm test` (full, Node 22.16.0) | **1,936 pass, 0 fail, 0 skipped** |
| `nextBarExecution.test.ts` | 10 pass |
| `nextBarExecutionRegression.test.ts` | 18 pass |
| `backtest`, `phase10`, `phase9`, `performance`, `dashboard`, `phase2316Hardening` | 5 + 69 + 43 + 45 + 25 + 22 pass |
| `npx tsc --noEmit` | exit 0 |
| `npx eslint .` | 0 errors, 88 warnings (unchanged; none in files touched here) |

## 5. Risk budget: measured behaviour

Worst realized R per exit type. A stop or gap loss is measured against the recorded `riskAmount`, which includes estimated charges. The fixtures are synthetic.

| Fixture | Model | Exit type | Trades | Worst R | Trades beyond −1.02R |
|---|---|---|---|---|---|
| Plain | CLOSE_ONLY | STOP_LOSS (at close) | 69 | **−3.80** | **54** |
| Plain | INTRABAR | STOP_LOSS (on path) | 36 | −0.99 | 0 |
| Plain | INTRABAR | GAP_EXIT (after fill) | 42 | **−5.87** | **29** |
| 1% gaps | both | TARGET at fill | 243 | −1.00 | 0 |
| 1% gaps | both | GAP_EXIT at fill | 242 | −1.03 | 2 |
| 3% gaps | both | TARGET at fill | 145 | −1.00 | 0 |
| 3% gaps | both | GAP_EXIT at fill | 135 | −1.03 | 3 |

What this means:
- **Budget is held for every exit the engine books at a known level** (on path, or at the fill open). The residual −1.03R is the charge-estimate error.
- **Budget is not held for CLOSE_ONLY stop exits.** CLOSE_ONLY checks stops only at the bar close. A premium that falls through the stop within the bar is exited at a later, much worse close. This is pre-existing model behaviour. It was not changed, because doing so would change every CLOSE_ONLY result, including the two stored CLOSE_ONLY runs. It is a limitation, and it is a reason to prefer INTRABAR for any risk claim.
- **Budget cannot be held for gaps after fill.** An opening gap through the stop is a loss the budget cannot cap. It is recorded at the open, at its real size.

## 6. UI checks

Production build served with `next start` (port 3124). Browser checks at 1366, 834 and 390 px.

| Route | Result |
|---|---|
| `/performance` | pass ×3 |
| `/strategy-performance` | pass ×3 |
| `/strategy-evidence` | pass ×3 |
| `/stock-v2` (14 charts) | pass ×3 |
| `/options-engine` | pass ×3 |
| `/options-research` | pass ×3 |

All 18 checks: HTTP 200, no horizontal overflow, zero console errors, zero Upstox or NSE requests.

Run pages: `/performance?run=bt_482207d9` and `/performance?run=bt_f817dfc2` pass the same checks at three widths. All four stored runs show the `LEGACY_SAME_CANDLE` label and the legacy notice.

New-timing label: a new run was generated offline from the fixture and stored in an isolated data root (not `web/.data/`). A second production instance pointed at that root shows `Next bar open (signal at bar close)`, and no legacy notice. This confirms the display path for new runs. The real stored data has no new-timing run yet.

Live routes were not loaded, and no control that triggers a broker request was used.

## 7. Build, security and protected data

**Build.** `NEXT_DIST_DIR=.next-prod-verify npx next build` (in-tree). Exit 0, compiled successfully.

**Remaining warnings: 33, classified.** None comes from the backtest engine, the timing module or the Stock V2 loader.

| Class | Count | Source files (warning count) |
|---|---|---|
| Dynamic filesystem access causes tracing of the whole project | 27 | `paperOpportunityStore.ts` 8; `liveOpportunityCollector.ts` 4; `opportunityTrackingStore.ts` 4; `paperTradeMonitorRunner.ts` 4; `sessionEvidenceStore.ts` 4; `optionsAuditReport.ts` 2; `recommendationStore.ts` 1 |
| File pattern matches a large directory | 6 | `/ROOT/.data` (14,910 files); `.research-data/intraday-bars-historical` (12,012); `.data/collection-logs` (×2, 22,211 and 10,664); `.data/monitor-logs` (×2, 23,363 and 11,240) |

Not changed. The sources compute data paths at run time, so the tracer must assume any file under them may be read. Removing the warnings would mean changing how the stores locate their data, which risks the records themselves. The recommended fix (one explicitly configured data root, plus `outputFileTracingExcludes` if a standalone build is ever needed) is a separate, reviewed change.

**Secrets (counts only).** `NEWS_API_KEY` and `UPSTOX_ANALYTICS_TOKEN`: 0 matches in `.next/`, `.next-prod-verify/` and the repo (excluding `.env.local`). Credentials were not rotated.

**Caches.** The production build recreated `.next-prod-verify/cache`. It was checked (Turbopack files only) and removed. `.next/cache` and `.next/dev/cache` are absent. Parent folders were kept.

**Protected data.**
- `web/.data/` and `web/.research-data/`: 18,018 files. Size and modification-time comparison with the start-of-pass baseline: **0 differences**.
- Stored legacy records (SHA-256, recorded before this change):
  - `bt_482207d9.json`: `d5a8a4fc…db9a6` (unchanged)
  - `bt_5ad11e54.json`: `ef00d533…561e` (unchanged)
  - `bt_6093f183.json`: `1f6815f1…7ff7` (unchanged)
  - `bt_f817dfc2.json`: `08da26bb…ac90` (unchanged)
- Strategy 11.4 (`web/src/lib/engine/strategy.ts`): SHA-256 `d0170b40a4b9fb6265697edda03917779b9b8acddcaddc4c43488a4b29eb3f18`, matches; no git diff.
- Option flags: `OPTION_QUOTE_LTT_ENABLED` and `OPTION_QUOTE_CANARY_ENABLED` are not set to true in any repo env file.
- Processes: no paper runner, supervisor, canary, scheduler or collector from this repo is running. The `com.upstox.paperlive` LaunchAgent is installed but **not loaded**.

**Git status** (this pass; the earlier passes' changes are also uncommitted):
- Modified: `web/package.json`, `web/src/lib/backtestEngine.ts`, `web/src/lib/backtestTypes.ts`, `web/src/lib/services/performance.test.ts`.
- New, untracked: `web/src/lib/backtestTiming.ts`, `web/src/lib/services/nextBarExecution.test.ts`, `web/src/lib/services/nextBarExecutionRegression.test.ts`, `web/src/app/(research)/performance/page.tsx`, `web/src/lib/stockV2/`, `docs/`.
- No commit has been made. The repository's HEAD is `80f3eee`.

## 8. Readiness decision

The four levels are kept separate.

1. **Code correctness: READY FOR REVIEW.** The engine follows the stated execution rules in every tested case. Four defects were found and fixed (§2). Known model limits are listed in §9.
2. **Synthetic-fixture correctness: PASSING.** 1,936 tests pass, including the gap, missing-bar, expiry, concurrency and multi-leg cases. The fixtures are deterministic and synthetic. They show the rules are enforced. They say nothing about profitability.
3. **Historical-data validation: NOT DONE.** The four stored runs were produced with same-candle execution and have not been re-run, because the candles are not available offline. Their figures are not evidence of real execution performance. No result in this pass supports a profitability claim.
4. **Trading recommendation readiness: NOT READY.** Stock V2 is NO-GO. The options engine is NO-GO for recommendations. The execution model has the CLOSE_ONLY and gap-risk limits above. No live recommendation, order or broker action is enabled or proposed.

## 9. Known limitations

1. **CLOSE_ONLY stop overshoot.** CLOSE_ONLY checks stops only at the bar close, so exits can be several R beyond the budget (§5). This affects the two stored CLOSE_ONLY runs.
2. **Gap risk after fill.** An opening gap through a stop after the fill cannot be capped by a budget (−5.87R worst on the plain fixture).
3. **Price floor.** Option premiums are floored at ₹0.05, and prices are rounded to two decimals. A position at the floor has no room for slippage, so its round trip is exactly flat. Losses at the floor are understated.
4. **Charges estimate.** The fill-time estimate differs from the realized charges by about 3% on the measured trades.
5. **PHASE9 legacy model timing.** Decision and same-bar exit timestamps are stamped at the bar open while priced at the close. This is pre-existing. The next-bar fill is correct in this model, but the same-bar exits are not. The model is not used for research claims.
6. **Multi-leg trades in the engine.** The fixtures never produce spreads or condors. Multi-leg repricing is tested as a pure function (RG4–RG5), not through a full engine run.
7. **Fixture sensitivity.** Alternating-gap fixtures are adversarial. About half of all trades close at the open, and most of those are gap-through-target losses. They test the rules, not the market.
8. **Synthetic option prices.** Black–Scholes at a benchmark or VIX-based IV, with no observed option data. Labelled as such in the stored results.
9. **Comparison-table labelling.** The comparison view still does not show the cost breakdown or the synthetic label next to the figures (found by code review, not in a browser).
10. **Time-to-expiry sensitivity.** Near expiry, a 1% gap can move a near-the-money premium by a large multiple. Stops and targets set at decision time are fragile to that. This is a property of the strategy's geometry, not a defect in the fill.
11. **Stored results not re-run.** No result has been produced under the new rule on real candles.

## 10. Decisions still open

1. Approve a live Upstox historical fetch, or supply an offline candle set, to re-run the four stored backtests under the new rule.
2. Keep the CLOSE_ONLY model as it is (documented as optimistic on stops), or change it to fill stops at the level. The second changes every CLOSE_ONLY result.
3. Keep the absolute-level stop and target rule, or evaluate re-planning at fill as a strategy change, with its own tests and evidence.
4. Rotate `NEWS_API_KEY` as a precaution (recommended; awaiting approval).
5. Decide whether the 33 tracing warnings are addressed by a separate, reviewed data-root change.
