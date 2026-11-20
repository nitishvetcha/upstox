# Historical strategy research — 2026-11-20

## Decision

No stock or options strategy is promoted to validated status. The live recommendation gates remain unchanged.

## Stock intraday development run

Dataset: 60 complete one-minute sessions for 50 stocks. The chronological protocol uses the first 40 sessions for development and reserves the following 20 for validation. Flat zero-volume closing placeholders are excluded before indicator calculation. Entries occur at the next minute open, costs and adverse slippage are included, and each stock can create at most one trade per session.

Selection rule: at least 100 base-scenario development trades and positive expectancy under conservative costs. Only a selected candidate may enter the validation phase.

| Candidate | Scenario | Trades | Win rate | Profit factor | Expectancy |
|---|---:|---:|---:|---:|---:|
| Trend Reclaim | Base | 1,857 | 36.46% | 0.612 | -0.232R |
| Trend Reclaim | Conservative | 1,788 | 30.59% | 0.410 | -0.388R |
| Pullback Reclaim | Base | 1,763 | 35.00% | 0.552 | -0.262R |
| Pullback Reclaim | Conservative | 1,645 | 30.15% | 0.397 | -0.389R |
| ORB Continuation | Base | 93 | 36.56% | 0.491 | -0.222R |
| ORB Continuation | Conservative | 19 | 26.32% | 0.253 | -0.420R |

Result: all three candidates fail. ORB Continuation fails both the minimum sample and profitability requirements. Validation was not run.

Output: `.research-data/stock-v3-historical-2026-11-20/development.json`.

## Positional stocks

The existing 2022–2024 development replay contains 86 trades. It meets the trade-count, profit-factor and drawdown gates but does not beat NIFTY. It remains retired/watch-only. The result also carries survivorship-bias and approximate-cost caveats.

## Options historical evidence

The local pilot has 4,859 candles across 52 legs in short 14-day windows. This is useful for descriptive path inspection, but it cannot validate the live options recommendation engine because it lacks:

- historical executable bid and ask prices;
- synchronized full-chain OI snapshots;
- observed timestamped Greeks and IV;
- sufficient completed expiry cycles;
- a clean frozen holdout with adequate multi-regime coverage.

Any options replay using these candles must be labelled exploratory. It must not produce a validated profitability claim or change live recommendation grades.

## Product policy

- Stock V1, Stock V2 and ORB Continuation remain watch-only/rejected research.
- Grade C and REJECT cannot become Best Available Now.
- Historical evidence is displayed separately from live recommendation status.
- `NO TRADE` is the correct output when no Grade A+, A or B candidate passes current gates.
- Broker order automation remains disabled.
