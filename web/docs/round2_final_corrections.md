# Round 2 Final Corrections — Remediation Record

**Date:** 2026-11-03  
**Scope:** Documentation-only correction. No recovery or technical-overlay code implemented.

## Corrections applied

| Issue | Correction | Exact authority/section |
|---|---|---|
| Incomplete first-init logic | Six-state sentinel table, legacy-data branch, exclusive durable initialization, interrupted/concurrent handling | `disk_crash_recovery_implementation_plan.md` §§3–3.1 |
| Ambiguous recovery modes | Normal, `RECOVERY_SUSPECT`, `RECOVERY_FALLBACK_READONLY`, `LOCKED_ADMIN_ONLY` permissions and transitions | Recovery plan §4 |
| Acknowledgement could resume | Acknowledgement is non-transitioning; three explicit reconciliations and immutable audit fields | Recovery plan §4.1 |
| Unsafe backup rotation/promotion | Protected `.bak`, separate recovered candidate, crash-safe promotion, one-good-copy guard | Recovery plan §5 |
| In-place active-log replacement | Full crash-safe quarantine protocol with temporary prefix and atomic rename | Recovery plan §6 |
| Incomplete boundary recovery | Restart behavior specified for every copy/fsync/rename/verify/delete boundary | Recovery plan §6.1 |
| Weak prefix verification | Full parse/schema/sequence/ID/boundary/hash/replay/backup checks | Recovery plan §7 |
| Missing crash cases | Consolidated R01–R27 synthetic matrix | Recovery plan §9 |
| Decision divergence | Single 15-item register; D15 retired into D8a; every decision Pending | Recovery plan §10 |
| Coercive/incomplete candle checks | Strict OHLC, volume, timestamp and UTC rules | `per_stock_technicals_implementation_plan.md` §2 |
| Order-dependent duplicates | Reject conflicting timestamp group; dedupe only complete identical values | Technical plan §2.2 |
| Session overclaim | Normal NSE session plus explicit holiday/partial/Muhurat limitation and calendar gate | Technical plan §3 |
| Indicator-count mismatch | Independent minima; MACD correctly derived as 35 | Technical plan §4 |
| Provenance ambiguity | Per-indicator source and synthetic rejection at production boundaries | Technical plan §5 |
| Test omissions | PT01–PT23 matrix, including exact clamps and symmetry | Technical plan §7 |
| Fundamental category conflict | Separate freshness category from field validity and scoring eligibility | `fundamental_provider_comparison.md` §§4.2–4.3 |
| Provider claims appeared verified | Pricing/rates/endpoints/coverage/budgets marked unverified; evaluation sequence gated | Fundamental comparison preface and §§4.4–4.6 |
| Stale tracker prose/count references | 204-row counts preserved; recovery and provider notes corrected | `full_application_completion_tracker.md` |

## Decision status

The authoritative register exists only in `disk_crash_recovery_implementation_plan.md` §10. It contains D1–D11, D8a, D12–D14 (15 decisions), all **Pending owner approval**. D15 is retired. This correction record does not duplicate or approve the register.

## Implementation status

Accepted design language is not implementation. Recovery, per-stock overlay integration, live market validation, and provider integration remain unimplemented/blocked as recorded in the tracker.
