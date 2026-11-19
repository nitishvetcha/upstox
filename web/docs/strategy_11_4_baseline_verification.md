# Strategy 11.4 Baseline Verification

**Date:** 2026-11-03  
**Decision:** Option B — committed version at `bcdd18a` is the approved frozen baseline.

---

## Verified Baseline

| Property | Value |
|----------|-------|
| Source commit | `bcdd18a` (Add web application code) |
| File | `src/lib/engine/strategy.ts` |
| SHA-256 | `d0170b40a4b9fb6265697edda03917779b9b8acddcaddc4c43488a4b29eb3f18` |
| Line count | 298 |
| Verification | `diff /tmp/strategy_baseline.ts src/lib/engine/strategy.ts` → IDENTICAL |

---

## What Was Reverted

The working tree contained a 4-line change relative to the committed baseline:

```diff
@@ -283,5 +283,9 @@ export function analyze(
-  if (stale.length || missing.length) status = "NO TRADE";
-  else if (best) status = openingWindow || conflict || isEod ? "WAIT" : "TRADE";
+  // Option chain / news stale → direction still readable; only block TRADE, not WAIT.
+  // Market / technical / breadth stale → direction unknown → NO TRADE.
+  const criticalStale = stale.filter((x) => !x.startsWith("Option chain") && !x.startsWith("News is stale"));
+  const criticalMissing = missing.filter((x) => x !== "Option chain / OI" && x !== "Volatility / IV");
+  if (criticalStale.length || criticalMissing.length) status = "NO TRADE";
+  else if (best) status = openingWindow || conflict || stale.length || isEod ? "WAIT" : "TRADE";
```

**Behavioral effect of the reverted change:**  
Option-chain and news staleness would no longer have caused `NO TRADE` — they would only have contributed to `WAIT`. Market, technical and breadth staleness would still have caused `NO TRADE`. This is a substantive signal-generation logic change.

---

## Why This Change Was Not Approved

1. No Git commit message — the change existed only in the uncommitted working tree.
2. No code review record.
3. No approval documentation or sign-off.
4. No test suite update accompanying the change.
5. The strategy version string remained `"11.4-frozen"` despite the behavioral change, which is misleading.

In the absence of any approval evidence, the committed baseline (`bcdd18a`) is taken as the intended frozen state.

---

## Current Status

`src/lib/engine/strategy.ts` is now byte-for-byte identical to the `bcdd18a` committed version.

Verification command:
```bash
git show bcdd18a:web/src/lib/engine/strategy.ts > /tmp/baseline.ts
diff /tmp/baseline.ts src/lib/engine/strategy.ts
# Output: (empty — IDENTICAL)
```

---

## Remaining Action

Create a Git tag pointing to `bcdd18a` after review:

```bash
git tag strategy-11.4-frozen bcdd18a
git push origin strategy-11.4-frozen  # if remote tagging is desired
```

This tag is not yet created. It requires explicit strategy-owner review and approval before tagging.

---

## If the Reverted Change Was Intended

If the option-chain staleness → WAIT behavior was intentional and should be part of Strategy 11.4, the correct process is:

1. Document the behavioral change in a commit message explaining why option-chain staleness should only contribute to WAIT.
2. Update the strategy version string (e.g. `"11.4.1-frozen"` or `"11.5-frozen"`).
3. Update any test suites that assert the old NO TRADE behavior.
4. Get explicit sign-off before restoring the change.

Do not restore the change without completing these steps.
