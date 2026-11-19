> **Current authoritative reference** for Phase 8 historical pilot findings. Earlier pilot reports are archived.

# Phase 8 — historical research findings (consolidated)

**Label: Historical Market-Structure Research — Pilot.** This document does not validate Strategy 11.4. It does not replace the 60-session live evidence requirement. It is not evidence of profitability, win-rate, expectancy or execution quality. Engine remains NO-GO. Strategy 11.4, production formulas and the 1% risk limit are unchanged.

Written for: the project owner, as the single reference for what the historical pilot does and does not show. Consolidates `PHASE8_HISTORICAL_PILOT_RESEARCH_REPORT.md` and `PHASE8_HISTORICAL_PILOT_DEEPER_ANALYSIS.md`, with both corrections applied.

## 1. Data used

- **Source:** `.research-data/historical-pilot-raw/candles.csv` — 4,859 bars, 30-minute, OHLC, volume and OI, from expired option contracts.
- **Acquisition:** 60 candle calls, all HTTP 200, no retries. Log at `docs/phase0/historical-pilot-acquisition-log.json`. Earlier probe evidence (`historical-coverage-probe.json`) unchanged.
- **Window:** 14 calendar days ending on each contract's expiry date. This is not a full history.
- **Legs:** 60 requested, 52 returned bars, 8 returned empty.

## 2. Legs used and excluded

**Used (52 legs):** all legs with bars, across all six indices and three sampled expiries per index.

**Excluded (8 legs):** the ATM CE and ATM PE of the oldest sampled expiry for BANKNIFTY and FINNIFTY (2024-10-01), and for MIDCPNIFTY and BANKEX (2024-09-30). Each returned zero bars on a repeat request. The cause is unknown.

Exclusion is a data decision, not a finding about those indices' markets.

## 3. Data-quality scorecard

| Index | Legs used | Legs excluded | Zero-OI bars (traded) | Off-grid bars | Ordering violations | Zero-volume bars | Assessment |
|---|---|---|---|---|---|---|---|
| NIFTY | 10 | 0 | 11.2% (98) | 18 (one session) | 4.8% | 9.9% | Usable. Flag the 2026-11-08 session. Exclude zero-OI bars from OI work. |
| BANKNIFTY | 8 | 2 | 0.0% | 0 | 0.0% | 3.6% | Cleanest in this sample. Oldest expiry missing. |
| FINNIFTY | 8 | 2 | 0.0% | 0 | 2.5% | 25.5% | Thin. Oldest expiry missing. |
| MIDCPNIFTY | 8 | 2 | 0.0% | 0 | 3.6% | 11.9% | Oldest expiry missing. |
| SENSEX | 10 | 0 | 5.0% (15) | 0 | 1.3% | 6.2% | Usable. 2024 OI weak. |
| BANKEX | 8 | 2 | 0.5% (1) | 0 | 3.0% | 21.9% | Thin. Oldest expiry missing. |

Totals: 159 zero-OI bars, of which 114 have traded volume (98 NIFTY, 15 SENSEX, 1 BANKEX). The scorecard covers the returned bars only, and does not measure coverage of the full listed history.

## 4. Observed patterns (descriptive)

These describe the sampled windows only.

1. **Expiry decay in OTM legs.** 11 of 12 OTM legs close at the ₹0.05 floor on expiry day.
2. **Some ITM legs and one ATM call rose into expiry.** For example SENSEX 2026-11-05 ATM CE rose about threefold.
3. **Afternoon volume concentration.** Across the indices, 63% to 80% of volume falls from 13:15 onward (index average). By expiry, the share ranges from 53% to 92%: 53% to 71% on the latest sampled expiries and 76% to 92% on the middle and oldest. All 14 sampled expiry windows exceed 50%. This is a sample-level observation, not a general market rule. Detail: `PHASE8B_HISTORICAL_DESCRIPTIVE_RESULTS.md`.
4. **The 14:45 bar holds about 26% of total volume.** It appears on 51 dates. Its meaning is unresolved.
5. **OI falls from its peak into expiry on most legs.** The median last/peak ratio (positive-OI bars only) is 0.49 for BANKNIFTY and 0.99 for BANKEX.
6. **Strike ordering is mostly consistent.** 47 of 1,945 comparisons violate the expected ITM ≥ ATM ≥ OTM order at matching timestamps.

## 5. Hypotheses (not established)

- The ATM-at-expiry strike selection makes premium ratios mostly reflect strike selection and expiry decay together, not a decay rate for an at-the-money option.
- The 14:45 bar either reflects closing-session activity or aggregates a longer interval than 30 minutes. The data cannot tell which.
- The 47 ordering violations come from bars stamped at different last-trade times for different strikes. This has not been checked leg by leg.
- The zero-OI bars on traded contracts are a data artefact. This follows from market structure, not from a confirmed Upstox specification.
- The eight empty legs reflect untraded or unarchived contracts. Unverified.
- Thin indices (FINNIFTY, BANKEX) show many zero-volume bars because their strikes are illiquid.

## 6. Corrections applied from the earlier reports

1. **Off-grid timestamps:** the 18 bars at 14:20, 14:50 and 15:20 are all NIFTY 2026-11-09 legs on one session, 2026-11-08. They are not a general stamping pattern across indices or dates.
2. **14:45 concentration:** 14:45 is a regular bar on 51 dates. It is not an artefact of the off-grid stamps. Its meaning is unresolved.

## 7. Limitations

1. **Window length:** 14 days per contract. Not a full history.
2. **Single contract per leg:** one strike and one expiry per position. Results do not generalise to other strikes or dates.
3. **Strike selection:** ATM is chosen at expiry, so premium ratios over the window are not decay rates.
4. **No bid/ask or depth:** the candles contain no quote data. Nothing here supports execution-cost, fill or slippage conclusions.
5. **Underlying identity:** not independently verified. Only the strike-grid check was applied.
6. **Expiry-list span:** documentation says about six months; the list spans about two years. Unexplained.
7. **Volume units:** raw units, not lots. Not comparable across indices.
8. **Zero OI:** treated as unknown, not genuine zero. OI conclusions shown with and without these bars.

## 8. What this research cannot establish

- Whether Strategy 11.4, or any alternative, is profitable after costs.
- Whether the volume or prices shown were available at execution.
- Bid/ask spread, market depth, slippage or realistic fill quality.
- Liquidity at any order size.
- Whether observed patterns predict future price or OI behaviour.
- Anything about the eight excluded legs.

## 9. Still required before any production claim

- **Live evidence:** the 60-session live requirement, unchanged. It remains the gate for production claims.
- **Live execution data:** bid/ask, depth, quote freshness and realistic fills. These cannot come from historical candles.
- **Holdout discipline:** the compromised holdout periods stay excluded. Any future validation needs a frozen specification and a new holdout.
- **Independent review** of the methodology before any finding is used in a decision.

## 10. Decisions

| Item | Decision |
|---|---|
| Deeper descriptive analysis | Complete |
| 52 legs with data | Usable for further offline research |
| Eight oldest-expiry empty legs | Excluded and documented |
| 32-request zero-candle follow-up | Optional investigation. Not approved; not currently necessary |
| Further Upstox API requests | Not approved |
| Strategy 11.4 changes | Not approved |
| 60-session live requirement | Unchanged |
| 1% risk limit | Unchanged |
| Production engine | NO-GO |

**Next step:** offline analysis of the existing bars only. No strategy optimisation and no production validation based on this pilot.
