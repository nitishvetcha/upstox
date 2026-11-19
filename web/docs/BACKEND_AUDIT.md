# Backend audit (2026-11-10)

## 1. GET routes (isolated mock server)
- 68 GET routes, 136 calls (valid and invalid inputs). **PASS** for transport errors (0) and token leakage (0).
- Unknown path parameters return 404 on every parameterised route checked. **PASS**.
- `/api/options-canary` returns 500 when `CANARY_AUTH_SECRET` is unset. Fail-closed, documented. **PARTIAL**: a 503 status would describe a server misconfiguration more accurately. Not changed.
- Authorization (401/403) and provider-failure paths: **NOT TESTED**.

## 2. Write routes (disposable temp store)
| Route | Result |
|---|---|
| saved-picks POST | **PASS** after fix F-W1 (non-string instrument threw; now 422) |
| saved-picks DELETE | **PASS** (valid 200, missing 404, no id 400) |
| risk/assess POST | **PASS** after fix F-W2 (malformed JSON now 400; was 500) |
| auth/logout POST | **PASS** (200 for all bodies; body ignored by design) |
| opportunities/track POST | **PARTIAL**: invalid inputs 400; valid write not tested |
| opportunities/outcomes PATCH | **PARTIAL**: invalid inputs 400; valid write not tested |
| recommendations/generate POST | **PARTIAL**: body ignored (200), no file written in the test store; valid generation not tested |
| Others (15 POST, 0 DELETE, 0 PATCH) | **NOT TESTED**: see `TESTING_AND_VERIFICATION.md` section 5 for each reason |

## 3. Data-layer findings
- Storage is atomic JSON writes (`savedPicks.ts`, `dataRoot.ts`). No database engine. No migrations to test.
- Saved-pick validation rejects VALIDATED self-declaration, LONG/SHORT stop placement, non-positive prices and duplicates on the same IST day.
- The saved-picks store path can be overridden by `SAVED_PICKS_FILE`. If it is not set, the default is `.data/saved-picks/picks.json`. The test harness always set it to a temp path.

## 4. Security observations (backend)
- The provider gate logs endpoint names and never logs tokens. **PASS** (tests).
- Token resolution reads `UPSTOX_ANALYTICS_TOKEN` or `.data/upstox-token.json`. File permissions not inspected. **NOT TESTED**.
- Authentication and authorization model for the write routes was not reviewed beyond the canary secret and logout. **PARTIAL**.

## 5. Not performed
Authorization tests, provider-failure tests, timeout and retry behaviour, rate-limit behaviour, concurrency, and response-schema validation across all routes.
