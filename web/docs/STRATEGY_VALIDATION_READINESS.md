# Strategy validation readiness

Status: NOT READY for validation.

Verified:
- Indicator functions (EMA, RSI, ATR, MACD) match hand-derived references.
- Backtest code executes and labels its inputs as MOCK-source. Display labels are corrected; calculations are unchanged.
- Descriptive historical pilot exists (4,859 bars, 52 legs, 14-day windows).

Not possible with current data:
- Historical bid/ask, so entry and exit costs cannot be realistic.
- Full-chain OI and observed Greeks at historical timestamps.
- Index VWAP (index candles carry no volume); futures volume not acquired.
- Full-history coverage (only 14-day windows).

Governance blockers:
- No holdout frozen. The earlier holdouts (2022 onward, after 2025-07-01) are compromised.
- No out-of-sample test can be defined until the holdout is frozen.

Therefore: the strategy must be described as unvalidated. Backtests that run are exploratory only.

Next steps (all need data or owner decisions): obtain provider data, choose and freeze a holdout, define in-sample and out-of-sample periods, then run sensitivity tests.
