# Stock V2 — Backtest Methodology

## Data
- Source: `.research-data/intraday-bars-historical/` (3,000 stock-session files, 60 sessions, 50 stocks, 375 one-minute bars each). Read-only.
- Loader rejects any file that is not `status: OK`, has the wrong symbol or date, has a malformed candle, or does not have exactly 375 candles. Nothing is repaired or filled.
- Chronological split: development = first 40 sessions (2026-08-06 to 2026-10-05); validation = last 20 (2026-10-06 to 2026-11-03), validation not run.
- Survivorship bias: the 50 stocks are one 2026-11-04 snapshot applied to all sessions. Not corrected.

## Causality
- Indicators at bar `i` use only bars up to and including `i`. The EMA is computed in chronological order over continuous minute bars.
- A signal is decided on bar `i`'s close. Entry is at the open of bar `i+1`, adverse-filled. The next bar must be exactly one minute later, or the signal is rejected.
- Stop and target checks start at bar `i+1`. On any bar that touches both, the stop is taken first.
- Square-off: no position is held at or after 15:15 IST. The time exit is at the close of the last bar before 15:15, adverse-filled.
- Entry window: signals from 09:30 up to, not including, 14:00.

## Execution and costs
- Entry slippage, stop slippage and time-exit slippage: adverse, by scenario (BASE 0.05%, CONSERVATIVE 0.10%, ADVERSE_SLIPPAGE 0.20%). Target fills have no slippage.
- Charges: brokerage (min of 0.03% and ₹20 per order), exchange 0.00297%, SEBI 0.0001%, STT 0.025% on the sell side, stamp duty 0.003% on the buy side, GST 18% on brokerage, exchange and SEBI charges. CONSERVATIVE multiplies all charges by 1.5.
- These are assumptions. Verify against the broker's current schedule before quoting any net figure.

## Sizing
- Risk 1% of capital per trade, capital ₹10 lakh (assumption). Quantity = min(risk-based quantity, capital ÷ entry price). No leverage; notional never exceeds capital.
- Reward-to-risk must be at least 1.5, measured from the planned entry fill to target and stop.

## Gate modes
- FULL: market state, event risk, VIX, NIFTY ATR and verified-stock count are all evaluated, and a missing input blocks the session. Not runnable on this dataset.
- CORE: no market gates are evaluated. Reported as CORE in every output. Results describe the Core Research variant only.

## Selection and independence
- Candidates and the selection rule are written before results are seen. The rule is applied once to development.
- The code hash is recorded in `development.json`. Validation refuses to run if the hash differs, and refuses to run twice.
- No parameter was tuned on validation sessions, and none has been run on them.

## Verification
- Unit tests: 50 Stock V2 tests across the indicator, signal, sizing, cost, execution, loader, split and selection code.
- Independent reimplementation in Python of EMA, VWAP, the TREND signal, stops, targets, exits and quantity: 38 of 38 RELIANCE development trades matched.

## Known limitations
- Stop fills carry slippage that is large relative to tight stops.
- Most signals fail the 1.5 reward-to-risk floor under the V1 stop and target method.
- No point-in-time constituents, no full-spec market gates, no bid/ask (so spread cost is not measured).
- The first 200 bars of the first session are EMA 200 warm-up. Holiday calendar provenance is the same as the options work.
