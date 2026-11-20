# Issue 2: Market-Data STALE Classification Investigation

Date: 2026-11-06 (IST). Written for: the project owner and reviewers.

Question: why do the NIFTY and BANK NIFTY recommendation engines report `READY · data STALE`, and why do the diagnostics report `INSUFFICIENT_TECHNICAL_DATA` and `NO_VALID_STRATEGY`?

Read-only. No source file, protected record, credential, or Upstox/NSE request was used or changed. Line numbers are from the working tree at the time of inspection.

## 1. Executive summary

- **The STALE label is produced by design, and the most likely source is the option chain, not the spot quote.** The repository's own documents say `/v2/option/chain` carries no trade timestamp, and that the chain is therefore classified STALE during the open session. The code, the Phase 30 tests and `chainFreshness.ts` all implement that rule on purpose. This is the leading hypothesis, with high confidence from the code and repository documents. It has **not** been observed in a live response.
- **The spot quote cannot be confirmed or excluded offline.** Whether a NIFTY or BANK NIFTY index quote carries `last_trade_time` is not recorded anywhere in the repository. If it does not, the spot quote is also STALE by the same design rule.
- **`INSUFFICIENT_TECHNICAL_DATA` is a mislabel.** Any unavailable factor (including an option-chain factor) produces the blocker text "Not enough comparable data to trade: …", and the diagnostic classifies every such text as `INSUFFICIENT_TECHNICAL_DATA`, whichever factor is named. This is a confirmed bug in the classifier, not a safety gate.
- **`NO_VALID_STRATEGY` is a consequence.** When any factor is unavailable, the engine builds no candidates, and the diagnostic then reports no valid strategy. The strategy never evaluated a setup.
- **Two further defects were found, and both are real:**
  - The chain-consistency tolerance is a percentage with no tick allowance, so a one-tick difference on a cheap option can fail verification.
  - Breadth freshness substitutes the current time for a constituent quote without a trade time, which makes that quote look fresh. The spot and chain paths treat a missing timestamp as STALE. The two paths disagree.
- **A correction to the previous diagnostic report.** `UPSTOX_LIVE_DIAGNOSTIC_REPORT.md` says the chain verifier checks "up to seven strikes around ATM", and that the spot quote is the most likely cause. Both statements are wrong: the verifier requests **every** contract in the chain (the parameter that would have limited it is unused), and the repository's documents point to the chain as the structural cause.

## 2. The short path, and what decides it

```
spot quote (last_trade_time?)  ─┐
option chain (no chain time)   ─┼─► raw source label ─► diagnostic "freshness" ─► overall STALE
breadth (constituent times)    ─┘                  └──► factor available? (source must equal market source)
technical candles (fetch time) ── LIVE ─┘                       │
                                                                ▼
                       unavailable factor ─► "Not enough comparable data…" ─► candidates = []
                                                                ▼
                       classifier ─► INSUFFICIENT_TECHNICAL_DATA ; no candidates ─► NO_VALID_STRATEGY
```

The discriminating fact is **which factor names appear in the blocker text** in the diagnostic JSON you already have (§7). That text is not a live request.

## 3. Freshness rules table

| Source | Timestamp field | Unit / parsing | Missing timestamp | Thresholds | Future timestamp | Freshness basis | Code |
|---|---|---|---|---|---|---|---|
| Spot quote | `last_trade_time` on the index quote | epoch ms; accepted only if ≥ 2020-01-01 | `null` → **STALE** while OPEN/PRE-OPEN; END_OF_DAY when CLOSED | LIVE < 30 s; AGING 30–120 s (source LIVE); **STALE > 120 s** | > 5 s ahead → source **UNAVAILABLE** | exchange trade time | `upstoxMarket.ts:76–89` (normaliser), `:217–232` (`liveQuoteSource`), `time.ts:139–190` |
| Option chain | none on `/v2/option/chain`; falls back to the maximum `last_trade_time` found in the chain payload | epoch ms (≥ 2020) | no chain timestamp → **STALE** while OPEN (`liveQuoteSource(null)`) | as spot | as spot | exchange trade time, if present | `upstoxMarket.ts:192–201` (`ltts`, `lastTradeTime`), `:416–447` (`getOptionChain`), `:441` (fallback) |
| Chain quote verifier (per contract) | `last_trade_time` from `/v3/market-quote/quotes` | epoch ms; `> 0` only (no 2020 floor) | `CONTRACT_PRICE_UNAVAILABLE` | per contract: LIVE < 30 s; AGING; STALE > 120 s | as spot | exchange trade time per contract | `optionPriceVerification.ts:129–131`, `:152–157` |
| Breadth (constituents) | `last_trade_time` per constituent quote | epoch ms (≥ 2020) | **substituted by the current time** (`now()`) | breadth status: `tradeFreshnessOf(latest, now, 1.25)` → STALE > **150 s**, END_OF_DAY when CLOSED | as spot | the *latest* constituent time | `upstoxMarket.ts:365–372` (substitution), `breadthService.ts:103` (rule), `:105–123` (status), `:133` (source) |
| Technical candles (15m, 1d, opening) | candle `timestamp` (bar time) | ISO with +05:30 | n/a | **not judged**: source is LIVE whenever the series is non-empty | not checked | **fetch time** (`fetchedAt = now()` on the intraday request; history cached 1 h, intraday 60 s) | `upstoxMarket.ts:258–268` (`getCandles`), `:296–323` (`getTechnicals`), `candles.ts` (cache TTLs) |
| News | article publish time | ISO | n/a | LIVE ≤ 6 h; AGING ≤ 24 h | n/a | publish time | `newsConfig.ts:16`, `market.ts:66–84` (snapshot maps to LIVE or UNAVAILABLE only) |
| Engine staleness (blockers) | `fetchedAt` (not trade time) | ms | n/a | market 120 s; chain 120 s; technical 300 s; breadth 150 s; news 3600 s | n/a | **fetch time** | `strategy.ts:169–183` |

Two different staleness notions are in use:
- **Raw source label** (trade-time based): drives the diagnostic `freshness` object (`recommendationDiagnostic.ts:297, 307`) and factor availability (`analysis.ts:212–213`).
- **Engine blocker** (fetch-time based): drives `Market data is stale` and `Option chain is stale` (`strategy.ts:176–177`).

They disagree by design or by accident. The 15m intraday candle cache is 60 s (`candles.ts:17`, `intradayTtlMs`), and the history cache is 1 h (`candles.ts:22`). The chain cache TTL was not verified, so its value is unknown here. The fetch-time rule therefore fires only when a cached response is older than its threshold; the cache TTLs make that unlikely, but the chain figure is unconfirmed. The diagnostic can report STALE while the engine's own staleness check reports fresh.

**Conversion to IST.** Freshness is computed from epoch milliseconds, so it does not depend on time zone. Trading-day and session decisions use IST (`marketStatus`, `time.ts:66–72`; `istToday`, `time.ts:103`). The END_OF_DAY test compares the IST date of the trade with the latest trading session (`time.ts:191–195`).

**Future timestamps.** A trade time more than 5 seconds in the future is **UNAVAILABLE**, not STALE (`time.ts:165–170`). So clock skew that puts exchange time ahead of the local clock by more than 5 seconds would show as UNAVAILABLE. It cannot produce the STALE label. A local clock that is more than 120 seconds **behind** the exchange would make ages negative, which are clamped; a local clock more than 120 seconds **ahead** would make every quote STALE.

**Clock sync.** A read-only query to `time.apple.com` (NTP) reported an offset of about +5 ms from this machine's clock, at 11:05 IST on 2026-11-06. So the local clock is close to network time at the time of the check. The machine's time-source setting (`timedatectl`-style) was not read, and this single sample says nothing about exchange clock skew over a longer period.

## 4. NIFTY and BANK NIFTY findings

The two indices use the same code paths. Their chains are structurally identical (`/v2/option/chain`, no chain timestamp). Their spot quotes are both `NSE_INDEX` instruments. A cause that is the same for both indices is more likely than an index-specific one.

| Input | NIFTY | BANK NIFTY | Status |
|---|---|---|---|
| Spot quote LTT | unknown | unknown | not recorded in the repository (§5) |
| Chain LTT | none (documented) | none (documented) | structural, high confidence |
| Chain verifier | all contracts requested (~270 keys for 135 strikes, from your report) | all contracts requested (~308 keys for 154 strikes) | all-or-nothing rule (§5.4) |
| Technicals | LIVE by construction (non-empty candles) | LIVE by construction | confirmed from code |
| Breadth | depends on constituent LTTs; LTT-less quotes are counted as fresh | same | confirmed from code |
| Overall label | STALE (reported) | STALE (reported) | consistent with the chain rule |
| Blockers | `INSUFFICIENT_TECHNICAL_DATA`, `NO_VALID_STRATEGY` | same | mechanism confirmed; which factor is missing unknown |

The reported symptoms are identical for both indices. The live freshness values for each index were **not** observed (§7).

## 5. Investigation by area

### 5.1 Spot quote (Investigation C)

- **Field.** `normalizeQuote` reads `last_trade_time` (`upstoxMarket.ts:86–88`). It keeps the value only if it is a number ≥ 2020-01-01 in milliseconds. A value in seconds, zero, or absent becomes `null`. Nothing else is read as a timestamp. No other field is used as a fallback. Good: a fallback would be unproven.
- **Does an index quote carry it?** Not known. The repository's index-quote fixtures include `last_trade_time` (for example `marketData.test.ts:62`, `technical.test.ts:201`), but these are test constructions, not recorded responses. The only recorded evidence about trade timestamps is for options and constituent stocks (`docs/options-data-audit.md:15`). **Unconfirmed.**
- **Is an unavailable index timestamp treated as stale?** Yes, and this is intentional. Tests MQ30-02 and LS30-02 (`phase30_1.test.ts:46–50`, `:133–139`) require "OPEN + missing LTT → STALE, not LIVE". So the current code does what it was designed to do. The design question is whether an index quote without a trade time can be judged any other way. The code already documents that it cannot be proven live.
- **Other trustworthy timestamp in the response?** Not in `normalizeQuote`. The raw quote response may contain other fields; the code reads none of them as time. Whether one exists is unknown from the repository. Any fallback needs proof that it represents trade activity, and the brief rules that out for now.

### 5.2 Option chain (Investigation D)

- **Timestamp.** `normalizeChain` derives a chain timestamp from `last_trade_time` on the row or on `call_options`/`put_options.market_data` (`upstoxMarket.ts:192–201`). The repository documents that the v2 chain payload does not contain it (`docs/options-data-audit.md:9–10`; `docs/FINAL_OPERATIONAL_READINESS_REPORT.md:55`). With no timestamp, `lastTradeTime` is `null`, and `getOptionChain`'s fallback returns `liveQuoteSource(null)` → **STALE** while OPEN (`:441`).
- **ATM selection.** There is none. `verifyEvaluationOptionPrices` requests `allContractKeys(rows)` (`optionPriceVerification.ts:211`), which is every contract in the chain. The `_maxStrikesAtm = 7` parameter (`:206`) is accepted and never used. The comment says "verification must cover that same universe". **This corrects the previous diagnostic report.**
- **How many must pass.** For the verifier's `LIVE` state, **every** requested key must be LIVE, eligible, and consistent (`:252–253`). The chain source becomes LIVE only when that state is LIVE **and** analytics are complete (`:440`). The remaining case falls back to the chain's own timestamp, which does not exist.
- **Can one illiquid strike make the whole chain STALE?** The verifier's state can be pulled down by a single contract: a contract older than 30 s makes the state AGING; older than 120 s makes it STALE (`:255–259`). But the chain's **source** does not depend on the verifier's state in the absence of a chain timestamp. Either way, the chain source is STALE, so the answer is: the chain is STALE because it has no timestamp, and the verifier cannot rescue it because it requires all contracts.
- **Missing timestamps in the verifier.** A contract with no `last_trade_time` (or `≤ 0`) becomes `CONTRACT_PRICE_UNAVAILABLE` (`optionPriceVerification.ts:129–131`). It counts as not LIVE.
- **LTP consistency** (`:154`): `consistent = ltp > 0 && |chainLtp − quoteLtp| ≤ ltp × 2%`. There is **no tick allowance**. The tick is ₹0.05. For a chain LTP under ₹2.50, 2% is less than one tick, so any one-tick difference between the chain and quote fetches fails the check (`python` arithmetic: at ₹2.00, the tolerance is ₹0.04; at ₹1.00, ₹0.02). With ~270–308 contracts, at least one cheap contract failing is likely, which makes the verifier's state MISMATCH and never LIVE. **Confirmed design gap.** Its effect is on the verifier's state and on eligibility, not on the chain source directly, because the source falls back anyway. It is still a real defect in the verifier.
- **Chain timestamp vs verifier timestamp.** They can disagree. The chain has no timestamp, and its LTP is fetched a few milliseconds before the quote LTP. The consistency check compares prices, not times. Not a timestamp conflict, but a price-timing gap, and the 2% rule is the wrong tool for it.
- **Batch size.** `OPTION_QUOTE_BATCH_SIZE = 500` (`optionPriceVerification.ts:5`), so a full chain is one request. Not a rate concern at this size.
- **chainFreshness.** `chainFreshness.ts` states the design: "the snapshot is always unverified; judge each contract individually". It counts LIVE contracts per side. Its result is attached to the snapshot (`market.ts:120`) and is **not** used for the chain source or for factor availability. So the per-contract information that Upstox does provide is computed and then not used for the STALE decision.

### 5.3 Technical candle freshness (Investigation E, part 1)

- Candles are fetched from `/v3/historical-candle` (history, cached 1 h) and the intraday endpoint (cached 60 s for 15m, `candles.ts` plan). The merged series is the input (`upstoxMarket.ts:258–268`).
- The source is **LIVE whenever the merged series is non-empty** (`:262–265`). No candle is compared with the current time. The `fetchedAt` is the time of the intraday request (`now()`).
- So technicals are LIVE if the response has bars, however old those bars are. A correct freshness judgement would use the timestamp of the last completed bar, which the code does not read for this purpose.
- The engine's own technical staleness check uses `fetchedAt` with a 300 s allowance (`strategy.ts:179`). With a 60 s cache this almost never fires.

### 5.4 Breadth (Investigation D/E, part 2)

- Each constituent's timestamp is its trade time, or `now()` when missing (`upstoxMarket.ts:365–372`). **A missing trade time is treated as a fresh quote.** The spot and chain paths treat a missing trade time as STALE. The breadth tests (`breadth.test.ts`) pass `timestamp: null` but only for classification, not freshness. Nothing tests the substitution. **Confirmed inconsistency; it makes breadth LIVE by construction when constituent times are absent.**
- The breadth status takes the **latest** constituent time, with a 150 s threshold (`breadthService.ts:103`). STALE status becomes source `UNAVAILABLE` (`:133`), not `STALE`. So the diagnostic's raw `breadth` label cannot read STALE from this path.

### 5.5 Overall source classification (Investigation A, item 6)

- `buildSnapshot` assembles the sources (`market.ts:117`): market = spot, optionChain = chain, technical = candles, news = feed, breadth = breadth source.
- The diagnostic sets `overall = STALE` if **any** raw source equals `STALE` (`recommendationDiagnostic.ts:297`). `UNAVAILABLE` does not count. So a future-skewed spot quote (UNAVAILABLE) would **not** produce the STALE label. The reported STALE label therefore needs a STALE source, which points to the chain (no timestamp) or to a spot quote without a timestamp or older than 120 s.

### 5.6 Factor availability and source matching (Investigation E, part 3)

- Each factor has a subsystem and is available only if `c !== null && src === base` (`analysis.ts:212–213`). `base` is the market (spot) source.
- Mapping (`analysis.ts:198–206`):
  - Market trend, Price action, Technical indicators → technical source.
  - Option chain / OI, Volatility / IV → optionChain source.
  - News sentiment → news source.
  - Breadth / confirmation → breadth source.
- **Is the source-matching rule logically correct?** The rule is consistent: it asks that every factor be judged on the same freshness basis as the market. Its weakness is that it compares **labels**, not data. Two problems follow:
  - A `LIVE` label on candles means "non-empty", while a `LIVE` label on spot means "traded within 30–120 s". The labels do not mean the same thing, so a LIVE candle set can be "comparable" to a STALE quote while the reverse is not true.
  - A `UNAVAILABLE` chain label blocks the chain factors in the same way as STALE, even though one is a data-presence fact and the other a freshness judgement.

  Neither point is a bug in the comparison. Both mean the label is doing more work than it should.

### 5.7 From factors to the blocker text

- A missing factor set produces `missing` (`strategy.ts:199`). If it is non-empty, the strategy does not build candidates (`strategy.ts:213`, `switch (missing.length ? null : m.regime)`).
- The blocker text is `Not enough comparable data to trade: <factor labels> unavailable` (`strategy.ts:257`). The "Full confirmation requires live news data" text is added separately when the news factor is missing and the news source differs from the market source (`:256`).
- The classifier (`recommendationDiagnostic.ts:143–144`):
  - `is stale` → `INSUFFICIENT_FRESHNESS`;
  - `not enough comparable data` → `INSUFFICIENT_TECHNICAL_DATA`, **whatever the named factors are**.
- `NO_VALID_STRATEGY` is added when there are no candidates and the decision is not TRADE (`recommendationDiagnostic.ts:222`).

**Why the observed codes are consistent with the chain hypothesis.** The engine's fetch-time staleness check does not fire (§3), so no `STALE_MARKET_DATA` or `INSUFFICIENT_FRESHNESS` blocker is expected. The only blocker is the "not enough comparable data" text, and the mapping then reports it as `INSUFFICIENT_TECHNICAL_DATA`. That matches what you reported. It also matches a spot-only cause, so the codes alone do not discriminate between them. The factor labels do (§7).

## 6. Confidence and unknowns

| Question | Confidence | Basis |
|---|---|---|
| The chain's raw source is STALE during OPEN | **High** | Code path `:441` with no chain timestamp; repository documents and readiness report; Phase 30 tests |
| The overall STALE label comes from the chain | **High** | `recommendationDiagnostic.ts:297` plus §5.2 |
| The index spot quote carries `last_trade_time` | **Unknown** | No recorded index quote in the repository |
| The spot quote is STALE | **Unknown** | Depends on the line above |
| `INSUFFICIENT_TECHNICAL_DATA` is a mislabel for option-chain factors | **High** | `recommendationDiagnostic.ts:144` ignores the factor names |
| Both indices behave the same | **Medium** | Same code paths; the live values were not observed |
| The local clock is not skewed | **Partly confirmed** | One NTP sample: about +5 ms offset (§3). Not a long-term check |
| Live values | **Not observed** | Lives in the running server and the browser only |

## 7. What settles the live question, without a new request

1. **Blocker text.** In the existing diagnostic JSON (or the browser), read the `blockers` array for each index. If the named factors are `Option chain / OI` and/or `Volatility / IV` (and not `Market trend`, `Price action`, `Technical indicators`), the cause is the chain. If the technical factors are named, the cause is the spot quote or the candles. This is the single most decisive check.
2. **Freshness object.** Read `freshness.spot`, `freshness.optionChain`, `freshness.technicals`, `freshness.breadth`. A STALE chain with a LIVE spot confirms §7.1.
3. **Raw index quote.** In the browser network log, open the request to `/v2/market-quote/quotes` for the index key, and read whether `last_trade_time` is present and in what unit. This settles the spot question.

Not one of these needs a new Upstox request.

## 8. Root cause

**Primary (high confidence): the option chain has no trade timestamp.** The app maps a missing chain timestamp to STALE during the open session, by design. The chain-level verifier cannot provide a LIVE state, because it needs every contract in the chain to be LIVE and consistent, and the consistency rule cannot be met for cheap contracts. The chain's STALE source then makes the overall label STALE and makes both chain factors unavailable.

**Secondary (confirmed defect): the classifier mislabels any unavailable factor as `INSUFFICIENT_TECHNICAL_DATA`.** This turns an option-chain freshness gate into a "technical data" message. It does not change any decision, but it sends the reader to the wrong place.

**Unknown (cannot be settled offline): whether the spot quote also lacks a timestamp.** If it does, it is a second, independent cause, and the technical factors also drop out.

## 9. Confirmed bugs versus intentional gates

| # | Item | Classification | Evidence |
|---|---|---|---|
| G1 | Missing trade time during OPEN → STALE (spot and chain) | **Intentional safety gate** | `phase30_1.test.ts:46–50`, `:133–139`; `productionReadinessAudit.test.ts:151`; `chainFreshness.ts` header |
| G2 | Chain snapshot is always unverified (no exchange generation time) | **Intentional safety gate** | `chainFreshness.ts:1–4`; `FINAL_OPERATIONAL_READINESS_REPORT.md:55` |
| G3 | Factor requires a matching source (same freshness basis as market) | **Intentional gate** (the rule is consistent; see §5.6) | `analysis.ts:212–213` |
| G4 | Missing factors suppress candidate construction | **Intentional gate** | `strategy.ts:213` |
| G5 | 120 s live threshold | **Intentional threshold; do not relax to produce LIVE** | `time.ts:95–100`, `:184–187` |
| B1 | Classifier maps any "not enough comparable data" to `INSUFFICIENT_TECHNICAL_DATA` regardless of factor | **Confirmed bug (mislabel)** | `recommendationDiagnostic.ts:144` |
| B2 | Chain consistency tolerance is percentage-only; cannot be met for premiums under ₹2.50 with a ₹0.05 tick | **Confirmed design defect** | `optionPriceVerification.ts:154` |
| B3 | Verifier requires every contract in the chain to be LIVE; the parameter that would limit it is unused | **Confirmed defect (unused parameter; scope decision needed)** | `optionPriceVerification.ts:206, 211, 252–253` |
| B4 | Breadth substitutes `now()` for a missing constituent trade time, so the quote counts as fresh | **Confirmed inconsistency** | `upstoxMarket.ts:372`; no test covers it |
| B5 | Technical candles are judged LIVE by presence and fetch time, not by bar time | **Confirmed gap** (technicals can be LIVE with old bars) | `upstoxMarket.ts:262–265`, `:323` |
| B6 | Engine staleness (fetch-time) and diagnostic staleness (trade-time) disagree | **Confirmed inconsistency** | `strategy.ts:169–183` vs `recommendationDiagnostic.ts:297` |
| B7 | The per-contract information that `chainFreshness` computes is not used for the chain source | **Design gap, a decision for the owner** | `chainFreshness.ts`; `market.ts:120` |
| U1 | Whether the index quote has `last_trade_time` | **Unknown** | §5.1 |

## 10. Recommended minimal corrections (not implemented)

For each, the risk and the test are given. Nothing here relaxes the 120 s threshold.

**C1. Make the blocker class name the factor (B1).**
- Root cause: the classifier ignores which factor is named.
- Correction: classify "Not enough comparable data…" by its factor names: chain factors → `INSUFFICIENT_OPTION_CHAIN` or `INSUFFICIENT_FRESHNESS`; technical factors → `INSUFFICIENT_TECHNICAL_DATA`; mixed → both.
- Risk: presentation only. No decision changes. The UI and any reports that read the code name must be updated together.
- Test: classifier cases for each factor set; the existing blocker-text tests must still pass.

**C2. Make the verifier's consistency tolerance tick-aware (B2).**
- Correction: consistent if `|diff| ≤ max(2% × ltp, one tick)`.
- Risk: loosens a safety check, slightly, for cheap contracts. The decision is the owner's. It does not by itself make the chain LIVE (the chain source falls back to the chain timestamp, which is absent).
- Test: boundary cases at ₹0.50, ₹1.00, ₹2.50 and ₹50 with a one-tick difference; the 2% boundary at ₹100.

**C3. Breadth: treat a missing constituent time as unknown, not fresh (B4).**
- Correction: exclude constituents without a trade time from the freshness judgement, or judge the set as UNKNOWN when too many are missing (the spot rule is "missing → STALE").
- Risk: breadth coverage shrinks and breadth can become PARTIAL or UNAVAILABLE more often, which removes a factor during OPEN. That is the intended effect of not fabricating freshness, and it needs the owner's acceptance.
- Test: breadth with all, some and no constituent timestamps; the spot/chain/breadth rules agree on a missing timestamp.

**C4. Technical freshness by bar time (B5).** Only if the owner wants technicals judged on the same basis as spot.
- Correction: compare the last completed bar's time with the current time, using the 15m interval.
- Risk: technicals can become STALE in OPEN when a data gap exists, which lowers availability. A decision for the owner.
- Test: a series whose last bar is 10 minutes old is not LIVE; a series ending at the last completed bar is LIVE.

**C5. Decide what the chain should use (B3, B7). A product decision, not a bug fix.**
- Options: (a) keep the current rule (the chain is STALE; recommendations are impossible in OPEN until the endpoint provides a timestamp, which is the documented position); (b) a per-contract coverage rule for ATM-near contracts, using `chainFreshness`, with a stated threshold.
- Risk of (b): this changes the freshness gate itself. It must not be done to produce a LIVE label. It needs a written rule, approval, and tests for the threshold.
- Test (if approved): coverage at the threshold, and that a stale ATM contract still blocks.

**C6. Do not change the spot rule until U1 is answered.** If the index quote has no trade time, the spot path needs a trustworthy timestamp from Upstox, or it stays STALE. No fallback should be introduced without proof that it represents trade activity.

**C7. Align the two staleness notions (B6).** Decide whether the diagnostic's trade-time label or the engine's fetch-time check is authoritative, and document it. This is a decision, not a one-line fix.

## 11. Offline test plan

Each test uses fixtures or injected responses. None makes a network call.

| # | Test | Asserts |
|---|---|---|
| T1 | Freshness boundaries (`tradeFreshnessOf`) at 29, 30, 119, 120, 121 s, OPEN and CLOSED | exact LIVE / AGING / STALE / END_OF_DAY |
| T2 | Future timestamp at 4 s and 6 s ahead | 4 s: not future-rejected; 6 s: UNAVAILABLE |
| T3 | Index quote with and without `last_trade_time` | missing → spot source STALE (OPEN), END_OF_DAY (CLOSED) |
| T4 | Chain with no timestamp | chain source STALE (OPEN) |
| T5 | Chain verifier with every contract LIVE and consistent | state LIVE (positive control) |
| T6 | Chain verifier with one contract at 130 s | state STALE; chain source still STALE |
| T7 | Consistency with one tick difference at ₹0.50, ₹2.00, ₹50 | today: MISMATCH at ₹0.50 and ₹2.00; after C2: consistent |
| T8 | Breadth with a constituent missing `last_trade_time` | today: counted fresh (documents B4); after C3: not fresh |
| T9 | Factor availability for each source combination (LIVE/LIVE, LIVE/STALE, STALE/LIVE, UNAVAILABLE/LIVE) | available only when labels match |
| T10 | Classifier for each factor set (C1) | chain-only → chain code; technical-only → technical code; mixed → both |
| T11 | Engine blocker text for each factor set | text lists exactly the unavailable factors |
| T12 | Candle series ending 10 minutes ago (after C4) | not LIVE |
| T13 | Breadth status at the 150 s boundary | STALE → source UNAVAILABLE (documents `breadthService.ts:133`) |

Each correction must come with its own positive and negative cases, and the existing Phase 30 tests must still pass unchanged.

## 12. How to prove a correction works

1. Run the offline suite before and after each correction, and confirm that only the intended tests change.
2. For C1, read the classifier output for a recorded blocker set (fixture) and confirm the code names the chain, not the technicals.
3. For C2, C3 and C4, show the boundary cases and that no LIVE result is produced by a stale or missing input.
4. For any change that affects the live label, a read-only check: re-read the diagnostic JSON that already exists, and confirm the reasons. A live run would need explicit permission, and is not part of this investigation.

## 13. Confirmation

- **No source file was modified.** The only file written is this report, `docs/ISSUE2_STALE_CLASSIFICATION_INVESTIGATION.md`.
- **No protected data was modified, as far as the checks show.** `web/.research-data/` entries carry mtimes from 4–5 November 2026, before this investigation. `.data/` was not listed in this check (it does not appear in git status). No content hash or baseline comparison was run.
- **No Upstox or NSE request was made.** The diagnostic, health and dashboard routes were not called. One outbound request was made: a read-only NTP query to `time.apple.com` for the clock check (§3). It is not an Upstox or NSE request.
- **No authentication was verified or refreshed.** The OAuth file and `.env.local` were not read as values.
- **No historical data was collected, no backtest ran, and no collector, runner, paper monitor or canary was started.**
- **Strategy 11.4 was not changed.** Its hash was checked: `web/src/lib/engine/strategy.ts` matches SHA-256 `d0170b40…3eb3f18`.
- **Recommendation thresholds and risk controls were not changed.**
- **Existing dirty Git changes were preserved.** Nothing was staged, committed, reset or cleaned.

The investigation stops here. No fix has been implemented.
