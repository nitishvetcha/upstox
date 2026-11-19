# Decision register (2026-11-11, approved by owner after external review)

| Item | Decision | Status |
|---|---|---|
| Holdout (P1 2022-onward) | Retire as independent evidence | APPROVED |
| Post-2025-07-01 period | Not clean (H-09); do not assume untouched | APPROVED |
| New holdout | Establish after a frozen strategy specification, with recorded hash | APPROVED (procedure) |
| G1 runs (2026-11-08) | Exploratory only; negative results recorded | APPROVED |
| G1 protocol | On-disk copy verified by hash (`55f03a00…`); not recreated | APPROVED |
| Aggregate exposure | Recorded (H-07) | APPROVED |
| S-06 | Full repricing research specification (synthetic, research only) | APPROVED |
| Path simulation | Approved for research; no production change; synthetic only | APPROVED (research) |
| S-04 / S-05 | Path simulation done (synthetic). No formula selected. Current formulas negative on average under all cost scenarios in these families. Width leaves zero lots at ₹1 lakh (1% budget). Next: wider, independently specified families (`S04_S05_PATH_DECISION_REPORT.md`) | OPEN (research) |
| S-07 | Fail-closed news requirement retained | APPROVED |
| R-06 | Correlated-exposure research rule (not production) | APPROVED (research) |
| R-07 | Temporary expiry-day entry restriction (implementation needs separate review and regression tests) | APPROVED (interim policy) |
| Cost scenarios | Base 1×, adverse 1.5× + 2%, stress 2× + 4% slippage per leg per side on mid; brokerage and statutory charges included; no double-counting | APPROVED (research) |
| G1 protocol | Recovered on disk; SHA-256 `55f03a00…` verified; missing-protocol finding closed | CLOSED |
| Holdout (2022-onward and post-2025-07-01) | Both retired as compromised; new holdout after formal freeze | RETIRED / PENDING |
| F-R1 | Verified in code and tests | CLOSED |
| Strategy 11.4 | Unchanged | MANDATORY |
| Live trading | Prohibited | NO-GO |
| Recommendation engine | NO-GO | NO-GO |

Notes
- Expiry-day restriction: no implementation was made in this step. It requires a separate reviewed change with regression tests.
- Correlated exposure: no production limit was introduced.
