# A3: H1 position-level data-quality and return-concentration audit (2026-11-08)

Diagnostic audit only. Not a strategy change, not validation, and not a passing result. The A2 development rerun is preserved unchanged. H1–H5 definitions, parameters and A2 are unchanged. No validation was run and the holdout was not opened. Machine-readable audit: `web/.research-data/a3-h1-audit-2026-11-08/h1-position-audit.json`.

## 1. Reconciliation to A2

- Positions audited: **3028** (H1, primary Rs 1 crore, LOW costs, A2 applied).
- Rebalances: 93.
- Maximum absolute difference between recomputed and stored per-rebalance means: **2.8e-17** (exact).
- Mean portfolio net return: stored 2.145%, recomputed 2.145%.

## 2. Return concentration

Contribution of each position = its net return divided by the number of positions in its rebalance, summed over all positions.

| Measure | Share of total contribution |
|---|---|
| Top 5 positions | 4.89% |
| Top 10 positions | 8.0% |
| Top 20 positions | 15.2% |
| Top 50 positions | 32.69% |
| Top 5 stocks | 14.4% |
| Top 10 stocks | 24.94% |
| Top 20 stocks | 42.27% |
| Top 50 stocks | 78.66% |

Top stocks by contribution: AJANTPHARM 7.5%, GRAVITA 6.2%, WELSPUNLIV 5.7%, MARKSANS 4.7%, VAKRANGEE 4.6%, TTKPRESTIG 4.4%, SUVEN 4.4%, CEATLTD 4.2%, APLLTD 4.1%, JUBLFOOD 4.0%.

Top 50 positions (under 2% of the 3,028) carry about a third of the total, and the top 50 stocks carry about four-fifths. The result is concentrated.

## 3. Anomaly scan (flags are broad, not proof of error)

| Flag | Positions |
|---|---|
| Any close-to-close move between 15% and 20% in the lookback or holding window | 1814 |
| Corporate-action ex-date in the window | 4 |
| History starts more than 30 days after the master listing date | 1159 |
| Zero-volume session in the window | 40 |
| Any of the above | 2352 |

The 15–20% flag uses the full 252-session lookback, so it captures ordinary volatility in small stocks as well as suspect moves. It is an upper bound on suspicion, not a count of errors.

## 4. Exploratory sensitivity (diagnostic only; not a new threshold; not a replacement for A2)

Each row keeps the same eligibility and the same eligible-universe means, and drops the flagged positions.

| Exclusion | Rebalances | Mean spread | t |
|---|---|---|---|
| None (A2 result) | 93 | 1.232% | 3.43 |
| Drop 15–20% move positions | 93 | 0.997% | 2.35 |
| Drop corporate-action positions | 93 | 1.23% | 3.42 |
| Drop late-history positions | 93 | 1.291% | 3.26 |
| Drop zero-volume positions | 93 | 1.189% | 3.27 |
| Drop any flag | 93 | 1.172% | 2.38 |

The spread stays positive under every exclusion. Its t-statistic falls to about 2.4 when the 15–20% and any-flag positions are dropped. These tables are not used to choose a rule.

## 5. Verified, suspected and unresolved

**Verified**
- The A2 H1 positions reconcile exactly to the stored results.
- Concentration is high: the top 50 stocks carry about 79% of total contribution.
- Corporate-action ex-dates fall in the windows of only 4 positions.

**Suspected**
- Price discontinuities between 15% and 20%. Many are probably real, but this has not been tested against a second source, and none is available.
- Truncated or late-starting histories: 1,159 positions use stocks whose history begins more than 30 days after their master listing date.
- Survivorship bias, since the universe is today's listed set.

**Unresolved with available data**
- Whether the 15–20% moves are real. No second price source exists.
- Whether the late-history and ISIN-reuse cases refer to the same instrument. Vendor instrument mapping is not available.
- Survivorship effects. A point-in-time universe is not available.
- Adjustment status of unflagged moves. Only events in NSE's corporate-action file can be tested, and most are back-adjusted but not all.

## 6. Decision

The A2 H1 result is **not yet sufficiently credible to justify an independent research protocol.** The positive development result survives every exclusion in section 4, but its t-statistic falls to about 2.4 under the broadest exclusion, and about a third of its total contribution comes from 50 positions. The main unresolved risks, survivorship bias and unverifiable price moves, cannot be removed with the data available here.

A new protocol may be drafted, but it should not be run until a survivorship-free universe or a second independent price source is available. This audit does not claim the strategy is profitable or ready for validation.

## 7. Hash manifest

- h1-position-audit.json: `68cfd47c4b18ccd76f8438da3f50ac7473cf4365638425a77f58f7b59b7cba72`
