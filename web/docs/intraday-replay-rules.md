# Intraday stock strategy: historical replay rules

Status: **FROZEN 2026-10-24** (version `intraday-replay-1`). Written before any replay code or result existed.
Amended the same day, **before any replay result was produced or viewed**: periods, data validation, faithfulness notes.
A first download run was stopped before it computed anything.
This replay complements the forward evaluation `intraday-eval-1`. It does not replace it, and it does not change it.

## What is tested
The existing intraday stock scanner (Opportunity Engine v20.1, stock part) and the live paper-trade collector and
monitor, **exactly as they are**. Setup detection, score ≥ 30, R:R ≥ 1.0, stops and targets use the same code
(`detectIntradaySetup`, `buildTradePlan`). No rule, threshold or parameter is changed for, or after, the replay.

## Data
- Upstox 1-minute candles for today's NIFTY 50 stocks (survivorship bias acknowledged; it flatters results).
- Previous close comes from Upstox daily candles (the official close).
- Period: 2022-01-03 → 2026-10-23, every NSE session with data.

## Replay of one session (no look-ahead)
- At the close of each 1-minute bar from 09:15 to 14:29, the scanner sees, per stock, only data up to that bar:
  - day open = first bar's open
  - high and low so far
  - LTP = this bar's close
  - previous official close
  - cumulative volume
  - change %
- NIFTY change = the average change % of the constituents with data, if more than 10 (as live).
- Top 3 candidates by score, as live. A paper trade opens at that bar's close (= the LTP the live system would record).
  The collector rules are kept:
  - no second open position in the same stock
  - an identical setup (same entry, stop and target) is never re-entered
- **No new entries from 14:30 IST.**
- Live checks every 30 s; the replay checks every 1 min (coarser, documented).

## Periods (chronological, frozen before either is evaluated)
- **Development:** 2022-01-03 → 2024-12-31.
- **Validation:** 2025-01-01 → 2026-10-23, untouched.
- No strategy choices are made from either period: the strategy is the frozen live code. The two periods are reported
  separately. A conclusion needs both periods to agree, or it is INCONCLUSIVE.

## Data validation (applied before replay; every exclusion is counted)
- Bars must have an IST (+05:30) timestamp inside 09:15–15:29. Bars outside that window are dropped and counted.
- Duplicate minutes: the first bar is kept and duplicates are counted. Out-of-order bars are sorted and counted.
- **Excluded stock-days**, each counted by reason:
  - any bar with a non-positive price or high < max(open, close) or low > min(open, close)
  - fewer than 300 of the 375 bars (no prices are filled in)
  - no previous official close
- **Corporate-action guard:** a stock-day whose first open differs from the previous official close by more than ±25%
  (split, bonus or demerger in unadjusted data) is excluded.
- A session is replayed only if more than 10 stocks have valid data (the live NIFTY-proxy requirement).
- Coverage is measured and reported per stock and per year.

## Faithfulness to the live system
| Live input / rule | Replay | Faithful? |
|---|---|---|
| LTP, day open, high and low so far, previous close, change % | Rebuilt from 1-min bars + daily close | Yes; the official open is approximated by the first bar's open |
| NIFTY change (mean constituent change %, more than 10 stocks) | Same function | Yes |
| Volume | Cumulative bar volume | Yes. Volume only feeds the explanation text, not the score |
| Score ≥ 30, R:R ≥ 1.0, setup, stops and targets | Same function `scoreIntradayQuote` | Yes |
| Top 3 per scan; one open position per stock; identical setup never re-entered | Same; the identity key (stock, direction, setup, entry, stop, target 1) spans the whole replay, as live | Yes |
| Stop on the wrong side of entry rejected | Same | Yes |
| Polling every 30 s | Every 1 min | Coarser |
| Exits on the 30 s LTP | Bar open, high and low, stop first | Approximate, conservative |
| Bid/ask spread, queue, partial fills | Not available | Covered only by the 0.05% slippage |
| Confidence / grade | Not used by the live collector | Not needed |

## Survivorship bias
- The universe is **today's** NIFTY 50.
- Stocks that left the index or stopped existing (for example HDFC Ltd, merged into HDFC Bank in 2023) are missing.
- Stocks that joined later are included before they were index members.
- Upstox does not provide historical index membership, so the bias cannot be removed. It can only be described: the
  report lists each stock's first available date.

## Exits (from the next bar onward)
Checked in this order on each bar. Stop first is conservative when one bar touches both stop and target.
| Bar condition (long; mirrored for short) | Exit |
|---|---|
| Open beyond the stop (gap) | Bar open |
| Low touches the stop | Stop price |
| Open beyond target 2 / target 1 | Bar open |
| High touches target 2 | Target 2 |
| High touches target 1 | Target 1 (whole position, as live) |
| Still open after the 15:29 bar | 15:29 bar close (end-of-day exit, as live) |

## Costs, statistics and verdicts
- Same cost model as `intraday-eval-1`: ₹1,00,000 notional, 0.05% slippage per side, Upstox intraday charges
  (estimate). Net R is computed by the same code (`netTrade`).
- Same statistics and gates (`groupStats`), reported for combined, long and short:
  - session-clustered 95% interval (≥ 10 sessions)
  - mean net R and profit factor
  - drawdown limit 20R, with 150-trade and POSITIVE / NEGATIVE / INCONCLUSIVE gates
- Also reported, for information only: results by year, and gross R before costs.

## Interpretation
- POSITIVE here does not promote the strategy. The forward evaluation must agree.
- NEGATIVE here means the strategy is not deployed, and the forward run continues only as confirmation.
- No re-runs with changed rules under this version. A changed rule is `intraday-replay-2` and must be justified in
  advance, not by these results.

## Result (recorded 2026-10-24, not to be revised)
**NEGATIVE in both periods, for long, short and combined.**

| Period | Trades / sessions | Mean net R | 95% interval (session bootstrap) | Profit factor | Gross mean R |
|---|---|---|---|---|---|
| Development 2022-01-03 → 2024-12-31 | 17,670 / 738 | −0.119 | −0.133 to −0.105 | 0.69 | +0.005 |
| Validation 2025-01-01 → 2026-10-23 | 9,880 / 448 | −0.109 | −0.130 to −0.091 | 0.69 | +0.012 |

The strategy has no gross edge (≈ 0R before costs), and costs of ≈ 0.12R per trade make every year negative.
Record: `.data/intraday-replay/RESULT_intraday-replay-1.json`.
