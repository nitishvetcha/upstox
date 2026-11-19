// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { authorizeUrl, exchangeCode, tokenExpiry, verifyConnection } from "./upstoxAuth.ts";
import { UpstoxNetworkBlockedError } from "./upstoxNetworkGate.ts";

process.env.UPSTOX_CLIENT_ID = "cid";
process.env.UPSTOX_CLIENT_SECRET = "top-secret";
process.env.UPSTOX_REDIRECT_URI = "http://localhost:3123/api/auth/callback";

test("token expires at the next 03:30 IST", () => {
  // 14:00 IST Mon -> 03:30 IST Tue (= 22:00 UTC Mon)
  assert.equal(tokenExpiry(new Date("2026-10-05T08:30:00Z")).toISOString(), "2026-10-05T22:00:00.000Z");
  // 02:00 IST Tue (before 03:30) -> 03:30 IST same morning
  assert.equal(tokenExpiry(new Date("2026-10-05T20:30:00Z")).toISOString(), "2026-10-05T22:00:00.000Z");
  // 03:30 IST exactly -> next day
  assert.equal(tokenExpiry(new Date("2026-10-05T22:00:00Z")).toISOString(), "2026-10-06T22:00:00.000Z");
});

test("authorize URL carries client id, exact redirect URI and state, never the secret", () => {
  const u = new URL(authorizeUrl("abc-123"));
  assert.equal(u.origin + u.pathname, "https://api.upstox.com/v2/login/authorization/dialog");
  assert.equal(u.searchParams.get("client_id"), "cid");
  assert.equal(u.searchParams.get("redirect_uri"), "http://localhost:3123/api/auth/callback");
  assert.equal(u.searchParams.get("state"), "abc-123");
  assert.ok(!u.href.includes("top-secret"));
});

test("fail-closed network gate: exchangeCode and verifyConnection throw when MARKET_DATA_PROVIDER is not upstox", async () => {
  const savedProvider = process.env.MARKET_DATA_PROVIDER;
  try {
    delete process.env.MARKET_DATA_PROVIDER;

    let fetchCalled = false;
    const guardedFetch = (async () => {
      fetchCalled = true;
      return Response.json({});
    }) as unknown as typeof fetch;

    // 1. exchangeCode must throw UpstoxNetworkBlockedError and never touch fetch
    await assert.rejects(
      async () => exchangeCode("code-123", new Date(), guardedFetch),
      (err: unknown) => err instanceof UpstoxNetworkBlockedError,
    );
    assert.equal(fetchCalled, false, "exchangeCode must not reach fetch when network gate blocks");

    // 2. verifyConnection must throw UpstoxNetworkBlockedError and never touch fetch
    fetchCalled = false;
    await assert.rejects(
      async () => verifyConnection("token-123", guardedFetch),
      (err: unknown) => err instanceof UpstoxNetworkBlockedError,
    );
    assert.equal(fetchCalled, false, "verifyConnection must not reach fetch when network gate blocks");

    // 3. Same fail-closed refusal when MARKET_DATA_PROVIDER is explicitly 'mock'
    process.env.MARKET_DATA_PROVIDER = "mock";
    await assert.rejects(
      async () => exchangeCode("code-123", new Date(), guardedFetch),
      (err: unknown) => err instanceof UpstoxNetworkBlockedError,
    );
    await assert.rejects(
      async () => verifyConnection("token-123", guardedFetch),
      (err: unknown) => err instanceof UpstoxNetworkBlockedError,
    );
    assert.equal(fetchCalled, false, "Neither call reaches fetch when provider is mock");
  } finally {
    if (savedProvider === undefined) delete process.env.MARKET_DATA_PROVIDER;
    else process.env.MARKET_DATA_PROVIDER = savedProvider;
  }
});

test("code exchange: success stores expiry, failure surfaces Upstox's message without the secret (when network allowed)", async () => {
  const savedProvider = process.env.MARKET_DATA_PROVIDER;
  process.env.MARKET_DATA_PROVIDER = "upstox";
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, init) => {
      const body = new URLSearchParams(String(init?.body));
      assert.equal(body.get("grant_type"), "authorization_code");
      assert.equal(body.get("redirect_uri"), "http://localhost:3123/api/auth/callback");
      return Response.json({ access_token: "tok", user_name: "Test User", user_id: "U1" });
    };
    const t = await exchangeCode("good", new Date("2026-10-05T08:30:00Z"));
    assert.equal(t.accessToken, "tok");
    assert.equal(t.expiresAt, "2026-10-05T22:00:00.000Z");

    globalThis.fetch = async () =>
      Response.json({ status: "error", errors: [{ message: "Invalid Auth code" }] }, { status: 401 });
    await assert.rejects(exchangeCode("bad"), (e: Error) => /Invalid Auth code/.test(e.message) && !e.message.includes("top-secret"));
  } finally {
    globalThis.fetch = realFetch;
    if (savedProvider === undefined) delete process.env.MARKET_DATA_PROVIDER;
    else process.env.MARKET_DATA_PROVIDER = savedProvider;
  }
});

test("verifyConnection: handles success and error status codes when network allowed", async () => {
  const savedProvider = process.env.MARKET_DATA_PROVIDER;
  process.env.MARKET_DATA_PROVIDER = "upstox";
  try {
    const successFetch = (async () => Response.json({ status: "success" })) as unknown as typeof fetch;
    assert.equal(await verifyConnection("valid-token", successFetch), "UPSTOX_CONNECTED");

    const authExpiredFetch = (async () => Response.json({}, { status: 401 })) as unknown as typeof fetch;
    assert.equal(await verifyConnection("expired-token", authExpiredFetch), "UPSTOX_AUTH_EXPIRED");

    const apiErrorFetch = (async () => Response.json({}, { status: 500 })) as unknown as typeof fetch;
    assert.equal(await verifyConnection("valid-token", apiErrorFetch), "UPSTOX_API_ERROR");

    const networkErrorFetch = (async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch;
    assert.equal(await verifyConnection("valid-token", networkErrorFetch), "UPSTOX_NETWORK_ERROR");
  } finally {
    if (savedProvider === undefined) delete process.env.MARKET_DATA_PROVIDER;
    else process.env.MARKET_DATA_PROVIDER = savedProvider;
  }
});
