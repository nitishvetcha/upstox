# Expanded path simulation: specification (frozen before execution)

**SYNTHETIC — RESEARCH ONLY.** Not historical evidence. No holdout data. No production change. Engine NO-GO.

## 1. Frozen weights (set before execution)
- **Primary diagnostic:** equal weight per top-level category (1/5 each), split equally across that category's families.
- **Stress-weighted diagnostic (predefined):** Directional 0.10; Non-directional 0.15; Reversal 0.25; Sudden movements 0.35; Combined volatility 0.15, split equally within each category.
- **Sensitivity weight set B (predefined):** Directional 0.40; Non-directional 0.20; Reversal 0.20; Sudden 0.10; Combined 0.10.
Weights are not probabilities of real market conditions.

## 2. Families (23) — keyframes in ATR units of the session; IV shape as stated
| Category | Family | Underlying keyframes (fraction of session, ATR) | IV shape |
|---|---|---|---|
| Directional | STRONG_UP | (0,0) → (1,+2.0) | flat |
| Directional | WEAK_UP | (0,0) → (1,+0.6) | flat |
| Directional | STRONG_DOWN | (0,0) → (1,−2.0) | flat |
| Directional | WEAK_DOWN | (0,0) → (1,−0.6) | flat |
| Non-directional | TIGHT_SIDEWAYS | zigzag ±0.15 | flat |
| Non-directional | WIDE_SIDEWAYS | zigzag ±0.60 | flat |
| Non-directional | CHOPPY | 10 alternations of ±0.2–0.4 | flat |
| Non-directional | FALSE_BREAKOUT | (0,0) → (0.3,+0.8) → (0.6,0) → (1,−0.1) | flat |
| Reversal | BULL_REVERSAL | (0,0) → (0.4,−1.0) → (1,+0.5) | flat |
| Reversal | BEAR_REVERSAL | (0,0) → (0.4,+1.0) → (1,−0.5) | flat |
| Reversal | MULTI_REVERSAL | ±0.8 zigzag, three cycles | flat |
| Reversal | BREAKOUT_FAILURE | (0,0) → (0.4,+1.0) → (0.7,−0.5) → (1,−0.5) | flat |
| Sudden | GAP_UP | (0,0) → (0.02,+1.0) → (1,+1.0) | flat |
| Sudden | GAP_DOWN | (0,0) → (0.02,−1.2) → (1,−0.2) | flat |
| Sudden | FLASH_CRASH | (0,0) → (0.5,−1.5) within 1.5 steps → (1,0) | spike +40% |
| Sudden | SUDDEN_RECOVERY | (0,0) → (0.4,−0.8) → (0.45,+0.2) → (1,+0.2) | flat |
| Sudden | VOL_SHOCK | (0,0) → (0.35,−1.0) → (1,−0.8) | spike +40% |
| Combined | UP_IV_DOWN | (0,0) → (1,+1.0) | −20% |
| Combined | DOWN_IV_UP | (0,0) → (1,−1.0) | +20% |
| Combined | UP_IV_UP | (0,0) → (1,+1.0) | +20% |
| Combined | DOWN_IV_DOWN | (0,0) → (1,−1.0) | −20% |
| Combined | SIDEWAYS_IV_EXPAND | ±0.3 zigzag | +30% ramp |
| Combined | SIDEWAYS_IV_CONTRACT | ±0.3 zigzag | −30% ramp |

Per-step noise: 0.03 ATR, seeded. Paths per family: 40.

## 3. Seeds and independence
- Development seeds: 1000 + family index × 1000 + path index.
- Sensitivity seeds (separate sample, used only for the robustness check): 5000 + family index × 1000 + path index.
The path generator is not adjusted after seeing results.

## 4. Widths
Simulated at 50, 100 and 200 points. The 200 point width is the production rule (daily ATR 180, step 50). 50 is the narrowest width valid on a 50-point strike step. Widths are feasibility-checked separately (`SPREAD_WIDTH_FEASIBILITY_REPORT.md`).

## 5. Candidates (unchanged; none selected)
Stops: S0 50% of debit; S1 30%; S2 70%; S3 scenario (spread value at −1 ATR, IV and time held).
Targets: T0 debit + 0.5 × max profit; T1 debit + 0.8 × max profit; T2 scenario (value at +1 ATR).

## 6. Execution and cost scenarios
- Base: no added slippage; brokerage ₹20 per order (4 per round trip) plus statutory charges at configured rates.
- Adverse: costs 1.5×; slippage 2% per leg per side on mid.
- Stress: costs 2×; slippage 4% per leg per side on mid.
- Legging sensitivity (on base): extra 1% adverse fill on the second entry leg. Partial fills and depth are NOT TESTED (no depth data).
Slippage is applied once; it is not added to bid/ask on top.

## 7. Stop and target rules
Checked at every sub-step (4 per 5-minute step). If stop and target could both fall inside one sub-step, the stop is assumed first. Gap-through-stop: a breach at the open of a step that moved ≥0.3 ATR. Stop-then-recovery is recorded as a stop exit.

## 8. Reported measures
Stop, target, time and gap exits; stop-then-recovery rate; mean and worst net P&L per unit; MAE; MFE; % of debit lost; % of max profit achieved; net return on debit; execution cost as % of debit.

## 9. Sensitivity checks
Rate 5% and 8%; days to expiry 2 and 5; entry IV level ±20%. Applied to primary candidates only.

## 10. Freeze
The hash of this file is recorded in the results report. The script refuses to run if this file's hash differs from the value it contains.
