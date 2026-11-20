# Options Strategy Research — Design Considerations

Status: design considerations, not validated findings. **No web sources were fetched and no packages were installed in this pass.** Items marked "to verify" must be checked against primary sources (exchange documentation, the broker's published schedule, or peer-reviewed work) before they drive any rule.

## 1. Tool survey (not performed in this pass)

The brief asks for a survey of QuantLib, TA-Lib, NumPy/pandas, QuantStats and open-source Greeks libraries, with licence checks. This pass did not perform that survey. Facts already established in this repository:
- Python 3 is available; `pandas` and `numpy` are **not** installed in the system Python (`ModuleNotFoundError`).
- TA-Lib is **not** installed.
- The Node project has no options pricing library; Greeks are read from the quote payload when provided, and Strategy 11.4 uses a delta-only premium estimate.

Recommendation: before installing anything, check each candidate's licence (QuantLib is BSD-style; TA-Lib's C library and Python wrapper have their own terms; QuantStats is Apache-2.0 per its repository, to verify). Install only what an independent cross-check actually needs.

## 2. Design considerations for an options recommendation

These are candidate rules, each to be tested before use. Each is stated with its economic reason.

- **Direction from the underlying, not the option.** A CE or PE recommendation should follow an underlying condition (trend and VWAP side, confirmed by a pullback-and-reclaim or a breakout close). The option premium is not the signal.
- **Buyer's return is not the index return.** A 1% index move can produce a large, small, or negative premium return depending on delta, gamma, theta and the premium paid. Results must be reported as premium returns.
- **Strike choice by delta, with a liquidity constraint.** ATM (delta ≈ 0.5) has the highest delta per rupee of premium but the highest premium. Deeper ITM reduces time-value decay; far OTM is cheap but has low delta and high theta. A defensible default is near-ATM with a delta window, filtered by spread and open interest. Exact window to be tested.
- **Expiry choice and theta.** Time decay accelerates near expiry. Short-dated contracts carry the most gamma and the most expiry-day risk. A default of at least a few sessions to expiry, with an explicit expiry-day rule, to be tested.
- **Implied versus realised volatility.** Buying premium is more defensible when IV is low relative to recent realised volatility. The IV percentile needs a history that the repository does not have (IV history is not stored), so an IV-percentile filter is **not available** and must not be used.
- **Bid/ask and liquidity.** The buyer pays the ask. Spread cost is a first-order term for short holds. A maximum spread as a percentage of premium, and a minimum open interest and volume, are necessary gates.
- **Event risk.** Scheduled events and expiry days widen spreads and move premiums sharply. An event gate needs an event calendar that is not in the repository.
- **Gap risk.** A stop on an option is a trigger, not a guarantee; gaps and thin books can fill far through it.
- **Costs.** Options costs include brokerage, exchange charges, STT on the sell side (verify the rate), stamp duty and GST. The verified-rate status is in `OPTIONS_DATA_DEPENDENCIES.md`.

## 3. Methodological cautions

- **Black-Scholes assumptions** (constant volatility, lognormal prices, continuous hedging, no dividend or discrete-event adjustment) do not hold for index options near expiry or around events. Greeks from such a model are approximations. The European vs American exercise convention for Indian index options should be confirmed against the exchange specification (to verify).
- **Time-to-expiry convention** (calendar vs trading days, the 15:30 IST expiry-day cut-off) changes Greeks materially for short-dated contracts. The convention used must be documented.
- **Fixtures are not history.** Any result from a synthetic option path is a fixture result and must not be described as historical performance.

## 4. Open questions requiring data or verification

1. What is the actual historical contract-level bid/ask series available from the broker or an official source, and at what cost?
2. What are the verified current transaction-cost rates and their effective dates?
3. Which official source provides India VIX history, and on what terms?
4. Is an IV history (per contract and index) obtainable, so that an IV percentile can be computed?

Until these are answered, the options engine cannot be validated on history.
