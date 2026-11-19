# Phase 8 — Collection specification (final design; collection NOT started)

Conditional on: PHASE8_API_CAPABILITY_VERIFICATION passing, owner approval of the read-only test, and owner approval of this specification.

## Purpose and limits
Calibration of execution assumptions only (bid/ask behaviour, depth, slippage, liquidity differences between strikes, quote freshness, data gaps, cost sensitivity). It cannot establish profitability, select a stop or target formula, select a width, estimate win probability or expectancy, or serve as the holdout.

## Instruments
- NIFTY and BANK NIFTY index spot; the current weekly (NIFTY) and monthly (BANK NIFTY) expiry, as the chain currently lists them.
- Option contracts: ATM ± 5 strikes, CE and PE. That is 22 strikes × 2 sides = 44 contracts per index, 88 in total, plus index and futures instruments.
- Instrument keys must be verified (see API verification). Keys are not constructed by hand.

## Transport
- Market Data Feed **V3** (WebSocket) subscription, opened once per session and held. The V2 feed is not used.
- Snapshot persisted every 5 minutes, 09:15–15:30 IST, weekdays. Snapshots use the most recent message per instrument; the message timestamp is stored.
- Fallback (only if WebSocket is not usable): REST V3 full-quote requests in batches, with the batch size set by the verified limit. Request count per day is recorded.

## Stored fields per contract per snapshot
Snapshot time (local and UTC); instrument key; LTP; last trade time; bid and ask price; bid and ask quantity; depth levels (price and quantity, five per side, when present); open interest; volume; IV and Greeks (when present, with the field source); message time; and a `populated` flag per field group.

## Storage
- One file per trading day, append-only, JSON Lines.
- SHA-256 of each file recorded at close of day, in a daily manifest.
- Raw message bodies kept for the verification period only; afterwards field-level data only.
- No account identifiers, tokens or secrets in stored files.

## Expiry and regime labels
- Expiry-day sessions are labelled separately (the expiry date of the instrument).
- Regime labels are assigned from index spot and IV path using the rules in PHASE8_DATA_QUALITY_RULES. A session can carry several labels.

## Failure handling
- Token expiry (03:30 IST): the session is recorded as a gap with the reason.
- Rate limits and disconnects: logged with timestamps. Gaps are never filled or interpolated.
- Partial snapshots are kept and flagged, not dropped silently.

## Safety
Read-only. No order endpoints. Gated by the collection guard (`UPSTOX_COLLECTION_ENABLED`, `MARKET_DATA_PROVIDER=upstox`). Does not start the paper runner, collectors or launch agents. Production code, formulas, Strategy 11.4, width rule and risk limits are unchanged. Engine NO-GO.

## Duration
Minimum 60 sessions with full coverage, per the approved sufficiency criteria. Calendar duration is set by market days, not by session count.
