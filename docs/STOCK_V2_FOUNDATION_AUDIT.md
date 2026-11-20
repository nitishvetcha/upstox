# Stock V2 — Foundation Audit

Scope: `web/src/lib/stockV2/` at the start of this pass. Verified by reading the code and by tests; the defects below were confirmed, not assumed.

## Defects found and fixed

| # | Defect | Effect | Fix | Test |
|---|---|---|---|---|
| D1 | Quantity was capped by risk only. Tight stops produced positions up to ~15× capital (average notional ₹15 lakh on a ₹10 lakh account in the first development run). | Violated "never exceed capital". Results were not realistic. | Quantity = min(risk quantity, capital ÷ entry price). `cappedByCapital` is reported. First development run archived as superseded. | "notional never exceeds capital; a tight stop is capped and reported" |
| D2 | No check that the bar after a signal is the next minute. A missing minute could be bridged silently. | Entry could occur minutes after the signal, using a price not known at the signal. | Entry rejected as `NON_CONTIGUOUS_ENTRY` unless the next bar is exactly one minute later. | "a missing minute between signal and entry is rejected, never bridged" |
| D3 | A gap during a holding period was not handled. | Exit price could be taken from a bar after an unseen interval. | Exit at the first bar after the gap, adverse-filled, reason `GAP_EXIT`. Zero in the current dataset. | "a missing minute during the hold exits at the first bar after the gap (GAP_EXIT)" |
| D4 | Costs and slippage were fixed constants. | Scenarios could be labelled but not run. | `CostScenario` (BASE, CONSERVATIVE, ADVERSE_SLIPPAGE) threaded through fills and charges. | "a scenario changes simulated net P&L, not just a label" |
| D5 | Only one signal rule existed. | No defensible comparison before selection. | Second pre-declared candidate (PULLBACK_RECLAIM) and a selection rule. | Candidate signal tests |
| D6 | The window and entry checks were not tested at their boundaries. | Possible off-by-one at 09:30 and 14:00. | Explicit boundary tests. | "time window: entries only from 09:30 up to, not including, 14:00" |
| D7 | Validation could be rerun or run after code changes. | Non-independent validation. | Code hash recorded at development. Validation refuses if the hash differs or the output exists. | Protocol check in the script |

## Checked and found correct

- EMA: seeded with the SMA of the first period; values before that are null (tested).
- Session VWAP: resets each session; null while cumulative volume is zero (tested).
- ATR: Wilder smoothing from the first `period` true ranges (tested for warm-up and positivity).
- Stop-first rule on a bar touching both stop and target (tested as an invariant on every trade).
- One trade per stock per session (tested).
- Square-off at 15:15 (tested: no exit at or after 15:15).
- Cost formula: charges match the documented formula, STT on the sell side and stamp duty on the buy side only, brokerage capped at ₹20 per order (tested).
- Independent check: a Python reimplementation reproduced all 38 RELIANCE development trades exactly.

## Known limitations (not defects, but must be reported)

- Stop fills include adverse slippage that is large relative to tight stop distances (about 10% of the stop distance). This drives the stop-side loss.
- The reward-to-risk floor of 1.5 is applied to the V1 stop and target method. Most signals fail it, as the rejection counts show.
- The first bar of a session cannot be used for a signal (the entry bar must be the next bar).
- Stop and target checks start on the entry bar itself. The entry bar's range may include prices before the entry fill. This is conservative for targets.
- EMA 200 is computed over continuous minute bars across sessions, so the first session needs 200 bars of history (a warm-up, handled by skipping early signals).
- `countMissingMinutes` counts gaps; the current dataset has none.

## Duplicate implementations

The Stock V2 indicators and the options research use separate code. The options audit `optionsAuditResearch` has its own ATM and Greeks paths. No shared calculation has been merged.
