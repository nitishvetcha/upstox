# A2 contamination attribution and development rerun (2026-11-08)

Labelled: **sensitivity/research rerun following a post-result data-quality amendment. Not independent validation.** The v1.0 development results are preserved unchanged and labelled **contaminated**. Validation and holdout were not run. The five hypotheses and their parameters are unchanged. Costs are provisional.

Outputs (SHA-256, registered in `REGISTRY_v1.0.json`):
- before (A2 off, reproduces v1.0): `results.json` in `.research-data/crosssectional-dev-A2-before-2026-11-08/`
- after (A2 on): `results.json` and `positions-and-exclusions.json` in `.research-data/crosssectional-dev-A2-after-2026-11-08/`
- Sanity check: the before run reproduces the v1.0 H1 primary LOW result exactly (1.493%, t 3.86, 93 rebalances).

## Exclusion counts (A2)

- Flagged stock-days (absolute close-to-close move above 20%): **4,369**
- Stocks affected: **971**
- Trading dates affected: **2,449**
- Signal lookbacks excluded (name removed from ranking): **14,120**
- Holding windows excluded (position removed): **282**
- Index (NIFTY) flags: 0. H4 unaffected by index flags.
- Second-source confirmations: none available. All flagged observations are excluded.

## H1 and H2: before and after A2 (development, Rs 1 crore unless stated)

| Run | Before (v1.0 contaminated): spread, t, port net, cum, maxDD, null pct, skipped names | After A2 |
|---|---|---|
| H1_primary_LOW | 1.493% | t 3.86 | port 2.379% | cum 569% | maxDD -26.8% | null pct 65.2 | skipped names 0 | 1.232% | t 3.43 | port 2.145% | cum 458% | maxDD -23.0% | null pct 64.6 | skipped names 15 |
| H1_primary_HIGH | 1.489% | t 3.86 | port 2.068% | cum 404% | maxDD -30.7% | null pct 65.2 | skipped names 0 | 1.228% | t 3.43 | port 1.835% | cum 320% | maxDD -26.1% | null pct 64.6 | skipped names 15 |
| H1_sens_50L_HIGH | 1.578% | t 4.45 | port 2.264% | cum 511% | maxDD -28.5% | null pct 67.7 | skipped names 1 | 1.437% | t 4.29 | port 2.149% | cum 461% | maxDD -26.2% | null pct 67.6 | skipped names 17 |
| H1_sens_2Cr_HIGH | 1.249% | t 3.20 | port 1.652% | cum 240% | maxDD -29.5% | null pct 62.8 | skipped names 0 | 0.992% | t 2.54 | port 1.421% | cum 178% | maxDD -32.3% | null pct 62.2 | skipped names 10 |
| H2_primary_LOW | -0.004% | t -0.05 | port -0.155% | cum -62% | maxDD -79.2% | null pct 48.3 | skipped names 0 | -0.007% | t -0.08 | port -0.156% | cum -62% | maxDD -77.4% | null pct 48.3 | skipped names 33 |
| H2_primary_HIGH | -0.004% | t -0.05 | port -0.459% | cum -89% | maxDD -90.8% | null pct 48.3 | skipped names 0 | -0.007% | t -0.08 | port -0.460% | cum -88% | maxDD -90.4% | null pct 48.3 | skipped names 33 |
| H2_sens_50L_HIGH | 0.026% | t 0.29 | port -0.396% | cum -85% | maxDD -87.8% | null pct 48.3 | skipped names 1 | 0.045% | t 0.53 | port -0.373% | cum -84% | maxDD -86.2% | null pct 48.5 | skipped names 43 |
| H2_sens_2Cr_HIGH | 0.038% | t 0.40 | port -0.447% | cum -88% | maxDD -90.1% | null pct 49.3 | skipped names 0 | 0.023% | t 0.25 | port -0.460% | cum -88% | maxDD -90.1% | null pct 49.1 | skipped names 24 |

## H1 attribution (primary LOW, before run, 3,223 positions)

- Positions with a flagged observation in the lookback or holding window: **437 (13.6%)**.
- Mean net return: all positions 2.82%; flagged-window positions 3.77%; clean positions 2.68%.
- Summed net return: flagged 16.5 of 91.0 total (18%); clean 74.5.
- **Largest single contributor: SAKUMA**, with 8.34 summed net return from two positions. Its position entered on 2017-11-01 and was held through 2017-11-30, crossing the **+850% move on 2017-11-14**, a flagged observation. That single position returned +795% gross. Excluded under A2.
- Other top contributors (clean, unflagged) include GRAVITA, RUSHIL, TTKPRESTIG, MARKSANS, HSCL, VIPIND and EVEREADY, each with about 1.5 to 2.0 summed return over 14 to 24 positions.

**Specific stocks named in the request:**
- **VINEETLAB, KHADIM, PREMIERPOL and TIL: zero H1 positions** in the before run. They do not enter the top decile on any rebalance date, so they contribute nothing directly to H1 returns. Their artefacts are still present in the data and were flagged under A2.
- Their effect on H5 (liquidity) is not separated here. Their liquidity classification remains subject to the same artefact exclusions.

## H1 result after A2

The spread falls from 1.49% to 1.23% per rebalance (t 3.43). The result remains large and positive. The artefact exclusion therefore explains roughly one-sixth of the spread. **It does not remove the H1 result**, and the clean-position mean (2.68%) remains high. Residual contamination is still possible from moves of 15% to 20%, which A2 does not flag, and from survivorship bias (today's listed set).

## H5 after A2

H5 Q5 minus Q1 is -0.99% (primary) against -1.07% before. **The negative liquidity spread persists** under the same treatment, so it is not explained by the flagged observations alone.

## H3 and H4 after A2 (predictive, gross)

- H3 breadth HIGH 1.16% against LOW 1.67% (before: 1.23% and 1.63%). Persists.
- H4 volatility HIGH 0.85% against LOW 1.71% (before: 0.85% and 1.76%). Persists.

## Failures and limits

- No dates skipped at the primary threshold. Names skipped after A2: 15 (H1 primary LOW), 33 (H2 primary LOW).
- The exclusion rule is a conservative research choice, not proof that the flagged moves are wrong. Some flagged moves may be real.
- Survivorship bias remains. Residual artefacts below the 20% threshold may remain.
- Nothing has been validated. Nothing here is evidence of profitability.

## Decision needed

H1 remains large after A2, so the artefact rule does not by itself make the result credible. Before any validation, the following would need registration and approval: (a) a survivorship-free universe, which is not available; (b) a lower or tiered artefact threshold, registered in advance; (c) a per-position audit of H1 holdings. No further change has been made.
