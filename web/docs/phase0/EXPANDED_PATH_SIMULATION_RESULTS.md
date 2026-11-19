# Expanded path simulation results (2026-11-11)

**SYNTHETIC — RESEARCH ONLY.** Not historical evidence. No holdout. No production change. Engine NO-GO. Frozen specification hash: `eecb87ed49c710144e2e5ed2e306140234776628905819872578637b18de99dd`.

Specification: `docs/phase0/EXPANDED_PATH_SIMULATION_SPECIFICATION.md` (frozen). Primary diagnostic: equal weight per category. Stress-weighted and weight-set B are predefined. Family weights are not real-world probabilities.

## Aggregate results by width, cost scenario and candidate
| Width | Costs | Candidate (stop | target) | Equal-weight mean P&L/unit | Stress-weighted mean | Set B mean | Worst family P&L | Stop % | Target % | Time % | Gap % | Stop then recovered % | MAE | MFE | Debit lost % (avg) | Max profit achieved % (avg, gains only) | Costs % of debit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 50 | base | S0 50% of debit + T0 0.5 of max profit | -2.96 | -3.58 | -2.53 | -14.81 | 30% | 20% | 50% | 0% | 16% | -8.12 | 7.25 | -12.3% | 11.1% | 7.6% |
| 50 | base | S0 50% of debit + T1 0.8 of max profit | -3.90 | -5.07 | -3.18 | -14.81 | 30% | 5% | 65% | 0% | 16% | -8.12 | 7.25 | -16.2% | 10.2% | 7.5% |
| 50 | base | S0 50% of debit + T2 scenario +1 ATR | -2.48 | -2.95 | -2.06 | -14.81 | 30% | 24% | 45% | 0% | 16% | -8.12 | 7.25 | -10.3% | 11.8% | 7.6% |
| 50 | base | S1 30% of debit + T0 0.5 of max profit | -1.44 | -1.01 | -1.56 | -18.86 | 8% | 20% | 72% | 0% | 0% | -8.12 | 7.25 | -6.0% | 12.1% | 7.6% |
| 50 | base | S1 30% of debit + T1 0.8 of max profit | -2.38 | -2.50 | -2.21 | -18.86 | 8% | 5% | 87% | 0% | 0% | -8.12 | 7.25 | -9.9% | 11.3% | 7.6% |
| 50 | base | S1 30% of debit + T2 scenario +1 ATR | -0.96 | -0.39 | -1.09 | -18.86 | 8% | 24% | 67% | 0% | 0% | -8.12 | 7.25 | -4.0% | 12.9% | 7.7% |
| 50 | base | S2 70% of debit + T0 0.5 of max profit | -2.38 | -3.02 | -1.82 | -10.94 | 50% | 20% | 30% | 0% | 27% | -8.12 | 7.25 | -9.9% | 10.9% | 7.6% |
| 50 | base | S2 70% of debit + T1 0.8 of max profit | -3.25 | -4.44 | -2.41 | -10.94 | 57% | 5% | 37% | 0% | 27% | -8.12 | 7.25 | -13.5% | 10.1% | 7.6% |
| 50 | base | S2 70% of debit + T2 scenario +1 ATR | -1.92 | -2.43 | -1.38 | -10.94 | 47% | 24% | 28% | 0% | 27% | -8.12 | 7.25 | -8.0% | 11.7% | 7.6% |
| 50 | base | S3 scenario -1 ATR + T0 0.5 of max profit | -2.96 | -3.57 | -2.52 | -14.92 | 30% | 20% | 51% | 0% | 16% | -8.12 | 7.25 | -12.3% | 11.1% | 7.6% |
| 50 | base | S3 scenario -1 ATR + T1 0.8 of max profit | -3.89 | -5.06 | -3.17 | -14.92 | 30% | 5% | 65% | 0% | 16% | -8.12 | 7.25 | -16.2% | 10.2% | 7.5% |
| 50 | base | S3 scenario -1 ATR + T2 scenario +1 ATR | -2.47 | -2.94 | -2.05 | -14.92 | 30% | 24% | 46% | 0% | 16% | -8.12 | 7.25 | -10.3% | 11.8% | 7.6% |
| 50 | adverse | S0 50% of debit + T0 0.5 of max profit | -12.09 | -13.02 | -11.57 | -18.39 | 54% | 0% | 44% | 2% | 29% | -14.48 | -2.99 | -42.9% | 0.8% | 9.0% |
| 50 | adverse | S0 50% of debit + T1 0.8 of max profit | -12.09 | -13.02 | -11.57 | -18.39 | 54% | 0% | 44% | 2% | 29% | -14.48 | -2.99 | -42.9% | 0.8% | 9.0% |
| 50 | adverse | S0 50% of debit + T2 scenario +1 ATR | -11.25 | -11.75 | -10.81 | -18.39 | 46% | 26% | 27% | 2% | 27% | -14.48 | -2.99 | -39.9% | 0.0% | 9.1% |
| 50 | adverse | S1 30% of debit + T0 0.5 of max profit | -11.48 | -11.96 | -11.18 | -22.78 | 9% | 0% | 86% | 4% | 5% | -14.48 | -2.99 | -40.8% | 0.8% | 9.1% |
| 50 | adverse | S1 30% of debit + T1 0.8 of max profit | -11.48 | -11.96 | -11.18 | -22.78 | 9% | 0% | 86% | 4% | 5% | -14.48 | -2.99 | -40.8% | 0.8% | 9.1% |
| 50 | adverse | S1 30% of debit + T2 scenario +1 ATR | -10.38 | -10.37 | -10.17 | -22.78 | 9% | 29% | 58% | 4% | 5% | -14.48 | -2.99 | -36.9% | 0.0% | 9.1% |
| 50 | adverse | S2 70% of debit + T0 0.5 of max profit | -9.27 | -9.57 | -8.95 | -12.88 | 83% | 0% | 17% | 0% | 38% | -14.48 | -2.99 | -32.9% | 0.7% | 9.2% |
| 50 | adverse | S2 70% of debit + T1 0.8 of max profit | -9.27 | -9.57 | -8.95 | -12.88 | 83% | 0% | 17% | 0% | 38% | -14.48 | -2.99 | -32.9% | 0.7% | 9.2% |
| 50 | adverse | S2 70% of debit + T2 scenario +1 ATR | -9.00 | -9.03 | -8.76 | -12.88 | 73% | 24% | 3% | 0% | 38% | -14.48 | -2.99 | -32.0% | 0.0% | 9.2% |
| 50 | adverse | S3 scenario -1 ATR + T0 0.5 of max profit | -12.26 | -13.12 | -11.84 | -21.13 | 28% | 0% | 72% | 0% | 15% | -14.48 | -2.99 | -43.6% | 0.8% | 9.0% |
| 50 | adverse | S3 scenario -1 ATR + T1 0.8 of max profit | -12.26 | -13.12 | -11.84 | -21.13 | 28% | 0% | 72% | 0% | 15% | -14.48 | -2.99 | -43.6% | 0.8% | 9.0% |
| 50 | adverse | S3 scenario -1 ATR + T2 scenario +1 ATR | -11.15 | -11.50 | -10.81 | -21.13 | 28% | 29% | 43% | 0% | 15% | -14.48 | -2.99 | -39.6% | 0.0% | 9.1% |
| 50 | stress | S0 50% of debit + T0 0.5 of max profit | -19.81 | -19.81 | -19.81 | -19.81 | 100% | 0% | 0% | 0% | 59% | -20.85 | -13.03 | -61.4% | 0.0% | 10.2% |
| 50 | stress | S0 50% of debit + T1 0.8 of max profit | -19.81 | -19.81 | -19.81 | -19.81 | 100% | 0% | 0% | 0% | 59% | -20.85 | -13.03 | -61.4% | 0.0% | 10.2% |
| 50 | stress | S0 50% of debit + T2 scenario +1 ATR | -19.81 | -19.81 | -19.81 | -19.81 | 100% | 0% | 0% | 0% | 59% | -20.85 | -13.03 | -61.4% | 0.0% | 10.2% |
| 50 | stress | S1 30% of debit + T0 0.5 of max profit | -20.86 | -21.40 | -20.86 | -26.56 | 29% | 0% | 67% | 4% | 17% | -20.85 | -13.03 | -64.6% | 0.0% | 10.1% |
| 50 | stress | S1 30% of debit + T1 0.8 of max profit | -20.86 | -21.40 | -20.86 | -26.56 | 29% | 0% | 67% | 4% | 17% | -20.85 | -13.03 | -64.6% | 0.0% | 10.1% |
| 50 | stress | S1 30% of debit + T2 scenario +1 ATR | -19.88 | -20.24 | -19.76 | -26.56 | 25% | 49% | 22% | 4% | 14% | -20.85 | -13.03 | -61.6% | 0.0% | 10.2% |
| 50 | stress | S2 70% of debit + T0 0.5 of max profit | -19.81 | -19.81 | -19.81 | -19.81 | 100% | 0% | 0% | 0% | 7% | -20.85 | -13.03 | -61.4% | 0.0% | 10.2% |
| 50 | stress | S2 70% of debit + T1 0.8 of max profit | -19.81 | -19.81 | -19.81 | -19.81 | 100% | 0% | 0% | 0% | 7% | -20.85 | -13.03 | -61.4% | 0.0% | 10.2% |
| 50 | stress | S2 70% of debit + T2 scenario +1 ATR | -19.81 | -19.81 | -19.81 | -19.81 | 100% | 0% | 0% | 0% | 7% | -20.85 | -13.03 | -61.4% | 0.0% | 10.2% |
| 50 | stress | S3 scenario -1 ATR + T0 0.5 of max profit | -20.75 | -21.23 | -20.74 | -27.34 | 25% | 0% | 75% | 0% | 14% | -20.85 | -13.03 | -64.3% | 0.0% | 10.1% |
| 50 | stress | S3 scenario -1 ATR + T1 0.8 of max profit | -20.75 | -21.23 | -20.74 | -27.34 | 25% | 0% | 75% | 0% | 14% | -20.85 | -13.03 | -64.3% | 0.0% | 10.1% |
| 50 | stress | S3 scenario -1 ATR + T2 scenario +1 ATR | -20.06 | -20.42 | -19.94 | -27.34 | 25% | 49% | 26% | 0% | 14% | -20.85 | -13.03 | -62.1% | 0.0% | 10.2% |
| 50 | legging | S0 50% of debit + T0 0.5 of max profit | -5.16 | -6.13 | -4.74 | -15.29 | 32% | 14% | 54% | 0% | 17% | -9.03 | 6.34 | -20.7% | 8.3% | 7.2% |
| 50 | legging | S0 50% of debit + T1 0.8 of max profit | -4.95 | -6.17 | -4.23 | -15.29 | 32% | 5% | 63% | 0% | 17% | -9.03 | 6.34 | -19.8% | 9.7% | 7.2% |
| 50 | legging | S0 50% of debit + T2 scenario +1 ATR | -3.54 | -4.06 | -3.13 | -15.29 | 32% | 24% | 43% | 0% | 17% | -9.03 | 6.34 | -14.2% | 11.0% | 7.3% |
| 50 | legging | S1 30% of debit + T0 0.5 of max profit | -3.48 | -3.36 | -3.58 | -19.50 | 8% | 14% | 78% | 0% | 0% | -9.03 | 6.34 | -13.9% | 9.2% | 7.3% |
| 50 | legging | S1 30% of debit + T1 0.8 of max profit | -3.26 | -3.40 | -3.08 | -19.50 | 8% | 5% | 87% | 0% | 0% | -9.03 | 6.34 | -13.1% | 10.7% | 7.3% |
| 50 | legging | S1 30% of debit + T2 scenario +1 ATR | -1.85 | -1.29 | -1.97 | -19.50 | 8% | 24% | 67% | 0% | 0% | -9.03 | 6.34 | -7.4% | 12.0% | 7.4% |
| 50 | legging | S2 70% of debit + T0 0.5 of max profit | -4.11 | -5.02 | -3.54 | -10.83 | 57% | 14% | 29% | 0% | 28% | -9.03 | 6.34 | -16.5% | 8.3% | 7.3% |
| 50 | legging | S2 70% of debit + T1 0.8 of max profit | -3.88 | -5.04 | -3.02 | -10.83 | 58% | 5% | 37% | 0% | 28% | -9.03 | 6.34 | -15.5% | 9.7% | 7.3% |
| 50 | legging | S2 70% of debit + T2 scenario +1 ATR | -2.62 | -3.11 | -2.06 | -10.83 | 48% | 24% | 27% | 0% | 28% | -9.03 | 6.34 | -10.5% | 11.0% | 7.4% |
| 50 | legging | S3 scenario -1 ATR + T0 0.5 of max profit | -5.01 | -5.93 | -4.57 | -15.83 | 30% | 14% | 57% | 0% | 16% | -9.03 | 6.34 | -20.1% | 8.3% | 7.2% |
| 50 | legging | S3 scenario -1 ATR + T1 0.8 of max profit | -4.80 | -5.97 | -4.07 | -15.83 | 30% | 5% | 65% | 0% | 16% | -9.03 | 6.34 | -19.2% | 9.7% | 7.3% |
| 50 | legging | S3 scenario -1 ATR + T2 scenario +1 ATR | -3.39 | -3.86 | -2.96 | -15.83 | 30% | 24% | 46% | 0% | 16% | -9.03 | 6.34 | -13.6% | 11.0% | 7.3% |
| 100 | base | S0 50% of debit + T0 0.5 of max profit | -7.15 | -9.14 | -6.31 | -25.73 | 33% | 13% | 54% | 0% | 18% | -15.84 | 14.47 | -16.1% | 8.9% | 4.0% |
| 100 | base | S0 50% of debit + T1 0.8 of max profit | -6.30 | -8.76 | -4.74 | -25.73 | 33% | 5% | 62% | 0% | 18% | -15.84 | 14.47 | -14.2% | 10.6% | 4.0% |
| 100 | base | S0 50% of debit + T2 scenario +1 ATR | -3.50 | -4.48 | -2.69 | -25.73 | 33% | 24% | 42% | 0% | 18% | -15.84 | 14.47 | -7.9% | 12.3% | 4.0% |
| 100 | base | S1 30% of debit + T0 0.5 of max profit | -3.79 | -3.74 | -3.90 | -33.14 | 8% | 13% | 79% | 0% | 0% | -15.84 | 14.47 | -8.5% | 10.0% | 4.0% |
| 100 | base | S1 30% of debit + T1 0.8 of max profit | -2.93 | -3.36 | -2.33 | -33.14 | 8% | 5% | 87% | 0% | 0% | -15.84 | 14.47 | -6.6% | 11.7% | 4.0% |
| 100 | base | S1 30% of debit + T2 scenario +1 ATR | -0.14 | 0.91 | -0.28 | -33.14 | 8% | 24% | 67% | 0% | 0% | -15.84 | 14.47 | -0.3% | 13.4% | 4.1% |
| 100 | base | S2 70% of debit + T0 0.5 of max profit | -5.06 | -6.89 | -3.93 | -19.06 | 58% | 13% | 29% | 0% | 28% | -15.84 | 14.47 | -11.4% | 8.7% | 4.0% |
| 100 | base | S2 70% of debit + T1 0.8 of max profit | -4.19 | -6.50 | -2.35 | -19.06 | 58% | 5% | 37% | 0% | 28% | -15.84 | 14.47 | -9.4% | 10.4% | 4.0% |
| 100 | base | S2 70% of debit + T2 scenario +1 ATR | -1.69 | -2.59 | -0.59 | -19.06 | 48% | 24% | 27% | 0% | 28% | -15.84 | 14.47 | -3.8% | 12.2% | 4.1% |
| 100 | base | S3 scenario -1 ATR + T0 0.5 of max profit | -6.90 | -8.79 | -6.03 | -27.01 | 31% | 13% | 57% | 0% | 16% | -15.84 | 14.47 | -15.5% | 8.9% | 4.0% |
| 100 | base | S3 scenario -1 ATR + T1 0.8 of max profit | -6.04 | -8.41 | -4.46 | -27.01 | 31% | 5% | 64% | 0% | 16% | -15.84 | 14.47 | -13.6% | 10.6% | 4.0% |
| 100 | base | S3 scenario -1 ATR + T2 scenario +1 ATR | -3.24 | -4.14 | -2.41 | -27.01 | 31% | 24% | 45% | 0% | 16% | -15.84 | 14.47 | -7.3% | 12.3% | 4.0% |
| 100 | adverse | S0 50% of debit + T0 0.5 of max profit | -13.90 | -16.41 | -12.50 | -28.59 | 35% | 5% | 52% | 7% | 23% | -21.54 | 5.12 | -28.9% | 6.0% | 5.2% |
| 100 | adverse | S0 50% of debit + T1 0.8 of max profit | -13.67 | -16.29 | -12.04 | -28.59 | 35% | 0% | 57% | 7% | 23% | -21.54 | 5.12 | -28.4% | 6.4% | 5.2% |
| 100 | adverse | S0 50% of debit + T2 scenario +1 ATR | -11.41 | -12.77 | -10.38 | -28.59 | 35% | 25% | 33% | 7% | 23% | -21.54 | 5.12 | -23.7% | 6.1% | 5.2% |
| 100 | adverse | S1 30% of debit + T0 0.5 of max profit | -10.84 | -11.09 | -10.57 | -36.61 | 8% | 5% | 87% | 0% | 0% | -21.54 | 5.12 | -22.5% | 6.3% | 5.2% |
| 100 | adverse | S1 30% of debit + T1 0.8 of max profit | -10.61 | -10.98 | -10.11 | -36.61 | 8% | 0% | 92% | 0% | 0% | -21.54 | 5.12 | -22.0% | 6.7% | 5.2% |
| 100 | adverse | S1 30% of debit + T2 scenario +1 ATR | -8.36 | -7.46 | -8.46 | -36.61 | 8% | 25% | 67% | 0% | 0% | -21.54 | 5.12 | -17.4% | 6.4% | 5.3% |
| 100 | adverse | S2 70% of debit + T0 0.5 of max profit | -10.00 | -11.43 | -8.59 | -19.64 | 67% | 5% | 28% | 0% | 35% | -21.54 | 5.12 | -20.8% | 6.0% | 5.2% |
| 100 | adverse | S2 70% of debit + T1 0.8 of max profit | -9.77 | -11.32 | -8.13 | -19.64 | 67% | 0% | 33% | 0% | 35% | -21.54 | 5.12 | -20.3% | 6.4% | 5.2% |
| 100 | adverse | S2 70% of debit + T2 scenario +1 ATR | -8.23 | -8.70 | -7.19 | -19.64 | 57% | 25% | 18% | 0% | 35% | -21.54 | 5.12 | -17.1% | 6.1% | 5.3% |
| 100 | adverse | S3 scenario -1 ATR + T0 0.5 of max profit | -13.74 | -15.70 | -12.61 | -32.62 | 30% | 5% | 65% | 0% | 15% | -21.54 | 5.12 | -28.5% | 6.0% | 5.2% |
| 100 | adverse | S3 scenario -1 ATR + T1 0.8 of max profit | -13.50 | -15.59 | -12.15 | -32.62 | 30% | 0% | 70% | 0% | 15% | -21.54 | 5.12 | -28.0% | 6.4% | 5.2% |
| 100 | adverse | S3 scenario -1 ATR + T2 scenario +1 ATR | -11.26 | -12.07 | -10.50 | -32.62 | 30% | 25% | 45% | 0% | 15% | -21.54 | 5.12 | -23.4% | 6.1% | 5.2% |
| 100 | stress | S0 50% of debit + T0 0.5 of max profit | -20.37 | -22.18 | -19.19 | -32.55 | 57% | 0% | 42% | 1% | 27% | -27.24 | -4.17 | -39.3% | 2.0% | 6.2% |
| 100 | stress | S0 50% of debit + T1 0.8 of max profit | -20.37 | -22.18 | -19.19 | -32.55 | 57% | 0% | 42% | 1% | 27% | -27.24 | -4.17 | -39.3% | 2.0% | 6.2% |
| 100 | stress | S0 50% of debit + T2 scenario +1 ATR | -18.68 | -19.56 | -17.80 | -32.55 | 47% | 26% | 27% | 1% | 27% | -27.24 | -4.17 | -36.0% | 0.0% | 6.3% |
| 100 | stress | S1 30% of debit + T0 0.5 of max profit | -19.98 | -21.37 | -18.99 | -40.97 | 9% | 0% | 84% | 7% | 8% | -27.24 | -4.17 | -38.5% | 2.0% | 6.2% |
| 100 | stress | S1 30% of debit + T1 0.8 of max profit | -19.98 | -21.37 | -18.99 | -40.97 | 9% | 0% | 84% | 7% | 8% | -27.24 | -4.17 | -38.5% | 2.0% | 6.2% |
| 100 | stress | S1 30% of debit + T2 scenario +1 ATR | -18.02 | -18.39 | -17.32 | -40.97 | 9% | 27% | 57% | 7% | 8% | -27.24 | -4.17 | -34.7% | 0.0% | 6.3% |
| 100 | stress | S2 70% of debit + T0 0.5 of max profit | -14.76 | -15.55 | -13.79 | -22.30 | 81% | 0% | 19% | 0% | 31% | -27.24 | -4.17 | -28.4% | 1.9% | 6.3% |
| 100 | stress | S2 70% of debit + T1 0.8 of max profit | -14.76 | -15.55 | -13.79 | -22.30 | 81% | 0% | 19% | 0% | 31% | -27.24 | -4.17 | -28.4% | 1.9% | 6.3% |
| 100 | stress | S2 70% of debit + T2 scenario +1 ATR | -14.04 | -14.17 | -13.38 | -22.30 | 71% | 25% | 4% | 0% | 31% | -27.24 | -4.17 | -27.1% | 0.0% | 6.3% |
| 100 | stress | S3 scenario -1 ATR + T0 0.5 of max profit | -21.21 | -22.95 | -20.23 | -38.26 | 30% | 0% | 70% | 0% | 16% | -27.24 | -4.17 | -40.9% | 2.0% | 6.2% |
| 100 | stress | S3 scenario -1 ATR + T1 0.8 of max profit | -21.21 | -22.95 | -20.23 | -38.26 | 30% | 0% | 70% | 0% | 16% | -27.24 | -4.17 | -40.9% | 2.0% | 6.2% |
| 100 | stress | S3 scenario -1 ATR + T2 scenario +1 ATR | -19.20 | -19.92 | -18.52 | -38.26 | 29% | 27% | 44% | 0% | 15% | -27.24 | -4.17 | -37.0% | 0.0% | 6.2% |
| 100 | legging | S0 50% of debit + T0 0.5 of max profit | -7.88 | -9.90 | -7.03 | -26.31 | 34% | 12% | 54% | 0% | 18% | -16.55 | 13.76 | -17.4% | 8.6% | 3.9% |
| 100 | legging | S0 50% of debit + T1 0.8 of max profit | -6.95 | -9.42 | -5.38 | -26.31 | 34% | 5% | 61% | 0% | 18% | -16.55 | 13.76 | -15.4% | 10.4% | 3.9% |
| 100 | legging | S0 50% of debit + T2 scenario +1 ATR | -4.16 | -5.15 | -3.35 | -26.31 | 34% | 24% | 42% | 0% | 18% | -16.55 | 13.76 | -9.2% | 12.1% | 4.0% |
| 100 | legging | S1 30% of debit + T0 0.5 of max profit | -4.55 | -4.53 | -4.65 | -33.77 | 8% | 12% | 79% | 0% | 0% | -16.55 | 13.76 | -10.1% | 9.7% | 3.9% |
| 100 | legging | S1 30% of debit + T1 0.8 of max profit | -3.62 | -4.06 | -3.00 | -33.77 | 8% | 5% | 87% | 0% | 0% | -16.55 | 13.76 | -8.0% | 11.4% | 4.0% |
| 100 | legging | S1 30% of debit + T2 scenario +1 ATR | -0.83 | 0.22 | -0.97 | -33.77 | 8% | 24% | 67% | 0% | 0% | -16.55 | 13.76 | -1.8% | 13.1% | 4.0% |
| 100 | legging | S2 70% of debit + T0 0.5 of max profit | -5.69 | -7.50 | -4.54 | -18.20 | 59% | 12% | 28% | 0% | 29% | -16.55 | 13.76 | -12.6% | 8.5% | 3.9% |
| 100 | legging | S2 70% of debit + T1 0.8 of max profit | -4.75 | -7.01 | -2.88 | -18.20 | 59% | 5% | 36% | 0% | 29% | -16.55 | 13.76 | -10.5% | 10.3% | 4.0% |
| 100 | legging | S2 70% of debit + T2 scenario +1 ATR | -2.30 | -3.17 | -1.19 | -18.20 | 49% | 24% | 26% | 0% | 29% | -16.55 | 13.76 | -5.1% | 11.9% | 4.0% |
| 100 | legging | S3 scenario -1 ATR + T0 0.5 of max profit | -7.67 | -9.60 | -6.80 | -27.72 | 31% | 12% | 57% | 0% | 16% | -16.55 | 13.76 | -17.0% | 8.7% | 3.9% |
| 100 | legging | S3 scenario -1 ATR + T1 0.8 of max profit | -6.74 | -9.12 | -5.15 | -27.72 | 31% | 5% | 64% | 0% | 16% | -16.55 | 13.76 | -14.9% | 10.4% | 3.9% |
| 100 | legging | S3 scenario -1 ATR + T2 scenario +1 ATR | -3.95 | -4.85 | -3.12 | -27.72 | 31% | 24% | 45% | 0% | 16% | -16.55 | 13.76 | -8.8% | 12.1% | 4.0% |
| 200 | base | S0 50% of debit + T0 0.5 of max profit | -12.33 | -17.03 | -9.94 | -43.17 | 40% | 6% | 54% | 0% | 22% | -29.19 | 27.95 | -16.4% | 8.2% | 2.3% |
| 200 | base | S0 50% of debit + T1 0.8 of max profit | -10.50 | -16.12 | -6.25 | -43.17 | 40% | 4% | 57% | 0% | 22% | -29.19 | 27.95 | -14.0% | 9.6% | 2.3% |
| 200 | base | S0 50% of debit + T2 scenario +1 ATR | -5.52 | -7.97 | -3.48 | -43.17 | 40% | 24% | 37% | 0% | 22% | -29.19 | 27.95 | -7.3% | 11.1% | 2.3% |
| 200 | base | S1 30% of debit + T0 0.5 of max profit | -5.80 | -6.34 | -5.42 | -55.18 | 8% | 6% | 85% | 0% | 0% | -29.19 | 27.95 | -7.7% | 9.2% | 2.3% |
| 200 | base | S1 30% of debit + T1 0.8 of max profit | -3.97 | -5.43 | -1.74 | -55.18 | 8% | 4% | 88% | 0% | 0% | -29.19 | 27.95 | -5.3% | 10.6% | 2.3% |
| 200 | base | S1 30% of debit + T2 scenario +1 ATR | 1.01 | 2.72 | 1.04 | -55.18 | 8% | 24% | 68% | 0% | 0% | -29.19 | 27.95 | 1.3% | 12.1% | 2.3% |
| 200 | base | S2 70% of debit + T0 0.5 of max profit | -7.23 | -10.48 | -4.71 | -30.50 | 64% | 6% | 29% | 0% | 34% | -29.19 | 27.95 | -9.6% | 8.1% | 2.3% |
| 200 | base | S2 70% of debit + T1 0.8 of max profit | -5.39 | -9.56 | -1.03 | -30.50 | 64% | 4% | 32% | 0% | 34% | -29.19 | 27.95 | -7.2% | 9.6% | 2.3% |
| 200 | base | S2 70% of debit + T2 scenario +1 ATR | -1.28 | -2.49 | 0.89 | -30.50 | 55% | 24% | 22% | 0% | 34% | -29.19 | 27.95 | -1.7% | 11.0% | 2.3% |
| 200 | base | S3 scenario -1 ATR + T0 0.5 of max profit | -11.97 | -15.86 | -10.06 | -46.88 | 33% | 6% | 61% | 0% | 17% | -29.19 | 27.95 | -15.9% | 8.3% | 2.3% |
| 200 | base | S3 scenario -1 ATR + T1 0.8 of max profit | -10.14 | -14.95 | -6.37 | -46.88 | 33% | 4% | 64% | 0% | 17% | -29.19 | 27.95 | -13.5% | 9.7% | 2.3% |
| 200 | base | S3 scenario -1 ATR + T2 scenario +1 ATR | -5.16 | -6.80 | -3.60 | -46.88 | 33% | 24% | 44% | 0% | 17% | -29.19 | 27.95 | -6.9% | 11.1% | 2.3% |
| 200 | adverse | S0 50% of debit + T0 0.5 of max profit | -17.48 | -22.23 | -14.67 | -45.20 | 41% | 5% | 52% | 3% | 23% | -33.93 | 20.04 | -22.3% | 7.1% | 3.1% |
| 200 | adverse | S0 50% of debit + T1 0.8 of max profit | -16.27 | -21.63 | -12.25 | -45.20 | 41% | 0% | 57% | 3% | 23% | -33.93 | 20.04 | -20.8% | 8.1% | 3.1% |
| 200 | adverse | S0 50% of debit + T2 scenario +1 ATR | -11.48 | -13.86 | -9.40 | -45.20 | 40% | 24% | 33% | 3% | 22% | -33.93 | 20.04 | -14.7% | 8.9% | 3.1% |
| 200 | adverse | S1 30% of debit + T0 0.5 of max profit | -11.81 | -12.55 | -11.02 | -58.23 | 8% | 5% | 87% | 0% | 0% | -33.93 | 20.04 | -15.1% | 7.7% | 3.1% |
| 200 | adverse | S1 30% of debit + T1 0.8 of max profit | -10.61 | -11.95 | -8.60 | -58.23 | 8% | 0% | 92% | 0% | 0% | -33.93 | 20.04 | -13.5% | 8.7% | 3.1% |
| 200 | adverse | S1 30% of debit + T2 scenario +1 ATR | -5.83 | -4.20 | -5.76 | -58.23 | 8% | 24% | 68% | 0% | 0% | -33.93 | 20.04 | -7.4% | 9.5% | 3.2% |
| 200 | adverse | S2 70% of debit + T0 0.5 of max profit | -11.06 | -14.09 | -8.31 | -33.70 | 66% | 5% | 29% | 0% | 34% | -33.93 | 20.04 | -14.1% | 7.1% | 3.1% |
| 200 | adverse | S2 70% of debit + T1 0.8 of max profit | -9.85 | -13.49 | -5.89 | -33.70 | 66% | 0% | 34% | 0% | 34% | -33.93 | 20.04 | -12.6% | 8.1% | 3.2% |
| 200 | adverse | S2 70% of debit + T2 scenario +1 ATR | -6.31 | -7.29 | -4.29 | -33.70 | 56% | 24% | 20% | 0% | 34% | -33.93 | 20.04 | -8.1% | 8.9% | 3.2% |
| 200 | adverse | S3 scenario -1 ATR + T0 0.5 of max profit | -17.85 | -21.75 | -15.62 | -51.69 | 32% | 5% | 63% | 0% | 17% | -33.93 | 20.04 | -22.8% | 7.1% | 3.1% |
| 200 | adverse | S3 scenario -1 ATR + T1 0.8 of max profit | -16.64 | -21.15 | -13.20 | -51.69 | 32% | 0% | 68% | 0% | 17% | -33.93 | 20.04 | -21.3% | 8.1% | 3.1% |
| 200 | adverse | S3 scenario -1 ATR + T2 scenario +1 ATR | -11.86 | -13.40 | -10.36 | -51.69 | 32% | 24% | 44% | 0% | 17% | -33.93 | 20.04 | -15.1% | 8.9% | 3.1% |
| 200 | stress | S0 50% of debit + T0 0.5 of max profit | -22.53 | -26.99 | -19.46 | -48.84 | 44% | 5% | 43% | 8% | 26% | -38.67 | 12.13 | -27.7% | 5.9% | 3.9% |
| 200 | stress | S0 50% of debit + T1 0.8 of max profit | -21.96 | -26.71 | -18.32 | -48.84 | 44% | 0% | 48% | 8% | 26% | -38.67 | 12.13 | -27.0% | 6.4% | 3.9% |
| 200 | stress | S0 50% of debit + T2 scenario +1 ATR | -17.50 | -19.52 | -15.52 | -48.84 | 36% | 24% | 32% | 8% | 23% | -38.67 | 12.13 | -21.5% | 6.5% | 3.9% |
| 200 | stress | S1 30% of debit + T0 0.5 of max profit | -18.19 | -19.40 | -16.81 | -61.33 | 9% | 5% | 85% | 1% | 1% | -38.67 | 12.13 | -22.4% | 6.2% | 3.9% |
| 200 | stress | S1 30% of debit + T1 0.8 of max profit | -17.62 | -19.11 | -15.68 | -61.33 | 9% | 0% | 90% | 1% | 1% | -38.67 | 12.13 | -21.7% | 6.7% | 3.9% |
| 200 | stress | S1 30% of debit + T2 scenario +1 ATR | -13.13 | -11.90 | -12.85 | -61.33 | 9% | 24% | 66% | 1% | 1% | -38.67 | 12.13 | -16.1% | 6.8% | 3.9% |
| 200 | stress | S2 70% of debit + T0 0.5 of max profit | -14.79 | -17.49 | -11.79 | -33.41 | 69% | 5% | 26% | 0% | 32% | -38.67 | 12.13 | -18.2% | 5.9% | 3.9% |
| 200 | stress | S2 70% of debit + T1 0.8 of max profit | -14.22 | -17.20 | -10.66 | -33.41 | 69% | 0% | 31% | 0% | 32% | -38.67 | 12.13 | -17.5% | 6.4% | 3.9% |
| 200 | stress | S2 70% of debit + T2 scenario +1 ATR | -11.32 | -11.97 | -9.41 | -33.41 | 59% | 24% | 16% | 0% | 32% | -38.67 | 12.13 | -13.9% | 6.5% | 3.9% |
| 200 | stress | S3 scenario -1 ATR + T0 0.5 of max profit | -23.64 | -27.54 | -21.11 | -56.57 | 32% | 5% | 63% | 0% | 17% | -38.67 | 12.13 | -29.0% | 5.9% | 3.9% |
| 200 | stress | S3 scenario -1 ATR + T1 0.8 of max profit | -23.07 | -27.26 | -19.98 | -56.57 | 32% | 0% | 68% | 0% | 17% | -38.67 | 12.13 | -28.4% | 6.4% | 3.9% |
| 200 | stress | S3 scenario -1 ATR + T2 scenario +1 ATR | -18.58 | -20.04 | -17.15 | -56.57 | 32% | 24% | 44% | 0% | 17% | -38.67 | 12.13 | -22.8% | 6.5% | 3.9% |
| 200 | legging | S0 50% of debit + T0 0.5 of max profit | -12.72 | -17.47 | -10.28 | -43.15 | 40% | 6% | 54% | 0% | 22% | -29.59 | 27.55 | -16.8% | 8.1% | 2.3% |
| 200 | legging | S0 50% of debit + T1 0.8 of max profit | -10.90 | -16.56 | -6.62 | -43.15 | 40% | 4% | 57% | 0% | 22% | -29.59 | 27.55 | -14.4% | 9.6% | 2.3% |
| 200 | legging | S0 50% of debit + T2 scenario +1 ATR | -5.93 | -8.41 | -3.84 | -43.15 | 40% | 24% | 37% | 0% | 22% | -29.59 | 27.55 | -7.8% | 11.0% | 2.3% |
| 200 | legging | S1 30% of debit + T0 0.5 of max profit | -6.18 | -6.73 | -5.79 | -55.29 | 8% | 6% | 85% | 0% | 0% | -29.59 | 27.55 | -8.2% | 9.1% | 2.3% |
| 200 | legging | S1 30% of debit + T1 0.8 of max profit | -4.36 | -5.82 | -2.12 | -55.29 | 8% | 4% | 88% | 0% | 0% | -29.59 | 27.55 | -5.8% | 10.6% | 2.3% |
| 200 | legging | S1 30% of debit + T2 scenario +1 ATR | 0.62 | 2.33 | 0.65 | -55.29 | 8% | 24% | 68% | 0% | 0% | -29.59 | 27.55 | 0.8% | 12.0% | 2.3% |
| 200 | legging | S2 70% of debit + T0 0.5 of max profit | -7.48 | -10.73 | -4.95 | -30.90 | 65% | 6% | 29% | 0% | 34% | -29.59 | 27.55 | -9.9% | 8.1% | 2.3% |
| 200 | legging | S2 70% of debit + T1 0.8 of max profit | -5.65 | -9.82 | -1.28 | -30.90 | 65% | 4% | 32% | 0% | 34% | -29.59 | 27.55 | -7.5% | 9.6% | 2.3% |
| 200 | legging | S2 70% of debit + T2 scenario +1 ATR | -1.57 | -2.79 | 0.60 | -30.90 | 55% | 24% | 21% | 0% | 34% | -29.59 | 27.55 | -2.1% | 11.0% | 2.3% |
| 200 | legging | S3 scenario -1 ATR + T0 0.5 of max profit | -12.36 | -16.26 | -10.44 | -47.28 | 33% | 6% | 61% | 0% | 17% | -29.59 | 27.55 | -16.4% | 8.2% | 2.3% |
| 200 | legging | S3 scenario -1 ATR + T1 0.8 of max profit | -10.54 | -15.35 | -6.77 | -47.28 | 33% | 4% | 64% | 0% | 17% | -29.59 | 27.55 | -13.9% | 9.7% | 2.3% |
| 200 | legging | S3 scenario -1 ATR + T2 scenario +1 ATR | -5.56 | -7.20 | -4.00 | -47.28 | 33% | 24% | 44% | 0% | 17% | -29.59 | 27.55 | -7.4% | 11.1% | 2.3% |

## Individual family results (base cost, width 200)
| Family | Category | Width | Candidate | Mean P&L/unit (base) | Stop % | Target % | Stop then recovered % |
|---|---|---|---|---|---|---|---|
| STRONG_UP | Directional | 200 | S0 50% of debit + T0 0.5 of max profit | 60.82 | 0% | 100% | 0% |
| STRONG_UP | Directional | 200 | S0 50% of debit + T1 0.8 of max profit | 97.71 | 0% | 75% | 0% |
| STRONG_UP | Directional | 200 | S0 50% of debit + T2 scenario +1 ATR | 49.05 | 0% | 100% | 0% |
| STRONG_UP | Directional | 200 | S1 30% of debit + T0 0.5 of max profit | 60.82 | 0% | 100% | 0% |
| WEAK_UP | Directional | 200 | S0 50% of debit + T0 0.5 of max profit | 28.77 | 0% | 0% | 0% |
| WEAK_UP | Directional | 200 | S0 50% of debit + T1 0.8 of max profit | 28.77 | 0% | 0% | 0% |
| WEAK_UP | Directional | 200 | S0 50% of debit + T2 scenario +1 ATR | 28.77 | 0% | 0% | 0% |
| WEAK_UP | Directional | 200 | S1 30% of debit + T0 0.5 of max profit | 28.77 | 0% | 0% | 0% |
| STRONG_DOWN | Directional | 200 | S0 50% of debit + T0 0.5 of max profit | -39.56 | 100% | 0% | 0% |
| STRONG_DOWN | Directional | 200 | S0 50% of debit + T1 0.8 of max profit | -39.56 | 100% | 0% | 0% |
| STRONG_DOWN | Directional | 200 | S0 50% of debit + T2 scenario +1 ATR | -39.56 | 100% | 0% | 0% |
| STRONG_DOWN | Directional | 200 | S1 30% of debit + T0 0.5 of max profit | -54.42 | 100% | 0% | 0% |
| WEAK_DOWN | Directional | 200 | S0 50% of debit + T0 0.5 of max profit | -38.93 | 55% | 0% | 20% |
| WEAK_DOWN | Directional | 200 | S0 50% of debit + T1 0.8 of max profit | -38.93 | 55% | 0% | 20% |
| WEAK_DOWN | Directional | 200 | S0 50% of debit + T2 scenario +1 ATR | -38.93 | 55% | 0% | 20% |
| WEAK_DOWN | Directional | 200 | S1 30% of debit + T0 0.5 of max profit | -38.76 | 0% | 0% | 0% |
| TIGHT_SIDEWAYS | Non-directional | 200 | S0 50% of debit + T0 0.5 of max profit | -7.63 | 0% | 0% | 0% |
| TIGHT_SIDEWAYS | Non-directional | 200 | S0 50% of debit + T1 0.8 of max profit | -7.63 | 0% | 0% | 0% |
| TIGHT_SIDEWAYS | Non-directional | 200 | S0 50% of debit + T2 scenario +1 ATR | -7.63 | 0% | 0% | 0% |
| TIGHT_SIDEWAYS | Non-directional | 200 | S1 30% of debit + T0 0.5 of max profit | -7.63 | 0% | 0% | 0% |
| WIDE_SIDEWAYS | Non-directional | 200 | S0 50% of debit + T0 0.5 of max profit | -7.90 | 0% | 0% | 0% |
| WIDE_SIDEWAYS | Non-directional | 200 | S0 50% of debit + T1 0.8 of max profit | -7.90 | 0% | 0% | 0% |
| WIDE_SIDEWAYS | Non-directional | 200 | S0 50% of debit + T2 scenario +1 ATR | -7.90 | 0% | 0% | 0% |
| WIDE_SIDEWAYS | Non-directional | 200 | S1 30% of debit + T0 0.5 of max profit | -7.90 | 0% | 0% | 0% |
| CHOPPY | Non-directional | 200 | S0 50% of debit + T0 0.5 of max profit | -8.20 | 0% | 0% | 0% |
| CHOPPY | Non-directional | 200 | S0 50% of debit + T1 0.8 of max profit | -8.20 | 0% | 0% | 0% |
| CHOPPY | Non-directional | 200 | S0 50% of debit + T2 scenario +1 ATR | -8.20 | 0% | 0% | 0% |
| CHOPPY | Non-directional | 200 | S1 30% of debit + T0 0.5 of max profit | -8.20 | 0% | 0% | 0% |
| FALSE_BREAKOUT | Non-directional | 200 | S0 50% of debit + T0 0.5 of max profit | -13.39 | 0% | 0% | 0% |
| FALSE_BREAKOUT | Non-directional | 200 | S0 50% of debit + T1 0.8 of max profit | -13.39 | 0% | 0% | 0% |
| FALSE_BREAKOUT | Non-directional | 200 | S0 50% of debit + T2 scenario +1 ATR | -13.39 | 0% | 0% | 0% |
| FALSE_BREAKOUT | Non-directional | 200 | S1 30% of debit + T0 0.5 of max profit | -13.39 | 0% | 0% | 0% |
| BULL_REVERSAL | Reversal | 200 | S0 50% of debit + T0 0.5 of max profit | -39.58 | 100% | 0% | 100% |
| BULL_REVERSAL | Reversal | 200 | S0 50% of debit + T1 0.8 of max profit | -39.58 | 100% | 0% | 100% |
| BULL_REVERSAL | Reversal | 200 | S0 50% of debit + T2 scenario +1 ATR | -39.58 | 100% | 0% | 100% |
| BULL_REVERSAL | Reversal | 200 | S1 30% of debit + T0 0.5 of max profit | 22.55 | 0% | 0% | 0% |
| BEAR_REVERSAL | Reversal | 200 | S0 50% of debit + T0 0.5 of max profit | -33.76 | 0% | 0% | 0% |
| BEAR_REVERSAL | Reversal | 200 | S0 50% of debit + T1 0.8 of max profit | -33.76 | 0% | 0% | 0% |
| BEAR_REVERSAL | Reversal | 200 | S0 50% of debit + T2 scenario +1 ATR | 42.81 | 0% | 93% | 0% |
| BEAR_REVERSAL | Reversal | 200 | S1 30% of debit + T0 0.5 of max profit | -33.76 | 0% | 0% | 0% |
| MULTI_REVERSAL | Reversal | 200 | S0 50% of debit + T0 0.5 of max profit | -39.71 | 100% | 0% | 100% |
| MULTI_REVERSAL | Reversal | 200 | S0 50% of debit + T1 0.8 of max profit | -39.71 | 100% | 0% | 100% |
| MULTI_REVERSAL | Reversal | 200 | S0 50% of debit + T2 scenario +1 ATR | -39.71 | 100% | 0% | 100% |
| MULTI_REVERSAL | Reversal | 200 | S1 30% of debit + T0 0.5 of max profit | -7.81 | 0% | 0% | 0% |
| BREAKOUT_FAILURE | Reversal | 200 | S0 50% of debit + T0 0.5 of max profit | -33.91 | 0% | 0% | 0% |
| BREAKOUT_FAILURE | Reversal | 200 | S0 50% of debit + T1 0.8 of max profit | -33.91 | 0% | 0% | 0% |
| BREAKOUT_FAILURE | Reversal | 200 | S0 50% of debit + T2 scenario +1 ATR | 47.05 | 0% | 98% | 0% |
| BREAKOUT_FAILURE | Reversal | 200 | S1 30% of debit + T0 0.5 of max profit | -33.91 | 0% | 0% | 0% |
| GAP_UP | Sudden | 200 | S0 50% of debit + T0 0.5 of max profit | 52.55 | 0% | 0% | 0% |
| GAP_UP | Sudden | 200 | S0 50% of debit + T1 0.8 of max profit | 52.55 | 0% | 0% | 0% |
| GAP_UP | Sudden | 200 | S0 50% of debit + T2 scenario +1 ATR | 49.28 | 0% | 100% | 0% |
| GAP_UP | Sudden | 200 | S1 30% of debit + T0 0.5 of max profit | 52.55 | 0% | 0% | 0% |
| GAP_DOWN | Sudden | 200 | S0 50% of debit + T0 0.5 of max profit | -40.85 | 100% | 0% | 100% |
| GAP_DOWN | Sudden | 200 | S0 50% of debit + T1 0.8 of max profit | -40.85 | 100% | 0% | 100% |
| GAP_DOWN | Sudden | 200 | S0 50% of debit + T2 scenario +1 ATR | -40.85 | 100% | 0% | 100% |
| GAP_DOWN | Sudden | 200 | S1 30% of debit + T0 0.5 of max profit | -19.23 | 0% | 0% | 0% |
| FLASH_CRASH | Sudden | 200 | S0 50% of debit + T0 0.5 of max profit | -41.45 | 100% | 0% | 100% |
| FLASH_CRASH | Sudden | 200 | S0 50% of debit + T1 0.8 of max profit | -41.45 | 100% | 0% | 100% |
| FLASH_CRASH | Sudden | 200 | S0 50% of debit + T2 scenario +1 ATR | -41.45 | 100% | 0% | 100% |
| FLASH_CRASH | Sudden | 200 | S1 30% of debit + T0 0.5 of max profit | -8.45 | 0% | 0% | 0% |
| SUDDEN_RECOVERY | Sudden | 200 | S0 50% of debit + T0 0.5 of max profit | -29.94 | 78% | 0% | 78% |
| SUDDEN_RECOVERY | Sudden | 200 | S0 50% of debit + T1 0.8 of max profit | -29.94 | 78% | 0% | 78% |
| SUDDEN_RECOVERY | Sudden | 200 | S0 50% of debit + T2 scenario +1 ATR | -29.94 | 78% | 0% | 78% |
| SUDDEN_RECOVERY | Sudden | 200 | S1 30% of debit + T0 0.5 of max profit | 3.69 | 0% | 0% | 0% |
| VOL_SHOCK | Sudden | 200 | S0 50% of debit + T0 0.5 of max profit | -39.47 | 100% | 0% | 0% |
| VOL_SHOCK | Sudden | 200 | S0 50% of debit + T1 0.8 of max profit | -39.47 | 100% | 0% | 0% |
| VOL_SHOCK | Sudden | 200 | S0 50% of debit + T2 scenario +1 ATR | -39.47 | 100% | 0% | 0% |
| VOL_SHOCK | Sudden | 200 | S1 30% of debit + T0 0.5 of max profit | -46.37 | 0% | 0% | 0% |
| UP_IV_DOWN | Combined | 200 | S0 50% of debit + T0 0.5 of max profit | 59.76 | 0% | 40% | 0% |
| UP_IV_DOWN | Combined | 200 | S0 50% of debit + T1 0.8 of max profit | 59.42 | 0% | 0% | 0% |
| UP_IV_DOWN | Combined | 200 | S0 50% of debit + T2 scenario +1 ATR | 49.16 | 0% | 100% | 0% |
| UP_IV_DOWN | Combined | 200 | S1 30% of debit + T0 0.5 of max profit | 59.76 | 0% | 40% | 0% |
| DOWN_IV_UP | Combined | 200 | S0 50% of debit + T0 0.5 of max profit | -39.44 | 100% | 0% | 0% |
| DOWN_IV_UP | Combined | 200 | S0 50% of debit + T1 0.8 of max profit | -39.44 | 100% | 0% | 0% |
| DOWN_IV_UP | Combined | 200 | S0 50% of debit + T2 scenario +1 ATR | -39.44 | 100% | 0% | 0% |
| DOWN_IV_UP | Combined | 200 | S1 30% of debit + T0 0.5 of max profit | -45.10 | 0% | 0% | 0% |
| UP_IV_UP | Combined | 200 | S0 50% of debit + T0 0.5 of max profit | 47.93 | 0% | 0% | 0% |
| UP_IV_UP | Combined | 200 | S0 50% of debit + T1 0.8 of max profit | 47.93 | 0% | 0% | 0% |
| UP_IV_UP | Combined | 200 | S0 50% of debit + T2 scenario +1 ATR | 48.12 | 0% | 53% | 0% |
| UP_IV_UP | Combined | 200 | S1 30% of debit + T0 0.5 of max profit | 47.93 | 0% | 0% | 0% |
| DOWN_IV_DOWN | Combined | 200 | S0 50% of debit + T0 0.5 of max profit | -39.52 | 100% | 0% | 0% |
| DOWN_IV_DOWN | Combined | 200 | S0 50% of debit + T1 0.8 of max profit | -39.52 | 100% | 0% | 0% |
| DOWN_IV_DOWN | Combined | 200 | S0 50% of debit + T2 scenario +1 ATR | -39.52 | 100% | 0% | 0% |
| DOWN_IV_DOWN | Combined | 200 | S1 30% of debit + T0 0.5 of max profit | -54.47 | 100% | 0% | 0% |
| SIDEWAYS_IV_EXPAND | Combined | 200 | S0 50% of debit + T0 0.5 of max profit | -1.72 | 0% | 0% | 0% |
| SIDEWAYS_IV_EXPAND | Combined | 200 | S0 50% of debit + T1 0.8 of max profit | -1.72 | 0% | 0% | 0% |
| SIDEWAYS_IV_EXPAND | Combined | 200 | S0 50% of debit + T2 scenario +1 ATR | -1.72 | 0% | 0% | 0% |
| SIDEWAYS_IV_EXPAND | Combined | 200 | S1 30% of debit + T0 0.5 of max profit | -1.72 | 0% | 0% | 0% |
| SIDEWAYS_IV_CONTRACT | Combined | 200 | S0 50% of debit + T0 0.5 of max profit | -18.55 | 0% | 0% | 0% |
| SIDEWAYS_IV_CONTRACT | Combined | 200 | S0 50% of debit + T1 0.8 of max profit | -18.55 | 0% | 0% | 0% |
| SIDEWAYS_IV_CONTRACT | Combined | 200 | S0 50% of debit + T2 scenario +1 ATR | -18.55 | 0% | 0% | 0% |
| SIDEWAYS_IV_CONTRACT | Combined | 200 | S1 30% of debit + T0 0.5 of max profit | -18.55 | 0% | 0% | 0% |

## Sensitivity
| Candidate | Width | Dev-sample equal-weight mean | Sensitivity-sample equal-weight mean | Difference |
|---|---|---|---|---|
| S0+T0 (model: rate 5%) | 100 | -7.02 | — | — |
| S2+T1 (model: rate 5%) | 100 | -4.08 | — | — |
| S0+T0 (model: rate 8%) | 100 | -7.17 | — | — |
| S2+T1 (model: rate 8%) | 100 | -4.31 | — | — |
| S0+T0 (model: 2 days to expiry) | 100 | -3.81 | — | — |
| S2+T1 (model: 2 days to expiry) | 100 | -3.83 | — | — |
| S0+T0 (model: 5 days to expiry) | 100 | -2.89 | — | — |
| S2+T1 (model: 5 days to expiry) | 100 | -4.75 | — | — |
| S0+T0 (model: entry IV 14%) | 100 | -5.51 | — | — |
| S2+T1 (model: entry IV 14%) | 100 | -4.88 | — | — |
| S0+T0 (model: entry IV 10%) | 100 | -3.61 | — | — |
| S2+T1 (model: entry IV 10%) | 100 | -4.19 | — | — |
| S0 50% of debit | T0 0.5 of max profit (seed independence) | 100 | -7.15 | -7.24 | -0.08 |
| S2 70% of debit | T1 0.8 of max profit (seed independence) | 100 | -4.19 | -4.20 | -0.00 |

## Reading
- No candidate is selected. A ranking here reflects these synthetic families only.
- The primary diagnostic is equal-weighted; the stress-weighted and set-B columns show whether the ranking depends on weights.
- Individual family rows are reported so no aggregate hides a bad family.
