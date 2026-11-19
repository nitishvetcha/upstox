// GET /api/auth/upstox/start: begins the Upstox OAuth login. Issues a one-time state, stores it in a short-lived
// cookie (checked by /api/auth/callback), and redirects the browser to the Upstox authorisation dialog.
// No request is made to Upstox from here; the browser performs the redirect.
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { STATE_COOKIE, STATE_TTL_MS, authorizeUrl, createAuthState } from "@/lib/services/upstoxAuth";

export async function GET(req: NextRequest) {
  let target: string;
  try {
    target = authorizeUrl(createAuthState());
  } catch {
    // Missing Upstox configuration: report it on the dashboard without exposing any setting value.
    return NextResponse.redirect(new URL("/?upstox=error&reason=config_missing", req.url));
  }
  const state = new URL(target).searchParams.get("state") ?? "";
  const res = NextResponse.redirect(target);
  res.cookies.set(STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", path: "/api/auth", maxAge: Math.floor(STATE_TTL_MS / 1000) });
  return res;
}
