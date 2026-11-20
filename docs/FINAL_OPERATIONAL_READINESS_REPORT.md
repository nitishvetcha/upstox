# Final Operational Readiness Report

**INTERIM — PRE-3:15 PM — 2026-11-05** (Asia/Kolkata). Not production-ready. Recommendation-only; no live broker execution.

## 1. Scheduler repair (12:49 IST)

- Old scheduler PID 22226 (inline `bash -c` loop, token gate written without quotes → `SyntaxError`, every slot skipped) was stopped cleanly with SIGTERM. Its `sleep` child was not left behind.
- Replaced by `scripts/research-slot-runner.sh` (PID 32067, log `logs/research-slot-runner.log`). Remaining slots only: **13:15, 13:55, 14:35, 15:15 IST**. Past slots are skipped, not run late. The round command is unchanged and the duplicate-slot guard in `options-audit-research.ts` is kept.
- Token gate moved to `scripts/check-research-token.ts`. Verified locally: `TOKEN_AVAILABLE`, exit 0. It reads local state only, prints no token, does not refresh OAuth or generate a token. On gate failure the runner stops with `AUTH_STOP` and does not continue.
- The old inline loop also ended with a `report` step. The new runner omits it on purpose; the final report is generated manually after 15:15 (§8).
- Slot outcomes: **pending** at time of writing. Check `logs/research-slot-runner.log` and `rounds-research.jsonl` after each slot.

Earlier failure (11:55 and 12:35): no records written, because of the gate `SyntaxError`.

## 2. Files inspected

- `scripts/paper-live.mjs`, `scripts/options-audit-research.ts`, `scripts/upstox-cli.mjs`
- `src/app/api/paper-opportunities/collect/route.ts`, `src/lib/ops/opsStatus.ts`, `src/lib/services/liveOpportunityCollector.ts`
- `src/lib/services/upstoxMarket.ts`, `market.ts`, `time.ts`, `optionPriceVerification.ts`, `contractFreshnessReconciliation.test.ts`
- `src/lib/research/optionsAuditResearch.ts` and its two test files
- `.data/options-audit-research/rounds-research.jsonl`, `report-research_2026-11-05_*.json`, `.data/collection-logs/`, `.data/runner-health.jsonl`

## 3. Files created or modified

| File | Change |
|---|---|
| `src/lib/services/chainFreshness.ts` (new) | Separates chain snapshot (always `CHAIN_SNAPSHOT_UNVERIFIED`) from per-contract quote freshness (`FRESH` / `STALE` / `MIXED` / `UNKNOWN`). Fail-closed on missing, future-dated and end-of-day times. |
| `src/lib/services/chainFreshness.test.ts` (new) | 12 tests: receipt time cannot verify, fresh/stale/mixed, future and missing times, empty chain, dashboard wording. |
| `src/lib/types.ts` | `Snapshot.chainFreshness` (optional). `sources.optionChain` unchanged. |
| `src/lib/services/market.ts` | Computes `chainFreshness` at snapshot time (not cached with the 15 s chain). |
| `src/lib/services/upstoxMarket.ts` | LIVE branch `lastTradeTime` now newest (`.sort().at(-1)`), matching `normalizeChain`. Metadata only; no downstream reader. |
| `src/components/DataTimestamps.tsx` | Shows "snapshot unverified · N/M contract quotes fresh (state)" beside the option-chain source. |
| `scripts/lib/intraday-core.mjs` (new) | Pure collector logic: normalisation, session validation (375-bar window, zero-volume kept, duplicates, gaps, out-of-window), auth fail-fast, atomic writes, existing-record protection, dry-run. |
| `scripts/collect-intraday-bars.mjs` | Rewritten as a thin wrapper over the core. Still uses only `/api/research/stock-candles`. Dry-run is the default. |
| `src/lib/research/stockCandleRequest.ts` (new) | Shared key/date validators and 28-day chunk planner, used by both research routes. |
| `src/app/api/research/stock-candles/route.ts`, `stock-candles-range/route.ts` | Import the shared validators (no behaviour change). |
| `src/lib/collect-intraday-bars.test.ts` | Rewritten: 31 tests against the real core module (previously copies of the logic). |
| `src/lib/ops/opsStatus.ts`, `src/lib/ops/ops.test.ts` | Last-collection timestamp considers LIVE runs only; regression test added. |
| `docs/FINAL_OPERATIONAL_READINESS_REPORT.md` | This file. |

Not changed: `strategy.ts` (Strategy 11.4), stock and options engines, scoring, thresholds, eligibility gates, option flags, `.data/`, research records, LaunchAgents, `.env` files, Git history.

## 4. Status by task

### Task 1 — Stock market-data collector (offline)
- Implemented as an independent, research-only collector. It calls only `/api/research/stock-candles`; a static test asserts no reference to paper-trading, order or `.data/` paths.
- Dry-run is the default and makes zero requests (tested with a fetch that throws). Existing records are never overwritten or re-fetched (tested). Auth failure (401/403) aborts the run with no retry and no writes (tested).
- Incomplete sessions cannot be collected before the regular close (15:30 IST).
- **Not run live.** Live testing needs your explicit authorization.
- Limitation: the 60-session historical dataset does not exist on disk. The backfill script is implemented but not run.
- Limitation: `src/lib/backfill-intraday-bars.test.ts` still tests inline copies of its logic, not the script. Recorded as known gap.

### Task 2 — Option-chain freshness
- The chain `source` label (which gates options eligibility in `opportunityEngine.ts`) is **unchanged**. The new fields are additive.
- Confirmed: the raw `/v2/option/chain` response has no chain-level `last_trade_time`, so the chain-level label falls back to STALE during OPEN. Measured offline: median sample age 2–8 s; the STALE share comes from illiquid contracts with old last trades.
- Dashboard now shows the truthful state beside the source badge. The source badge itself still reads STALE for that fallback case; relabelling needs your decision because it changes the shared enum.
- LTT semantics: `normalizeChain` uses newest (`Math.max`); the LIVE branch used oldest. Changed to newest. No downstream consumer reads it, so there is no behaviour change.
- Not verified end-to-end against a live dashboard (no live requests permitted). Unit-level only.

### Task 3 — Research report review (no collection run, no report regenerated)
Checked against the brief:
- Two-second chain-to-quote bound: enforced (`hasValidResearchTiming`, `upperBoundMs > 2000`, consistency ±100 ms).
- Closed-market, duplicate-slot (first qualifying round kept), error and missing-timing exclusions: enforced.
- IV and price-agreement metrics: computed only from comparable samples.
- TARGET_WINDOW and FALLBACK horizons reported separately; legacy versions filtered out (`version === RESEARCH_AUDIT_VERSION`).
- Five-session acceptance requirement unchanged.

Findings, not changed (they would alter reported numbers while collection is still open):
1. `comparableShare`, `indeterminateShare` and `staleShare` are computed independently. A sample with an out-of-bounds age and INDETERMINATE drift is counted in both indeterminate and stale, so the three shares can sum above 100%. Recommended fix: define stale as "not comparable and not indeterminate". Eligibility is unaffected because it uses comparable only.
2. Percentiles use nearest-rank without interpolation; with fewer than 20 samples the P95 is effectively the maximum. Conservative, but should be stated in the report.

Offline tests: `optionsAuditResearch.test.ts` and `optionsAuditResearchPhase8.test.ts` — 32/32 pass.

### Task 4 — Final verification (after 15:15 IST, see §6)

### Task 5 — This document.

## 5. Test and check results

- Changed suites: `chainFreshness` 12/12, `collect-intraday-bars` 31/31, `ops` 13/13, research 32/32.
- Full offline suite (`node --test --experimental-strip-types "src/**/*.test.ts"`): 1817 pass, 0 fail, 0 skipped, exit 0. The count is lower than the earlier 1829 because the collector test file was rewritten from inline copies to 31 tests against the real module.
- `npx tsc --noEmit`: exit 0, no output (after fixing two test typing errors).
- Strategy 11.4 SHA-256: `d0170b40a4b9fb6265697edda03917779b9b8acddcaddc4c43488a4b29eb3f18` (unchanged).
- `OPTION_QUOTE_LTT_ENABLED=false`, `OPTION_QUOTE_CANARY_ENABLED=false` (unchanged).
- Production build: not run (would interfere with the dev server that also serves the scheduler's app).

## 6. Status summary

| Subsystem | Status |
|---|---|
| Stock market-data collector | Implemented offline, NOT RUN live. Needs authorization. |
| Stock monitoring (`paper-live`) | NOT RUNNING. Stays disabled. |
| Options research scheduler | RUNNING but SKIPPING every slot (gate syntax bug, §1). |
| Options research data | INSUFFICIENT. One qualifying session per index (2026-10-28). |
| Option-chain freshness | Model fixed offline; label semantics need your decision. |
| Paper execution | DISABLED. |
| Live broker execution | DISABLED. No order code added. |
| Overall | NOT READY for production. |

## 7. Required actions (user)

1. Stop the scheduler (PID 22226), fix the token gate to a quoted module path, and restart the **remaining approved slots only** (13:15, 13:55, 14:35, 15:15). Do not run missed slots late.
2. Decide the option-chain source label (keep `LIVE` gating, or add an UNVERIFIED state, which also changes eligibility).
3. Decide the reporting fix in §4 Task 3 finding 1 (recommended before the final report).
4. Authorize, or decline, a live stock-data test of the new collector.

## 8. After 3:15 PM IST — verification checklist

Run only after the scheduler has finished (confirm it has exited or finished all slots):

1. `ps -p <scheduler pid>` — confirm no scheduler process remains.
2. `node scripts/options-audit-research.ts report` — generates the final report (this is the only command for the report).
3. Inspect each of the six indices: qualifying sessions and rounds, duplicate-slot exclusions, closed-market and timing exclusions.
4. Confirm no record counted twice in a slot (`qualifies` false with `duplicate in 40-min slot`).
5. Verify freshness, IV median and P95, and price-agreement against the thresholds in the brief. Do not lower them.
6. `SESSION_EVIDENCE_DIR="$(mktemp -d)" node --test --experimental-strip-types "src/**/*.test.ts"` — full offline suite.
7. `npx tsc --noEmit`.
8. Production build only after the scheduler has exited (`npm run build`).
9. `shasum -a 256 src/lib/engine/strategy.ts` — must equal `d0170b40a4b9fb6265697edda03917779b9b8acddcaddc4c43488a4b29eb3f18`.
10. `grep -E "^OPTION_QUOTE_(LTT|CANARY)_ENABLED" .env.example` — both `false`.
11. `pgrep -fl "paper-live|run-paper-supervisor|paper-cycle"` — none.
12. `launchctl list | grep upstox` — none.
13. Confirm no `.data/` mutation beyond the research JSONL and report files.

## 9. Confirmed facts, inferences, and assumptions

- **Confirmed:** scheduler gate syntax error (reproduced). Research records and report figures (read from disk). Freshness distribution (measured offline). Two-second bound and duplicate handling (read from code and tested).
- **Inference:** the STALE label on option chains comes from the absent chain-level LTT plus the verification gate. Supported by code and the reconciliation test comment, not by a live response.
- **Unverified:** end-to-end dashboard rendering of the new wording (no browser check, no live requests). Live collector behaviour against Upstox.
