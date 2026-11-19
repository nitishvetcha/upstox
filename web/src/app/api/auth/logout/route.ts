export const dynamic = "force-dynamic";

import { requireOperator, readCookie, revokeSession, clearedCookieHeader, SESSION_COOKIE } from "../../../../lib/operatorSession.ts";

// Protected: an unauthenticated caller cannot sign anyone out.
// Ends the app session only. The Upstox login is NOT removed: signing out of the analyzer must not disconnect Upstox.
export async function POST(req: Request) {
  const refused = requireOperator(req);
  if (refused) return refused;
  revokeSession(readCookie(req, SESSION_COOKIE));
  return Response.json({ ok: true }, { headers: { "Set-Cookie": clearedCookieHeader() } });
}
