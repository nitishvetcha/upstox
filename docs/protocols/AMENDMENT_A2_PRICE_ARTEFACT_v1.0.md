# Protocol amendment A2: price-artefact treatment (post-result data-quality amendment)

Status: written 2026-11-08, to be reviewed and registered before any rerun. It follows the v1.0 development results, which showed a probable data artefact. The rerun is a sensitivity/research rerun. It is NOT an independent validation.

## Rule (applies identically to H1, H2, H3, H4 and H5)

1. **Flag.** A stock-day is flagged when the absolute close-to-close percentage move versus the previous calendar session's close exceeds **20%**. The threshold is a conservative research exclusion, not proof that a move is erroneous. Index-level flags use the same rule on the NIFTY 50 close.
2. **Confirmation.** A flagged move may be retained only if independently confirmed by a reliable second source. **No second source is available in this project for the development window** (the bhavcopy sweep was not completed, and no second price vendor is authorised). Therefore every flagged observation is treated as unconfirmed.
3. **Exclusion.** Each unconfirmed flagged observation is excluded. Excluded observations are not used as signal, entry, exit, lookback or holding-period prices.
4. **Window exclusion.** Any signal or holding-period return window that crosses an unconfirmed flagged observation is excluded:
   - H1 signal (return from t-252 to t-21): any flagged day in that window excludes the name on that date.
   - H2 signal (return from t-21 to t): same rule.
   - H1 and H2 holding (entry day to exit day, scheduled): any flagged day excludes the position.
   - H3 and H5 forward return (open t+1 to open t+22): any flagged day excludes the observation.
   - H4 realised volatility (20 log returns): any flagged day in the window makes the index observation unusable on that date.
5. **Consistency.** The rule is applied identically to all five hypotheses and to both cost scenarios.
6. **No repair.** Prices are never interpolated, repaired, reassigned or fabricated. An excluded observation leaves no value in its place.
7. **Recording.** Every exclusion is logged with stock, date, return, source-confirmation status ("none available") and reason.
8. **Eligibility.** A flagged observation is not a valid session for the eligibility rule (Section: valid session), so it also reduces the 240-of-252 count and the 60-session value median.

## Scope and labelling

- Development dates only: 2010-01-04 to 2017-12-31. The same cost scenarios and liquidity thresholds (Rs 1 crore primary; Rs 50 lakh and Rs 2 crore sensitivities) as v1.0.
- The five hypotheses, their parameters and their definitions are unchanged.
- The original v1.0 results are preserved unchanged and labelled **contaminated**.
- The rerun is labelled "sensitivity/research rerun following a post-result data-quality amendment. Not independent validation."
- Validation (2018–2021) and holdout (2022–2026) are not run or opened.

## Outputs required

- A contamination attribution report: H1 positions and signals affected; H1 windows crossing flags; per-stock contribution to H1 returns; specific attribution for VINEETLAB, KHADIM, PREMIERPOL and TIL; H1 results before and after; whether H5's spread persists under the same treatment; counts of observations, stocks and trading dates excluded.
- The "before" numbers are reproduced by the same runner with A2 switched off (logging only), and must match the v1.0 results.
