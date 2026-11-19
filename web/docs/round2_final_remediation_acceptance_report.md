# Round 2 Final Remediation — Acceptance Report

**Date:** 2026-11-03 (Asia/Kolkata)  
**Repository baseline:** `main` at `80f3eeeea990bf2b3b9a07d486bc9a934448b4d3`

## A. Executive result

**ACCEPTED — documentation design consistent; owner approvals still pending.**

This acceptance applies only to the final documentation design. It does **not** mean recovery is implemented, production records are repaired, the per-stock overlay is integrated, a fundamental provider is selected, or live/paper trading is ready. Disk recovery remains Blocked pending all 15 owner decisions.

## B. Corrections completed

| Original problem | Correction | Exact file/section |
|---|---|---|
| No session safety record | Recorded Git branch/commit/dirty tree, strategy hash, flags, runtime, port, and `.data/` boundary | `docs/round2_final_remediation_baseline.md` |
| Sentinel combinations incomplete and absent could mean unsafe first init | Added complete six-row state machine, legacy branch, exclusive durable creation, interruption and concurrency rules | `docs/disk_crash_recovery_implementation_plan.md` §§3–3.1 |
| Recovery states and resume behavior ambiguous | Defined four states, permissions, prohibited operations, transitions, and non-transitioning acknowledgement | Recovery plan §4 |
| Reconciliation lacked controlled choices/audit | Defined three choices, allowed origins/preconditions, and required immutable audit fields | Recovery plan §4.1 |
| Recovery could overwrite/rotate the only recoverable snapshot | Added separate recovered candidate, protected `.bak`, verified promotion, and one-good-copy rotation guard | Recovery plan §5 |
| Quarantine could overwrite active log in place | Replaced with full-backup → suffix → prefix-temp → verify → atomic rename → directory fsync protocol | Recovery plan §6 |
| Crash boundaries incomplete | Defined restart behavior at every copy, fsync, rename, verify, manifest, and deletion boundary | Recovery plan §6.1 |
| Prefix verification too weak | Required full JSON/schema validation, contiguous sequence, unique valid IDs, exact boundary, byte hash, replay, and backup presence | Recovery plan §7 |
| Crash suite fragmented/missing cases | Consolidated R01–R27 and required additional replay/promotion/audit cases | Recovery plan §9 |
| Decision IDs/counts diverged | Made one authoritative 15-item register; D15 retired into D8a; all items Pending | Recovery plan §10 |
| Candle validation coercive/incomplete | Required `Number.isFinite`, strict numeric OHLC, consistency, volume, timestamp, and UTC normalization rules | `docs/per_stock_technicals_implementation_plan.md` §§2–2.1 |
| Duplicate selection depended on API order | Deduplicate only fully identical relevant values; reject the whole conflicting timestamp group with diagnostics | Technical plan §2.2 |
| Fixed session window overclaimed correctness | Documented normal NSE window and explicit calendar requirement for holidays, partial, and Muhurat/special sessions | Technical plan §3 |
| Indicator availability conflated; MACD count wrong in prior text | Defined independent minima: EMA-20 20, EMA-50 50, RSI/ATR 15, MACD 35, VWAP by positive usable session volume | Technical plan §4 |
| Synthetic/live provenance could blur across candle sets | Added per-indicator provenance, strict aggregation, and production/engine boundary rejection | Technical plan §5 |
| Technical matrix incomplete | Added PT01–PT23 including 14-candle bypass, exact minima, reversed duplicates, conflicts, exact clamps, symmetry, and unavailable data | Technical plan §7 |
| Fundamental validity and scoring eligibility conflated | Kept Valid/Stale/Ancient/Invalid while separating storage, display, and scoring; negative P/E/ROE remain valid but score-ineligible | `docs/fundamental_provider_comparison.md` §§4.2–4.3 |
| Provider pricing/rates/endpoints/budgets looked current | Marked every such claim unverified and gated official-document review, evaluation, credentials, purchase, and integration separately | Fundamental comparison preface and §§4.4–4.6 |
| Review documents competed with authoritative plans | Replaced duplicated protocols with an authority map and remediation summaries | `round2_final_safety_review.md`, `round2_final_corrections.md`, `round2_final_consistency_audit.md`, `round2_remaining_gaps_report.md` |
| Tracker contained stale completion prose | Preserved 204-row counts and statuses; corrected recovery, technical, and provider notes without inflating completion | `docs/full_application_completion_tracker.md` Strategy/Paper Trading/Summary sections |

## C. Decision register

The only authoritative register is `docs/disk_crash_recovery_implementation_plan.md` §10. Summary:

| ID | Description | Status |
|---|---|---|
| D1 | Pure deterministic `applyEvent` semantics | Pending owner approval |
| D2 | Required event schema version and unknown-version behavior | Pending owner approval |
| D3 | Legacy migration and deterministic-ID collision stop | Pending owner approval |
| D4 | New event ID generation | Pending owner approval |
| D5 | Single durable-store sequence ownership | Pending owner approval |
| D6 | Applied-ID compaction and protected archive | Pending owner approval |
| D7 | Snapshot/event-log atomicity invariant | Pending owner approval |
| D8 | Enforced single-writer/concurrency model | Pending owner approval |
| D8a | File, append, rename/unlink, and directory fsync requirements | Pending owner approval |
| D9 | Corrupt/truncated/gap preservation and quarantine | Pending owner approval |
| D10 | Orphan temp quarantine/no auto-promotion | Pending owner approval |
| D11 | Recovery states and reconciliation model | Pending owner approval |
| D12 | Sentinel state machine/path/format/exclusive creation | Pending owner approval |
| D13 | Protected backup and two-phase candidate promotion | Pending owner approval |
| D14 | Crash-safe quarantine and full verification protocol | Pending owner approval |

Exactly 15 decisions are active. D15 is retired and absorbed into D8a.

## D. Remaining owner decisions

Every D-item above requires explicit acceptance or a chosen alternative. They matter because together they define event compatibility/idempotency (D1–D5), bounded durable history and atomicity (D6–D8a), evidence preservation (D9–D10, D13–D14), and fail-closed recovery/resumption (D11–D12). If any remains pending, recovery implementation is blocked; partial implementation would create undefined crash behavior.

Specific policy choices still requiring attention:

- D11: whether “verified no open positions” may ever leave `LOCKED_ADMIN_ONLY`; the safe default is no. The required evidence threshold and operator notification channel also need approval.
- D12: sentinel path/content/checksum, stale-claim rule, and platform-safe no-replace creation need approval.
- D13/D14: incident evidence retention and when full-backup deletion is permitted need approval.
- Per-stock technicals: owner approval is required for the `<15` overlay bypass, weights, top-N/live request budget, authoritative exchange calendar, and later production/paper integration. Pending decisions block integration, not documentation or a separately authorized pure offline implementation.
- Fundamentals: current official documentation must be verified first. Owner decisions for evaluation subject, credential creation, plan purchase, and integration must remain separate. Pending status blocks provider integration and fundamental scoring.

## E. Validation results

All commands were run from `web/`. No validation command used production `.data/`, authentication, or network access.

| Exact command | Result | Passed / failed / skipped | Isolated storage | Network |
|---|---|---|---|---|
| `npm run typecheck` (`tsc --noEmit`) | Failed on existing `.next/dev/types/validator.ts` check for `src/app/api/options-canary/route.ts`: optional `OptionsCanaryRouteDeps` second parameter is incompatible with Next route context | 0 successful compilation; 1 TypeScript error; 0 skipped | No storage used | None |
| Inline Node tracker recount over rows before `## Summary Counts` | `159 Complete + 5 Partially Complete + 32 Requires Live Auth + 5 Blocked + 3 Not Implemented = 204` | 1 check passed; 0 failed; 0 skipped | No storage used | None |
| `test -s` for all eight required documents plus `rg` authority-reference checks | All files non-empty and authority references present | 1 check passed; 0 failed; 0 skipped | No storage used | None |
| Inline Node local Markdown-link check for the eight required documents | `local markdown links: PASS` | 1 check passed; 0 failed; 0 skipped | No storage used | None |
| `rg` stale-term scan across the eight documents | No active stale count, old test namespace, unsafe duplicate rule, or 27-candle MACD requirement; matches were explanatory/retirement statements only | 1 check passed; 0 failed; 0 skipped | No storage used | None |
| `shasum -a 256 src/lib/engine/strategy.ts` | Exact protected hash | 1 check passed; 0 failed; 0 skipped | No storage used | None |
| Flag search in `ecosystem.config.cjs`, `.env.example`, `playwright.config.ts`, and `optionContractLTT.ts` | Active defaults remain false; only a comment explains the disabled canary's hypothetical true setting | 1 check passed; 0 failed; 0 skipped | No storage used | None |
| `launchctl list` filter and `lsof -nP -iTCP:3123 -sTCP:LISTEN` | No protected LaunchAgent and no port-3123 listener | 2 checks passed; 0 failed; 0 skipped | No storage used | None |

No unit test suite was run because this session changed documentation only; the repository's broad `npm test` writes test ledgers and was unnecessary for validating these edits. No recovery tests are claimed to pass: they are design requirements for the future implementation phase. The TypeScript failure is unrelated to these documentation changes and was not fixed because the task prohibits implementing code merely to prove the design.

## F. Safety confirmation

- Strategy 11.4 final SHA-256: `d0170b40a4b9fb6265697edda03917779b9b8acddcaddc4c43488a4b29eb3f18`, identical to baseline.
- No live broker execution or order endpoint was enabled or used.
- `OPTION_QUOTE_LTT_ENABLED=false` and `OPTION_QUOTE_CANARY_ENABLED=false` remain the active documented/configured defaults.
- `.data/` was untouched: not inspected, read, migrated, repaired, reset, truncated, or used as a fixture.
- No OAuth refresh/replacement/login was attempted.
- No Upstox, NSE, broker, or provider network request was made.
- No runner, supervisor, canary, or `com.upstox.paperlive` LaunchAgent was started or loaded.
- This session did not start a server or occupy port 3123; the final listener check was empty.
- No permanent Git tag was created.
- Existing unrelated working-tree changes were preserved.

## G. Final recommendation

Proceed independently with owner review of D1–D14, the per-stock overlay policy, and the provider-evaluation gates. After all recovery decisions are explicit, authorize a separate offline engineering phase for recovery and R01–R27 using isolated synthetic directories. The pure per-stock validator/indicators and PT01–PT23 can likewise proceed in a separately authorized offline phase before any live wiring.

Keep recovery implementation, live per-stock integration, fundamental-provider integration, credential creation/purchase, and any trading activation blocked until their stated approvals and acceptance tests are complete. Address the existing canary route TypeScript signature in a separate code task; do not enable the canary to do so.
