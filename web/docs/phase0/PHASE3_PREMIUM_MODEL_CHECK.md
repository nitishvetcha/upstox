# Phase 3 — premium model check (offline, synthetic)

Date: 2026-11-11. Inputs are SYNTHETIC: index 25000, ATR 180 (the mock daily ATR), rate 0.065, volatility 0.12. Model: Black-Scholes, European call.

This measures how far the engine's delta-only premium move departs from a full repricing when the index moves one ATR. It is a model-error check, not evidence that the strategy makes money.

| Days to expiry | Strike offset | Delta | Premium now | Engine move (|delta| x ATR) | Full repricing move (index +1 ATR) | Engine error |
|---|---|---|---|---|---|---|
| 1 | +0 | 0.513 | 64.9 | 92.3 | 128.9 | -28.5% |
| 1 | +100 | 0.273 | 26.2 | 49.1 | 87.8 | -44.1% |
| 1 | +300 | 0.031 | 1.9 | 5.6 | 19.7 | -71.7% |
| 3 | +0 | 0.522 | 115.3 | 93.9 | 116.5 | -19.4% |
| 3 | +100 | 0.377 | 70.8 | 67.9 | 91.3 | -25.6% |
| 3 | +300 | 0.149 | 20.8 | 26.8 | 43.6 | -38.6% |
| 7 | +0 | 0.533 | 181.7 | 96.0 | 111.0 | -13.6% |
| 7 | +100 | 0.438 | 133.9 | 78.8 | 94.2 | -16.4% |
| 7 | +300 | 0.263 | 65.7 | 47.3 | 61.0 | -22.5% |

Reading: the engine's estimate ignores gamma (the move is larger than delta suggests when price moves toward the strike) and theta (time decay). The error column shows the size of that gap under these synthetic inputs. Finding S-06 is confirmed; the magnitude depends on real IV and expiry, which need market data (BLOCKED).

## Scenario grid (synthetic)

Same synthetic inputs. Errors are relative to the full repricing. The delta-only column is what the engine uses today.

| Scenario | Strike offset | Premium change: full | Delta-only error | Delta+gamma error |
|---|---|---|---|---|
| Index +1 ATR | +0 | 116.5 | -19.4% | 1.0% |
| Index +1 ATR | +300 | 43.6 | -38.6% | -6.9% |
| Index -1 ATR | +0 | -70.7 | -32.8% | 0.7% |
| Index -1 ATR | +300 | -16.0 | -67.7% | 18.8% |
| Index +1 ATR, IV -20% (relative) | +0 | 100.6 | -6.6% | 17.0% |
| Index +1 ATR, IV -20% (relative) | +300 | 23.7 | 13.1% | 71.5% |
| No move, IV +20% (relative) | +0 | 21.7 | -100.0% | -100.0% |
| No move, IV +20% (relative) | +300 | 13.8 | -100.0% | -100.0% |
| No move, one day passes (theta) | +0 | -22.2 | 100.0% | 100.0% |
| No move, one day passes (theta) | +300 | -10.7 | 100.0% | 100.0% |

These scenarios show model error only. They are not historical performance and do not validate any strategy.

## Spread repricing (synthetic, bull call spread)

Both legs repriced independently; the net value is long minus short. Research sensitivity only; not a production result.

| Scenario | Width | Net spread value now | Full repricing move | Delta-only error (net) |
|---|---|---|---|---|
| Index +1 ATR | 200 | 75.2 | 50.6 | -2.9% |
| Index -1 ATR | 200 | 75.2 | -41.8 | -17.6% |
| No move, IV +20% | 200 | 75.2 | 3.7 | -100.0% |
| No move, one day passes | 200 | 75.2 | -6.3 | 100.0% |
