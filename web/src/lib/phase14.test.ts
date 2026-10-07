// Phase 14 — one-command Upstox login + live recommendation flow.
// Network is never touched: fetch is injected, token files live in a temp dir.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  authorizeUrl, classifyToken, clearToken, completeLogin, consumeAuthState, createAuthState, exchangeCode, loadToken,
  markTokenInvalid, saveToken, STATE_TTL_MS, tokenExpiry, tokenStatus, upstoxConfig, verifyConnection,
  type LoginDeps, type StoredToken,
} from "./services/upstoxAuth.ts";
import { withFallback, type FallbackDeps } from "./services/market.ts";
import { normalizeChain, normalizeOptionContracts } from "./services/upstoxMarket.ts";
import { UpstoxError } from "./services/errors.ts";
import { mockSnapshot } from "./services/mock.ts";
import { evaluateBoth, evaluateIndex, evaluationLines } from "./postLogin.ts";
import { diagnose } from "./recommendationDiagnostic.ts";
import { analyze, MIN_STRATEGY_SCORE } from "./engine/strategy.ts";
import { DEFAULT_RISK_CONFIG } from "./services/risk/riskConfig.ts";
import { STRATEGY_VERSION } from "./journalTypes.ts";
import type { FallbackReason, IndexId, Snapshot } from "./types.ts";

const CFG = { clientId: "client-123", clientSecret: "SUPER_SECRET_VALUE", redirectUri: "http://localhost:3123/api/auth/callback" };
const MIDDAY = new Date("2026-10-05T07:00:00Z");
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "p14-")), "upstox-token.json");
const tok = (over: Partial<StoredToken> = {}): StoredToken => ({
  provider: "upstox", accessToken: "ACCESS_TOKEN_VALUE", userId: "U1", userName: "u", issuedAt: "2026-10-07T03:00:00.000Z",
  expiresAt: "2026-10-07T22:00:00.000Z", invalidatedAt: null, ...over,
});
const resp = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function deps(over: Partial<LoginDeps> = {}) {
  const calls = { exchange: 0, save: 0, verify: 0, markInvalid: 0, logs: [] as string[] };
  const d: LoginDeps = {
    configured: () => true,
    consumeState: (s) => s === "good",
    exchange: async () => { calls.exchange++; return tok(); },
    save: async () => { calls.save++; },
    verify: async () => { calls.verify++; return "UPSTOX_CONNECTED"; },
    markInvalid: async () => { calls.markInvalid++; },
    log: (m) => calls.logs.push(m),
    ...over,
  };
  return { d, calls };
}
const ok = { code: "AUTH_CODE_VALUE", state: "good", cookieState: "good", error: null };

function live(index: IndexId = "nifty", mut?: (s: Snapshot) => void): Snapshot {
  const s = structuredClone(mockSnapshot(index, MIDDAY));
  for (const k of Object.keys(s.sources) as (keyof Snapshot["sources"])[]) s.sources[k] = { ...s.sources[k], source: "LIVE", provider: "UPSTOX" };
  s.fallbackReason = null;
  for (const r of s.chain) { r.call.instrumentKey = `NSE_FO|T${r.strike}CE`; r.put.instrumentKey = `NSE_FO|T${r.strike}PE`; }
  mut?.(s);
  return s;
}
const mockWith = (reason: FallbackReason | null) => (i: IndexId) => Promise.resolve({ ...mockSnapshot(i, MIDDAY), fallbackReason: reason });

// ── AUTH ──────────────────────────────────────────────────────────────────────

describe("AUTH — OAuth flow", () => {
  it("AUTH-01. login URL targets the official dialog with all required params, URL-encoded", () => {
    const u = new URL(authorizeUrl("abc", CFG));
    assert.equal(u.origin + u.pathname, "https://api.upstox.com/v2/login/authorization/dialog");
    assert.equal(u.searchParams.get("response_type"), "code");
    assert.equal(u.searchParams.get("client_id"), "client-123");
    assert.equal(u.searchParams.get("redirect_uri"), CFG.redirectUri);
    assert.equal(u.searchParams.get("state"), "abc");
    assert.ok(u.search.includes("redirect_uri=http%3A%2F%2Flocalhost%3A3123"));
  });
  it("AUTH-02. login URL never contains the client secret", () => assert.ok(!authorizeUrl("s", CFG).includes(CFG.clientSecret)));
  it("AUTH-03. login URL throws a clear error when not configured", () => assert.throws(() => authorizeUrl("s", null), /UPSTOX_CLIENT_ID/));
  it("AUTH-04. state is 32 random bytes (64 hex) and unique", () => {
    const a = createAuthState(), b = createAuthState();
    assert.match(a, /^[0-9a-f]{64}$/);
    assert.notEqual(a, b);
  });
  it("AUTH-05. state is single-use", () => {
    const s = createAuthState();
    assert.equal(consumeAuthState(s), true);
    assert.equal(consumeAuthState(s), false);
  });
  it("AUTH-06. expired state is rejected", () => {
    const s = createAuthState(0);
    assert.equal(consumeAuthState(s, STATE_TTL_MS + 1), false);
  });
  it("AUTH-07. unknown / null state is rejected", () => {
    assert.equal(consumeAuthState("f".repeat(64)), false);
    assert.equal(consumeAuthState(null), false);
  });
  it("AUTH-08. forged state → AUTH_STATE_MISMATCH and the code is never exchanged", async () => {
    const { d, calls } = deps();
    const r = await completeLogin({ ...ok, state: "forged", cookieState: "forged" }, d);
    assert.deepEqual(r.ok ? null : r.error, "AUTH_STATE_MISMATCH");
    assert.equal(calls.exchange, 0);
  });
  it("AUTH-09. cookie not matching the server state → AUTH_STATE_MISMATCH", async () => {
    const { d } = deps();
    const r = await completeLogin({ ...ok, cookieState: "other" }, d);
    assert.equal(!r.ok && r.error, "AUTH_STATE_MISMATCH");
  });
  it("AUTH-10. missing code → AUTH_CODE_MISSING; provider error → AUTH_PROVIDER_ERROR", async () => {
    assert.equal((await completeLogin({ ...ok, code: null }, deps().d) as { error: string }).error, "AUTH_CODE_MISSING");
    assert.equal((await completeLogin({ ...ok, error: "access_denied" }, deps().d) as { error: string }).error, "AUTH_PROVIDER_ERROR");
  });
  it("AUTH-11. invalid code → TOKEN_EXCHANGE_FAILED, nothing saved, exchanged exactly once", async () => {
    let n = 0;
    const { d, calls } = deps({ exchange: async () => { n++; throw new Error("Upstox token exchange failed: Invalid Auth code"); } });
    const r = await completeLogin(ok, d);
    assert.equal(!r.ok && r.error, "TOKEN_EXCHANGE_FAILED");
    assert.equal(n, 1);
    assert.equal(calls.save, 0);
  });
  it("AUTH-12. success → exchange once, save once, verify once, CONNECTED", async () => {
    const { d, calls } = deps();
    const r = await completeLogin(ok, d);
    assert.ok(r.ok && r.connection === "UPSTOX_CONNECTED");
    assert.deepEqual([calls.exchange, calls.save, calls.verify, calls.markInvalid], [1, 1, 1, 0]);
  });
  it("AUTH-13. verification 401 marks the new token invalid", async () => {
    const { d, calls } = deps({ verify: async () => "UPSTOX_AUTH_EXPIRED" });
    const r = await completeLogin(ok, d);
    assert.ok(r.ok && r.connection === "UPSTOX_AUTH_EXPIRED");
    assert.equal(calls.markInvalid, 1);
  });
  it("AUTH-14. missing environment → AUTH_NOT_CONFIGURED; upstoxConfig null if any var missing", async () => {
    assert.equal((await completeLogin(ok, deps({ configured: () => false }).d) as { error: string }).error, "AUTH_NOT_CONFIGURED");
    assert.equal(upstoxConfig({ UPSTOX_CLIENT_ID: "a", UPSTOX_CLIENT_SECRET: "b" }), null);
    assert.ok(upstoxConfig({ UPSTOX_CLIENT_ID: "a", UPSTOX_CLIENT_SECRET: "b", UPSTOX_REDIRECT_URI: "c" }));
  });
  it("AUTH-15. token exchange POSTs the documented form fields to the token endpoint", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const f = (async (url: string, init: RequestInit) => { seen = { url, init }; return resp(200, { access_token: "T", user_id: "U" }); }) as unknown as typeof fetch;
    const t = await exchangeCode("CODE", new Date("2026-10-07T04:00:00Z"), f, CFG);
    assert.equal(seen!.url, "https://api.upstox.com/v2/login/authorization/token");
    assert.equal(seen!.init.method, "POST");
    const body = new URLSearchParams(String(seen!.init.body));
    assert.deepEqual(Object.fromEntries(body), { code: "CODE", client_id: "client-123", client_secret: "SUPER_SECRET_VALUE", redirect_uri: CFG.redirectUri, grant_type: "authorization_code" });
    assert.equal(t.accessToken, "T");
    assert.equal(t.expiresAt, "2026-10-07T22:00:00.000Z"); // 03:30 IST next morning
  });
  it("AUTH-16. exchange errors never echo the secret", async () => {
    const f = (async () => resp(400, { status: "error", errors: [{ message: "Invalid Auth code" }] })) as unknown as typeof fetch;
    await assert.rejects(exchangeCode("C", new Date(), f, CFG), (e: Error) => e.message.includes("Invalid Auth code") && !e.message.includes(CFG.clientSecret));
  });
  it("AUTH-17. a 200 without access_token is rejected", async () => {
    const f = (async () => resp(200, { status: "success" })) as unknown as typeof fetch;
    await assert.rejects(exchangeCode("C", new Date(), f, CFG));
  });
  it("AUTH-18. tokens expire at 03:30 IST (before and after 03:30)", () => {
    assert.equal(tokenExpiry(new Date("2026-10-06T20:00:00Z")).toISOString(), "2026-10-06T22:00:00.000Z"); // 01:30 IST → same day 03:30
    assert.equal(tokenExpiry(new Date("2026-10-07T03:30:00Z")).toISOString(), "2026-10-07T22:00:00.000Z"); // 09:00 IST → next day
  });
  it("AUTH-19. token stored server-side with mode 600 and round-trips", async () => {
    const f = tmp();
    await saveToken(tok(), f);
    assert.equal(fs.statSync(f).mode & 0o777, 0o600);
    assert.equal((await loadToken(new Date("2026-10-07T10:00:00Z"), f))?.accessToken, "ACCESS_TOKEN_VALUE");
  });
  it("AUTH-20. token status: MISSING / VALID / EXPIRED / INVALID / UNKNOWN", async () => {
    const f = tmp();
    assert.equal((await tokenStatus(new Date(), f)).status, "MISSING");
    await saveToken(tok(), f);
    assert.equal((await tokenStatus(new Date("2026-10-07T10:00:00Z"), f)).status, "VALID");
    assert.equal((await tokenStatus(new Date("2026-10-08T00:00:00Z"), f)).status, "EXPIRED");
    fs.writeFileSync(f, "{not json");
    assert.equal((await tokenStatus(new Date(), f)).status, "UNKNOWN");
    assert.equal(classifyToken({ kind: "ok", token: tok({ invalidatedAt: "x" }) } as never), "INVALID");
  });
  it("AUTH-21. a file existing is not enough: expired token is not loaded", async () => {
    const f = tmp();
    await saveToken(tok(), f);
    assert.equal(await loadToken(new Date("2026-10-08T00:00:00Z"), f), null);
  });
  it("AUTH-22. 401 marks token INVALID (kept on disk, not loaded)", async () => {
    const f = tmp();
    await saveToken(tok(), f);
    await markTokenInvalid(new Date("2026-10-07T10:00:00Z"), f);
    assert.equal((await tokenStatus(new Date("2026-10-07T10:00:00Z"), f)).status, "INVALID");
    assert.equal(await loadToken(new Date("2026-10-07T10:00:00Z"), f), null);
  });
  it("AUTH-23. logout removes the token → MISSING", async () => {
    const f = tmp();
    await saveToken(tok(), f);
    await clearToken(f);
    assert.equal((await tokenStatus(new Date(), f)).status, "MISSING");
  });
  it("AUTH-24. login logs never contain the code or token", async () => {
    const { d, calls } = deps();
    await completeLogin(ok, d);
    assert.ok(calls.logs.length >= 3);
    assert.ok(calls.logs.every((l) => !l.includes("AUTH_CODE_VALUE") && !l.includes("ACCESS_TOKEN_VALUE")));
  });
});

// ── LIVE ──────────────────────────────────────────────────────────────────────

describe("LIVE — connectivity, chain, lot size, keys", () => {
  const capture = (status: number | "throw") => {
    const seen: { url?: string; init?: RequestInit } = {};
    const f = (async (url: string, init: RequestInit) => {
      seen.url = url; seen.init = init;
      if (status === "throw") throw new Error("ENOTFOUND");
      return resp(status, {});
    }) as unknown as typeof fetch;
    return { f, seen };
  };
  it("LIVE-01. verify uses a read-only GET quote with a Bearer token → CONNECTED", async () => {
    const { f, seen } = capture(200);
    assert.equal(await verifyConnection("T", f), "UPSTOX_CONNECTED");
    assert.ok(seen.url!.startsWith("https://api.upstox.com/v2/market-quote/quotes?instrument_key="));
    assert.equal(seen.init!.method ?? "GET", "GET");
    assert.equal((seen.init!.headers as Record<string, string>).Authorization, "Bearer T");
  });
  it("LIVE-02. verify 401 → UPSTOX_AUTH_EXPIRED", async () => assert.equal(await verifyConnection("T", capture(401).f), "UPSTOX_AUTH_EXPIRED"));
  it("LIVE-03. verify network failure → UPSTOX_NETWORK_ERROR", async () => assert.equal(await verifyConnection("T", capture("throw").f), "UPSTOX_NETWORK_ERROR"));
  it("LIVE-04. verify 5xx → UPSTOX_API_ERROR", async () => assert.equal(await verifyConnection("T", capture(503).f), "UPSTOX_API_ERROR"));

  const fb = (over: Partial<FallbackDeps>): FallbackDeps => ({ mode: "upstox", getToken: async () => null, onAuthExpired: async () => {}, now: () => MIDDAY, ...over });
  it("LIVE-05. expired session falls back with UPSTOX_AUTH_EXPIRED (not 'never connected')", async () => {
    const r = await withFallback(async (p) => p.name, fb({ tokenStatus: async () => "EXPIRED" }));
    assert.deepEqual([r.data, r.fallbackReason], ["MOCK", "UPSTOX_AUTH_EXPIRED"]);
  });
  it("LIVE-06. no token at all → UPSTOX_NOT_CONNECTED", async () => {
    const r = await withFallback(async (p) => p.name, fb({ tokenStatus: async () => "MISSING" }));
    assert.equal(r.fallbackReason, "UPSTOX_NOT_CONNECTED");
  });
  it("LIVE-07. a 401 mid-request flags the session and reports UPSTOX_AUTH_EXPIRED", async () => {
    let flagged = 0;
    const r = await withFallback(async (p) => {
      if (p.name !== "MOCK") throw new UpstoxError("UPSTOX_AUTH_EXPIRED", "Invalid token", 401);
      return p.name;
    }, fb({ getToken: async () => "T", onAuthExpired: async () => { flagged++; } }));
    assert.equal(r.fallbackReason, "UPSTOX_AUTH_EXPIRED");
    assert.equal(flagged, 1);
  });
  const side = (key: string | null, ltp: number) => ({ instrument_key: key, market_data: { ltp, bid_price: ltp - 1, ask_price: ltp + 1, oi: 1000, prev_oi: 900, volume: 50 }, option_greeks: { iv: 14, delta: 0.5, gamma: 0.001, theta: -5, vega: 10 } });
  const chainRaw = [24900, 25000, 25100].map((k) => ({ strike_price: k, underlying_spot_price: 25010, lot_size: 65, call_options: side(`NSE_FO|C${k}`, 100), put_options: side(`NSE_FO|P${k}`, 90) }));
  it("LIVE-08. live chain preserves the provider instrument keys exactly", () => {
    const c = normalizeChain(chainRaw, "nifty", "2026-10-13");
    assert.deepEqual(c.rows.map((r) => r.call.instrumentKey), ["NSE_FO|C24900", "NSE_FO|C25000", "NSE_FO|C25100"]);
    assert.equal(c.rows[1].put.instrumentKey, "NSE_FO|P25000");
  });
  it("LIVE-09. lot size comes from contract/chain metadata, not a hard-coded value", () => {
    assert.equal(normalizeChain(chainRaw, "nifty", "2026-10-13").lotSize, 65);
    assert.equal(normalizeChain(chainRaw.map((r) => ({ ...r, lot_size: 30 })), "banknifty", "2026-10-28").lotSize, 30);
    assert.equal(normalizeOptionContracts([{ expiry: "2026-10-13", lot_size: 75 }]).lotSize, 75);
  });
  it("LIVE-10. chain carries bid/ask/OI/chgOI/volume/IV/Greeks; missing key stays null (never constructed)", () => {
    const c = normalizeChain([{ ...chainRaw[0], call_options: side(null, 100) }], "nifty", "2026-10-13");
    const q = c.rows[0].call;
    assert.equal(q.instrumentKey, null);
    assert.deepEqual([q.bid, q.ask, q.oi, q.chgOi, q.volume, q.iv, q.delta], [99, 101, 1000, 100, 50, 14, 0.5]);
  });
});

// ── RECOMMEND ─────────────────────────────────────────────────────────────────

describe("RECOMMEND — post-login evaluation", () => {
  it("RECOMMEND-01. post-login evaluation covers NIFTY then BANK NIFTY", async () => {
    const e = await evaluateBoth((i) => Promise.resolve(live(i)), MIDDAY);
    assert.deepEqual(e.map((x) => x.underlying), ["NIFTY", "BANKNIFTY"]);
    assert.ok(e.every((x) => x.analysis === "READY"));
  });
  it("RECOMMEND-02. live NIFTY uses live sources, lot size and keys; production ₹1L config sizes it to zero lots", async () => {
    const e = await evaluateIndex("nifty", (i) => Promise.resolve(live(i)), MIDDAY);
    // Default risk: 1% of ₹1,00,000 = ₹1,000 per trade, below one NIFTY lot's stop risk → POSITION_SIZE_ZERO.
    assert.equal(e.decision, "NO_TRADE");
    assert.deepEqual(e.blockers, ["POSITION_SIZE_ZERO"]);
    assert.equal(e.spotSource, "LIVE");
    assert.equal(e.lotSize, 65);
    assert.equal(e.instrumentKeys, e.strikes * 2);
  });
  it("RECOMMEND-03. event risk → WAIT", async () => {
    const e = await evaluateIndex("nifty", (i) => Promise.resolve(live(i, (s) => { s.news.eventRisk = "RBI policy"; })), MIDDAY);
    assert.equal(e.decision, "WAIT");
    assert.ok(e.blockers.includes("EVENT_RISK"));
  });
  it("RECOMMEND-04. expired session → NO_TRADE with UPSTOX_NOT_CONNECTED", async () => {
    const e = await evaluateIndex("nifty", mockWith("UPSTOX_AUTH_EXPIRED"), MIDDAY);
    assert.equal(e.decision, "NO_TRADE");
    assert.ok(e.blockers.includes("UPSTOX_NOT_CONNECTED"));
    assert.match(e.spotSource, /^MOCK/);
  });
  it("RECOMMEND-05. a snapshot failure is reported as ERROR, not hidden", async () => {
    const e = await evaluateIndex("banknifty", () => Promise.reject(new Error("chain timeout")), MIDDAY);
    assert.equal(e.decision, "ERROR");
    assert.equal(e.error, "chain timeout");
  });
  it("RECOMMEND-06. terminal summary has MARKET/OPTIONS/ANALYSIS/RECOMMENDATION for both indices", async () => {
    const lines = evaluationLines(await evaluateBoth((i) => Promise.resolve(live(i)), MIDDAY));
    for (const tag of ["[MARKET]", "[OPTIONS]", "[ANALYSIS]", "[RECOMMENDATION]"]) assert.equal(lines.filter((l) => l.startsWith(tag)).length, 2, tag);
    assert.ok(lines.some((l) => l.includes("BANK NIFTY")));
  });
  it("RECOMMEND-07. diagnostic labels SESSION_EXPIRED vs NOT_CONNECTED vs CONNECTED", () => {
    const d = (r: FallbackReason | null) => diagnose(analyze({ ...mockSnapshot("nifty", MIDDAY), fallbackReason: r }, MIDDAY), MIDDAY).upstox;
    assert.equal(d("UPSTOX_AUTH_EXPIRED"), "SESSION_EXPIRED");
    assert.equal(d("UPSTOX_NOT_CONNECTED"), "NOT_CONNECTED");
    assert.equal(diagnose(analyze(live(), MIDDAY), MIDDAY).upstox, "CONNECTED");
  });
  it("RECOMMEND-08. session-expired blocker message tells the user to reconnect", () => {
    const d = diagnose(analyze({ ...mockSnapshot("nifty", MIDDAY), fallbackReason: "UPSTOX_AUTH_EXPIRED" }, MIDDAY), MIDDAY);
    const b = d.blockers.find((x) => x.code === "UPSTOX_NOT_CONNECTED")!;
    assert.match(b.message, /session expired.*\/api\/auth\/login/i);
  });
  it("RECOMMEND-09. required score is exposed; a sub-65 candidate is never executable", () => {
    const d = diagnose(analyze(live("banknifty"), MIDDAY), MIDDAY);
    assert.equal(d.requiredScore, 65);
    for (const c of d.candidates) if (c.score < 65) assert.equal(c.executable, false);
  });
  it("RECOMMEND-10. evaluation blockers are exactly the diagnostic's blocker codes", async () => {
    const s = live("nifty", (x) => { x.news.eventRisk = "RBI policy"; });
    const e = await evaluateIndex("nifty", () => Promise.resolve(s), MIDDAY);
    const d = diagnose(analyze(s, MIDDAY), MIDDAY);
    assert.deepEqual(e.blockers, [...new Set(d.blockers.map((b) => b.code))]);
  });
});

// ── SAFETY ────────────────────────────────────────────────────────────────────

const ROOT = path.join(import.meta.dirname, "..", "..");
const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.name === "node_modules" || e.name.startsWith(".") ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : /\.(ts|tsx|mjs|js)$/.test(e.name) && !/\.test\.ts$/.test(e.name) ? [path.join(d, e.name)] : []);
const files = [...walk(path.join(ROOT, "src")), ...walk(path.join(ROOT, "scripts"))];
const read = (f: string) => fs.readFileSync(f, "utf8");

describe("SAFETY — mock, orders, secrets, strategy", () => {
  it("SAFETY-01. mock data can never be executable, whatever the fallback reason", () => {
    for (const r of ["UPSTOX_NOT_CONNECTED", "UPSTOX_AUTH_EXPIRED", "UPSTOX_API_ERROR", null] as (FallbackReason | null)[]) {
      const d = diagnose(analyze({ ...mockSnapshot("nifty", MIDDAY), fallbackReason: r }, MIDDAY), MIDDAY);
      assert.notEqual(d.finalDecision, "TRADE");
      assert.equal(d.eligible, false);
      assert.ok(d.candidates.every((c) => !c.executable));
    }
  });
  it("SAFETY-02. zero Upstox order endpoints in src/ and scripts/", () => {
    const hits = files.filter((f) => /\/v[23]\/orders?\b|order\/place|order\/modify|order\/cancel|placeOrder|modifyOrder|cancelOrder/.test(read(f)));
    assert.deepEqual(hits, []);
  });
  it("SAFETY-03. the only POST to Upstox is the OAuth token exchange", () => {
    const posting = files.filter((f) => /api\.upstox\.com/.test(read(f)) && /method:\s*"POST"/.test(read(f)));
    assert.deepEqual(posting.map((f) => path.basename(f)), ["upstoxAuth.ts"]);
  });
  it("SAFETY-04. secret never reaches the browser: no NEXT_PUBLIC_ Upstox vars, no client import of upstoxAuth", () => {
    for (const f of files) assert.ok(!/NEXT_PUBLIC_UPSTOX|NEXT_PUBLIC_.*SECRET/.test(read(f)), f);
    const env = path.join(ROOT, ".env.example");
    if (fs.existsSync(env)) assert.ok(!/NEXT_PUBLIC_UPSTOX/.test(read(env)));
    const client = files.filter((f) => /^["']use client["']/.test(read(f).trimStart()));
    for (const f of client) assert.ok(!/upstoxAuth/.test(read(f)), f);
  });
  it("SAFETY-05. auth routes and Upstox CLI scripts never return or print the access token", () => {
    const strict = files.filter((f) => f.includes(`${path.sep}app${path.sep}api${path.sep}auth`) || /upstox-(cli|login|status)\.mjs$|dev-upstox\.mjs$/.test(f));
    assert.equal(strict.length, 9);
    for (const f of strict) assert.ok(!/accessToken\s*[:,}]|access_token|\.accessToken\b/.test(read(f).replace(/getAccessToken/g, "")), f);
    // Every script (incl. older verification tools) may use the token, but never log it.
    for (const f of files.filter((x) => x.includes(`${path.sep}scripts${path.sep}`)))
      assert.ok(!/console\.\w+\((?:[^)]*\$\{\s*|\s*|[^)]*,\s*)(token|accessToken|access_token|tokenData)\b(?!\s*(?:VALID|Status))/.test(read(f)), f);
  });
  it("SAFETY-06. callback never puts the authorization code in the redirect", () => {
    const src = read(path.join(ROOT, "src/app/api/auth/callback/route.ts"));
    assert.ok(!/searchParams\.set\(["']code/.test(src));
  });
  it("SAFETY-07. strategy and risk unchanged: 11.4-frozen, score 65, default risk config", () => {
    assert.equal(STRATEGY_VERSION.strategyVersion, "11.4-frozen");
    assert.equal(MIN_STRATEGY_SCORE, 65);
    assert.deepEqual(
      [DEFAULT_RISK_CONFIG.riskPerTradePercent, DEFAULT_RISK_CONFIG.maxDailyLossPercent, DEFAULT_RISK_CONFIG.maxOpenRiskPercent, DEFAULT_RISK_CONFIG.maxConcurrentPositions, DEFAULT_RISK_CONFIG.minRiskReward, DEFAULT_RISK_CONFIG.maxLotsPerTrade],
      [1, 2, 3, 3, 1.2, 5],
    );
  });
  it("SAFETY-08. token file and env are gitignored", () => {
    const gi = read(path.join(ROOT, ".gitignore"));
    assert.ok(/^\/\.data/m.test(gi) && /^\.env\*/m.test(gi));
  });
});
