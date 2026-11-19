# Spread width feasibility (2026-11-11)

**SYNTHETIC — RESEARCH ONLY.** Not historical evidence. No holdout. No production change. Engine NO-GO. Frozen specification hash: `eecb87ed49c710144e2e5ed2e306140234776628905819872578637b18de99dd`.

Long leg at the money (ATM, delta about 0.5), short leg at long strike plus width. Synthetic inputs: index 25000, volatility 0.12, rate 0.065, 3 days, lot 65. The 1% risk limit (₹1,000 at ₹1 lakh) is applied without relaxation.

| Width | Valid on 50-point step? | Debit per unit | Max profit per unit | Max loss per lot incl. costs (₹) | Capital for one lot at 1% (₹) | Lots at ₹1,00,000 (1% = ₹1,000) | Net R:R after costs (base) | Costs as % of debit (base) |
|---|---|---|---|---|---|---|---|---|
| 25 | no (not a listed strike interval here) | 12.5 | 12.5 | 931 | 93,134 | 1 | 0.74 | 15% |
| 50 | yes | 24.0 | 26.0 | 1,681 | 1,68,117 | 0 | 0.93 | 8% |
| 75 | no (not a listed strike interval here) | 34.7 | 40.3 | 2,372 | 2,37,227 | 0 | 1.05 | 5% |
| 100 | yes | 44.4 | 55.6 | 3,006 | 3,00,569 | 0 | 1.16 | 4% |
| 150 | yes | 61.4 | 88.6 | 4,106 | 4,10,599 | 0 | 1.37 | 3% |
| 200 | yes | 75.2 | 124.8 | 4,999 | 4,99,878 | 0 | 1.60 | 2% |
| 300 | yes | 94.5 | 205.5 | 6,252 | 6,25,167 | 0 | 2.12 | 2% |

## Reading
- Only widths whose max loss per lot is at or below ₹1,000 can be traded at ₹1 lakh. Check the lots column.
- Strike validity: 25-point and 75-point widths are not valid on a 50-point strike step. Real contract specifications must be checked for each instrument (BLOCKED).
- Narrower spreads reduce debit but also reduce max profit. Net reward-to-risk is shown after costs.
- Liquidity, bid-ask spreads, market depth and IV-surface behaviour cannot be measured offline (BLOCKED). Slippage sensitivity is in the cost report.
- If no width is feasible at a given capital, the correct output is NO TRADE. The risk limit is not relaxed.
