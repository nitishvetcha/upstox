export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { STATE_COOKIE, STATE_TTL_MS, authorizeUrl, createAuthState, upstoxConfig } from "@/lib/services/upstoxAuth";

export async function GET() {
  if (!upstoxConfig()) {
    return Response.json({ error: "AUTH_NOT_CONFIGURED", message: "Set UPSTOX_CLIENT_ID, UPSTOX_CLIENT_SECRET, UPSTOX_REDIRECT_URI in web/.env.local" }, { status: 500 });
  }
  const state = createAuthState(); // 32 random bytes, stored server-side, single-use
  console.info("[AUTH] Redirecting to Upstox login");
  const res = NextResponse.redirect(authorizeUrl(state));
  // Also bound to this browser: the callback needs the cookie AND the server-side state. Lax survives Upstox's redirect.
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth",
    maxAge: STATE_TTL_MS / 1000,
  });
  return res;
}
