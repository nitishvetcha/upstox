# Positional v2: pre-registered hypothesis

Status: **FROZEN 2026-10-23 (approved with clarifications). Written before any v2 code or result existed.**
Once approved, these rules are frozen. Any change after the development results are seen needs a new version
number. Any change after the validation results are seen makes the validation period development data.

## Hypothesis

v1 lost money for two reasons: it had no gross edge (+0.009R per trade), and it traded so often (627 trades) that costs took about 0.08R per trade.
A **slower trend-following rule with a market filter** should trade far less often, so costs matter less. It should also only
hold stocks while their long-term trend is intact.

## Rules

| | Rule |
|---|---|
| Universe | Current NIFTY 50 (same as v1; survivorship bias acknowledged and flatters results) |
| Data | Upstox daily candles. Bars after a split, bonus or demerger use the v1 corporate-action guard |
| Evaluation day | **Weekly**, on the last trading day of each week, using that day's close only |
| Market filter | New entries only when NIFTY close > NIFTY 200-day simple average |
| Stock entry | Close > 200-day average **and** 50-day > 200-day average **and** close is the highest close of the last 100 sessions |
| Ranking | Eligible stocks ranked by 126-session (≈6-month) return, highest first |
| Execution | Next session's open + 0.05% slippage |
| Positions | Max 5; each sized at 1/5 of marked-to-market equity; no adding to positions |
| Initial stop | Entry − 3 × ATR(20) |
| Trailing stop | Highest close since entry − 3 × ATR(20), checked at each daily close; exit at the next open. Gap below the stop exits at the open |
| Time limit | None (the trend decides) |
| Costs | Same delivery cost model as v1 (STT 0.1% each side, stamp, exchange, SEBI, GST, ₹20 brokerage, ₹18.5 DP) |
| Benchmark | NIFTY 50 price index, buy and hold, same dates |

## Frozen implementation details

**Weekly signal and execution**
1. Signal date = the last NIFTY trading day of each calendar week (Mon–Sun).
2. On that date, use only completed daily candles up to and including it: NIFTY 200-day SMA, stock 50/200-day SMA,
   100-session highest close (including that day), 126-session return, ATR(20) (Wilder).
3. Rank eligible stocks by 126-session return and keep enough to fill **vacant** slots.
4. Fill at the next trading session's open + 0.05% slippage, plus costs. A stock with no candle on that session is skipped.

**Stops** (all evaluated on completed daily closes)
- Initial stop = fill price − 3 × ATR(20) as of the signal date.
- Each daily close: candidate = highest close since entry (including today) − 3 × ATR(20) as of today.
  Stop = max(previous stop, candidate). The stop never moves down.
- If a close is below the stop, exit at the **next session's open** (whatever it is, gaps included) − 0.05% slippage.
  Intraday lows do not trigger exits.
- Corporate action (an overnight move of more than ±25%) on a held stock: exit at the previous session's close, marked
  `CORP_ACTION` (the unadjusted price cannot be traded through honestly). For signals, a stock needs ≥200 clean
  bars after its last corporate action.

**Portfolio**
- Max 5 holdings. Holdings are kept until their stop exits them; **no replacement** by better-ranked candidates.
- Each new position = floor((marked-to-market equity at the previous close ÷ 5) ÷ fill price) shares, capped by cash.
  If fewer than 5 qualify, the unused slots stay in cash (no reallocation, no leverage).

**Accounting**
- Trade = one completed position (entry to exit). A position still open on the last day of a period is closed at that
  day's close (− slippage, + costs), marked `END`, and counted.
- Profit factor = Σ positive net ₹ trade P&L ÷ |Σ negative net ₹ trade P&L|; no losses → reported as null (undefined).
- Drawdown = largest peak-to-trough fall of daily marked-to-market equity at the close; same calculation for NIFTY.
- Dividends excluded on both sides (as in v1, for comparability). This understates both returns.
- Universe: today's NIFTY 50 for the whole history. Point-in-time constituents are not available to this system;
  survivorship bias is acknowledged and makes results optimistic.
- The development run receives **no candles after 2024-12-31**, so it cannot see the validation period.

## Periods

- **Warm-up:** candles from 2021 onward, used only to compute the 200-day averages; no trades.
- **Development:** 2022-01-01 → 2024-12-31.
- **Validation:** 2025-01-01 → 2026-10-22. Run **once**, with rules unchanged.

## Pass criteria (set before any result is seen)

| | Development | Validation |
|---|---|---|
| Net return (after costs) | > NIFTY over the same period | > 0 |
| Profit factor (₹, net) | ≥ 1.2 | ≥ 1.0 |
| Max drawdown | ≤ 1.5 × NIFTY's | ≤ 1.5 × NIFTY's |
| Trade count | ≥ 30 | reported (expected to be small) |

Failing development means v2 is rejected and validation is not run.
Passing both means v2 becomes a **paper-trading observation candidate**. That is not evidence of future profitability.

## Result (recorded, not to be revised)

**Development run 2026-10-23 — FAILED.** 2022-01-03 → 2024-12-31: v2 +14.71% vs NIFTY +34.15%; max drawdown
20.39% vs 16.47%; profit factor 1.21; 86 completed trades; costs ₹43,158. Gate failed: does not beat NIFTY.
Per the frozen rules, v2 is rejected and the validation period was **not** run (it remains untouched).
Record: `.data/positional-v2/DEVELOPMENT_result.json`.
