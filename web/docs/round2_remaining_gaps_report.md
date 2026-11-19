# Round 2 Remaining Gaps — Post-Remediation

**Date:** 2026-11-03  
**Scope:** Remaining work after documentation consistency remediation.

## Blocking gaps

| Area | Status | Exact blocker / next authorization |
|---|---|---|
| Disk crash recovery | **Blocked; not implemented** | Owner must decide all 15 items in recovery plan §10. A later engineering phase must implement and pass R01–R27 plus additional cases using isolated synthetic storage. |
| Per-stock technical overlay | **Design complete; live integration blocked** | Owner must approve overlay policy/weights, top-N/request budget, exchange-calendar source, and production integration. Pure implementation/tests require separate code authorization. |
| Fundamental scoring | **Blocked; no provider selected** | Current official provider documentation must be verified first; then separate approvals are required for evaluation, credentials, purchase (if any), and integration. |
| Exercise STT/IPFT | **Blocked** | Requires authoritative statutory specification; no rates should be guessed. |
| Historical options | **Blocked** | Requires appropriate Upstox plan and separately authorized authentication/live validation. |

## Other known gaps preserved from the 204-row tracker

- `POST /api/risk/assess` remains Partially Complete because input validation is missing.
- Performance/load tests, Docker/container configuration, and authorized live broker execution are Not Implemented; live broker execution is intentionally outside scope.
- Four E2E cases that require authentication remain an external/live-auth concern; this remediation did not rerun browser tests or start port 3123.

## Work that can proceed independently after authorization

- Recovery owner review can decide D1–D14 without production-data access.
- Per-stock pure validation/normalization/indicator/provenance code and PT01–PT23 can be built offline with synthetic fixtures in a separate phase.
- Official fundamental-provider documentation can be reviewed without selecting or purchasing a provider, but that review is online work and was prohibited in this session.
- The risk-route input guard is an unrelated offline code change and was not included in this documentation-only remediation.

## Safety/status clarification

The completed work is documentation consistency only. It does not make the application live-trading-ready, does not repair any production records, and does not convert any blocked tracker row to Complete.
