# Phase 2: Legacy versus Next-Bar Comparison

Date: 2026-11-06 (IST). Written for: the project owner and reviewers.

**Status: the legacy side is complete. The next-bar side is NOT RUN** (Phase 2 is BLOCKED; see [PHASE2_HISTORICAL_DATA_AUDIT.md](PHASE2_HISTORICAL_DATA_AUDIT.md)). Every new-side field below is marked "not run". No value is estimated or substituted.

## 0. How to read this

Four categories are kept separate throughout, as the brief requires:

| Category | Applies to | What it means |
|---|---|---|
| **Legacy same-candle** | All four runs (`bt_482207d9`, `bt_5ad11e54`, `bt_6093f183`, `bt_f817dfc2`) | Entries filled at the signal bar's close. All 2,470 trades have entry time equal to signal time. |
| **Corrected next-bar** | None yet | Entries at bar N+1's open. No run exists. |
| **Observed historical underlying** | Spot and technicals in the legacy runs | Measured from the index candle series (`HISTORICAL_MEASURED`). |
| **Model-derived option prices** | All four runs | Black–Scholes at the VIX-based IV. No observed option premiums exist. Labelled `MODEL_DERIVED`. |

Two further distinctions:
- **Synthetic fixture results** (the unit tests and the regression fixtures) are not historical evidence, and are not in this comparison.
- **Performance claims.** CLOSE_ONLY performance claims are **disabled**. INTRABAR results are **research only**, because their option prices are model-derived. None of the four legacy runs is a performance claim.

## 1. Legacy baseline (read-only, from the stored records)

Starting capital ₹10,00,000 in every run. Net P&L is after slippage and transaction costs.

| Metric | `bt_482207d9` (Bank Nifty, CLOSE_ONLY) | `bt_5ad11e54` (Nifty, INTRABAR) | `bt_6093f183` (Bank Nifty, INTRABAR) | `bt_f817dfc2` (Nifty, CLOSE_ONLY) |
|---|---|---|---|---|
| Trades | 435 | 816 | 521 | 698 |
| Wins / losses | 151 / 284 | 248 / 568 | 182 / 339 | 256 / 442 |
| Win rate | 34.7% | 30.4% | 34.9% | 36.7% |
| Gross P&L (before slippage and costs) | −₹4,43,430.60 | −₹2,05,218.00 | −₹4,05,600.60 | +₹6,01,944.20 |
| Slippage | ₹3,73,142.40 | ₹3,48,333.05 | ₹4,39,089.60 | ₹3,22,599.55 |
| Transaction costs | ₹60,157.44 | ₹86,628.24 | ₹71,135.33 | ₹77,087.58 |
| **Net P&L (after all costs)** | **−₹8,76,730.44** | **−₹6,40,179.29** | **−₹9,15,825.53** | **+₹2,02,257.07** |
| Return | −87.67% | −64.02% | −91.58% | +20.23% |
| Max drawdown | 97.8% | 74.17% | 102.28% | 35.2% |
| Profit factor | 0.70 | 0.85 | 0.69 | 1.05 |
| Average R | −0.23 | −0.10 | −0.21 | +0.11 |
| Max consecutive losses | 21 | 24 | 22 | 22 |
| Validation status (stored) | NOT_SUPPORTED | NOT_SUPPORTED | NOT_SUPPORTED | PARTIAL_VALIDATION |

Gross, slippage, costs and net reconcile in every run (gross − slippage − costs = net).

Note on `bt_f817dfc2`. Its positive net P&L comes from a CLOSE_ONLY run, which has performance claims disabled. The stored validation label (PARTIAL_VALIDATION) does not lift that restriction, and the result should not be quoted as evidence.

## 2. Exit behaviour (legacy)

| Exit reason | `bt_482207d9` | `bt_5ad11e54` | `bt_6093f183` | `bt_f817dfc2` |
|---|---|---|---|---|
| TARGET | 146 trades, net +₹19.2 L | 232 trades, net +₹34.7 L | 181 trades, net +₹19.7 L | 217 trades, net +₹38.6 L |
| STOP_LOSS | 280 trades, net −₹29.1 L | 452 trades, net −₹28.9 L | 285 trades, net −₹22.6 L | 431 trades, net −₹39.8 L |
| GAP_EXIT (gap through stop, booked at the open) | — | 114 trades, net −₹13.7 L | 51 trades, net −₹6.6 L | — |
| EXPIRY | 6 | 16 | 1 | 48 |
| END_OF_BACKTEST | 3 | 2 | 3 | 2 |

Stop losses that lost more than the 1R budget:

| Run | Stop exits beyond −1R | Gap exits beyond −1R |
|---|---|---|
| `bt_482207d9` (CLOSE_ONLY) | **250 of 280** | — |
| `bt_5ad11e54` (INTRABAR) | 33 of 452 | 108 of 114 |
| `bt_6093f183` (INTRABAR) | 2 of 285 | 48 of 51 |
| `bt_f817dfc2` (CLOSE_ONLY) | **387 of 431** | — |

The legacy runs were recorded before the gap and tick changes. In those runs, gap exits were booked at the gap-bar open (as the INTRABAR model does), and CLOSE_ONLY stops were checked at the close only. The CLOSE_ONLY overshoot is the main legacy risk-budget violation, and it is why CLOSE_ONLY performance claims are disabled.

## 3. Rejected and cancelled entries (legacy)

| Run | Total rejections | Largest reasons |
|---|---|---|
| `bt_482207d9` | 5,727 | signals conflict 980; open-risk limit 1,676; low strategy score 890; max concurrent positions 738; daily-loss block 571 |
| `bt_5ad11e54` | 5,338 | open-risk limit 1,649; low strategy score 1,118; range cheap IV 831; max concurrent positions 670; daily-loss block 982 |
| `bt_6093f183` | 5,641 | open-risk limit 1,532; low strategy score 890; max concurrent positions 758; signals conflict 980 |
| `bt_f817dfc2` | 5,456 | open-risk limit 1,808; low strategy score 1,118; daily-loss block 855; max concurrent positions 756 |

Legacy runs have no next-bar cancellation counters (`PENDING_NEXT_BAR_MISSING`, `PENDING_SESSION_ENDED`, `PENDING_NO_NEXT_BAR`), because those were added after they were produced. The next-bar side will report them.

## 4. Missing and excluded data (legacy)

- Missing historical candles: **none recorded** (100% spot and VIX coverage, no missing or partial sessions).
- Data-quality exclusions: **none recorded.**
- Caveats that are not exclusions: breadth is reconstructed from today's constituent list (survivorship bias: TRUE); option prices are model-derived; open interest and news are not available.

## 5. Comparison fields (next-bar side: NOT RUN)

Every row below needs a next-bar run. None exists.

| Required comparison | Legacy value | Corrected next-bar value |
|---|---|---|
| 1. Trade count | 435 / 816 / 521 / 698 | not run |
| 2. Entry differences (timing, price, rejected entries) | all entries at signal close | not run |
| 3. Exit differences (reason and timing) | see §2 | not run |
| 4. Gross P&L | see §1 | not run |
| 5. Slippage | see §1 | not run |
| 6. Transaction costs | see §1 | not run |
| 7. Net P&L | see §1 | not run |
| 8. Maximum drawdown | see §1 | not run |
| 9. Win rate | see §1 | not run |
| 10. Profit factor | see §1 | not run |
| 11. Expectancy in R | average R see §1; stored expectancy in ₹ also available | not run |
| 12. Maximum consecutive losses | see §1 | not run |
| 13. Gap-through-stop losses | see §2 | not run |
| 14. Gap-through-target outcomes | legacy runs have no separate label for targets passed at the open | not run |
| 15. Rejected and cancelled entries | see §3 | not run |
| 16. Missing historical candles | none recorded | not run (inputs not fetched) |
| 17. Data-quality exclusions | none recorded | not run |
| 18. Performance differences caused by next-bar execution | unknown | unknown until run |

## 6. What the comparison can and cannot say now

- It can say what the legacy runs show, on their own terms, including the CLOSE_ONLY overshoot and the gap losses.
- It cannot say whether next-bar execution changes performance, in either direction. That needs the new runs.
- It cannot say the legacy results are right. They used same-candle fills, model-derived option prices, and reconstructed breadth with survivorship bias.
- No performance claim follows from this document.

## 7. Next step

Once authorised candles exist (see the audit §8), run the four scenarios under `exec-next-bar-open-v1` with `APP_DATA_DIR` set to `/Users/webanatomy/Desktop/upstox-phase2-research-data/`, then fill the §5 column above. Keep the legacy values as they are.
