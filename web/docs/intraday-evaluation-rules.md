# Intraday stock strategy: Phase 2 evaluation rules

Status: **FROZEN 2026-10-23** (version `intraday-eval-1`). Approved in principle by the project owner. Written before any
trade in the evaluation window existed. Changing a rule creates `intraday-eval-2` with a new start date. Trades
collected under eval-1 must not be re-scored under eval-2 and presented as validation.

Implementation: `src/lib/intradayEvaluation.ts` (calculation), `scripts/intraday-evaluation.ts` (report),
`src/lib/services/liveOpportunityCollector.ts` (14:30 cutoff), `scripts/paper-live.mjs` (readiness log).

## Scope
- The existing intraday stock scanner (Opportunity Engine v20.1, stock part). Its setup rules, thresholds, stops,
  targets and confidence scoring are **not changed** during the evaluation.
- Options stay disabled wherever option data fails freshness checks.
- Paper trading only. No real orders.

## Evaluation window and eligible trades
- Window starts **2026-10-26 (IST)**, the first session after the rules were frozen. Earlier trades (15–23 Oct) are
  reported as **reference only**: they include late starts and entries made after 14:30.
- Eligible: genuine live-collector (`provenance = LIVE_COLLECTOR`) stock paper trades, completed, with a verified exit
  price. Excluded trades are counted by reason (fixture/legacy, before start, still open, no verified exit price).

## Execution rules
- **No new entries at or after 14:30 IST.** Monitoring and exits continue.
- Entries need live quotes. The collector's existing LIVE-only checks are unchanged.
- Entry and exit prices are the recorded paper prices. Costs and slippage are applied in the evaluation (below).

## Cost model (estimate; check it against an Upstox contract note before relying on it)
- Each trade is valued at a ₹1,00,000 notional: qty = floor(100000 / entry), at least 1.
- **Slippage:** 0.05% per side, against the trade.
- **Brokerage:** ₹20 or 0.1% of order value per order, whichever is lower.
- **STT:** 0.025% on the sell order.
- **Exchange charge:** 0.00297% per order.
- **SEBI fee:** 0.0001% per order.
- **Stamp duty:** 0.003% on the buy order.
- **GST:** 18% on brokerage + exchange charge + SEBI fee.
- Net R = (₹ P&L after slippage − ₹ charges) ÷ (original risk per unit × qty). Costs are converted to R with each
  trade's own stop distance, so a tighter stop costs more R.

## Benchmark and reporting
- **Benchmark:** 0R net per completed trade, i.e. staying in cash.
- Reported for **combined, long and short** separately:
  - trades and distinct sessions
  - mean net R, with a 95% interval
  - profit factor (net R)
  - win rate
  - cumulative R and max drawdown (R)
  - average cost in R
- **95% interval:** a bootstrap that resamples whole sessions, because same-day trades are correlated (2,000 resamples, fixed seed).
  It is reported only when there are **≥ 10 sessions**.
- Each session's runner readiness is listed: scheduled vs actual start, auth status, first collection, and whether the opening window was missed.

## Decision gates (applied to combined, long and short separately)
| Verdict | Condition |
|---|---|
| NEGATIVE | Max drawdown > 20R at any time, **or** (≥ 10 sessions and the 95% upper bound < 0). Can be reached before 150 trades. |
| INSUFFICIENT_SAMPLE | Fewer than 150 eligible trades (and not NEGATIVE) |
| POSITIVE | ≥ 150 trades, mean net R > 0, 95% lower bound > 0, profit factor ≥ 1.2, max drawdown ≤ 20R |
| INCONCLUSIVE | Anything else. Continue under the same rules, or retire. No tuning against this sample |

- A POSITIVE verdict only makes the strategy a candidate for further observation. It is not proof of a lasting edge.
- Safety and data-quality failures are reviewed continuously. Strategy rules are never tuned on interim P&L.

## Operations prerequisite
- The runner is scheduled for 09:10 IST, but the Mac mini sleeps (sleep = 1 min) and has no wake schedule. Every
  session so far started late (09:28–11:39 IST).
- Proposed fix, to be run by the owner: `sudo pmset repeat wakeorpoweron MTWRF 09:05:00`.
- Verify the actual starts in `.data/runner-health.jsonl` over several sessions. Sessions that miss the opening window are
  flagged in every report.
