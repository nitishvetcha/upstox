// Credential sources, states and provenance. Deterministic: temporary token files, an injected or stubbed fetch, and
// explicit control of UPSTOX_ANALYTICS_TOKEN in every case. No test can reach the network.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  classifyToken, evidenceAuthStatus, getAccessToken, markTokenInvalid, resolveCredential, stateAfterVerification,
  tokenStatus, verifyCurrentCredential,
} from "./upstoxAuth.ts";
import { defaultFallbackDeps, withFallback } from "./market.ts";
import { GET as statusGET } from "../../app/api/auth/status/route.ts";

const DAY = 86_400_000;

// Runs fn with the given environment variables set (undefined = unset), then restores them.
async function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void>) {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) { saved[k] = process.env[k]; if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k]; }
  try { await fn(); } finally {
    for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
}

// Runs fn with globalThis.fetch replaced, then restores it.
async function withFetch(impl: typeof fetch, fn: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try { await fn(); } finally { globalThis.fetch = original; }
}

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "upstox-auth-"));
const oauthToken = (expiresInMs: number) => ({
  provider: "upstox", accessToken: "oauth-test-value", userId: null, userName: null,
  issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + expiresInMs).toISOString(), invalidatedAt: null,
});
function writeToken(file: string, t: object) { fs.writeFileSync(file, JSON.stringify(t), "utf8"); }

// A fetch that records each URL and answers with the given status. Never reaches the network.
function answering(status: number, calls: string[] = []): typeof fetch {
  return (async (url: string | URL | Request) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ status: status === 200 ? "success" : "error", data: {} }), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}
const forbidden: typeof fetch = (async () => { throw new Error("network must not be used in this case"); }) as typeof fetch;

// 1. Analytics token configured, OAuth file absent.
test("A1. analytics configured, OAuth file absent: CONFIGURED_UNVERIFIED from the analytics source, no expiry", () => withEnv({ UPSTOX_ANALYTICS_TOKEN: "analytics-test-value" }, async () => {
  const file = path.join(tmpDir(), "absent.json");
  const st = await tokenStatus(new Date(), file);
  assert.equal(st.status, "CONFIGURED_UNVERIFIED");
  assert.equal(st.source, "ANALYTICS");
  assert.equal(st.expiresAt, null, "analytics expiry is unknown, so none is claimed");
  assert.equal((await resolveCredential(new Date(), file))?.source, "ANALYTICS");
}));

// 2. Analytics configured, verification not performed.
test("A2. analytics configured, verification not performed: no request is made and the state is not verified", () => withEnv({ UPSTOX_ANALYTICS_TOKEN: "analytics-test-value" }, () => withFetch(forbidden, async () => {
  const file = path.join(tmpDir(), "absent.json");
  const st = await tokenStatus(new Date(), file); // would throw if it touched the network
  assert.notEqual(st.status, "VERIFIED_CONNECTED", "presence alone must not verify a credential");
  assert.equal(evidenceAuthStatus(st.status), "UNVERIFIED");
})));

// 3. Analytics verification success.
test("A3. analytics verification success: VERIFIED_CONNECTED, one read-only quote request, source ANALYTICS", () => withEnv({ UPSTOX_ANALYTICS_TOKEN: "analytics-test-value", MARKET_DATA_PROVIDER: "upstox" }, async () => {
  const calls: string[] = [];
  const r = await verifyCurrentCredential(new Date(), path.join(tmpDir(), "absent.json"), answering(200, calls));
  assert.equal(r.status, "VERIFIED_CONNECTED");
  assert.equal(r.connection, "UPSTOX_CONNECTED");
  assert.equal(r.source, "ANALYTICS");
  assert.equal(calls.length, 1, "exactly one verification request");
  assert.match(calls[0], /market-quote\/quotes/);
  assert.equal(evidenceAuthStatus(r.status), "CONNECTED");
}));

// 4. Analytics verification failure.
test("A4. analytics verification failure: VERIFICATION_FAILED for a rejected token, a server error and a network error", () => withEnv({ UPSTOX_ANALYTICS_TOKEN: "analytics-test-value", MARKET_DATA_PROVIDER: "upstox" }, async () => {
  const file = path.join(tmpDir(), "absent.json");
  const rejected = await verifyCurrentCredential(new Date(), file, answering(401));
  assert.equal(rejected.status, "VERIFICATION_FAILED");
  assert.equal(rejected.connection, "UPSTOX_AUTH_EXPIRED");
  const serverError = await verifyCurrentCredential(new Date(), file, answering(500));
  assert.equal(serverError.status, "VERIFICATION_FAILED");
  const network = await verifyCurrentCredential(new Date(), file, (async () => { throw new Error("offline"); }) as typeof fetch);
  assert.equal(network.status, "VERIFICATION_FAILED");
  assert.equal(network.connection, "UPSTOX_NETWORK_ERROR");
  assert.equal(stateAfterVerification("UPSTOX_CONNECTED"), "VERIFIED_CONNECTED");
  assert.equal(stateAfterVerification("UPSTOX_API_ERROR"), "VERIFICATION_FAILED");
}));

// 5. OAuth expired.
test("A5. OAuth expired: EXPIRED, no credential is offered, and verification makes no request", () => withEnv({ UPSTOX_ANALYTICS_TOKEN: undefined }, () => withFetch(forbidden, async () => {
  const file = path.join(tmpDir(), "oauth.json");
  writeToken(file, oauthToken(-DAY));
  assert.equal((await tokenStatus(new Date(), file)).status, "EXPIRED");
  assert.equal(await resolveCredential(new Date(), file), null);
  const r = await verifyCurrentCredential(new Date(), file, forbidden); // would throw if it made a request
  assert.equal(r.status, "EXPIRED");
  assert.equal(r.connection, null);
})));

// 6. OAuth valid.
test("A6. OAuth valid: CONFIGURED_UNVERIFIED from the OAUTH source until verified, then VERIFIED_CONNECTED", () => withEnv({ UPSTOX_ANALYTICS_TOKEN: undefined, MARKET_DATA_PROVIDER: "upstox" }, async () => {
  const file = path.join(tmpDir(), "oauth.json");
  writeToken(file, oauthToken(DAY));
  const st = await tokenStatus(new Date(), file);
  assert.equal(st.status, "CONFIGURED_UNVERIFIED");
  assert.equal(st.source, "OAUTH");
  const cred = await resolveCredential(new Date(), file);
  assert.equal(cred?.source, "OAUTH");
  const r = await verifyCurrentCredential(new Date(), file, answering(200));
  assert.equal(r.status, "VERIFIED_CONNECTED");
  assert.equal(r.source, "OAUTH");
}));

// 7. Both configured: analytics priority is unchanged.
test("A7. both configured: the analytics token is still selected, and the source says so", () => withEnv({ UPSTOX_ANALYTICS_TOKEN: "analytics-test-value" }, async () => {
  const file = path.join(tmpDir(), "oauth.json");
  writeToken(file, oauthToken(DAY));
  const cred = await resolveCredential(new Date(), file);
  assert.equal(cred?.source, "ANALYTICS");
  assert.equal(cred?.token, "analytics-test-value");
  assert.equal(await getAccessToken(), "analytics-test-value", "getAccessToken keeps its priority");
  assert.equal((await tokenStatus(new Date(), file)).source, "ANALYTICS");
}));

// 8. Analytics-token 401 does not modify the OAuth file.
test("A8. analytics-token 401 leaves the OAuth file byte-identical, and the fallback is still mock", () => withEnv({ UPSTOX_ANALYTICS_TOKEN: "analytics-test-value", MARKET_DATA_PROVIDER: "upstox", UPSTOX_TOKEN_FILE: undefined }, async () => {
  const file = path.join(tmpDir(), "oauth.json");
  writeToken(file, oauthToken(DAY));
  const before = fs.readFileSync(file);
  process.env.UPSTOX_TOKEN_FILE = file; // the production default file, so the invalidation path is exercised for real
  await withFetch(answering(401), async () => {
    const res = await withFallback((p) => p.getMarketSnapshot("nifty"), defaultFallbackDeps());
    assert.equal(res.fallbackReason, "UPSTOX_AUTH_EXPIRED");
    assert.ok(res.data, "mock data is served");
  });
  assert.ok(fs.readFileSync(file).equals(before), "the OAuth file must be byte-identical after an analytics 401");
}));

// 9. OAuth-token 401 follows the existing invalidation behaviour.
test("A9. OAuth-token 401 invalidates the OAuth file, as before", () => withEnv({ UPSTOX_ANALYTICS_TOKEN: undefined, MARKET_DATA_PROVIDER: "upstox", UPSTOX_TOKEN_FILE: undefined }, async () => {
  const file = path.join(tmpDir(), "oauth.json");
  writeToken(file, oauthToken(DAY));
  process.env.UPSTOX_TOKEN_FILE = file;
  await withFetch(answering(401), async () => {
    const res = await withFallback((p) => p.getMarketSnapshot("nifty"), defaultFallbackDeps());
    assert.equal(res.fallbackReason, "UPSTOX_AUTH_EXPIRED");
  });
  const stored = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.ok(typeof stored.invalidatedAt === "string", "the OAuth file records the invalidation");
  assert.equal((await tokenStatus(new Date(), file)).status, "INVALID");
}));

// 10. withFallback preserves the mock fallback reason codes.
test("A10. withFallback keeps its fallback reasons: auth expired, not connected", () => withEnv({ UPSTOX_ANALYTICS_TOKEN: undefined, MARKET_DATA_PROVIDER: "upstox", UPSTOX_TOKEN_FILE: undefined }, async () => {
  const dir = tmpDir();
  // No credential at all: NOT_CONNECTED.
  process.env.UPSTOX_TOKEN_FILE = path.join(dir, "missing.json");
  const none = await withFallback((p) => p.getMarketSnapshot("nifty"), defaultFallbackDeps());
  assert.equal(none.fallbackReason, "UPSTOX_NOT_CONNECTED");
  // Expired OAuth file: AUTH_EXPIRED, without any request.
  const expired = path.join(dir, "expired.json");
  writeToken(expired, oauthToken(-DAY));
  process.env.UPSTOX_TOKEN_FILE = expired;
  await withFetch(forbidden, async () => {
    const res = await withFallback((p) => p.getMarketSnapshot("nifty"), defaultFallbackDeps());
    assert.equal(res.fallbackReason, "UPSTOX_AUTH_EXPIRED");
  });
}));

// 11. Collector provenance does not claim a verified connection from token presence.
test("A11. provenance: presence maps to UNVERIFIED, only a successful verification maps to CONNECTED", () => withEnv({ UPSTOX_ANALYTICS_TOKEN: "analytics-test-value" }, async () => {
  const st = await tokenStatus(new Date(), path.join(tmpDir(), "absent.json"));
  assert.equal(evidenceAuthStatus(st.status), "UNVERIFIED", "a configured analytics token is never recorded as CONNECTED");
  assert.equal(evidenceAuthStatus("VERIFIED_CONNECTED"), "CONNECTED");
  assert.equal(evidenceAuthStatus("VERIFICATION_FAILED"), "NOT_CONNECTED");
  assert.equal(evidenceAuthStatus("EXPIRED"), "EXPIRED");
  assert.equal(evidenceAuthStatus("INVALID"), "EXPIRED");
  assert.equal(evidenceAuthStatus("MISSING"), "NOT_CONNECTED");
  assert.equal(evidenceAuthStatus("UNKNOWN"), "UNKNOWN");
}));

// 12. Determinism: the result does not depend on whether the shell exports the analytics variable.
test("A12. local state is the same whether or not the analytics variable is set in the environment", async () => {
  const file = path.join(tmpDir(), "absent.json");
  await withEnv({ UPSTOX_ANALYTICS_TOKEN: undefined }, async () => {
    assert.equal((await tokenStatus(new Date(), file)).status, "MISSING");
  });
  await withEnv({ UPSTOX_ANALYTICS_TOKEN: "analytics-test-value" }, async () => {
    assert.equal((await tokenStatus(new Date(), file)).status, "CONFIGURED_UNVERIFIED");
  });
});

// Classifier branches.
test("A13. classifyToken: invalidated, unreadable and valid files", () => {
  const future = new Date(Date.now() + DAY).toISOString();
  assert.equal(classifyToken({ kind: "ok", token: { accessToken: "x", expiresAt: future, invalidatedAt: new Date().toISOString(), issuedAt: "", userId: null, userName: null } }), "INVALID");
  assert.equal(classifyToken({ kind: "unreadable" }), "UNKNOWN");
  assert.equal(classifyToken({ kind: "missing" }), "MISSING");
  assert.equal(classifyToken({ kind: "ok", token: { accessToken: "x", expiresAt: future, invalidatedAt: null, issuedAt: "", userId: null, userName: null } }), "CONFIGURED_UNVERIFIED");
});

// markTokenInvalid is the only writer of invalidatedAt; it is exercised by A9 and must not run for analytics (A8).
test("A14. markTokenInvalid writes only the file it is given, and only once", async () => {
  const file = path.join(tmpDir(), "oauth.json");
  writeToken(file, oauthToken(DAY));
  await markTokenInvalid(new Date(), file);
  const first = JSON.parse(fs.readFileSync(file, "utf8")).invalidatedAt;
  await markTokenInvalid(new Date(Date.now() + 60_000), file);
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).invalidatedAt, first, "an existing invalidation is not overwritten");
});


// Route level: the status endpoint itself, called as a request handler.
test("A15. status endpoint: a configured analytics token is connected:false without ?verify=1, and makes no request", () => withEnv({ UPSTOX_ANALYTICS_TOKEN: "analytics-test-value", UPSTOX_TOKEN_FILE: undefined }, () => withFetch(forbidden, async () => {
  const body = await (await statusGET(new Request("http://localhost/api/auth/status"))).json();
  assert.equal(body.connected, false, "presence is not a connection");
  assert.equal(body.tokenStatus, "CONFIGURED_UNVERIFIED");
  assert.equal(body.credentialSource, "ANALYTICS");
  assert.equal(body.verificationRequested, false);
  assert.ok(!JSON.stringify(body).includes("analytics-test-value"), "the credential value is never returned");
})));

test("A16. status endpoint: ?verify=1 with a successful request is connected:true", () => withEnv({ UPSTOX_ANALYTICS_TOKEN: "analytics-test-value", UPSTOX_TOKEN_FILE: undefined, MARKET_DATA_PROVIDER: "upstox" }, () => withFetch(answering(200), async () => {
  const body = await (await statusGET(new Request("http://localhost/api/auth/status?verify=1"))).json();
  assert.equal(body.connected, true);
  assert.equal(body.tokenStatus, "VERIFIED_CONNECTED");
  assert.equal(body.verificationRequested, true);
  assert.equal(body.connection, "UPSTOX_CONNECTED");
  assert.ok(!JSON.stringify(body).includes("analytics-test-value"), "the credential value is never returned");
})));

test("A17. status endpoint: ?verify=1 with a rejected request is connected:false and reports the failure", () => withEnv({ UPSTOX_ANALYTICS_TOKEN: "analytics-test-value", UPSTOX_TOKEN_FILE: undefined, MARKET_DATA_PROVIDER: "upstox" }, () => withFetch(answering(401), async () => {
  const body = await (await statusGET(new Request("http://localhost/api/auth/status?verify=1"))).json();
  assert.equal(body.connected, false);
  assert.equal(body.tokenStatus, "VERIFICATION_FAILED");
  assert.equal(body.connection, "UPSTOX_AUTH_EXPIRED");
})));

// Collection gate: a configured credential whose verification is rejected must not start collection.
test("A18. collect endpoint: a rejected verification blocks collection with an explicit reason, and records it", () => withEnv({ UPSTOX_ANALYTICS_TOKEN: "analytics-test-value", UPSTOX_TOKEN_FILE: undefined, MARKET_DATA_PROVIDER: "upstox", COLLECTION_LOG_DIR: tmpDir() }, () => withFetch(answering(401), async () => {
  const { POST } = await import("../../app/api/paper-opportunities/collect/route.ts");
  // The collect route requires an operator (defence in depth). Authenticate with a test-only token, removed after the call.
  const TEST_TOKEN = "test-operator-token-collect-0123456789abcdef";
  const prevToken = process.env.OPERATOR_TOKEN;
  process.env.OPERATOR_TOKEN = TEST_TOKEN;
  let body: { reason?: string; generated?: number } | undefined;
  try {
    const res = await POST(new Request("http://localhost/api/paper-opportunities/collect", { method: "POST", headers: { Authorization: `Bearer ${TEST_TOKEN}` } }));
    body = (await res.json()) as { reason?: string; generated?: number };
  } finally {
    if (prevToken === undefined) delete process.env.OPERATOR_TOKEN; else process.env.OPERATOR_TOKEN = prevToken;
  }
  assert.ok(body, "response body must be defined");
  assert.equal(body.reason, "AUTH_UNVERIFIED", "collection is blocked, not attempted");
  assert.equal(body.generated, 0);
  assert.ok(!JSON.stringify(body).includes("analytics-test-value"));
})));
