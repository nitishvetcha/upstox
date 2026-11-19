export const dynamic = "force-dynamic";

import { clearedCookieHeader, isValidSession, readCookie, SESSION_COOKIE } from "../../../../lib/operatorSession.ts";
import { changePin, isValidPinFormat } from "../../../../lib/operatorPin.ts";

// Changes the PIN. Requires a signed-in session AND the current PIN. A successful change ends every session
// (sessions are bound to the PIN), so the cookie is cleared here and the operator signs in again with the new PIN.
export async function POST(req: Request) {
  if (!isValidSession(readCookie(req, SESSION_COOKIE))) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) return Response.json({ error: "invalid request" }, { status: 400 });
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: "invalid request" }, { status: 400 }); }
  const current = (body as { current?: unknown })?.current;
  const next = (body as { next?: unknown })?.next;
  if (!isValidPinFormat(current) || !isValidPinFormat(next)) return Response.json({ error: "Both PINs must be 6 digits." }, { status: 400 });
  const r = changePin(current, next);
  if (r.ok) return Response.json({ ok: true, signedOut: true }, { headers: { "Set-Cookie": clearedCookieHeader() } });
  if (r.reason === "LOCKED") return Response.json({ error: `Too many attempts. Try again in ${Math.ceil((r.retryAfterSec ?? 900) / 60)} minutes.` }, { status: 429 });
  if (r.reason === "WRONG_CURRENT") return Response.json({ error: "The current PIN is wrong." }, { status: 401 });
  return Response.json({ error: "Both PINs must be 6 digits." }, { status: 400 });
}
