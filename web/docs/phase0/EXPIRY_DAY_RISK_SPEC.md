# Expiry-day risk specification (proposal, not implemented)

Proposed rule (pending validation): no new trades in contracts expiring that day.

Why: expiry sessions have rapid theta decay, high gamma, sudden premium changes, wider spreads and sensitivity to small index moves. Ordinary-day stop and target behaviour does not apply.

Existing positions on expiry day need a separately written policy. Proposal: flag them for manual review; no automatic action. Owner to decide.

Data to record for future research (no decision made from it yet): premium and spread on expiry days, time of day, fills versus theoretical prices.

Not invented: no cutoff time (12:00 or 14:00) is set. The current codebase documents a 15:15 expiry-exit cutoff (`transactionCosts.ts`), which is not enforced for every entry (R-07).

Status: PROPOSED. Not implemented.
