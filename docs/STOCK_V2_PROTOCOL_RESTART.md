# Stock V2 pre-registered protocol restart (written before the run)

Date: 2026-11-06 (IST). Written for: the project owner. Written **before** the development run below, so the rules cannot be fitted to its result.

## Why a restart

The legacy protocol run in `.research-data/stock-v2/development.json` was made under code hash `c1285bb4…`. The current `src/lib/stockV2` hash is different. The protocol's own check (`scripts/stock-v2-research.ts`, `validation` phase) refuses validation when the code changed after development. So the legacy run cannot be validated. Its outputs are kept, untouched, as legacy records.

## What is fixed (unchanged from the legacy protocol)

- **Data:** `.research-data/intraday-bars-historical/`, read-only. Files named `YYYY-MM-DD-SYMBOL.json`, 375 one-minute candles each.
- **Split:** the first 40 sessions in date order are development; the next 20 are validation.
- **Strategies:** `TREND_RECLAIM` and `PULLBACK_RECLAIM`, as defined in `src/lib/stockV2/signal.ts`.
- **Scenarios:** BASE, CONSERVATIVE, ADVERSE_SLIPPAGE, as defined in `src/lib/stockV2/risk.ts`. Their costs are assumptions and are not validated against a broker.
- **Selection rule** (`SELECTION_RULE` in `src/lib/stockV2/research.ts`): at least 100 development trades, **positive CONSERVATIVE expectancy**, then the higher BASE expectancy. If no candidate qualifies, **no strategy is selected and validation does not run (NO-GO for the candidate set).**
- **Acceptance:** a validation result is accepted only if the selection rule above was satisfied on development. No threshold is relaxed after the fact.

## What changes, and why

1. **Output directory.** The run writes to a new isolated directory, `.research-data/stock-v2-protocol-run-2/`, set by the environment variable `STOCK_V2_OUT_DIR`. The script refuses to write to the legacy directory. Nothing in `.research-data/stock-v2/` is overwritten.
2. **Placeholder method: excluded.** Closing placeholder bars (15:15–15:29, flat, zero volume) are removed before indicators are computed. This is the methodology you settled on earlier. It is recorded in the run's provenance as `placeholderMethod: "excluded"`. Honest disclosure: the earlier development comparison (`.research-data/stock-v2-placeholder-comparison/`) already showed both modes on development sessions. The decision therefore rests on your settled methodology, not on which mode scored better.
3. **Code hash.** The validation phase requires the development run's hash to match the code at validation time. **No file in `src/lib/stockV2/` may change between the development run and any validation run.** The script file itself (`scripts/stock-v2-research.ts`) is outside the hashed folder.

## What is not changed

- Gate mode is **CORE**: market state, event risk, India VIX, NIFTY ATR and verified stocks are not evaluated, because the dataset does not contain them. This is a limit of the result, and it is stated in every output.
- The constituent list is fixed (survivorship is not controlled).
- Nothing is loaded from the validation sessions before the development run is final.

## Pre-declared outcomes

- **If no candidate qualifies on development:** the run stops. The result is recorded as NO-GO for the candidate set. The validation phase is not run. The held-out sessions are not examined.
- **If a candidate qualifies:** validation runs once, on the 20 held-out sessions, for that candidate only, under the same scenarios. The result is recorded whether it is positive or negative.

A negative result is a valid, reportable outcome. It is not a reason to change the rules, the threshold, the split or the scenarios.
