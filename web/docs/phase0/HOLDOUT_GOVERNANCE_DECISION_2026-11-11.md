# Holdout governance decision (2026-11-11)

Status: **RECORDED** (owner approval per the external review). Strategy 11.4 unchanged. Engine NO-GO.

## Decisions
1. **Retire** the P1 2022-onward holdout as independent evidence. It is exposed (H-01, H-09).
2. **Do not** treat the post-2025-07-01 period as clean. Its rows were loaded into memory by the G1 v2 script (H-09).
3. **G1 runs** (1h and 15m, 2026-11-08) are **exploratory only**. Their protocol is recovered and verified by hash. Their results are negative (all decisions failed their own criteria) and are kept as research observations, not validation evidence.
4. **G1 protocol:** recovered from the on-disk copy and verified by hash. Not recreated. Kept as the record of what the runs did.
5. **Aggregate exposure** is recorded: validation-window aggregates were printed during the audit (H-07).
6. **Never describe the old holdout as sealed again.**

## New holdout procedure (to be followed when research is ready)
1. Finish all offline research and strategy decisions.
2. Freeze the strategy version, parameters, weights, thresholds and acceptance criteria as one written specification.
3. Record the freeze date and the SHA-256 hash of that specification in the repository.
4. Define the holdout as the first complete trading sessions after the freeze date. Prefer forward data collected after the freeze.
5. Restrict read access to the holdout data. Log every read.
6. Allow one formally authorised final evaluation.
7. Do not tune parameters from the holdout result. Any change means a new version and a new holdout.

Practical consequence: independent validation may require waiting for forward data. That is accepted over producing a misleading result.
