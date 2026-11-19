# Correlated exposure specification (proposal, not implemented)

Purpose: positions that can lose together should not be counted as independent risks.

Proposed grouping (to be tested):
1. Same underlying: NIFTY and BANK NIFTY options are treated as distinct groups, but NIFTY and BANK NIFTY exposure is combined when both are long the same direction (they are highly correlated).
2. Sector: stocks in the same sector and direction form one group.
3. Direction: all bullish positions in one index family form one group.

Calculations required:
- Combined maximum loss per group (sum of each position's maximum loss, after costs).
- Combined capital required and margin (margin not modelled today: R-10).
- Stress correlation: group losses under a 1-ATR adverse move and a one-day volatility spike, using the repricing model (S-06).

Proposed limit (initial, conservative research rule): 1% of capital maximum risk per correlated group.

Open questions for the owner:
- Correlation thresholds and how they are measured (historical correlation needs data: BLOCKED).
- Whether NIFTY and BANK NIFTY are one group or two.
- Behaviour when correlation data is missing (proposal: treat as one group).

Status: NOT IMPLEMENTED. No code change. Tests cannot be written until the grouping rule is approved.
