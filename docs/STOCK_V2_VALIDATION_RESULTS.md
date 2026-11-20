# Stock V2 — Validation Results

Status: **NOT RUN.**

Reason: the pre-registered selection rule selected no candidate (see `STOCK_V2_DEVELOPMENT_RESULTS.md`). Running the untouched 20-session validation set on a candidate that failed development would not be an independent test. Running it on both candidates to pick the better one would be selection on validation data. Neither is done.

Validation remains available for a future, separately labelled research cycle. Requirements for that cycle:

1. A new candidate or parameter set, written and frozen before any result is seen, with a new pre-registered rule.
2. Development on sessions that have not been used to select the new candidate. The current 40 development sessions have already been used, so a new cycle needs new data.
3. Code hash recorded at freeze. `scripts/stock-v2-research.ts validation` refuses to run if the code hash differs from development, and refuses to run twice.
4. Validation run once, with all results reported, including negative results.

Validation sessions for reference (chronological, untouched): 2026-10-06 to 2026-11-03.
