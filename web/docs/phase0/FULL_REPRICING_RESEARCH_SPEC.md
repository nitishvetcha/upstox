# Full option repricing: research specification (approved for research only)

Scope: research and synthetic testing. Not a production pricing model. Strategy 11.4, the stop and target formulas, and the production risk logic are not changed.

## Methods to compare
1. Delta-only: |Δ| × move (current engine).
2. Greeks approximation: Δ·ΔS + ½Γ(ΔS)² + Vega·ΔIV + Θ·Δt.
3. Full repricing: recalculate the option value at the new underlying price, new implied volatility and remaining time.

## Inputs
Underlying price (before and after); implied volatility (before and after); time to expiry; risk-free rate (assumed); dividend yield (not used for index options in this model; to be stated); option type; strike; exercise style (European assumed for index options, to be confirmed against contract specifications); contract multiplier (lot size).

## Pricing model
Black–Scholes is used for the research comparison. It is an assumption. Market validity requires comparison with observed option prices (BLOCKED until market data).

## Scenarios (synthetic)
Underlying rises; underlying falls; implied volatility rises; implied volatility falls; time passes; underlying and implied volatility change together; near-expiry movement; large sudden movement.

## Spreads
Reprice each leg independently, then take the net value (long minus short).

## Acceptance for research use
- The three methods reproduce each other where they should (small moves, no volatility or time change).
- Errors are reported by scenario, not averaged away.
- No pricing result is described as accurate until compared with independent market prices.

## Status
Synthetic results exist (`docs/phase0/PHASE3_PREMIUM_MODEL_CHECK.md`, produced by `scripts/phase3-premium-model-check.ts`). Market validation: BLOCKED.
