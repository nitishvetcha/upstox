# Phase 8 — Data quality rules (to be fixed before collection starts)

## 1. Snapshot quality
- A snapshot is **complete** if all scheduled instruments have a message with a timestamp within the snapshot window.
- A snapshot is **partial** if some instruments are missing or stale. Partial snapshots are kept and flagged.
- **Stale:** the last message for an instrument is older than 60 seconds at snapshot time. Stale values are flagged and not treated as current quotes.

## 2. Field-level rules
| Field | Rule |
|---|---|
| Bid and ask (paired legs) | Both present, bid < ask, both positive. A crossed or zero quote is flagged. |
| Depth | Five levels per side expected. Fewer levels or zero quantities are flagged, not padded. |
| Last trade time | Must be within the session. Older values are flagged as stale for that leg. |
| IV and Greeks | Taken only from the same message as the price. Absent values stay absent. |
| Timestamps | Message time must be within the 5-minute window. Clock skew above 2 seconds is flagged. |

## 3. Session-level rules
- Session is **included** if: snapshot coverage ≥ 95%; paired-leg bid/ask ≥ 98% of snapshots; no unexplained gap > 15 minutes.
- Session is **excluded** only with a recorded reason. Exclusion never happens silently. Each excluded session keeps its missing-data summary.
- Depth criterion: ≥ 90% of eligible ATM-leg snapshots. If depth is not available from the API, the criterion is **NOT TESTED**, not passed.

## 4. Regime classification (defined before collection)
Computed from the index spot path and IV path of the session, using only the session's own data.
- **Trending:** absolute net move over the session ≥ 0.75 × daily ATR, and at least 70% of 5-minute bars move in the same direction as the net move.
- **Sideways:** absolute net move ≤ 0.25 × daily ATR.
- **Volatile:** session high–low range ≥ 1.25 × daily ATR, or IV change ≥ 10% relative within the session.
A session can carry several labels (for example trending and volatile). Each label needs at least 10 included sessions.
Thresholds are proposals. They are fixed before collection starts and not changed afterwards.

## 5. Expiry sessions
Reported separately. Minimum 8 included expiry sessions. Expiry sessions are not mixed into non-expiry totals.

## 6. Reporting
- Included and excluded session counts, with reasons, reported in every results document.
- Missing data reported per field, per instrument group.
- No value is imputed. Missing is missing.

## 7. What these rules cannot guarantee
Passing these rules does not make the dataset statistically sufficient for profitability conclusions. It only shows that the calibration data is complete enough to be used.
