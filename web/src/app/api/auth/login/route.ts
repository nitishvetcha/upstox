export const dynamic = "force-dynamic";

import { createSession, sessionCookieHeader } from "../../../../lib/operatorSession.ts";
import { checkPin, setupPin, isValidPinFormat } from "../../../../lib/operatorPin.ts";

// Operator sign-in with the 6-digit PIN. Generic errors only; the lock reveals only how long to wait.
export async function POST(req: Request) {
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) return Response.json({ error: "invalid request" }, { status: 400 });
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: "invalid request" }, { status: 400 }); }
  const pin = (body as { pin?: unknown })?.pin;
  if (!isValidPinFormat(pin)) return Response.json({ error: "Enter the 6-digit PIN." }, { status: 400 });
  const r = checkPin(pin);
  if (r.ok) return Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookieHeader(createSession()) } });
  if (r.reason === "NOT_SET_UP") {
    const s = setupPin(pin);
    if (s.ok) {
      return Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookieHeader(createSession()) } });
    }
    return Response.json({ error: "PIN is not set up. Please try again." }, { status: 503 });
  }
  if (r.reason === "LOCKED") return Response.json({ error: `Too many attempts. Try again in ${Math.ceil(r.retryAfterSec / 60)} minutes.` }, { status: 429 });
  return Response.json({ error: "Wrong PIN." }, { status: 401 });
}
