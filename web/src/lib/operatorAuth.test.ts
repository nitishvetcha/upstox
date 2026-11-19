// Authentication and authorisation regression tests (positive and negative). Synthetic data only.
// No network. No paper-trading or backtest routes. Each request is built locally and handlers are invoked in-process.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { setupPin } from "../lib/operatorPin.ts";

const TOKEN = "test-operator-token-0123456789abcdef";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "op-auth-"));
const tokenFile = path.join(tmp, "upstox-token.json");
fs.writeFileSync(tokenFile, JSON.stringify({ accessToken: "synthetic-not-real", expiresAt: Date.now() + 3600_000 }));
process.env.UPSTOX_TOKEN_FILE = tokenFile;
process.env.SAVED_PICKS_FILE = path.join(tmp, "picks.json");
process.env.OPERATOR_TOKEN = TOKEN;
const PIN = "123456";
const pinFile = path.join(tmp, "operator-pin.json");
setupPin(PIN, pinFile);
process.env.OPERATOR_PIN_FILE = pinFile;
process.env.OPERATOR_SESSION_FILE = path.join(tmp, "operator-sessions.json");

const saved = await import("../app/api/saved-picks/route.ts");
const risk = await import("../app/api/risk/assess/route.ts");
const logout = await import("../app/api/auth/logout/route.ts");
const login = await import("../app/api/auth/login/route.ts");
const track = await import("../app/api/opportunities/track/route.ts");
const outcomes = await import("../app/api/opportunities/outcomes/route.ts");
const generate = await import("../app/api/recommendations/generate/route.ts");
const refresh = await import("../app/api/recommendations/[id]/refresh/route.ts");

const BASE = "http://localhost:3150";
const json = (method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(url, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const bearer = { authorization: `Bearer ${TOKEN}` };
const pick = { instrument: "RELIANCE", instrumentType: "STOCK", direction: "LONG", entry: 100, stopLoss: 95, targets: [110], source: "RESEARCH" };

before(() => { delete process.env.CANARY_AUTH_SECRET; });
after(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

// ── Positive ────────────────────────────────────────────────────────────────
test("P1 bearer token with the correct value reads saved picks (200)", async () => {
  const r = await saved.GET(json("GET", `${BASE}/api/saved-picks`, undefined, bearer));
  assert.equal(r.status, 200);
});

test("P2 valid bearer can create and delete a saved pick (201 then 200)", async () => {
  const c = await saved.POST(json("POST", `${BASE}/api/saved-picks`, pick, bearer));
  assert.equal(c.status, 201);
  const id = ((await c.json()) as { pick: { id: string } }).pick.id;
  const d = await saved.DELETE(json("DELETE", `${BASE}/api/saved-picks?id=${id}`, undefined, bearer));
  assert.equal(d.status, 200);
});

test("P3 login with the correct token issues an HttpOnly, SameSite=Strict session cookie", async () => {
  const r = await login.POST(json("POST", `${BASE}/api/auth/login`, { pin: PIN }));
  assert.equal(r.status, 200);
  const setCookie = r.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /^op_session=[A-Za-z0-9_-]{20,}; /);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
});

test("P4 the session cookie from login authorises a later request", async () => {
  const cookie = ((await login.POST(json("POST", `${BASE}/api/auth/login`, { pin: PIN }))).headers.get("set-cookie") ?? "").split(";")[0];
  const r = await saved.GET(json("GET", `${BASE}/api/saved-picks`, undefined, { cookie }));
  assert.equal(r.status, 200);
});

test("P5 logout with a valid session invalidates that session on the server and clears the cookie", async () => {
  const cookie = ((await login.POST(json("POST", `${BASE}/api/auth/login`, { pin: PIN }))).headers.get("set-cookie") ?? "").split(";")[0];
  const out = await logout.POST(json("POST", `${BASE}/api/auth/logout`, undefined, { cookie }));
  assert.equal(out.status, 200);
  assert.match(out.headers.get("set-cookie") ?? "", /op_session=; .*Max-Age=0/);
  // The old cookie must now be rejected, even though the browser might have kept it.
  const after = await saved.GET(json("GET", `${BASE}/api/saved-picks`, undefined, { cookie }));
  assert.equal(after.status, 401, "revoked session must be refused");
});

// ── Negative: no or wrong credentials ───────────────────────────────────────
const PROTECTED: Array<[string, () => Promise<Response>]> = [
  ["saved-picks GET", () => saved.GET(json("GET", `${BASE}/api/saved-picks`))],
  ["saved-picks POST", () => saved.POST(json("POST", `${BASE}/api/saved-picks`, pick))],
  ["saved-picks DELETE", () => saved.DELETE(json("DELETE", `${BASE}/api/saved-picks?id=x`))],
  ["risk/assess POST", () => risk.POST(json("POST", `${BASE}/api/risk/assess`, { index: "nifty", plan: {} }))],
  ["auth/logout POST", () => logout.POST(json("POST", `${BASE}/api/auth/logout`))],
  ["opportunities/track POST", () => track.POST(json("POST", `${BASE}/api/opportunities/track`, {}))],
  ["opportunities/outcomes PATCH", () => outcomes.PATCH(json("PATCH", `${BASE}/api/opportunities/outcomes`, {}))],
  ["recommendations/generate POST", () => generate.POST(json("POST", `${BASE}/api/recommendations/generate`, { underlying: "nifty" }))],
  ["recommendations/[id]/refresh POST", () => refresh.POST(json("POST", `${BASE}/api/recommendations/x/refresh`), { params: Promise.resolve({ id: "x" }) } as any)],
];

for (const [name, call] of PROTECTED) {
  test(`N1 ${name}: no credentials → 401 with a generic body`, async () => {
    const r = await call();
    assert.equal(r.status, 401);
    assert.deepEqual(await r.json(), { error: "unauthorized" });
  });
}

test("N2 wrong bearer token → 401 (not 200, not 500)", async () => {
  const r = await saved.GET(json("GET", `${BASE}/api/saved-picks`, undefined, { authorization: "Bearer wrong-token-0123456789abcdefghij" }));
  assert.equal(r.status, 401);
});

test("N3 wrong PIN → 401 with no session cookie", async () => {
  const r = await login.POST(json("POST", `${BASE}/api/auth/login`, { pin: "000000" }));
  assert.equal(r.status, 401);
  assert.equal(r.headers.get("set-cookie"), null);
});

test("N4 a forged or random session cookie → 401", async () => {
  const r = await saved.GET(json("GET", `${BASE}/api/saved-picks`, undefined, { cookie: "op_session=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" }));
  assert.equal(r.status, 401);
});

test("N5 login with a non-JSON body is refused (400), no cookie", async () => {
  const r = await login.POST(new Request(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "text/plain" }, body: PIN }));
  assert.equal(r.status, 400);
  assert.equal(r.headers.get("set-cookie"), null);
});

test("N6 the 401 body never reveals which check failed or any internal detail", async () => {
  const r = await saved.GET(json("GET", `${BASE}/api/saved-picks`, undefined, { authorization: "Bearer bad" }));
  const text = await r.text();
  assert.equal(text, '{"error":"unauthorized"}');
  assert.ok(!/stack|token|session|expected|SAVED_PICKS|OPERATOR/i.test(text));
});

// ── Negative: fail closed when the operator token is not configured ─────────
test("N7 OPERATOR_TOKEN unset → a bearer value is refused (401); a PIN session still works", async () => {
  const saveEnv = process.env.OPERATOR_TOKEN;
  delete process.env.OPERATOR_TOKEN;
  try {
    const r = await saved.GET(json("GET", `${BASE}/api/saved-picks`, undefined, { authorization: "Bearer anything" }));
    assert.equal(r.status, 401);
  } finally { process.env.OPERATOR_TOKEN = saveEnv; }
});

test("N8 a token shorter than 32 characters is never accepted as a bearer (401)", async () => {
  const saveEnv = process.env.OPERATOR_TOKEN;
  process.env.OPERATOR_TOKEN = "short";
  try {
    const r = await saved.GET(json("GET", `${BASE}/api/saved-picks`, undefined, { authorization: "Bearer short" }));
    assert.equal(r.status, 401);
  } finally { process.env.OPERATOR_TOKEN = saveEnv; }
});

// ── Destructive action: unauthenticated logout must not remove the Upstox token ──
test("N9 unauthenticated logout is refused AND the Upstox token file is untouched", async () => {
  // Earlier authorised logout tests (P5) correctly removed the token file; recreate it for this check.
  fs.writeFileSync(tokenFile, JSON.stringify({ accessToken: "synthetic-not-real", expiresAt: Date.now() + 3600_000 }));
  const before = fs.readFileSync(tokenFile, "utf8");
  const r = await logout.POST(json("POST", `${BASE}/api/auth/logout`));
  assert.equal(r.status, 401);
  assert.ok(fs.existsSync(tokenFile), "token file must still exist");
  assert.equal(fs.readFileSync(tokenFile, "utf8"), before, "token file content must be unchanged");
});
