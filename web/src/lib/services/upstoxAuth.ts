// Upstox OAuth (authorization-code flow). Server-only: the access token, client secret and auth code never leave
// the server and are never logged. The only Upstox POST in the codebase is the token exchange here.
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE = "https://api.upstox.com/v2";
export const STATE_COOKIE = "upstox_oauth_state";
export const STATE_TTL_MS = 10 * 60_000;
const VERIFY_KEY = "NSE_INDEX|Nifty 50"; // read-only quote used to prove the token works

export function tokenFile() {
  // ponytail: single-user file store; move to a database when multi-user auth lands.
  return process.env.UPSTOX_TOKEN_FILE ?? path.join(process.cwd(), ".data", "upstox-token.json");
}

export interface StoredToken {
  provider?: "upstox";
  accessToken: string;
  userId: string | null;
  userName: string | null;
  issuedAt: string; // ISO
  expiresAt: string; // ISO (03:30 IST after issue)
  invalidatedAt?: string | null; // set when Upstox rejected the token (401) before its nominal expiry
}

export type TokenStatus = "VALID" | "EXPIRED" | "MISSING" | "INVALID" | "UNKNOWN";
export type ConnectionResult = "UPSTOX_CONNECTED" | "UPSTOX_AUTH_EXPIRED" | "UPSTOX_NETWORK_ERROR" | "UPSTOX_API_ERROR";

export interface UpstoxConfig { clientId: string; clientSecret: string; redirectUri: string }

export function upstoxConfig(env: Record<string, string | undefined> = process.env): UpstoxConfig | null {
  const clientId = env.UPSTOX_CLIENT_ID;
  const clientSecret = env.UPSTOX_CLIENT_SECRET;
  const redirectUri = env.UPSTOX_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

// ── OAuth state: random, server-side, single-use, short-lived ─────────────────

const g = globalThis as typeof globalThis & { __upstoxOAuthStates?: Map<string, number> };
const states = () => (g.__upstoxOAuthStates ??= new Map());

export function createAuthState(now = Date.now()): string {
  for (const [s, exp] of states()) if (exp <= now) states().delete(s);
  const state = randomBytes(32).toString("hex");
  states().set(state, now + STATE_TTL_MS);
  return state;
}

// True once per issued, unexpired state; the state is destroyed either way.
export function consumeAuthState(state: string | null, now = Date.now()): boolean {
  if (!state) return false;
  const exp = states().get(state);
  states().delete(state);
  return exp !== undefined && exp > now;
}

export function authorizeUrl(state: string, cfg: UpstoxConfig | null = upstoxConfig()): string {
  if (!cfg) throw new Error("Upstox credentials missing: set UPSTOX_CLIENT_ID, UPSTOX_CLIENT_SECRET, UPSTOX_REDIRECT_URI");
  const url = new URL(`${BASE}/login/authorization/dialog`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

// Upstox tokens expire at 03:30 IST the morning after issue, whatever time they were created.
export function tokenExpiry(issued: Date): Date {
  const IST = 330 * 60_000;
  const ist = new Date(issued.getTime() + IST);
  const at0330 = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), 3, 30) - IST;
  return new Date(at0330 > issued.getTime() ? at0330 : at0330 + 86_400_000);
}

export async function exchangeCode(code: string, now = new Date(), fetchImpl: typeof fetch = fetch, cfg = upstoxConfig()): Promise<StoredToken> {
  if (!cfg) throw new Error("Upstox credentials missing");
  const res = await fetchImpl(`${BASE}/login/authorization/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || typeof body?.access_token !== "string" || !body.access_token) {
    // Upstox errors look like { status: "error", errors: [{ message }] }; never echo the request (it holds the secret).
    const msg = body?.errors?.[0]?.message ?? `HTTP ${res.status}`;
    throw new Error(`Upstox token exchange failed: ${msg}`);
  }
  return {
    provider: "upstox",
    accessToken: body.access_token,
    userId: body.user_id ?? null,
    userName: body.user_name ?? null,
    issuedAt: now.toISOString(),
    expiresAt: tokenExpiry(now).toISOString(),
    invalidatedAt: null,
  };
}

// ── Token storage + status ────────────────────────────────────────────────────

export async function saveToken(t: StoredToken, file = tokenFile()) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(t), { mode: 0o600 });
}

type Read = { kind: "missing" } | { kind: "unreadable" } | { kind: "ok"; token: StoredToken };

async function readStored(file: string): Promise<Read> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    return { kind: "missing" };
  }
  try {
    const t = JSON.parse(raw) as StoredToken;
    if (typeof t?.accessToken !== "string" || !t.accessToken || Number.isNaN(Date.parse(t.expiresAt))) return { kind: "unreadable" };
    return { kind: "ok", token: t };
  } catch {
    return { kind: "unreadable" };
  }
}

export function classifyToken(r: Read, now = new Date()): TokenStatus {
  if (r.kind === "missing") return "MISSING";
  if (r.kind === "unreadable") return "UNKNOWN";
  if (r.token.invalidatedAt) return "INVALID";
  return new Date(r.token.expiresAt) > now ? "VALID" : "EXPIRED";
}

export async function tokenStatus(now = new Date(), file = tokenFile()): Promise<{ status: TokenStatus; expiresAt: string | null }> {
  const r = await readStored(file);
  return { status: classifyToken(r, now), expiresAt: r.kind === "ok" ? r.token.expiresAt : null };
}

export async function loadToken(now = new Date(), file = tokenFile()): Promise<StoredToken | null> {
  const r = await readStored(file);
  return r.kind === "ok" && classifyToken(r, now) === "VALID" ? r.token : null;
}

// Upstox said 401: keep the file (so status reads INVALID → "session expired", not "never connected").
export async function markTokenInvalid(now = new Date(), file = tokenFile()) {
  const r = await readStored(file);
  if (r.kind === "ok" && !r.token.invalidatedAt) await saveToken({ ...r.token, invalidatedAt: now.toISOString() }, file);
}

export async function clearToken(file = tokenFile()) {
  await rm(file, { force: true });
}

// Used by the market-data layer: null means "no usable token".
export async function getAccessToken() {
  return (await loadToken())?.accessToken ?? null;
}

// ── Connectivity: one safe read-only quote ────────────────────────────────────

export async function verifyConnection(token: string, fetchImpl: typeof fetch = fetch): Promise<ConnectionResult> {
  try {
    const url = new URL(`${BASE}/market-quote/quotes`);
    url.searchParams.set("instrument_key", VERIFY_KEY);
    const res = await fetchImpl(url.toString(), {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (res.status === 401) return "UPSTOX_AUTH_EXPIRED";
    return res.ok ? "UPSTOX_CONNECTED" : "UPSTOX_API_ERROR";
  } catch {
    return "UPSTOX_NETWORK_ERROR";
  }
}

// ── Callback orchestration (route-independent so it is testable) ──────────────

export type LoginFailure = "AUTH_NOT_CONFIGURED" | "AUTH_STATE_MISMATCH" | "AUTH_PROVIDER_ERROR" | "AUTH_CODE_MISSING" | "TOKEN_EXCHANGE_FAILED";
export type LoginResult =
  | { ok: true; connection: ConnectionResult; expiresAt: string }
  | { ok: false; error: LoginFailure; message: string };

export interface LoginDeps {
  configured: () => boolean;
  consumeState: (s: string | null) => boolean;
  exchange: (code: string) => Promise<StoredToken>;
  save: (t: StoredToken) => Promise<void>;
  verify: (token: string) => Promise<ConnectionResult>;
  markInvalid: () => Promise<void>;
  log: (msg: string) => void;
}

export const defaultLoginDeps = (): LoginDeps => ({
  configured: () => upstoxConfig() !== null,
  consumeState: (s) => consumeAuthState(s),
  exchange: (c) => exchangeCode(c),
  save: (t) => saveToken(t),
  verify: (t) => verifyConnection(t),
  markInvalid: () => markTokenInvalid(),
  log: (m) => console.info(m),
});

export async function completeLogin(
  p: { code: string | null; state: string | null; cookieState: string | null; error: string | null },
  deps: LoginDeps = defaultLoginDeps(),
): Promise<LoginResult> {
  deps.log("[AUTH] Callback received");
  if (!deps.configured()) return { ok: false, error: "AUTH_NOT_CONFIGURED", message: "Upstox credentials are not configured on the server" };
  // Consume first, unconditionally: a state can never be replayed, even on a failed attempt.
  const stateOk = deps.consumeState(p.state) && p.cookieState === p.state;
  if (!stateOk) return { ok: false, error: "AUTH_STATE_MISMATCH", message: "Invalid or expired login state. Start again at /api/auth/login." };
  if (p.error) return { ok: false, error: "AUTH_PROVIDER_ERROR", message: `Upstox returned: ${p.error}` };
  if (!p.code) return { ok: false, error: "AUTH_CODE_MISSING", message: "No authorization code returned" };
  deps.log("[AUTH] Authorization code received");
  let token: StoredToken;
  try {
    token = await deps.exchange(p.code); // the code is single-use: exactly one attempt
  } catch (e) {
    return { ok: false, error: "TOKEN_EXCHANGE_FAILED", message: (e as Error).message };
  }
  await deps.save(token);
  deps.log("[AUTH] Token exchange successful");
  const connection = await deps.verify(token.accessToken);
  if (connection === "UPSTOX_AUTH_EXPIRED") await deps.markInvalid();
  deps.log(connection === "UPSTOX_CONNECTED" ? "[AUTH] Upstox connected" : `[AUTH] Live verification: ${connection}`);
  return { ok: true, connection, expiresAt: token.expiresAt };
}
