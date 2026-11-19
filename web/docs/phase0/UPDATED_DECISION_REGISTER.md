# Updated decision register (after expanded path simulation and width feasibility)

| Item | Decision | Status |
|---|---|---|
| Holdouts (2022-onward; post-2025-07-01) | Both retired as compromised. New holdout only after a frozen strategy specification | RETIRED / PENDING |
| G1 protocol | Recovered on disk; SHA-256 `55f03a00…` verified | CLOSED |
| G1 runs | Exploratory only | APPROVED |
| S-04 (stop formula) | No formula selected. Candidates remain research only | OPEN (research) |
| S-05 (target formula) | No formula selected. Candidates remain research only | OPEN (research) |
| S-06 (repricing) | Full repricing research specification; synthetic only | APPROVED (research) |
| Expanded path simulation | Specification frozen (hash `eecb87ed…`); executed; synthetic only; no selection | COMPLETE (research) |
| Spread width feasibility | Feasible under the 1% rule at ₹1 lakh: none. Narrowest valid width needs about ₹1.7 lakh | FINDING (HIGH) |
| Width rule (daily ATR) | Unchanged. Research on alternatives only | UNCHANGED / RESEARCH |
| NO TRADE at ₹1 lakh | Accepted | ACCEPTED |
| Capital feasibility research (₹1.7L–₹6L, with 10% buffer) | Approved for research only; minimum for 50-pt width about ₹1.85L (buffered) | APPROVED (research) |
| Alternative width methods (M0–M4) | Approved for research only; none for production | APPROVED (research) |
| Cost scenarios | Base 1×; adverse 1.5× and 2% slippage; stress 2× and 4% slippage; legging sensitivity | APPROVED (research) |
| R-06 (correlated exposure) | Research only | APPROVED (research) |
| R-07 (expiry-day restriction) | Interim policy; implementation needs separate review | APPROVED (policy) |
| S-07 (news) | Fail-closed retained | APPROVED |
| F-R1 | Verified in code and tests | CLOSED |
| Strategy 11.4 | Unchanged | MANDATORY |
| Production formulas and risk limits | Unchanged | MANDATORY |
| Live trading and automatic execution | Prohibited | NO-GO |
| Recommendation engine | NO-GO | NO-GO |
| Software tests | 2,731 passing (software quality only; not evidence of profitability) | INFORMATIONAL |
