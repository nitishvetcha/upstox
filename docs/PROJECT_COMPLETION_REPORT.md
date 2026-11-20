# Upstox Analyzer — Project Completion Report

Date: 2026-11-05 (IST). Written for: the project owner and reviewers.

Labels: **DONE** (implemented and verified), **PARTIAL** (implemented, with a limit or open decision), **NOT DONE**, **BLOCKED** (needs data, access or your decision), **NOT STARTED**.

Evidence: [PHASE1_RISK_HARDENING.md](PHASE1_RISK_HARDENING.md) (Phase 1), [NEXT_BAR_EXECUTION_VERIFICATION.md](NEXT_BAR_EXECUTION_VERIFICATION.md) (execution review; partly superseded, see its banner), [OFFLINE_WORKFLOW_AND_DATA_QUALITY_AUDIT.md](OFFLINE_WORKFLOW_AND_DATA_QUALITY_AUDIT.md) (audit).

## 1. Overall status

- **Research use: ready for read-only review** of stored data and the research dashboards. The six research routes load at 1366, 834 and 390 px with no horizontal overflow, no console errors and zero Upstox or NSE requests, on the production build.
- **Phase 1 (offline risk hardening): DONE.** See §3.
- **Phase 2 (validation on historical data): BLOCKED.** It needs authorised historical candles, which are not available offline. The four stored runs are preserved unchanged.
- **Phases 3–5 (stock and options recommendation engines; controlled release): NOT STARTED.** They need new market data, independent validation periods, and your approval.
- **Trading recommendation readiness: NOT READY.** Stock V2 and the options engine are NO-GO. No recommendation is enabled. No order or broker action is enabled.

## 2. Changes in this pass

| Area | Change |
|---|---|
| Executable prices (`backtestExecution.ts`) | `adverseFill()`: fills and exits on the ₹0.05 tick, adverse, never below one tick. A round trip at the floor is never free. |
| Backtest engine (`backtestEngine.ts`) | Adverse tick fills everywhere; exit tick allowance in sizing; at-open sizing on the exact tick round trip; charge-estimate margin 1.1. |
| Labels | Performance claim derived on read: CLOSE_ONLY **DISABLED**, INTRABAR **RESEARCH ONLY**. Comparison rows and table show costs, slippage, net P&L, claim and option-price status. Run page shows the claim and a CLOSE_ONLY notice. |
| Tests | New: `phase1Hardening.test.ts` (8). Three existing expectations updated for the tick rule, each with a stated reason (R1, phase9 24b, RG2 comment). |
| Stored data, strategy, option flags | **No changes.** `web/.data/` and `web/.research-data/` unchanged; the four legacy records are byte-identical. |
| Caches | The production build's cache was removed after checks. Parent folders kept. |

## 3. Phase 1 — offline engineering and risk hardening: DONE

| Item | Status | Result |
|---|---|---|
| CLOSE_ONLY risk-model limitation | DONE (explicitly disabled) | Performance claims disabled on every surface. The model is unchanged, because changing it would alter every CLOSE_ONLY result. |
| Gap-through-stop and gap-through-target audit | DONE | Four cases audited and tested. One residual risk is inherent: a gap after the fill, through the stop, can exceed the budget (worst −4.09R on the spread fixture). Reported, not capped. |
| Charges and slippage validated | DONE for charges (against the project's cost model); slippage remains an assumption | Realized charges exceeded the margined estimate on 6 of 134 trades, by at most 0.6% of recorded risk. Not validated against broker statements. |
| Complete multi-leg execution through the engine | DONE | Spread trades produced and tested end to end (repricing at the fill open, net price, quantity). Credit structures are tested as pure functions only. |
| Synthetic-data and cost labelling in comparison tables | DONE | Costs, slippage, net P&L, performance claim and option-price status added. The table is not yet seen in a browser (it appears only after a POST). |
| Premium rounding and minimum-price audit | DONE, with a fix | Fills were not tick-aligned, and a round trip at the ₹0.05 floor was exactly flat (free). Now tick-aligned and adverse. Valuation marks keep two decimals (equity curves, not executed P&L). |
| Six research routes verified again | DONE | 18/18 routes and 9/9 run-page checks on the production build. |

## 4. Phases 2–5

- **Phase 2: validate the corrected backtest using historical data — BLOCKED.** Needs authorised candles. Once available: new runs in a separate data directory, compared with the four legacy runs on trade count, entry and exit differences, net P&L after charges, drawdown, win rate, profit factor, expectancy in R, consecutive losses, gap losses and rejected entries.
- **Phase 3: stock recommendation engine — NOT STARTED.** Needs point-in-time constituents, India VIX, NIFTY ATR, events, breadth, and independent development and validation periods. Stock V2 remains NO-GO.
- **Phase 4: options recommendation engine — NOT STARTED.** Needs fresh observed quotes, open interest and volume, historical options data, and per-index gates. Options remain NO-GO for recommendations.
- **Phase 5: recommendation readiness and controlled release — NOT STARTED.** Depends on Phases 2–4, and on your approval of a monitored recommendation-only trial. The application must return NO TRADE when a strategy fails its gates.

## 5. Security and credentials

- **Caches: DONE.** The approved cache paths are absent after the final build and checks.
- **Secret recheck (counts only): DONE.** `NEWS_API_KEY` and `UPSTOX_ANALYTICS_TOKEN` have 0 matches in the build output and in the repo (excluding `.env.local`).
- **Credential rotation: NOT DONE.** Awaiting your approval. Recommended: rotate `NEWS_API_KEY` as a precaution.

## 6. Tests and checks

| Check | Result |
|---|---|
| `npm test` (full suite, Node 22.16.0) | **1,944 pass, 0 fail, 0 skipped** |
| Phase 1 hardening | 8 pass |
| Execution (core and regression) | 10 + 18 pass |
| Backtest engine (existing suites) | 209 pass |
| Stock V2 (including placeholder tests) | 57 pass |
| Options engine, route isolation, readiness audit | 30, 4, 21 pass |
| Typecheck (`tsc --noEmit`) | exit 0 |
| ESLint | 0 errors, 88 warnings (baseline; none in files touched) |
| Production build (in-tree) | exit 0; 33 tracing warnings, unchanged in count and classes |
| Browser, six research routes, 1366/834/390 px | **18 / 18 pass** |
| Run pages (three stored runs, three widths) | **9 / 9 pass** |
| Secret check on build output and repo (counts) | 0 matches |

## 7. Safety verification

- **Strategy 11.4.** `web/src/lib/engine/strategy.ts` matches SHA-256 `d0170b40a4b9fb6265697edda03917779b9b8acddcaddc4c43488a4b29eb3f18`. No diff.
- **Protected data.** `web/.data/` and `web/.research-data/` (18,018 files) match the start-of-pass metadata baseline exactly. The four stored legacy records match their recorded SHA-256 hashes.
- **Flags.** `OPTION_QUOTE_LTT_ENABLED` and `OPTION_QUOTE_CANARY_ENABLED` are not set to true in any repo env file.
- **Processes.** No runner, supervisor, canary, scheduler or collector from this repo is running. Servers used for checks were stopped.
- **LaunchAgent.** `com.upstox.paperlive.plist` is installed but **not loaded**.
- **Disclosure.** Earlier in the session, a process listing printed an environment-variable value. It was not used or stored. Consider rotating it if it was visible to anyone else.

## 8. Status by requirement

| Requirement | Status |
|---|---|
| Responsive fixes, six research routes | DONE |
| Approved caches deleted | DONE |
| Secret recheck | DONE (0 matches) |
| Credential rotation | NOT DONE (needs approval) |
| Run Backtest, offline | BLOCKED (needs Upstox or candles) |
| Compare Execution Models, offline | BLOCKED (same) |
| Stored-run recomputation and display | DONE |
| Next-bar execution (code) | DONE (four defects fixed; tick-aligned fills added in Phase 1) |
| Next-bar execution (real data) | PARTIAL (stored runs not re-run) |
| Stored runs labelled, not rewritten | DONE (hash-checked) |
| Phase 1 offline risk hardening | DONE |
| Phase 2 validation on historical data | BLOCKED |
| Phases 3–5 | NOT STARTED |
| Stock V2 data-quality audit | DONE (placeholders labelled; exclusion is a decision) |
| Options data-quality audit | DONE (not recommendation-grade) |
| `npm test` script | DONE |
| Full test suite | DONE (1,944 / 1,944) |
| Typecheck, lint | DONE |
| Production build | DONE (in-tree, exit 0; warnings classified, not changed) |
| Browser verification | DONE (18 / 18 routes; 9 / 9 run pages) |
| Safety verification | DONE |
| Stock V2 recommendation readiness | NO-GO |
| Options recommendation readiness | NO-GO |
| Live recommendations | BLOCKED (needs approval) |
| Live dashboard regression checks | BLOCKED (they call Upstox on render) |

## 9. Decisions needed

1. Rotate `NEWS_API_KEY` (recommended). `UPSTOX_ANALYTICS_TOKEN` is your call.
2. Approve a live Upstox historical fetch for Phase 2, or supply an offline candle set for a stated window. Writes go to a separate data directory.
3. CLOSE_ONLY: keep as a process-review model (current), or change it to fill stops at the level (alters every CLOSE_ONLY result).
4. Stop and target rule: keep absolute strategy levels (current, conservative), or evaluate re-planning at fill as a strategy change.
5. Keep the four legacy results as reference, or delete them. Do not overwrite them.
6. Provide broker statements or a validated slippage source before any performance claim.
7. Stock V2 closing placeholders: keep labelled, or exclude (needs a new pre-registration).
8. Options data: accept NO-GO, or collect fresher samples with open interest and volume.
9. Approve the data sources for Phases 3–5 (point-in-time constituents, India VIX, NIFTY ATR, events, breadth, historical options).

## 10. How to run

```
cd "/Users/webanatomy/Desktop/upstox_analyzer (2)/web"
export PATH=/usr/local/bin:$PATH          # Node 22.16.0 (matches .nvmrc)
npm test                                   # full offline suite (1,944 tests)
npx tsc --noEmit
npx eslint .
NEXT_DIST_DIR=.next-prod-verify npx next build   # in-tree build; then remove .next-prod-verify/cache
```

Research pages (no broker calls): `/stock-v2`, `/options-engine`, `/performance`, `/strategy-performance`, `/strategy-evidence`, `/options-research`. Live pages that call Upstox when opened: `/`, `/opportunities`, `/market-history`, `/option-history`, `/options-audit`, `/opportunity-journal`, `/recommendation-debug`.

## 11. Final assessment

Four levels, kept separate:

1. **Code correctness:** ready for review. The engine follows its stated execution and pricing rules in every tested case, including gaps, multi-leg spreads and the price floor. Known limits are listed in the Phase 1 document.
2. **Synthetic-fixture correctness:** passing (1,944 tests). The fixtures are deterministic and synthetic. They show the rules are enforced, not what the strategy earns.
3. **Historical-data validation:** not done (Phase 2 is blocked on candles). The stored backtests are not evidence of performance.
4. **Trading recommendation readiness:** NOT READY. Stock V2 and the options engine are NO-GO. No recommendation or order is enabled.

**Next priority:** Phase 2, once authorised candles are available (decision 2). No strategy tuning, and no performance claim, before that comparison.
