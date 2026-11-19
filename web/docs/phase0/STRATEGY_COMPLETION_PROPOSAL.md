# Strategy completion proposal (Phase C)

**Status: PROPOSAL ONLY.** No strategy rule, formula or parameter has been changed. Strategy 11.4 remains frozen. Material changes need owner approval before implementation. Model-derived Greeks are labelled **MODELLED** and are for research only. They must not be silently substituted into Strategy 11.4. Production NO-GO. The 1% risk limit is unchanged.

Reference points: `src/lib/engine/strategy.ts` (width, exits, entry filters), `src/lib/engine/analysis.ts` (factors), `src/lib/services/technicalAnalysis.ts` (indicators; EMA, RSI, MACD and ATR reference-tested in Phase D).

## 1. Input-by-input assessment

For each input: the existing rule, the problem, the proposal, the data needed, the formula and the validation.

### 1.1 Bid/ask spread filter

- **Existing rule:** reject if `(ask − bid) / ltp × 100 > 5` (`strategy.ts` line 160–161).
- **Problem:** historical candles carry no quotes. The filter cannot run on history. Live use is valid only with real quotes.
- **Proposal (keep the rule, change its evidence):** keep the 5% test for live decisions. For research, use a **MODELLED** spread proxy only if the owner approves it, labelled as a proxy: `spread_proxy = k × ltp`, with `k` taken from observed live quotes.
- **Data needed:** live bid/ask (available now from V3 quotes, five levels); historical quotes from a provider (unconfirmed; see the feasibility report).
- **Validation:** compare the proxy with observed live spreads on the same contracts before using it.

### 1.2 VWAP factor

- **Existing rule:** futures price vs futures VWAP; mock uses spot VWAP (`analysis.ts` lines 97–103).
- **Problem:** index candles carry no volume, so index VWAP is undefined. Futures VWAP needs futures candles with volume, which were not acquired.
- **Proposal:** use the session VWAP on futures only, as already implemented in `vwap()` (`technicalAnalysis.ts`), which returns null when volume is missing. Mark the factor UNAVAILABLE when futures volume is missing. Do not substitute spot VWAP.
- **Formula:** `VWAP = Σ(typical_price_i × volume_i) / Σ volume_i`, where `typical_price_i = (high_i + low_i + close_i) / 3`, over the session's candles only.
- **Data needed:** futures 15-minute candles with volume for each index. Source not yet confirmed.
- **Validation:** unit test against hand-computed VWAP; coverage report showing the fraction of sessions with futures volume.

### 1.3 Delta and the expected premium move

- **Existing rule:** expected premium move `move = |delta| × ATR` (`strategy.ts` lines 59–61). Delta is taken from the option chain (live) and is not available historically.
- **Problem:** the premium-move rule depends on delta, which history does not provide. A first-order approximation ignores gamma and vega, which earlier research found material.
- **Proposal A (keep, live only):** use observed delta from the live chain.
- **Proposal B (research only, MODELLED):** Black-Scholes delta for a European index option, with explicit inputs.
  - `d1 = [ln(S/K) + (r + σ²/2)·T] / (σ·√T)`, `d2 = d1 − σ·√T`
  - `Δ_call = N(d1)`, `Δ_put = N(d1) − 1`
  - Inputs and sources: `S` = underlying close at the timestamp; `K` = listed strike; `T` = (expiry − timestamp) in years on a 365-day basis; `r` = a stated risk-free rate (assumption, to be set and sensitivity-tested); `σ` = implied volatility from the option's own close price, solved numerically (assumption, method to be stated).
- **Assumptions to test:** sensitivity of Δ to `r` (±1 percentage point) and to `σ` (±10%).
- **Validation:** compare MODELLED delta with observed delta on live chains for the same contracts before any use.

### 1.4 Full-chain OI and change in OI

- **Existing rule:** call and put change in OI summed across strikes give the OI factor (`analysis.ts` lines 35–64).
- **Problem:** historically we have OI per sampled contract, not the full chain at each timestamp. Full-chain OI for every strike is unavailable from the historical endpoint.
- **Proposal:** keep the factor for live use. For history, mark it UNAVAILABLE, not neutral. The OI factor must not contribute a direction when its inputs are missing (the current code already returns neutral with a note; the proposal is to report UNAVAILABLE so the trade gate can see it).
- **Formula (live):** `PCR_OI = Σ put_OI / Σ call_OI`. `ΔOI_net = Σ put_chgOI − Σ call_chgOI`.
- **Data needed:** live full chain (available); historical full chain (not available from the current endpoint).

### 1.5 Spread-width rule

- **Existing rule:** `width = ceil(ATR_daily / step) × step` (`strategy.ts` lines 17–19).
- **Assessment:** arithmetic is correct. The width scales with daily ATR, which is a reasonable volatility measure. Its suitability depends on the risk budget and the 1% limit, and the historical feasibility work found no width that fits the ₹1 lakh budget at the stated costs. That finding stands; this proposal does not change the width rule.
- **Proposal:** no change at this stage. Validate on live data only after the data gaps close.

### 1.6 15-minute timeframe

- **Existing:** technicals use 15-minute candles (`candles.ts` line 7).
- **Assessment:** 15-minute bars are available from the existing Upstox candle endpoint for live use and for historical underlying candles. Historical expired-option candles at 15 minutes are available (1-minute, 5-minute, 15-minute and day were observed in the rate-limit test). The timeframe is feasible. The EMA 200 on 15-minute bars needs about 200 bars plus warm-up, which means several weeks of history per underlying. That requirement is achievable with the existing underlying endpoint, which must be checked for depth.
- **Proposal:** keep 15 minutes. Confirm underlying depth for EMA 200 warm-up before any backtest.

### 1.7 Entry and exit feasibility

- **Existing exits:** stop at `0.5 × debit`, targets at `debit + 0.5 × maxProfit` and `debit + 0.8 × maxProfit` (`strategy.ts` debit spread logic).
- **Problem:** the stop and target use the debit and max profit, which depend on the premiums at entry. Those premiums need quotes; the historical candles give traded prices, not executable prices.
- **Proposal:** keep the formulas unchanged. For research, express fills as **trade-price based** and label them as such. Executable prices require live quotes.
- **Validation:** replay on live data during a supervised session only after approval.

## 2. Data-source combinations

| Requirement | Upstox (verified) | Other source | Status |
|---|---|---|---|
| Live bid/ask | Yes (V3, five levels) | — | Available |
| Historical bid/ask | No | Unknown (enquiries drafted) | Blocked |
| Live full-chain OI | Yes | — | Available |
| Historical full-chain OI | No | Unknown | Blocked |
| Observed Greeks | No (live IV not returned for tested legs) | Fyers (expired F&O, documented); others unknown | Unconfirmed |
| MODELLED Greeks | Calculable from candles and an IV assumption | — | Research only |
| Futures volume (15-minute) | Unknown | Unknown | Blocked |
| Underlying 15-minute candles | Yes | — | Available |

## 3. Alternatives considered

- **Keep 11.4 as specified:** not testable historically. Retained for live use, pending data.
- **Replace the bid/ask filter with a fixed spread proxy:** changes the strategy. Requires approval.
- **Use spot VWAP:** rejected. Not a volume-based VWAP and would misrepresent the factor.
- **Use MODELLED delta in place of observed delta:** rejected for live use. Permitted for research only, labelled.

## 4. Assumptions

- Black-Scholes is an approximation for index options; early-exercise and dividend effects are ignored.
- The risk-free rate and the volatility solve method are assumptions and must be stated in every result.
- Historical traded prices are not executable prices.

## 5. Risks

- Any proxy can make results look better than achievable. Every proxy must be sensitivity-tested and labelled.
- Model-derived Greeks may diverge from market Greeks near expiry.
- Futures volume is unknown; the VWAP factor may be unavailable for much of the history.

## 6. Validation methods

1. Unit tests for every formula against hand-computed values.
2. Proxy-to-observed comparison on live data before any proxy is used.
3. Sensitivity sweeps of MODELLED inputs, reported with each result.
4. Holdout use only once, after a frozen specification, per the governance decision.

## 7. Owner decisions required

1. Whether a spread proxy may be used for research, and which evidence it must match.
2. Whether MODELLED delta may be used in research, with the stated methodology.
3. Whether the VWAP factor should be UNAVAILABLE on days without futures volume.
4. Whether the OI factor should report UNAVAILABLE rather than neutral in historical replays.
5. Whether any change to the stop, target or width rules is wanted at all.

No strategy change is implemented by this proposal.

## Owner decisions (2026-11-13)

1. **Bid/ask:** no modelled spread proxy in primary validation. Historical spread is UNAVAILABLE. Proxy sensitivity research is allowed only as hypothetical and labelled.
2. **Delta:** MODELLED Black-Scholes delta is approved for exploratory historical research only. Record underlying, strike, time to expiry, risk-free rate, IV, IV-solving method, timestamp, and sensitivity results. Never substitute for observed delta in live 11.4.
3. **VWAP:** futures session VWAP when valid futures volume exists. Otherwise UNAVAILABLE. No spot VWAP fallback. No fabricated volume.
4. **Full-chain OI:** historical is UNAVAILABLE when the chain is missing. Not neutral. Signals needing it are marked incomplete and cannot be fully validated. Any alternative scoring needs a separate decision.
5. **Unchanged:** 15-minute timeframe, spread-width formula, stop-loss and target formulas, 1% risk limit.

No material change is approved by these decisions.
