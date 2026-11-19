# Phase 9B Stage 4 — account-entitlement verification instructions

**Offline/read-only procedure. Do not obtain an authorized WebSocket URL, open a connection, send a subscription, or call an Upstox API.** Documentation-level availability is not account-level entitlement.

## Owner procedure

1. Sign in to the Upstox account/developer console using the normal browser UI.
2. Open the account's plan, subscriptions, or market-data access page. Do not open an API tester.
3. Look for an explicit account-specific statement covering **Market Data Feed V3** and **Full** mode (five-level depth), not merely a general documentation link.
4. Record the visible plan name, entitlement wording, connection limit, Full-mode instrument limit, and the date/time checked.
5. Save a screenshot or account-generated document locally. Do not paste an access token, API secret, authorized URL, cookie, or account identifier into the repository.
6. Complete the confirmation template below. If the account page does not explicitly state the entitlement, record `UNCONFIRMED`; do not test it by connecting.

## Owner confirmation template

```text
Checked at (IST):
Account plan shown:
Market Data Feed V3 explicitly listed: YES / NO / NOT SHOWN
Full mode explicitly listed: YES / NO / NOT SHOWN
Connection limit shown:
Full-mode instrument limit shown:
Evidence retained locally (no secret path/content committed): YES / NO
Result: CONFIRMED / NOT ENTITLED / UNCONFIRMED
Owner name/initials:
```

## Acceptance rule

- `CONFIRMED` requires explicit account-specific wording for V3 Full mode.
- A Plus badge, API token, successful REST quote, or public documentation is insufficient by itself.
- `NOT SHOWN`, ambiguity, or a conflict with official documentation means `UNCONFIRMED`.
- Until the owner records `CONFIRMED`, the pilot readiness gate remains closed.
