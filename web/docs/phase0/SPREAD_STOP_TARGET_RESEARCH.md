# S-04 / S-05 spread stop and target — offline research (SYNTHETIC)

Date: 2026-11-11. Research only. No production code, strategy weights, thresholds, risk limits or Strategy 11.4 were changed. No historical or holdout data was used. Inputs are synthetic (Black-Scholes; index 25000; daily ATR 180; strike step 50; width 200; volatility 0.12; rate 0.065; 3 days to expiry; lot 65).

## 1. Current production implementation (strategy.ts, debitSpread)
- Long leg: nearest strike to delta +0.5 (CE). Short leg: long strike + width.
- Width = ceil(daily ATR / strike step) x strike step (`wingWidth`). The width therefore scales with the daily range (see S-05 in STRATEGY_IMPLEMENTATION_AUDIT).
- Entry = debit = long mid − short mid (no slippage in the plan).
- Max profit = width − debit. Max loss = debit (plus costs, not in the plan).
- Stop = 0.5 × debit (spread-value units). Target 1 = debit + 0.5 × max profit. Target 2 = debit + 0.8 × max profit.
- Plan reward-to-risk (plan.rr) = (target1 − entry) / (entry − stop) = max profit / debit, gross of costs.

Hard-coded constants: 0.5 (stop), 0.5 (target 1), 0.8 (target 2), width rule (ATR multiple, rounded up to the strike step). None of these is derived in the documentation.

## 2. Synthetic reference values (base, no slippage)
- Entry debit (mid): 75.16 per unit. Max profit: 124.84.
- Current stop: 37.58. Current target 1: 137.58. Current target 2: 175.03.
- Scenario-based references: spread value at −1 ATR 33.40; at +1 ATR 125.72.

## 3. Scenario grid and results (base cost, 1x)
Scenarios: underlying −2 to +2 ATR; IV −20% to +20% (relative); 0 or 1 day passed; 42 equally weighted scenarios (the weighting is an assumption). Exit rule for each scenario: stop if spread value ≤ stop; target if ≥ target; otherwise mark-to-market at scenario end. This is a terminal-value approximation, not a path simulation.

| Stop | Target | Stop hit | Target hit | Mean P&L per unit after costs | Worst P&L per unit | Gross R:R (plan) | Net R:R after costs |
|---|---|---|---|---|---|---|---|
| S0 current: 50% of debit | T0 current: 0.5 of max profit | 29% | 14% | 3.68 | -38.81 | 1.66 | 1.58 |
| S0 current: 50% of debit | T1 0.8 of max profit (current t2) | 29% | 7% | 8.24 | -38.81 | 2.66 | 2.54 |
| S0 current: 50% of debit | T2 scenario: value at underlying +1 ATR | 29% | 24% | 1.50 | -38.81 | 1.35 | 1.27 |
| S1 fixed 30% of debit | T0 current: 0.5 of max profit | 17% | 14% | 0.16 | -53.84 | 1.19 | 1.14 |
| S1 fixed 30% of debit | T1 0.8 of max profit (current t2) | 17% | 7% | 4.71 | -53.84 | 1.90 | 1.83 |
| S1 fixed 30% of debit | T2 scenario: value at underlying +1 ATR | 17% | 24% | -2.02 | -53.84 | 0.96 | 0.92 |
| S2 fixed 70% of debit | T0 current: 0.5 of max profit | 40% | 14% | 8.77 | -23.78 | 2.77 | 2.57 |
| S2 fixed 70% of debit | T1 0.8 of max profit (current t2) | 40% | 7% | 13.32 | -23.78 | 4.43 | 4.15 |
| S2 fixed 70% of debit | T2 scenario: value at underlying +1 ATR | 40% | 24% | 6.59 | -23.78 | 2.24 | 2.07 |
| S3 scenario: value at underlying -1 ATR (IV, time held) | T0 current: 0.5 of max profit | 29% | 14% | 2.49 | -42.99 | 1.49 | 1.42 |
| S3 scenario: value at underlying -1 ATR (IV, time held) | T1 0.8 of max profit (current t2) | 29% | 7% | 7.04 | -42.99 | 2.39 | 2.29 |
| S3 scenario: value at underlying -1 ATR (IV, time held) | T2 scenario: value at underlying +1 ATR | 29% | 24% | 0.31 | -42.99 | 1.21 | 1.15 |

## 4. Cost and slippage sensitivity
Slippage is per leg, per execution side, as a fraction of mid. Entry and exit both pay it on both legs. Brokerage is ₹20 per order (4 orders per round trip), converted per unit. Bid-ask is not added on top of the slippage assumption, so it is not double-counted.

### Adverse (1.5x costs, 2% slippage) — all candidates
| Stop | Target | Stop hit | Target hit | Mean P&L per unit after costs | Worst P&L per unit | Gross R:R (plan) | Net R:R after costs |
|---|---|---|---|---|---|---|---|
| S0 current: 50% of debit | T0 current: 0.5 of max profit | 29% | 14% | -1.54 | -40.98 | 1.56 | 1.44 |
| S0 current: 50% of debit | T1 0.8 of max profit (current t2) | 29% | 0% | 1.38 | -40.98 | 2.49 | 2.33 |
| S0 current: 50% of debit | T2 scenario: value at underlying +1 ATR | 29% | 24% | -4.98 | -40.98 | 1.04 | 0.95 |
| S1 fixed 30% of debit | T0 current: 0.5 of max profit | 21% | 14% | -5.43 | -56.64 | 1.11 | 1.04 |
| S1 fixed 30% of debit | T1 0.8 of max profit (current t2) | 21% | 0% | -2.50 | -56.64 | 1.78 | 1.69 |
| S1 fixed 30% of debit | T2 scenario: value at underlying +1 ATR | 21% | 24% | -8.86 | -56.64 | 0.74 | 0.69 |
| S2 fixed 70% of debit | T0 current: 0.5 of max profit | 40% | 14% | 4.17 | -25.33 | 2.59 | 2.33 |
| S2 fixed 70% of debit | T1 0.8 of max profit (current t2) | 40% | 0% | 7.09 | -25.33 | 4.15 | 3.77 |
| S2 fixed 70% of debit | T2 scenario: value at underlying +1 ATR | 40% | 24% | 0.73 | -25.33 | 1.73 | 1.53 |
| S3 scenario: value at underlying -1 ATR (IV, time held) | T0 current: 0.5 of max profit | 29% | 14% | -3.50 | -47.83 | 1.32 | 1.23 |
| S3 scenario: value at underlying -1 ATR (IV, time held) | T1 0.8 of max profit (current t2) | 29% | 0% | -0.57 | -47.83 | 2.12 | 2.00 |
| S3 scenario: value at underlying -1 ATR (IV, time held) | T2 scenario: value at underlying +1 ATR | 29% | 24% | -6.94 | -47.83 | 0.88 | 0.81 |

### Stress (2x costs, 4% slippage) — all candidates
| Stop | Target | Stop hit | Target hit | Mean P&L per unit after costs | Worst P&L per unit | Gross R:R (plan) | Net R:R after costs |
|---|---|---|---|---|---|---|---|
| S0 current: 50% of debit | T0 current: 0.5 of max profit | 36% | 12% | -6.88 | -43.15 | 1.46 | 1.32 |
| S0 current: 50% of debit | T1 0.8 of max profit (current t2) | 36% | 0% | -5.67 | -43.15 | 2.33 | 2.14 |
| S0 current: 50% of debit | T2 scenario: value at underlying +1 ATR | 36% | 24% | -11.39 | -43.15 | 0.76 | 0.66 |
| S1 fixed 30% of debit | T0 current: 0.5 of max profit | 21% | 12% | -11.15 | -59.43 | 1.04 | 0.96 |
| S1 fixed 30% of debit | T1 0.8 of max profit (current t2) | 21% | 0% | -9.94 | -59.43 | 1.67 | 1.56 |
| S1 fixed 30% of debit | T2 scenario: value at underlying +1 ATR | 21% | 24% | -15.66 | -59.43 | 0.54 | 0.48 |
| S2 fixed 70% of debit | T0 current: 0.5 of max profit | 43% | 12% | -0.54 | -26.88 | 2.43 | 2.12 |
| S2 fixed 70% of debit | T1 0.8 of max profit (current t2) | 43% | 0% | 0.67 | -26.88 | 3.89 | 3.44 |
| S2 fixed 70% of debit | T2 scenario: value at underlying +1 ATR | 43% | 24% | -5.05 | -26.88 | 1.26 | 1.06 |
| S3 scenario: value at underlying -1 ATR (IV, time held) | T0 current: 0.5 of max profit | 26% | 12% | -9.67 | -52.67 | 1.18 | 1.08 |
| S3 scenario: value at underlying -1 ATR (IV, time held) | T1 0.8 of max profit (current t2) | 26% | 0% | -8.46 | -52.67 | 1.89 | 1.75 |
| S3 scenario: value at underlying -1 ATR (IV, time held) | T2 scenario: value at underlying +1 ATR | 26% | 24% | -14.18 | -52.67 | 0.61 | 0.54 |

## 5. Mathematical explanation
Spread value V(S, σ, t) = C(S, K1, σ, t) − C(S, K2, σ, t). Debit D = V at entry. Maximum profit = (K2 − K1) − D. Maximum loss = D (plus costs). Any stop or target expressed in spread value is an exit level on V. Premium changes of one leg alone are not the spread's P&L; both legs must be repriced (done here).

## 6. Failure cases
- Stop at 50% of debit is reached with no underlying move after one day (theta), so the stop can fire on time decay alone (see the no-move, 1-day rows).
- Targets at 80% of max profit are rarely reached when the underlying moves only half an ATR; they cost little to set but rarely fill.
- Plan reward-to-risk is gross. After costs and slippage it is lower, and the plan does not show that difference.
- Width tied to daily ATR means wide spreads with high debit on volatile days, which lowers the reward-to-risk.
- A scenario-based stop (−1 ATR) is a loss level that depends on the assumed volatility; if real IV differs, the level is wrong.

## 7. Candidate assessment (not validation)
- **Stop:** the fixed-fraction candidates (30%, 50%, 70%) trade off early exits against holding losers. The scenario-based stop ties the exit to a stated underlying move, which is more interpretable but depends on volatility and time assumptions.
- **Target:** the fixed fraction of max profit is simple and bounded. The scenario target at +1 ATR is linked to the same move the engine uses for the long-option analysis.
- **Recommended research candidate:** a scenario-based stop and a scenario-based target, each defined from full repricing of both legs, evaluated under the three cost scenarios. Recommendation is for research only. It is not evidence that any candidate works.

## 8. Synthetic results are not validation
These numbers come from one synthetic market with assumed volatility, rate and weights. A formula that looks best here has not been validated and must not be called validated. Validation needs real option prices, IV history and expiry data (BLOCKED), and a new holdout after a formal freeze.

## 9. Evidence still missing
Observed bid-ask and depth for both legs; IV history; actual expiry-day behaviour; verified cost schedules by effective date; a point-in-time option dataset; and a frozen strategy specification before any holdout is opened.
