# Historical acquisition — offline feasibility audit (2026-11-13)

**Route status: CLOSED — INFEASIBLE FOR FAITHFUL STRATEGY 11.4 VALIDATION.** This historical-candle route is closed. Its request budget is no longer being investigated. A faithful backtest would need a separate data-source feasibility assessment (quotes, full-chain OI, volume-based VWAP inputs, and Greeks, or the raw data to calculate them under an explicitly approved methodology). That assessment is not started. No API call, token operation or acquisition was made.

**Recommendation (superseded): BLOCKED.** Acquisition planning should not proceed until the blockers in section 6 are resolved. No API call, token operation or acquisition was made for this audit. Strategy 11.4, its formulas and the 1% risk limit are unchanged. Engine NO-GO.

## 1. Listing and first-trade dates

**Not available in local data.**
- The contract-list response (`.research-data/rate-limit-test/34.body`) has these fields only: name, segment, exchange, expiry, weekly, instrument key, exchange token, trading symbol, tick size, lot size, instrument type, freeze quantity, underlying key and type, underlying symbol, strike price, minimum lot. No listing or first-trade date.
- `.data/instruments/` holds only `NSE_EQ.json` (equities).
- Corporate-action files under `.research-data/nse-bhavcopy-2026-11-06/` cover equities, not option contracts.
- Probe windows were fixed at 14 days ending on expiry. They do not reveal when a contract started trading.

## 2. Contract-life distribution

**Cannot be established from existing evidence.** Without listing or first-trade dates, the life of any contract is unknown. The earlier scenarios (A 15,274, B 29,848, C 44,422) are assumptions, not measured distributions.

## 3. Request budget

- **No verified maximum exists.** The 44,422 figure in the earlier revision was a scenario, not a bound.
- Base estimate for one 14-day window per contract: 15,274. Valid only if all contracts live 14 days or less, which is unverified.
- Each extra window per contract adds 14,574 requests. The count per contract is set by the unknown life, so no bound can be stated.
- Bars-per-request cap: observed about 159 bars for 30-minute windows of 30 days or longer. Mechanism not confirmed. 1-minute returned 3,602 bars in one request, so the cap may depend on interval.

## 4. Strategy 11.4: data it requires (read from the frozen engine code)

| Input | Where used | Source needed | Supported by historical candles? |
|---|---|---|---|
| Daily ATR | Spread width and exit move (`strategy.ts` lines 17–19, 59–61) | Daily index candles | Yes, from daily candles of the index (not yet acquired) |
| Spot price | Strike selection, all calculations | Index candles | Yes, at the timestamp |
| EMA 9, 21, 50, 200 | Trend factor (`analysis.ts` lines 24–31) | Intraday candles, long history | Partly. EMA 200 needs far more history than one 14-day window. |
| VWAP | Vwap factor (`analysis.ts` lines 97–103) | Index candles with volume | **No.** Index candles carry no volume in this data. Futures VWAP would need futures candles, which were not requested. |
| Option-chain OI and change in OI | OI factor (`analysis.ts` lines 35–64) | Full chain at each timestamp (all strikes) | Partly. Per-contract OI series exist for sampled contracts only. A full chain at each timestamp needs every strike, which was not sampled. |
| Bid and ask, with a 5% spread filter | Entry filter (`strategy.ts` lines 9, 159–161) | Quotes | **No.** Candles contain no quote data. |
| Option LTP | Premium and exits | Option candles | Yes |
| Delta | Exit move (`strategy.ts` line 61) | Greeks | **No.** Not in historical candles. A pricing model would be a modelling assumption and must be labelled as such. |

**Interval requirement.** The engine's technical timeframe defaults to 15 minutes (`candles.ts` line 7). Daily candles supply the ATM. The project's own historical chunk limits (`historicalCandles.ts` line 11) are 28 days for 15-minute and 3,000 days for daily. Those limits belong to a different endpoint and are not verified for the expired endpoint.

## 5. Are 30-minute candles sufficient?

**No, not for Strategy 11.4 as specified.**
- The engine's technical timeframe is 15 minutes. 30-minute bars would need a re-specification, which would change the strategy. Not permitted.
- The bid-ask filter, the VWAP factor, delta and full-chain OI cannot be reproduced from candles at any interval. These are structural gaps, not interval gaps.
- A 1-minute series would not close these gaps, and its request budget and storage are much larger (see the acquisition plan, section 14.7).

**Conclusion:** a faithful Strategy 11.4 backtest cannot be built from the historical endpoint. Acquisition would only give research data for market-structure analysis, which is already covered by the pilot.

## 6. Blockers

1. **No contract listing or first-trade dates.** The budget cannot be computed.
2. **Strategy 11.4 requires bid/ask, VWAP and delta, which the historical endpoint cannot provide.** A backtest of 11.4 as specified is not feasible. Any substitute would change the strategy and needs the owner's decision under the governance rules.
3. **Index VWAP is unavailable** from index candles without volume.
4. **EMA 200 needs a longer intraday history** than one 14-day window per contract provides.
5. **Pricing not established.** The Upstox documentation was not checked for per-request cost.
6. **Endpoint limits not confirmed.** The 159-bar figure's mechanism is unknown. The rate limit is unknown. Five-second pacing is the tested reference. Faster pacing is not assumed to be safe.
7. **Data gaps.** The 2024 oldest-expiry legs are empty for four indices. OI is zero on many 2024 bars. Partial and special sessions (2026-10-28, 2026-10-29, 2026-11-08) need rules.

## 7. Duration at the tested reference pacing (five seconds)

For scenario A (15,274 requests, unverified): about 21 hours. Scenario B (29,848): about 42 hours. These are scenarios only. The true figure depends on the unknown contract life.

## 8. Governance

- Strategy 11.4, its formulas, stop-loss and target rules, spread-width rules and the 1% risk limit are unchanged.
- The compromised holdouts remain excluded from independent validation. Any data acquired is research data, not holdout evidence.
- No holdout period has been selected. The owner must select and freeze one before any validation.
- Production remains NO-GO.

## 9. Decision requested from the owner

The audit does not support proceeding to acquisition planning as currently scoped. Options:
1. **Accept BLOCKED** for a faithful Strategy 11.4 backtest on historical candles. Keep acquisition for market-structure research only, if you want it, with a new budget once listing dates are sourced.
2. **Source contract listing data** from an official exchange contract master (outside this audit). This unblocks the budget.
3. **Decide the bid-ask, VWAP and delta question.** Any proxy changes the strategy and is not permitted under the current frozen specification without a governance decision.
