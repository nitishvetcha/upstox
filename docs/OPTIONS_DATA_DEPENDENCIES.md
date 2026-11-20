# Options Data Dependencies and Collection Proposal

Status: register and proposal only. **No collection has been performed or approved in this document.** Collection requires your explicit approval, as the brief states.

## 1. Dependency register

| Input | Required for | Available now? | Source | Gap / note |
|---|---|---|---|---|
| Index spot (NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY, SENSEX, BANKEX) | Direction, trend, VWAP | Yes (live API and research samples) | Upstox market quotes | Historical intraday candles for indices exist only as 15-minute research pulls and daily; no 1-minute index history in repo |
| Option chain (CE/PE per strike, per expiry) | Strike choice, premium, OI, IV | Partly | Upstox `/v2/option/chain` | No chain generation timestamp (F6 in audit). Chain LTT missing in raw response |
| Contract master (strike, expiry, lot size, instrument key) | Contract mapping, lot sizing | Yes | Upstox option contract endpoint | Mapping validated in research audit (expiry-to-master check) |
| Contract-level quotes (LTP, bid/ask, volume, OI, last trade time) | Premium, liquidity, freshness | Yes (live); samples only (historical) | Upstox market quote V3 | No historical contract quote series with bid/ask over time |
| Greeks (delta, gamma, theta, vega) | Strike selection, risk | Partly | Quote fields when provided; strategy also uses a delta-only estimate | Not verified against an independent model; no historical Greeks |
| Implied volatility | IV analysis, IV agreement | Partly | Chain IV; recomputed IV in research | Chain IV missing for BANKEX in ~56% of liquid samples (research data) |
| Historical contract premiums with bid/ask | Options backtesting | **No** | — | Required for any valid options backtest (see §3) |
| India VIX history | Volatility regime | No | — | Not in repo; official source to be confirmed |
| Event-risk history | Event gate | No | — | Not in repo |
| Expiry calendar (holidays, special sessions) | Expiry selection | Partly | `time.ts` holiday list | Same provenance caveat as Stock V2 |
| Transaction cost schedule (options) | Net P&L | Assumption | — | Must be verified before quoting net results (§4) |

## 2. Six-index data trust (from the research audit)

Pooled over the two qualifying slots of 28 Oct and 5 Nov (interim, not a verdict):

- BANKNIFTY passes freshness, price agreement and IV checks to date.
- NIFTY fails price agreement (81%) with fresh quotes; the chain side is the suspected cause, not proven.
- FINNIFTY (22% fresh) and MIDCPNIFTY (58%) fail freshness; their stale contracts are mainly monthly.
- SENSEX fails freshness (89%) and price agreement (88%).
- BANKEX has 25 liquid samples and is not usable for validation.

Only one qualifying session exists per index. The protocol requires five. See `docs/OPTIONS_POST_COLLECTION_INVESTIGATION.md`.

## 3. Historical backtest availability

A valid historical options backtest needs, per contract and timestamp: premium, bid/ask (or a documented execution proxy), strike, expiry, option type, volume and OI, and any contract adjustments. The repository has none of this as a historical series. Underlying index candles must not be used as a substitute for option premiums. **Conclusion: no valid historical options backtest is possible from the existing data.** Options work is limited to strategy logic tests, contract-mapping tests, quote-freshness tests, Greeks and risk calculations on clearly labelled fixtures.

## 4. Cost schedule — status

Options costs (brokerage, STT on premium sell side, exchange charges, SEBI, stamp duty, GST) have not been verified against a current tariff in this pass. They must be labelled as assumptions. Conservative scenarios (1.5× charges, 0.2% slippage on premium) are to be run before any net figure is quoted.

## 5. Proposed collection plan (for approval — not executed)

Purpose: extend the protocol's qualifying sessions for all six indices. This is the minimum needed to reach the five-session requirement.

- **Dates:** earliest regular trading days after 5 Nov 2026: 6 Nov (Fri), 9 Nov (Mon), 11 Nov (Wed), 12 Nov (Thu). Exclude 10 Nov and 24 Nov (holidays) and 8 Nov (Muhurat session, too short).
- **Indices:** NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY, SENSEX, BANKEX.
- **Slots per session:** 8 at 10:35, 11:15, 11:55, 12:35, 13:15, 13:55, 14:35, 15:15 IST, spaced 40 minutes apart.
- **Rounds:** 4 sessions × 8 slots = 32 rounds per index; 192 index-rounds in total.
- **API calls:** not measured in this pass. Count the requests from the research collector's log for one round before approval (the dev-server log records every Upstox request with an endpoint and status). Do not treat any figure here as a measured budget.
- **Data volume:** the current research file averages about 14.0 KB per record (measured on 127 records). Scale this by the planned record count (192 index-rounds, 22 samples each) before approval.
- **Expected cost:** no monetary cost beyond the existing Upstox account; subject to the account's rate limits.
- **Expected benefit:** qualifying sessions per index rise from 1 toward the 5 required. It does not fix stale BANKEX, FINNIFTY or MIDCPNIFTY contracts, or the NIFTY/SENSEX chain-price disagreement.
- **Risks:** the gate bug was fixed at 12:49 on 5 Nov; the schedule must be run through the repaired gate and must not run missed slots late.
- **Required approvals:** the dates, the slots, the six indices, and the request budget.

Awaiting your explicit approval before any collection.
