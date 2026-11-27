// Operator authentication for the local-only application.
// - The operator signs in with the 6-digit PIN at POST /api/auth/login (see operatorPin.ts).
// - A successful login issues a random session id: HttpOnly, SameSite=Strict cookie, 8 hour lifetime.
// - The session is stored on the server (hashed, in .data), so logout can invalidate it immediately and it survives restarts.
// - Protected routes accept a valid session cookie OR "Authorization: Bearer <OPERATOR_TOKEN>" (for scripts, when set).
// - Responses never reveal which check failed beyond a generic status and message.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { logEvent } from "./ops/structuredLog.ts";
import { pinGeneration } from "./operatorPin.ts";

export const SESSION_COOKIE = "op_session";
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_SESSIONS = 50;
const MIN_TOKEN_LENGTH = 32;

// Durable session store: a file under .data (owner-only permissions). Only a SHA-256 hash of each session id is written,
// so a copy of the file cannot be used to sign in. Sessions survive a server restart until they expire or are revoked.
import fs from "node:fs";
import path from "node:path";

function sessionFile(env: NodeJS.ProcessEnv = process.env): string {
  return env.OPERATOR_SESSION_FILE ?? path.join(process.cwd(), ".data", "operator-sessions.json");
}

// sha256(session id) → expiry (epoch ms) and the PIN generation it was created under. A session is valid only while
// both still match, so changing the PIN ends every session. Entries in any other shape (e.g. the old format) are invalid.
type SessionEntry = { exp: number; gen: string };
type SessionMap = Record<string, SessionEntry>;

const validEntry = (e: unknown): e is SessionEntry =>
  !!e && typeof e === "object" && typeof (e as SessionEntry).exp === "number" && typeof (e as SessionEntry).gen === "string";

// A session file that cannot be read or parsed gives no sessions, so nothing is accepted (fails closed).
function loadSessions(file = sessionFile()): SessionMap {
  try {
    const v = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
    if (!v || typeof v !== "object") return {};
    return Object.fromEntries(Object.entries(v).filter(([, e]) => validEntry(e))) as SessionMap;
  } catch {
    return {};
  }
}

function saveSessions(map: SessionMap, file = sessionFile()): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(map), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

const idKey = (id: string) => createHash("sha256").update(id, "utf8").digest("hex");

export function createSession(now = Date.now()): string {
  const map = loadSessions();
  for (const [k, e] of Object.entries(map)) if (e.exp <= now) delete map[k];
  while (Object.keys(map).length >= MAX_SESSIONS) delete map[Object.keys(map)[0]];
  const id = randomBytes(32).toString("base64url");
  map[idKey(id)] = { exp: now + SESSION_TTL_MS, gen: pinGeneration() };
  saveSessions(map);
  return id;
}

export function isValidSession(id: string | null | undefined, now = Date.now()): boolean {
  if (!id) return false;
  const map = loadSessions();
  const entry = map[idKey(id)];
  if (!entry) return false;
  if (entry.exp <= now) {
    delete map[idKey(id)];
    saveSessions(map);
    return false;
  }
  return entry.gen === pinGeneration(); // a PIN change since sign-in ends this session
}

export function revokeSession(id: string | null | undefined): void {
  if (!id) return;
  const map = loadSessions();
  if (map[idKey(id)] !== undefined) {
    delete map[idKey(id)];
    saveSessions(map);
  }
}

export function sessionCount(): number {
  return Object.keys(loadSessions()).length;
}

function digest(v: string): Buffer {
  return createHash("sha256").update(v, "utf8").digest();
}

// Constant-time comparison of two strings (hashing first makes lengths equal).
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

export function operatorTokenConfigured(env: NodeJS.ProcessEnv = process.env): string | null {
  const t = env.OPERATOR_TOKEN ?? "";
  return t.length >= MIN_TOKEN_LENGTH ? t : null;
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=") || null;
  }
  return null;
}

// Returns null when the request is authorised, otherwise the refusal response.
export function requireOperator(req: Request, env: NodeJS.ProcessEnv = process.env): Response | null {
  // A signed-in session (PIN sign-in) is enough on its own.
  if (isValidSession(readCookie(req, SESSION_COOKIE))) return null;
  // Scripts may still send the bearer token, when one is configured in the environment.
  const configured = operatorTokenConfigured(env);
  const auth = req.headers.get("authorization") ?? "";
  if (configured && auth.startsWith("Bearer ") && safeEqual(auth.slice(7).trim(), configured)) return null;
  // Log the refusal without any credential: method and path only.
  logEvent("warn", "auth_refused", { method: req.method, path: safePath(req.url) });
  return Response.json({ error: "unauthorized" }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
}

function secureAttr(): string {
  return process.env.NODE_ENV === "production" ? "; Secure" : "";
}

export function sessionCookieHeader(id: string): string {
  return `${SESSION_COOKIE}=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secureAttr()}`;
}

export function clearedCookieHeader(): string {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureAttr()}`;
}

function safePath(url: string): string { try { return new URL(url).pathname; } catch { return "[unparseable]"; } }
