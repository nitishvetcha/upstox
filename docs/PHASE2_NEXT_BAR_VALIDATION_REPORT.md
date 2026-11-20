# Phase 2: Next-Bar Validation Report

Date: 2026-11-06 (IST), checks run 2026-11-05 evening. Written for: the project owner and reviewers.

**Verdict: PHASE 2 — BLOCKED.** No corrected next-bar backtest was run on historical data. No new run exists. The four legacy runs are unchanged.

Companion documents: [PHASE2_HISTORICAL_DATA_AUDIT.md](PHASE2_HISTORICAL_DATA_AUDIT.md) (why it is blocked), [PHASE2_LEGACY_VS_NEXT_BAR_COMPARISON.md](PHASE2_LEGACY_VS_NEXT_BAR_COMPARISON.md) (the legacy baseline, and the fields left empty).

## 1. What was asked, and what happened

| Step | Status |
|---|---|
| Check the existing Upstox authorisation | Done. **Expired** (2026-11-03 22:00 UTC). |
| Stop and report, without refreshing | Done. No refresh, no OAuth, no token generation, no Upstox request. |
| Inspect the legacy records and required inputs | Done (see the audit). |
| Fetch the required historical candles | **Not done.** Blocked by the expired authorisation. |
| Run the corrected next-bar scenarios | **Not done.** No input data. |
| Compare with the four legacy runs | **Not done** on the new side. The legacy side is complete (see the comparison document). |
| Isolated research directory | Created, empty of runs, baseline recorded. |
| Offline tests and typecheck | Done (§4). |

## 2. Run identifiers and outputs

- New run IDs: **none.**
- Isolated output location: `/Users/webanatomy/Desktop/upstox-phase2-research-data/` (contains `STATUS.md` and `baseline/` only; no `backtests/` directory).
- No data was written under `web/.data/` or `web/.research-data/`.

## 3. Coverage and data quality

- Historical candles fetched: **0.**
- Missing candles substituted: **0.** No synthetic or cached data was used as a substitute.
- Data-quality exclusions: not applicable (no data loaded).
- Missing historical candles: **all required inputs** (§4 of the audit lists them).

## 4. Offline verification (this pass)

| Check | Result |
|---|---|
| `npm test` (full suite, Node 22.16.0) | **1,944 pass, 0 fail, 0 skipped** |
| `npx tsc --noEmit` | exit 0 |

These confirm the code and the rules. They are not historical validation, and the brief says so: a passing suite alone does not constitute historical validation.

## 5. Protected data and legacy records

| Check | Result |
|---|---|
| Protected files (`web/.data/`, `web/.research-data/`) | 18,018 files, unchanged against the Phase 2 start baseline (0 differences in size, mtime or path) |
| Legacy run hashes (4 files) | match the baseline, 4 of 4 |
| Strategy 11.4 (`web/src/lib/engine/strategy.ts`) | SHA-256 `d0170b40…9eb3f18`, matches; no git diff |
| `OPTION_QUOTE_LTT_ENABLED` and `OPTION_QUOTE_CANARY_ENABLED` | not set to true in any repo env file |
| Processes | no runner, supervisor, canary, scheduler or collector from this repo is running |
| Listeners on ports 3123–3125 | none (no servers left running) |
| LaunchAgent `com.upstox.paperlive` | installed, not loaded |
| Order placement or automated execution | no path enabled; none was exercised |
| Secrets printed | none. The token file was read for its expiry field only. The secret checks report counts. |

## 6. Limitations of this report

- Nothing here measures the corrected strategy's performance. Validation requires the historical runs, which have not happened.
- The validator gap in the audit (§5) stands: OHLC and zero-volume checks are not wired into the backtest path.
- The legacy runs themselves carry known model limits (CLOSE_ONLY stop overshoot, gap risk, model-derived option prices, survivorship-biased breadth). They are not a benchmark that proves anything either.

## 7. Steps to unblock

1. The owner re-authorises Upstox. The fix is on the owner's side, and this pass will not attempt it.
2. Verify the 50 + 14 constituent instrument keys against the registry.
3. Fetch the inputs in the audit's §3 into the isolated directory, saving raw responses, fetch timestamps and per-request failures.
4. Wire the OHLC, duplicate and zero-volume checks into the validation step, and record their results.
5. Run the corrected next-bar scenarios with `APP_DATA_DIR` set to the isolated directory. Four runs, matching the legacy scenarios.
6. Complete the comparison (the new-side fields in the comparison document).
7. Re-verify the protected data and the legacy hashes at the end.

## 8. Decisions for the project owner

1. Re-authorise Upstox (or decline Phase 2).
2. Confirm the scope: the four legacy scenarios only, or a wider window.
3. Decide whether the legacy runs stay as reference only, or are deleted (the approval says do not overwrite them).

Phases 3–5 were not started, as the brief requires.
