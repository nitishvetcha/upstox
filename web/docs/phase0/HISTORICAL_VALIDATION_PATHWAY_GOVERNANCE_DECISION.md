# Historical Validation Pathway — Governance Decision

**Decision: APPROVED**

The mandatory 60-live-session validation requirement is replaced by a historical-data-based validation pathway.

The owner accepts that historical validation will not establish live execution quality or guarantee future profitability.

## Important limitations

- The existing 52-leg, 14-day dataset (`.research-data/historical-pilot-raw/candles.csv`) is insufficient for a comprehensive Strategy 11.4 backtest.
- Previously reserved holdout periods are compromised and cannot be presented as independent validation.
- A new holdout period must be identified and frozen before any future validation test.
- Full historical data acquisition is not yet approved.
- No Upstox API calls are authorized under this decision.
- Production approval remains separate.

## Unchanged

Strategy 11.4, its formulas, stop-loss and target rules, spread-width rules and the 1% risk limit remain unchanged.

## Current status

Historical validation pathway approved. Backtesting is blocked pending adequate data and a clean holdout. Historical acquisition is not yet authorized. Production remains NO-GO.

## Relationship to earlier records

This decision supersedes the 60-session live-evidence gate stated in:
- `PHASE8_HISTORICAL_RESEARCH_FINDINGS.md` (section 9 and decisions table)
- `PHASE9B_IMPLEMENTATION_PLAN.md`
- `PHASE9B_STAGE2_COMPLETION_REPORT.md`

Those documents are not edited. Read them with this record.
