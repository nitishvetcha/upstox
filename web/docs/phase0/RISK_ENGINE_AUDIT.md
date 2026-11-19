# Phase 0 — Risk engine audit (2026-11-11)

Scope: sizing, limits and costs, offline, by reading `src/lib/services/risk/riskService.ts` and `riskConfig.ts`, plus `transactionCosts.ts`.

| ID | Severity | Status | Finding |
|---|---|---|---|
| R-01 | — | PASS | Lots = minimum of (lots allowed by risk), (lots allowed by capital) and the 5-lot cap (`riskService.ts` ~lines 117–125). Tests: `riskService.test.ts` 15/15, `risk.test.ts` 17/17, `riskKnownAnswer.test.ts` 10/10. |
| R-02 | — | PASS | Risk budget = 1% of capital minus fixed (per-order) costs, before sizing (`riskService.ts` line ~119). |
| R-03 | — | PASS | The 20% rule is a cap on capital committed (`maxPositionValuePercent`), not a risk measure. The report shows capital required and total risk separately. |
| R-04 | — | PASS | Unknown lot size is rejected (`UNKNOWN_LOT_SIZE`), not assumed to be 1 in the output. |
| R-05 | — | PASS | Worst-case risk per lot includes entry and exit slippage and a stop-gap allowance (`riskConfig.ts`: entry 1%, exit 1%, stop gap configured). Values are assumptions and marked so. |
| R-06 | HIGH | FAIL | Correlated exposure is not measured. Positions are counted (max 3 concurrent) but no correlation or shared-underlying check exists in the risk or engine code (grep: no match). Two positions on the same index count as two. |
| R-07 | HIGH | FAIL | Expiry-day, overnight-gap and circuit-limit risk are not modelled beyond the stop-gap allowance. Trades are meant to close before the 15:15 expiry cutoff (`transactionCosts.ts`), but no code enforces that for every entry. |
| R-08 | MEDIUM | FAIL (model) | Option premium is modelled from delta only (S-06). Maximum loss for a long option = premium paid (correct). For spreads, maximum loss = net debit (correct). Theta and IV moves are not in the stop or target logic. |
| R-09 | MEDIUM | BLOCKED | Charges are configured rates, not verified (D-12). Brokerage ₹20 per order, STT 0.1% on sell premium, and the other rates must be checked against current schedules. |
| R-10 | MEDIUM | NOT TESTED | Margin blocked and span margin are not modelled. `capitalRequired` is premium-based only. Margin for option selling or spreads is not checked. |
| R-11 | LOW | PASS | Daily loss (2%), open-trade limit (3) and minimum reward-to-risk (1.2 after costs) are enforced (`riskConfig.ts` defaults; `riskService.ts` checks). Tests `risk.test.ts`. |
| R-12 | LOW | NOT TESTED | Realised plus unrealised daily loss: the daily-loss input is realised only (`realizedDailyLoss`). Unrealised losses on open positions are not added to the daily-loss check. |

Summary: sizing arithmetic and the basic limits are correct and tested. Not yet financially sound for the cases that matter most: correlated exposure (R-06), gap and expiry risk (R-07), margin (R-10) and unrealised losses (R-12). Costs need verification (R-09).
