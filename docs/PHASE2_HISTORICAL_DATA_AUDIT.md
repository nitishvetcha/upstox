# Phase 2: Historical Data Audit

Date: 2026-11-06 (IST), checks run 2026-11-05 evening. Written for: the project owner and reviewers.

**Verdict: PHASE 2 — BLOCKED.** No historical candles were fetched. The existing Upstox authorisation has expired, and the approval says to stop and report in that case, without refreshing it.

Companion documents: [PHASE2_NEXT_BAR_VALIDATION_REPORT.md](PHASE2_NEXT_BAR_VALIDATION_REPORT.md), [PHASE2_LEGACY_VS_NEXT_BAR_COMPARISON.md](PHASE2_LEGACY_VS_NEXT_BAR_COMPARISON.md).

## 1. Authorisation check (metadata only; token value not read or printed)

| Item | Finding |
|---|---|
| Token file | Present in the protected data folder (`web/.data/upstox-token.json`). Not modified. |
| `expiresAt` | 2026-11-03 22:00:00 UTC |
| `invalidatedAt` | none recorded |
| Status at check time (2026-11-05, 13:14 UTC) | **Expired** (about 39 hours before the check) |
| Action taken | None. The token was not refreshed, no OAuth flow was started, no new token was generated, and no Upstox request was made. |

Per the approval: "If the existing Upstox authorisation is missing, invalid or expired, STOP and report the issue. Do not attempt to refresh it." That stop applies here.

## 2. Inspection of the four legacy records

All four runs cover the same window, `2025-10-06` to `2026-10-05`, on 15-minute bars, with a 1,000,000 starting capital and a 1% per-trade risk.

| Run | Index | Model | Data model | Dataset hash | Trades | Spot coverage | India VIX coverage | Constituents | Membership as-of |
|---|---|---|---|---|---|---|---|---|---|
| `bt_482207d9` | Bank Nifty | CLOSE_ONLY | PHASE10 | `ds_8e948446` | 435 | 6,154 / 6,154 bars (100%) | 6,379 bars, 2025-09-22 → 2026-10-05 | 14 | 2026-10-05 |
| `bt_5ad11e54` | Nifty 50 | INTRABAR_MODEL_DERIVED | PHASE10 | `ds_c03e6739` | 816 | 6,154 / 6,154 bars (100%) | as above | 50 | 2026-10-05 |
| `bt_6093f183` | Bank Nifty | INTRABAR_MODEL_DERIVED | PHASE10 | `ds_8e948446` | 521 | 6,154 / 6,154 bars (100%) | as above | 14 | 2026-10-05 |
| `bt_f817dfc2` | Nifty 50 | CLOSE_ONLY | PHASE10 | `ds_c03e6739` | 698 | 6,154 / 6,154 bars (100%) | as above | 50 | 2026-10-05 |

Inputs each legacy run used (from its stored `historicalInputs`, `metadata` and `scorecard`):

- **Index spot, 15-minute.** Measured, from the index candle series.
- **Index technicals.** Computed from completed candles only.
- **India VIX, 15-minute close.** Observed index-level IV, applied flat across strikes. 100% of bars used observed IV (`ivFallbackBars: 0`).
- **Breadth.** Reconstructed from today's constituent list (membership as-of 2026-10-05). **Survivorship bias risk: TRUE.** Constituent history is not point-in-time.
- **Options.** MODEL DERIVED (Black–Scholes at the VIX-based IV). No observed option premiums. Open interest: NOT AVAILABLE. News and event risk: NOT AVAILABLE.
- **Transaction costs.** Config `nse-options-2024-10`, modelled.
- **Strategy version** `strategy-2026.10-p9`, **risk config** `risk-2026.10-p10`, **data version** `data-p10-vix-breadth`.

**Important:** these legacy runs were produced by the engine *before* the corrected next-bar execution, and before the Phase 1 changes (tick-aligned fills, charge margin, performance-claim labels). Re-running the same inputs under today's code gives a different model, not a reproduction of the legacy numbers.

## 3. Minimum historical data required

Derived from the loader code (`backtestInputs.ts`, `historicalContext.ts`, `historicalCandles.ts`) and the legacy coverage records. Windows include the warm-up the loader adds.

| Input | Upstox instrument key | Interval | Window (requested) | Used by |
|---|---|---|---|---|
| Nifty 50 spot | `NSE_INDEX|Nifty 50` | 15m | 2025-09-22 → 2026-10-05 (14-day warm-up) | Nifty runs |
| Bank Nifty spot | `NSE_INDEX|Nifty Bank` | 15m | 2025-09-22 → 2026-10-05 | Bank Nifty runs |
| Nifty 50 daily | `NSE_INDEX|Nifty 50` | 1d | 2025-07-08 → 2026-10-05 (90-day warm-up) | daily ATR and previous-session inputs |
| Bank Nifty daily | `NSE_INDEX|Nifty Bank` | 1d | 2025-07-08 → 2026-10-05 | as above |
| India VIX, 15-minute | `NSE_INDEX|India VIX` | 15m | 2025-09-22 → 2026-10-05 | IV at each decision time (all runs) |
| India VIX, daily | `NSE_INDEX|India VIX` | 1d | about 2024-09-01 → 2026-10-05 (400-day warm-up) | IV percentile (needs ≥ 252 sessions) |
| Nifty 50 constituents | 50 keys, from the instrument registry | 15m | 2025-09-22 → 2026-10-05 | breadth (Nifty runs) |
| Bank Nifty constituents | 14 keys, from the instrument registry | 15m | 2025-09-22 → 2026-10-05 | breadth (Bank Nifty runs) |
| Holiday and special-session calendar | in code (`time.ts`) | — | — | session completeness |

Keys for the constituents must be checked against the instrument registry before any fetch. That check has not been done.

## 4. Local availability (what is already on disk)

`web/.data/history/` holds 3,204 files. Checked against the required inputs:

| Required input | Locally present for the window? |
|---|---|
| Nifty 50 / Bank Nifty spot, 15m | **No.** Index files are daily only, and cover 2000–2019. |
| Nifty 50 / Bank Nifty daily, 2025–26 | **No.** |
| India VIX, 15m or daily | **No.** No VIX file of any kind exists. |
| Constituents, 15m | **No.** |
| Equity 1-minute bars, 2025–26 | Yes, for 1,150 files, mostly equities. Not the required inputs. |

The Stock V2 research folder (`web/.research-data/intraday-bars-historical/`) holds 1-minute equity bars for 60 sessions in 2026-08 to 2026-11. It does not cover the legacy window and does not contain index or VIX data. It is read-only and was not used as a substitute.

**Conclusion: no required input can be reproduced from local data.** Deriving 15-minute bars from the available 1-minute equity series would not supply index or VIX data, and would be a substitute rather than the source. Nothing has been substituted.

## 5. Data-quality validation available in the code

The loader's validator (`mergeAndValidate`, `historicalCandles.ts`) checks:
- merges and sorts chunks, and removes duplicate bars (counted as `duplicateBars`);
- counts out-of-order bars;
- reports session-aware coverage in IST: expected bars, missing sessions, partial sessions, holidays and weekends;
- records failed chunks, which are retried and then reported, never filled.

It does **not** check OHLC consistency, zero-volume bars, or closing-window placeholders. Those checks were written as one-off scripts for the Stock V2 audit (Phase 1 added labelling for the Stock V2 closing bars). They would need to be applied to the new Upstox responses before any run is accepted. This is a gap to close before Phase 2 can pass.

## 6. Isolation design (prepared, not used for a fetch)

- Isolated directory: `/Users/webanatomy/Desktop/upstox-phase2-research-data/`. It is outside the repository and outside `web/.data/` and `web/.research-data/`.
- Intended use: `APP_DATA_DIR` pointing at that directory. The application's `dataRoot()` then writes run files to `<APP_DATA_DIR>/backtests/` only.
- Baseline recorded at the start of Phase 2, in `baseline/`:
  - the protected manifest (18,018 files: size, mtime, path), SHA-256 of the manifest `befd2034…`;
  - SHA-256 of the four legacy run files.
- At the end of this Phase 2 pass, the protected manifest is unchanged (0 differences) and the legacy hashes match 4/4.
- The isolated directory currently contains no runs (`STATUS.md` and the baseline only).

## 7. Fetch plan (not executed)

Estimate, from `planChunks` (15m chunks of 28 days):
- Window of about 378 days → 14 chunks per 15-minute key.
- 15-minute keys: 2 index + 1 VIX + 50 Nifty constituents + 14 Bank Nifty constituents = 67 keys → about **938 requests**, before retries.
- Daily keys: 2 index + 1 VIX (400-day warm-up) → about 3 requests.

Raw responses would be saved under the isolated directory, with fetch timestamps, date coverage and failure counts recorded per request. None of this has run.

## 8. Blockers

1. **Upstox authorisation expired** (2026-11-03 22:00 UTC). Blocks all fetching. Per the approval, the fix is for the owner to re-authorise. This pass did not and will not refresh it.
2. **No required input exists locally** (§4). Even with a valid token, the fetch is the only source.
3. **Constituent instrument keys not verified** against the registry (§3).
4. **OHLC and zero-volume validation not yet wired** into the backtest path (§5).

## 9. What would change the verdict

Phase 2 can move to PARTIAL or PASS only after: a valid authorisation; the fetch of the §3 inputs into the isolated directory; the validator in §5 run on them with results recorded; the next-bar runs executed with `APP_DATA_DIR` set to the isolated directory; and the comparison report completed. The four legacy runs must still match their hashes at the end.
