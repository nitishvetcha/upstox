export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { STATE_COOKIE, completeLogin } from "@/lib/services/upstoxAuth";
import { evaluateBoth, evaluationLines } from "@/lib/postLogin";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const result = await completeLogin({
    code: sp.get("code"),
    state: sp.get("state"),
    cookieState: req.cookies.get(STATE_COOKIE)?.value ?? null,
    error: sp.get("error"),
  });

  // Never echo the code back into a URL or page; the address bar is cleaned by the redirect below.
  const dest = new URL("/", req.url);
  if (result.ok) {
    dest.searchParams.set("upstox", result.connection === "UPSTOX_CONNECTED" ? "connected" : result.connection.toLowerCase());
    if (result.connection === "UPSTOX_CONNECTED") {
      // One immediate live evaluation for the terminal; the dashboard renders its own live analysis on load.
      void evaluateBoth().then((e) => evaluationLines(e).forEach((l) => console.info(l)));
    }
  } else {
    console.warn(`[AUTH] Login failed: ${result.error}`);
    dest.searchParams.set("upstox", "error");
    dest.searchParams.set("reason", result.error);
  }
  const res = NextResponse.redirect(dest);
  res.cookies.delete({ name: STATE_COOKIE, path: "/api/auth" });
  return res;
}
