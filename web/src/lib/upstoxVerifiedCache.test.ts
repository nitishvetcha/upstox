// The header's verification is reused for 10 minutes (success) or 1 minute (failure), and re-checked at once when the
// credential changes. Uses a temporary token file and a stub fetch. No network.
process.env.MARKET_DATA_PROVIDER = "upstox";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { verifyCurrentCredentialCached } from "./services/upstoxAuth.ts";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vcache-"));
const file = path.join(dir, "token.json");
const issued = new Date("2026-11-11T04:00:00Z");
const expires = "2026-11-12T10:00:00.000Z";
fs.writeFileSync(file, JSON.stringify({ provider: "UPSTOX", accessToken: "synthetic-test-token", userId: null, userName: null, issuedAt: issued.toISOString(), expiresAt: expires, invalidatedAt: null }));
const ok = (() => { let calls = 0; const f = (async () => { calls++; return new Response("{}", { status: 200 }); }) as unknown as typeof fetch; return { f, count: () => calls }; });
const T0 = new Date("2026-11-11T05:00:00Z");
// Each test starts with an empty verification cache.
const resetCache = () => { delete (globalThis as unknown as { __upstoxVerified?: unknown }).__upstoxVerified; };
const at = (ms: number) => new Date(T0.getTime() + ms);

test("first check verifies, a repeat within 10 minutes does not call Upstox", async () => {
  resetCache();
  const s = ok();
  const a = await verifyCurrentCredentialCached(T0, file, s.f);
  assert.equal(a.status, "VERIFIED_CONNECTED");
  assert.equal(s.count(), 1);
  const b = await verifyCurrentCredentialCached(at(5 * 60_000), file, s.f);
  assert.equal(b.status, "VERIFIED_CONNECTED");
  assert.equal(s.count(), 1, "no second request inside the window");
});

test("after 10 minutes the credential is verified again", async () => {
  resetCache();
  const s = ok();
  await verifyCurrentCredentialCached(at(20 * 60_000), file, s.f);
  await verifyCurrentCredentialCached(at(31 * 60_000), file, s.f);
  assert.equal(s.count(), 2);
});

test("a failed verification is retried after 1 minute, not held for 10", async () => {
  resetCache();
  const bad = (() => { let n = 0; const f = (async () => { n++; return new Response("{}", { status: 500 }); }) as unknown as typeof fetch; return { f, count: () => n }; })();
  const t = at(40 * 60_000);
  const a = await verifyCurrentCredentialCached(t, file, bad.f);
  assert.equal(a.status, "VERIFICATION_FAILED");
  await verifyCurrentCredentialCached(new Date(t.getTime() + 30_000), file, bad.f);
  assert.equal(bad.count(), 1, "still inside the failure window");
  await verifyCurrentCredentialCached(new Date(t.getTime() + 90_000), file, bad.f);
  assert.equal(bad.count(), 2, "retried after 1 minute");
});

test("a changed credential (new expiry) is verified at once, ignoring the cache", async () => {
  resetCache();
  const s = ok();
  await verifyCurrentCredentialCached(at(50 * 60_000), file, s.f);
  const before = s.count();
  fs.writeFileSync(file, JSON.stringify({ provider: "UPSTOX", accessToken: "synthetic-test-token-2", userId: null, userName: null, issuedAt: issued.toISOString(), expiresAt: "2026-11-13T10:00:00.000Z", invalidatedAt: null }));
  await verifyCurrentCredentialCached(at(51 * 60_000), file, s.f);
  assert.equal(s.count(), before + 1);
});
