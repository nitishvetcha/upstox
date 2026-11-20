# Verified stock-strategy replication — 2026-11-20

## Purpose

Run the existing daily stock candidates against the project’s verified broad equity history without changing the live recommendation engine. This is a **development-only replication**, not a validation, a holdout test, or permission to recommend trades.

## Dataset and integrity rules

- Source: `.research-data/upstox-daily-universe-verified-2026-11-08/`.
- The source manifest reports 9,588 expected and valid files, 0 missing, 0 invalid, and 6,485,741 raw candles. Its calendar spans 2000-01-03 to 2026-11-05.
- Only dates in the verified NSE-equity calendar are used. Non-calendar bars are excluded rather than treated as trading sessions.
- Each parsed bar must have positive, internally consistent OHLC values, non-negative volume, a unique date, and strictly increasing dates.
- The runner fingerprints every input series and writes a new, immutable output directory.
- A symbol needs at least 252 in-range-or-earlier daily observations. No missing data is filled.

## Scope and rule freeze

- Development window: 2000-01-01 through 2015-12-31.
- Candidates and simulation are exactly the pre-existing `TREND_BREAKOUT_20`, `PULLBACK_RSI2`, and `DONCHIAN_55` rules in `src/lib/research/dailyEquity.ts`; no parameters are tuned in this run.
- Each signal executes next session's open with adverse slippage. Stops, gaps, costs, time stops, and corporate-action-style jumps are handled by the existing causal simulator.
- Both base and conservative cost assumptions are reported. The conservative result is the decision-relevant one.
- Validation and the 2022+ period are not accessed by this runner. It does not select a live candidate.

## Hard limitations

The collected universe contains companies listed at collection time. It excludes companies that delisted earlier and has no point-in-time membership history. It therefore has survivorship bias. Corporate-action coverage also is not complete across the entire universe. A positive development result is not a live edge; a negative result is useful rejection evidence. Before a stock strategy can be promoted, it needs a separately approved, point-in-time, survivorship-free validation universe and executable-cost evidence.

## Run command

```bash
node --experimental-strip-types scripts/daily-equity-verified-development.ts
```

The output is written once to `.research-data/daily-equity-verified-development-2026-11-20/development.json`.

## Development-only result

The run used 32 clean, long-history symbols. Of 2,397 coverage records, 1,315 did not have enough history before the end of 2015 and **1,050 were excluded** because their JSON series repeat at least one verified calendar date (the provider records may differ only by timestamp). The manifest's file-valid flag therefore does not by itself establish a deduplicated per-session series. Those records were not repaired or deduplicated.

| Candidate | Conservative trades | Conservative expectancy | Profit factor | Decision |
|---|---:|---:|---:|---|
| `TREND_BREAKOUT_20` | 900 | −0.034 R | 0.946 | Rejected in development |
| `PULLBACK_RSI2` | 2,474 | −0.144 R | 0.631 | Rejected in development |
| `DONCHIAN_55` | 689 | +0.104 R | 1.149 | Research hypothesis only |

`DONCHIAN_55` is not promoted: the run is survivorship-biased, the clean long-history sample is only 32 names, and no validation or holdout was opened. The immediate data task is to resolve the 1,050 duplicate-date records in a new verified source version, then re-register and validate the rule on a point-in-time, survivorship-free universe.
