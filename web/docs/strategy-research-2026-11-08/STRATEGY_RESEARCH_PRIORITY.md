# Strategy research priority (2026-11-08)

Written for: the project owner. This is a research recommendation, not a trading recommendation. Nothing here changes the live recommendation engine.

## Executive recommendation
1. **Stock strategy to investigate first: S2 (time-series trend on Indian index series), conditional on verifying the six index series.** It is the most testable with the existing daily data once index coverage is confirmed. Its evidence base is weak for Indian indices, so it is exploratory.
2. **Stock strategy with the strongest published basis, but blocked by data: S1 (volatility-adjusted momentum).** Its official rules exist. Replication needs point-in-time index membership and a survivorship-free universe, which the project does not have. Do not start until those are sourced.
3. **Options strategy to investigate first: O3 covered call, at daily level, on the 2024-06 onward window, with an explicit fill-price assumption.** It has several published Indian studies and the most direct link to stock data already held. Its results will be an upper bound on realistic fills, because bid, ask and IV are unavailable.
4. **Options deferred: O1 bull call debit spread.** One secondary study on Nifty; no fills; the window is short and includes no sustained bear market.
5. **Options deprioritised: O2 bear put debit spread.** The only Indian evidence found is unfavourable. Not rejected outright; the evidence is one secondary summary.
6. **Deferred: protective collar.** No Indian evidence found; the US evidence is for the index benchmark, not the NSE product.
7. **Deferred: S3 (crash-risk regimes).** Needs the same data as S1 plus a verified breadth series.

## What should never enter the live recommendation engine yet
- Any candidate above. None is VERIFIED.
- Any option strategy valued with inferred IV or Greeks.
- Any momentum ranking built on a survivorship-biased universe.
- Anything derived from blog, forum or broker-education backtests.
- Any result from the 321 invalid futures OHLC rows.

## What data is missing
- Point-in-time Nifty 200 and Nifty 200 Momentum 30 membership.
- Survivorship-free equity history (delisted names).
- Verified series for NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY, SENSEX and BANKEX (not confirmed in this document).
- Option bid, ask or intraday quotes, and historical option chains with implied volatility.
- Option history before 2024-06-03.
- Verified lot-size history and option corporate-action handling.
- Resolved SEBI, STT, stamp and GST cost treatment.

Acquiring any of this would need separate approval and must not use paid providers or new NSE requests without that approval.

## What can be tested now with existing data
- Covered-call replication at daily level on 2024-06 onward stock and option prints, with an explicit fill assumption. Exploratory.
- Time-series trend on index series, only after the six index series are verified.

## Protocol decision
**No strategy protocol draft is produced.** The rules require that a candidate has sufficient evidence and suitable data. S2 has suitable data only after index verification, and its Indian evidence is weak. O3 has evidence but no fill data. A draft now would commit to a design the data cannot yet support. The first step is data verification, not registration.

## Next steps (in order)
1. Verify the six index daily series in the same way as the equity universe.
2. Read the full text of R3–R5 (official momentum methodology) and compare it line by line with the registered H1 definition. Record the difference in writing before any S1 work.
3. Read the full Misra and Dalmia (R9) and Aggarwal (R10) papers to confirm their sample, costs and definitions for O3.
4. Only after 1–3, decide whether any candidate justifies a protocol draft for review.

## Not done in this phase
- No backtest, return figure or performance claim has been produced.
- Several sources were checked from snippets only (see `STRATEGY_SOURCE_REGISTER.md`).
