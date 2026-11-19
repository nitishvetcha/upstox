# Alternative width methods (research only; 2026-11-11)

**SYNTHETIC — RESEARCH ONLY.** Not a deposit recommendation, not a trading recommendation, not evidence of profitability. Engine NO-GO. Production unchanged.

Each method picks a width; feasibility is then checked by the same rules (1% risk with buffer, 20% allocation, 5-lot cap). No method is approved for production. Liquidity, bid-ask spread and depth are NOT TESTED (no data).

| Method | Capital | Selected width | Lots | Buffered loss per lot (₹) | Net R:R after costs | Status |
|---|---|---|---|---|---|---|
| M0 production: daily ATR, rounded up to step | ₹1,00,000 | 200 | 0 | 5,499 | 1.60 | NO TRADE |
| M0 production: daily ATR, rounded up to step | ₹1,70,000 | 200 | 0 | 5,499 | 1.60 | NO TRADE |
| M0 production: daily ATR, rounded up to step | ₹3,00,000 | 200 | 0 | 5,499 | 1.60 | NO TRADE |
| M0 production: daily ATR, rounded up to step | ₹5,00,000 | 200 | 0 | 5,499 | 1.60 | NO TRADE |
| M1 fixed listed width: 50 points (narrowest valid) | ₹1,00,000 | 50 | 0 | 1,849 | 0.93 | NO TRADE |
| M1 fixed listed width: 50 points (narrowest valid) | ₹1,70,000 | 50 | 0 | 1,849 | 0.93 | NO TRADE |
| M1 fixed listed width: 50 points (narrowest valid) | ₹3,00,000 | 50 | 1 | 1,849 | 0.93 | feasible under 1% (research) |
| M1 fixed listed width: 50 points (narrowest valid) | ₹5,00,000 | 50 | 2 | 1,849 | 0.93 | feasible under 1% (research) |
| M2 ATR-based with min 50 / max 150 | ₹1,00,000 | 150 | 0 | 4,517 | 1.37 | NO TRADE |
| M2 ATR-based with min 50 / max 150 | ₹1,70,000 | 150 | 0 | 4,517 | 1.37 | NO TRADE |
| M2 ATR-based with min 50 / max 150 | ₹3,00,000 | 150 | 0 | 4,517 | 1.37 | NO TRADE |
| M2 ATR-based with min 50 / max 150 | ₹5,00,000 | 150 | 1 | 4,517 | 1.37 | feasible under 1% (research) |
| M3 volatility bucket (low 50 / normal 100 / high 150) | ₹1,00,000 | 100 | 0 | 3,306 | 1.16 | NO TRADE |
| M3 volatility bucket (low 50 / normal 100 / high 150) | ₹1,70,000 | 100 | 0 | 3,306 | 1.16 | NO TRADE |
| M3 volatility bucket (low 50 / normal 100 / high 150) | ₹3,00,000 | 100 | 0 | 3,306 | 1.16 | NO TRADE |
| M3 volatility bucket (low 50 / normal 100 / high 150) | ₹5,00,000 | 100 | 1 | 3,306 | 1.16 | feasible under 1% (research) |
| M4 risk-budget constrained: widest valid width whose buffered loss fits 1% | ₹1,00,000 | none | 0 | — | — | NO TRADE |
| M4 risk-budget constrained: widest valid width whose buffered loss fits 1% | ₹1,70,000 | none | 0 | — | — | NO TRADE |
| M4 risk-budget constrained: widest valid width whose buffered loss fits 1% | ₹3,00,000 | 50 | 1 | 1,849 | 0.93 | feasible under 1% (research) |
| M4 risk-budget constrained: widest valid width whose buffered loss fits 1% | ₹5,00,000 | 150 | 1 | 4,517 | 1.37 | feasible under 1% (research) |

## Reading
- A method is only useful if it yields a valid strike width and a lot count of at least one at the capital in use.
- The risk-budget constrained method (M4) always respects the 1% rule by construction; its outcome shows the widest width that fits at each capital level.
- Narrower widths reduce debit but also reduce max profit; net reward-to-risk after costs is shown for each choice.
- Any method needs independent validation and explicit approval before production use.
