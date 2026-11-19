# Phase 8 — Pre-collection checklist (collection may not start until every item is ticked)

Status key: [ ] not done. [x] done with evidence recorded.

## A. Approvals
- [ ] Owner approves the read-only collection design (PHASE8_COLLECTION_SPECIFICATION_FINAL).
- [ ] Owner approves the single read-only API verification test and its request volume.
- [ ] Owner approves the sufficiency criteria and the regime rules (PHASE8_DATA_QUALITY_RULES).
- [ ] Owner confirms calibration-only use and that the holdout is defined after the Phase 9 freeze.

## B. API verification (PHASE8_API_CAPABILITY_VERIFICATION)
- [ ] Account entitlements for Market Data Feed V3 confirmed.
- [ ] Current official documentation checked for V3 depth, subscription limits and REST batch size. Source and date recorded.
- [ ] Instrument keys for the selected NIFTY and BANK NIFTY contracts verified against the instrument master.
- [ ] Read-only test run: bid/ask price and quantity, five depth levels, last trade time, IV/Greeks, populated status recorded per field.
- [ ] Depth status recorded as PASS or NOT TESTED. Depth missing is never recorded as PASS.
- [ ] Rate-limit and latency observed; batch size set below the verified limit.

## C. Software readiness
- [ ] Collector implemented as read-only (no order endpoints anywhere in the module).
- [ ] Collection guard in place (`UPSTOX_COLLECTION_ENABLED`, `MARKET_DATA_PROVIDER=upstox`), tested to refuse without both.
- [ ] Storage: append-only JSON Lines, daily SHA-256 manifest, no secrets in files.
- [ ] Tests: stale-quote flagging, crossed-quote flagging, partial-snapshot handling, gap logging, no interpolation.
- [ ] Paper runner, collectors and launch agents confirmed not started.

## D. Cost assumptions
- [ ] PHASE8_COST_ASSUMPTIONS_REGISTER reviewed. All figures labelled as assumptions.
- [ ] Dated official schedules requested (broker, exchange, SEBI, STT, stamp duty, GST). Not required to start calibration collection; required before any result counts as evidence.

## E. Production and safety
- [ ] Production formulas, width rule, Strategy 11.4, risk limits unchanged (diff checked).
- [ ] Engine remains NO-GO.
- [ ] No live orders or automatic execution path exists.

## F. Start
Collection starts only when sections A–C and E are fully ticked. Section D items may remain open for calibration, but they are recorded as open.
