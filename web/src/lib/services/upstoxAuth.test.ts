// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { authorizeUrl, exchangeCode, tokenExpiry } from "./upstoxAuth.ts";

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

test("code exchange: success stores expiry, failure surfaces Upstox's message without the secret", async () => {
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
  }
});
