# Phase 2.3.16 Stage 2: Deterministic 12-scenario multi-session test harness

**Date:** 2026-10-30 · **Mode:** offline, test-only · **Strategy:** 11.4-frozen (unchanged)

**Verdict: CONDITIONALLY COMPLETE — SPECIFIC TEST GAPS REMAIN**

All 12 scenarios are implemented and pass deterministically. Isolation is enforced by guards, not assumed. A mutation check showed that the assertions catch 12 out of 12 injected defects. Production `.data/` is byte-identical before and after every run.

The verdict is conditional for two reasons:

1. **The Stage 1 readiness report could not be found**, so exact alignment with its fixtures cannot be verified.
2. **Specific gaps remain**, listed in section 8. One of them is a pre-existing safety defect in *other* suites of the repository: they write into production session evidence. It is not a defect of this harness, but it must be fixed before the full suite is run again without a guard.

Stage 3 and Stage 4 were not started.

---

## 0. Input deviation: the Stage 1 report is missing

`phase2316_stage1_readiness_report.md` does not exist on this machine. These searches all came back empty:

- Spotlight (`mdfind`) and `find` across the repository, Desktop, Documents, Downloads and temporary directories.
- A text search of all repository `.md`, `.ts` and `.json` files for the scenario wording.

The 12 scenarios were therefore implemented from what the Stage 2 instructions give: the 12 titles and the scenario-specific restrictions.

Every expected behaviour below was derived from the production code's actual contracts, verified by reading the code and probing it in scratch directories before the tests were written. A reviewer holding the Stage 1 document should compare it against section 2.

---

## 1. Files created or modified

| File | Change |
|---|---|
| `web/src/lib/services/multiSessionPaperEvaluation.test.ts` | **New.** 19 tests in 13 suites: the 12 scenarios plus one harness self-check. |
| `web/docs/phase2316_stage2_multisession_test_report.md` | **New.** This report. |

**Not modified:**

- Strategy 11.4 and its scoring.
- Production source, risk configuration, feature flags, API routes and `paper-live.mjs`.
- Production `.data/` and `.next-verify/`.
- The LaunchAgent, which is still `disabled`.

No dependency was installed, nothing was restarted or rebuilt, no runner was started and the canary was not run.

Verification aids were kept outside the repository, in the session scratchpad:

| Aid | Purpose |
|---|---|
| `prod-data-guard.mjs` | Process preload that refuses production `.data` writes before the system call happens. |
| `mutate.mjs` | Mutation driver. |
| SHA-256 manifests | Production data fingerprints before and after. |
| `data-backup-before-stage2.tgz` | 4.1 MB backup; the token file is excluded. |

---

## 2. Scenario results (all PASS)

### Fixtures used by every scenario

**Clock.** Three NSE sessions:

| Session | Day | Role |
|---|---|---|
| S1 | Monday 26 Oct | positions open |
| S2 | Tuesday 27 Oct | expiry day: NIFTY weekly and BANKNIFTY monthly |
| S3 | Wednesday 28 Oct | Bhavcopy published at 18:00 IST |
| S4 | Thursday 29 Oct | re-entry check |

Every engine call receives an explicit instant. The file runs with `TZ=America/Los_Angeles`, so no result can come from the host happening to be in IST.

**Engine.** The production wiring `getPaperTradingEngine()`, with `allowMock: false` and storage via `PAPER_TRADES_DIR`. Each "process restart" discards the singleton and rebuilds it from disk.

**Capital.** Configured capital is ₹5,00,000 (`ACCOUNT_CAPITAL`, the same capital as the existing settlement suite). Every risk percentage and limit is the production default; this is asserted before each test.

**Prices.** The repository's deterministic mock chain: Black–Scholes as a pure function of the clock.

**Source labels.** Produced by the production classifier `tradeFreshnessOf()` from a synthetic exchange trade time, so 10:00 IST classifies as LIVE and 15:45 IST as END_OF_DAY. No label is hand-written. `provider` is null, so no fixture claims to come from Upstox.

**Approvals.** Strategy 11.4 approves only the **NIFTY Long Call** in these fixtures. A probe of 19 trading days × 7 times × 6 indices found 133 approvals, all of them NIFTY Long Call. Every other position, including every multi-leg and every BANKNIFTY position, reuses a plan **verbatim from Strategy 11.4's own candidate list** and is marked approved. These are labelled **SYNTHETIC** in the code, as in `paperTradingHardening.test.ts`. No price, stop or target is written by hand.

**Settlement data.** Synthetic NSE F&O Bhavcopy CSVs, zipped in memory and ingested through `ingestSettlementArchive()` into a temporary `storageDir`.

### What each scenario verifies

Every scenario checks, where applicable:

- the persisted ledger (disk equals memory, it reloads without error, reconciliation finds nothing, no temporary files are left behind);
- the event sequence;
- capital reservation (open risk and available risk);
- realized and unrealized P&L;
- failure behaviour and recovery behaviour.

| # | Scenario | Verified (beyond the common checks) | Event sequence asserted |
|---|---|---|---|
| S01 | Fresh startup and clean ledger | **Startup:** an empty ledger loads cleanly, the summary is exactly zero, and startup writes nothing. **First position:** a genuine Strategy 11.4 Long Call fills on the executable side (ask plus slippage) within the 1% per-trade, 5-lot and 20% position caps. Unrealized P&L equals minus the estimated round-trip costs. The first write creates `trades.json` and one event line, with no `.bak`. **Failure:** an orphan `events.jsonl` with no snapshot blocks the ledger (`LEDGER_UNAVAILABLE`) and the file is left untouched. | `OPENED` |
| S02 | Restart with open positions | **Restart:** two positions (1 leg and 2 legs) survive a restart with identical identity, entry prices, leg fills, lots, reserved risk and marks. **Duplicates:** replayed signals after restart give `DUPLICATE_TRADE_PREVENTED` with zero writes. **Next session:** an overnight restart is followed by revaluation. **Recovery:** a corrupt `trades.json` is recovered from `.bak` with identities, entries and reservations intact; the latest mark is lost (see G10). **Failure:** a backup that lags the event log blocks the ledger instead of dropping a position. | `OPENED` per trade |
| S03 | Duplicate event protection | **Signals:** a retry, a second retry, the same signal 6 minutes later, and a replay after restart all produce one position, one event, zero writes and identical bytes. **Saves:** saving the same ledger twice appends nothing. **Refused writes:** a duplicate in-memory event and a divergent history are refused before any write. **Reconciliation:** flags `DUPLICATE_OPEN_EVENT` and is not forced to pass. **On disk:** a duplicated line blocks the ledger on the next start and the files are untouched. | `OPENED` |
| S04 | Mid-session authentication expiry | **Token rejected:** a temp token file and the real `loadToken`, `markTokenInvalid`, `tokenStatus` and `withFallback` guard are used. A synthetic HTTP 401 on one quote request gives `UPSTOX_AUTH_EXPIRED`, and the token is marked `INVALID`. **Fallback:** the next snapshot is all `MOCK`, with zero network calls. **Engine:** fallback data cannot open a position (`FRESHNESS_BLOCKED: … MOCK`). Fallback prices set far through the stop are ignored: no exit, marks frozen, risk unchanged, one quote-unavailable event per outage rather than per cycle. **Recovery:** after re-login, trusted data resumes revaluation. Exactly 1 request was made and no login or token endpoint was contacted. | `OPENED, QUOTE_UNAVAILABLE` |
| S05 | Missing or stale option quotes | **Entry:** each leg's own exchange trade time is checked; whichever leg is stale (600 s), missing, aging (60 s) or more than 5 s in the future blocks entry and is named, with nothing written. **Revaluation cycles:** a stale short leg (with prices set through the stop), a missing or zero quote, a missing long-leg bid, a missing short-leg ask, and a missing leg timestamp each give `STALE_QUOTES` with that exact reason, marks frozen and risk unchanged. **Recovery:** revaluation resumes at long-at-bid, short-at-ask. The LTT feature flag stays `false` throughout. | `OPENED, QUOTE_UNAVAILABLE` |
| S06 | Market close and end-of-day transition | **15:29:59 IST:** live data still revalues. **15:45 IST:** data classified END_OF_DAY cannot open a position, and the open position is not revalued and not exited; the session close is not an exit. **Overnight:** a restart, then revaluation at Tuesday's open. **Expiry boundary:** still OPEN at 15:29:59 IST; at 15:30:00 IST it becomes `SETTLEMENT_PENDING` with no exit price, no exit timestamp, no realized P&L and no leg exits, while risk stays reserved. **Time zones:** session boundaries and IST days are identical under Asia/Kolkata, UTC and America/Los_Angeles. | `OPENED, QU, QU, SETTLEMENT_PENDING` |
| S07 | Expiry with settlement unavailable | **No dataset:** the position becomes `SETTLEMENT_UNVERIFIED` and the exact metadata is asserted: empty hashes, unverified exercise costs, empty legs, the reason given. Nothing is invented (no exit, gross, costs or realized P&L) and the settlement directory is never created. **Capital:** risk stays reserved and the report counts the position as unverified, not closed. **Duplicate guard:** still blocks re-entry. **Idempotency:** retrying gives no new event. **Quarantine:** a self-contradicting archive is quarantined, never persisted, and changes nothing. **Restart:** state preserved. | `OPENED, QU, PENDING, UNVERIFIED` |
| S08 | Delayed authoritative settlement | **Data arrives:** a day late, the position settles at the exchange `SttlmPric` (152.40 / 0.00) by exact five-field match. Near-miss rows are carried with different prices and none of them is used: wrong option type, wrong symbol, an unsupported symbol, a non-expiring date, a non-option row. **P&L:** gross is checked by hand from the settlement prices, costs equal the shared cost model, and net equals gross minus costs. **Provenance:** both hashes (ZIP and CSV) and the source file are recorded; exercise costs stay unverified. **Capital:** released. **Idempotency:** settling again, re-ingesting the same file (`IDEMPOTENT_NOOP`) and presenting a later revision (`CANDIDATE_REVISION`, not applied) change nothing. **Restart:** identical. | `…, UNVERIFIED, SETTLED_VERIFIED` |
| S09 | Interrupted or incomplete multi-leg settlement | **(a) Incomplete data:** the Bhavcopy's short-leg row has a blank price, so the whole spread stays `SETTLEMENT_UNVERIFIED`. The long leg, which does have a price, is **not** settled on its own. Risk stays reserved. A corrected archive is held as a candidate revision and not applied. **(b) Interrupted write:** a simulated crash at the atomic rename of `trades.json`. The settlement call returns `LEDGER_PERSIST_FAILED` and memory rolls back with every leg unsettled. The disk snapshot never shows a settled leg; the append-only log ran one event ahead. The running process then refuses further writes. A restart blocks the ledger (fail-closed) and nothing is rewritten. | (a) `…, PENDING, UNVERIFIED` |
| S10 | Restart after verified settlement | **Restart:** the record, P&L, provenance and released capital are identical. **Terminal state:** every transition out of `SETTLED_VERIFIED` is refused (`closeTrade` and `transitionToPendingSettlement` throw; re-settling is a no-op) and the bytes are unchanged. **Re-entry:** a new position gets a new identity. **Tampering:** reconciliation flags tampered net P&L (`NET_NOT_GROSS_MINUS_COSTS`), a cleared hash (`SETTLEMENT_PROVENANCE_INVALID`) and a tampered exit (`PNL_MISMATCH` + `COSTS_MISMATCH`). Deleting provenance on disk blocks the ledger. | `…, SETTLED_VERIFIED` |
| S11 | Multiple multi-leg positions, insufficient capital | **Three positions:** NIFTY Long Call (1 leg), NIFTY Bull Call Spread (2 legs) and BANKNIFTY Bear Put Spread (2 legs) reserve ₹4,684 + ₹4,744 + ₹4,999 = ₹14,427 of the ₹15,000 open-risk budget, leaving ₹573 available. **Fourth position (BANKNIFTY Long Put):** refused. The production risk engine, given the ledger's own inputs, returns `OPEN_RISK_LIMIT` and `MAX_CONCURRENT_POSITIONS`; the engine reports "Combined open risk ₹19,352 exceeds portfolio open risk limit ₹15,000". Zero writes, identical bytes and an identical summary. **Recovery:** closing the Long Call releases its reservation and the 4th position then fits. Capital equals starting capital plus realized plus unrealized; a restart preserves the summary. | `OPENED, EXITED` / `OPENED` |
| S12 | Reporting and capital reconciliation | **Ledger built:** three sessions with restarts produce one closed, one settled-verified, one settlement-unverified and one open position. **Report:** `REPORT_LABEL` is present. Exact counts. Realized P&L comes **only** from the closed and verified trades, and gross minus costs equals net. Unrealized P&L comes only from the open position; the unverified position is in neither. Exposure equals the active reservations. **Capital:** current capital equals starting capital plus net plus unrealized, and available risk equals the cap minus reserved risk. Unverified exercise costs stay visible. **Reconciliation:** the valid ledger reconciles with zero issues and the report rebuilds identically from disk. Four intentionally invalid copies each yield exactly their issue code. | per trade, all four asserted |

The harness self-check also passes. It proves the ledger is isolated **only** because of `PAPER_TRADES_DIR` injection: without it, the resolver points at `.data/paper-trades`. It also proves that writes outside the test root and outbound requests are blocked.

---

## 3. Test counts

| Run | Command (from `web/`) | Result |
|---|---|---|
| New suite ×3 (determinism) | `UPSTOX_TOKEN_FILE=.test-data/no-upstox-token.json node --test src/lib/services/multiSessionPaperEvaluation.test.ts` | exit 0, **19/19** each time, about 0.25 s |
| New suite under a hostile host environment ×3 | the same, with `TZ=Asia/Kolkata`; with `TZ=UTC`; with `ACCOUNT_CAPITAL=100000 MAX_CONCURRENT_POSITIONS=1 MAX_OPEN_RISK_PERCENT=1 PAPER_TRADES_DIR=/nonexistent… MARKET_DATA_PROVIDER=upstox` | exit 0, **19/19** each time |
| Mutation check | 12 injected defects, each in a scratch copy of `src/` | **12/12 caught**; the unmutated baseline copy passes 19/19 |
| Relevant existing suites | 13 files (listed in section 7) | exit 0, **243/243** |
| Full repository suite | `npm test` under the production-data guard (final runs 3 and 4, section 7) | exit 0, **1,687/1,687** (201 suites, about 159 s) |

Mutants, and the suites that caught them:

| Mutant | Caught by |
|---|---|
| Event log re-appended on every save | 11 suites |
| Partial multi-leg settlement | S09 |
| Fabricated leg exits at expiry | S06, S07, S09 |
| Duplicate guard ignores `SETTLEMENT_UNVERIFIED` | S07 |
| Untrusted data allowed to revalue | S04, S06–S10, S12 |
| Open-risk limit removed | S11 |
| Per-leg entry freshness removed | S05 |
| Settlement not idempotent | S08, S10 |
| Reconciliation blind to net P&L | S10, S12 |
| Auth expiry not recorded | S04 |
| Event validation skipped on load | S02, S03, S09, S10 |
| Settlement rollback removed | S09 |

---

## 4. Isolation verification

**Storage**
- Every test gets its own `mkdtemp` root.
- `PAPER_TRADES_DIR`, `UPSTOX_TOKEN_FILE` and `ACCOUNT_CAPITAL` are set for that test and restored afterwards. Host risk-limit overrides are cleared.
- The ledger resolver is asserted to point into the test root before each test.
- Settlement and token calls always pass explicit temporary paths.

**Write guard (in-process)**
- Wraps every `node:fs` and `node:fs/promises` write API, including ESM named imports via `syncBuiltinESMExports`.
- Any write outside the test's own root throws before the system call.
- The harness self-check proves it; S09 uses the same mechanism to inject the crash.
- `afterEach` asserts zero violations.

**Network guard**
- `fetch` is replaced; every outbound request is blocked.
- S04 answers exactly one request with a synthetic 401.
- `afterEach` asserts the exact number of calls (0, or 1 in S04).

**Concurrency and process state**
- The suite runs with concurrency 1.
- The production singleton is reset before and after each test.
- Each test file runs in its own process, so the guards are process-local.

**Clean-up and flags**
- Temporary roots are removed and their removal is asserted; 0 leftovers were found afterwards.
- Feature flags: `isOptionQuoteLttEnabled()`, `isOptionQuoteCanaryEnabled()` and `OPTION_QUOTE_LTT_ENABLED` are asserted `false` before and after the suite. The suite never sets them, and both environment variables are unset.

**Frozen strategy**
- Both `STRATEGY_VERSION.strategyVersion` and `FROZEN_STRATEGY_VERSION` are asserted to be `11.4-frozen`.

---

## 5. Production data integrity verification

**Baseline (15:51 IST, before any test was written)**
- SHA-256 manifest of **11,703** files: every file in `.data/` except the `history/` cache and the token file.
- Size and mtime listing of **3,204** `history/` files.
- Token file hash (contents never printed).
- 4.1 MB backup archive (token file excluded).

**Guard on every run**
- Every suite run was executed with a preload guard (`NODE_OPTIONS=--import`, inherited by every test process and subprocess).
- It refuses, before the system call, any write, delete, rename, copy, open-for-write or stream into the repository's `.data/`.
- It was validated first in a fake project directory: 12 out of 12 write variants were refused, reads and outside writes were allowed, and the fake `.data` stayed intact.

**After all runs**
- 11,703 out of 11,703 hashes are **identical**.
- The history listing is **identical**.
- The token hash is **identical**.
- `.data/paper-trades/` and `.data/settlement/` are still **absent**.
- The new suite itself attempted **0** writes into production `.data`.

---

## 6. TypeScript result

- `npx tsc --noEmit`: **exit 0**.
- `npx eslint src/lib/services/multiSessionPaperEvaluation.test.ts`: **exit 0**. Three `prefer-const` findings were fixed before the final runs.

---

## 7. Existing regression results

**Targeted suites**, run under the guard with `UPSTOX_TOKEN_FILE=.test-data/no-upstox-token.json`: exit 0, **243/243** pass.

- `paperTradingHardening`
- `paperSettlementLifecycle`
- `settlementIngestion`
- `paperTrading`
- `paperIntegrity`
- `upstoxAuth`
- `contractFreshnessSafeguards`
- `contractFreshnessReconciliation`
- `manualPaperOpportunityProtection`
- `phase2315Integration`
- `marketData`
- `phase30_4` (LTT gating)
- the new suite

**Full suite (`npm test`), three runs:**

| Run | Result |
|---|---|
| 1 | 1,683/1,687, 4 failures. **These were caused by my guard, not by code.** It protected each process's working-directory `.data`, which wrongly covered the temporary working directory that `researchRunner.test.ts` deliberately uses. |
| 2 | Guard corrected to protect only the absolute repository `.data`: **1,687/1,687**, exit 0. |
| 3 | Rerun after the final lint fix: **1,687/1,687**, exit 0. |
| 4 | `SESSION_EVIDENCE_DIR="$(mktemp -d)" npm test`, still under the guard: **1,687/1,687**, exit 0, and **0** production writes attempted. The 3 session files went to the temporary directory, which verifies the G1 mitigation. |

Not run: `npm run build`. It is not needed for a test-only change, and `.next-verify` must not be rebuilt.

---

## 8. Remaining gaps (most important first)

**G1. SAFETY, pre-existing and outside this harness: repository tests write into production session evidence.**

Under the guard, every full run refused **58** writes into `.data/paper-sessions/`:

- 54 from `src/lib/phase24.test.ts`;
- 4 from `src/lib/services/phase2315Integration.test.ts`.

Both suites isolate opportunities and logs but not `SESSION_EVIDENCE_DIR`. The collector swallows the refused write, so both suites still pass.

**Evidence that earlier unguarded runs already contaminated real files:**

- **26–30 Oct:** every session file carries one test-fixture `invalid price NaN / 0 / -5` triplet per run (10, 9, 9, 4 and 8 runs), and its `target1Hits`, `stopHits` and `expirations` counts are inflated.
- **Today's file (`session_2026-10-30.json`):** test entries were written 12:05–13:44 IST, after the runner had stopped at 11:26.
- **`session_2026-10-06.json` and `session_2026-10-07.json`:** they carry the tests' synthetic instants. On 10-06 the last observation is *earlier* than the first; 10-07 shows 1,246 collection cycles.

My own unguarded full-suite runs in Phases 8–11 (27–28 Oct) very likely contributed. **These files are not repaired:** that is outside Stage 2 and needs your approval.

Until the suites are fixed, run the full suite only with `SESSION_EVIDENCE_DIR` pointing at a temporary directory. That mitigation was verified (section 7, run 4): 1,687/1,687 pass with 0 production writes attempted.

**G2. Stage 1 report missing.** Exact fixture alignment with the accepted Stage 1 scenarios cannot be verified (section 0).

**G3. Latent engine defect, deliberately not encoded as expected behaviour.**

`evaluateOpenTrades` matches legs to chain rows **by strike only**; it checks neither `snapshot.expiry === trade.expiry` nor instrument keys.

- **Reproduced in a probe:** a LIVE-labelled snapshot at 15:30 IST on expiry day, whose chain had rolled to the next expiry, re-marked the expiring Long Call with that other contract's prices (+₹14,510 unrealized) before moving it to `SETTLEMENT_PENDING`.
- **In production today:** masked, because post-close Upstox data is classified END_OF_DAY and is not trusted.
- **Candidate fix (separate stage):** require the expiry or instrument identity to match before revaluing.

**G4. No supported recovery path for an unverified multi-leg settlement.** A corrected Bhavcopy is stored as a `CANDIDATE_REVISION` and never applied automatically, so the position stays `SETTLEMENT_UNVERIFIED` with risk reserved until someone promotes it. S09 asserts this behaviour.

**G5. Interrupted writes need an operator.**

- A crash between the event append and the rename locks the ledger, which is correct fail-closed behaviour, but it leaves a `trades.json.tmp-<pid>` file and there is no repair tool.
- Persist failures in the expiry and no-metadata transitions are not rolled back. Memory runs ahead of disk until the next successful write, and a restart in that window blocks the ledger.

**G6. Refused entries leave no audit trail.** Risk, freshness and duplicate rejections write no event; the `PAPER_TRADE_REJECTED` event type is never used.

**G7. Quarantined or rejected Bhavcopy archives leave no persistent record.**

**G8. There is no margin model.** "Insufficient capital" is enforced only through:

- the open-risk budget (3%);
- per-trade risk (1%);
- position value (20%);
- concurrency (3 positions).

Aggregate premium outlay is never checked; it is bounded only structurally (3 × 20% ≤ 100%).

**G9. Provenance label.** The engine records `marketDataSource: "UPSTOX_LIVE"` for any LIVE-labelled source, whatever its `provider`. The harness's synthetic snapshots (`provider: null`) are therefore recorded that way inside temporary ledgers. Nothing outside temporary storage is affected.

**G10. Backup recovery loses the latest mark.** `.bak` is one write behind. Identity, entry prices and reservations survive; the most recent mark-to-market does not (asserted in S02).

**G11. The harness tests the paper engine, not strategy behaviour.** Every multi-leg and BANKNIFTY position is a SYNTHETIC approval of a Strategy 11.4 candidate.

**G12. Two production values are non-deterministic and are not asserted by value:**

- trade IDs (`Date.now()` plus `Math.random()`);
- `ingestedAt` in settlement metadata (`new Date()`).

Tests assert identity and stability instead.

**G13. Exercise costs.** Settlement P&L models the exit as an ordinary sell; STT on exercise is not modelled. Every settled trade keeps `UNVERIFIED_MISSING_EXERCISE_SPECIFICATION`, and S08 and S12 assert that, so no settled P&L is presented as fully verified.

**G14. Untested branches.**

- Settlement supports only NIFTY and BANKNIFTY. Positions in FINNIFTY, MIDCPNIFTY, SENSEX or BANKEX would stay pending; this is not exercised.
- The engine's "ambiguous multiple records" branch cannot be reached through ingestion, which deduplicates or quarantines first, so it is not exercised.

---

## 9. Ready for independent review?

**Yes, as a harness.** It covers the 12 named scenarios end to end through the production wiring. It is deterministic: 19/19 in 6 runs, including hostile host environments. Isolation is mechanically enforced and self-tested. Its assertions are shown to catch 12 out of 12 injected defects. Production data was proven unchanged.

**Why not COMPLETE:** G2 (Stage 1 alignment unverifiable), G3 and G14 (untested defect or branches), and G1 (repository suites unsafe to run unguarded).

**Why not REJECTED:** no safety or correctness defect was found in the harness itself. The safety defect found (G1) is in pre-existing suites, and the harness's guard is what exposed it.

### Reproduce

```bash
cd "/Users/webanatomy/Desktop/upstox_analyzer (2)/web"
UPSTOX_TOKEN_FILE=.test-data/no-upstox-token.json node --test src/lib/services/multiSessionPaperEvaluation.test.ts
npx tsc --noEmit
# Full suite: do NOT run unguarded until G1 is fixed; at minimum isolate session evidence:
SESSION_EVIDENCE_DIR="$(mktemp -d)" npm test
```
