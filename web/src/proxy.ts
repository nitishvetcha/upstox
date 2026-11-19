// Next 16 "proxy" (formerly middleware).
// 1. Operator gate: page requests without a valid server-side session are redirected to /login?next=<same-origin path>.
//    API routes are NOT redirected; they enforce their own 401 responses. /login is always reachable.
// 2. Baseline security headers on every response, plus an OPTIONAL nonce-based report-only CSP (CSP_REPORT_ONLY=nonce).
//    Nothing here enforces a CSP.
import { NextResponse, type NextRequest } from "next/server";
import { applySecurityHeaders, buildNonceCsp, newNonce } from "./lib/securityHeaders.ts";
import { SESSION_COOKIE } from "./lib/operatorSession.ts";
import { pageGateRedirect } from "./lib/pageGate.ts";
import { isProtectedApiPath } from "./lib/protectedApi.ts";
import { requireOperator } from "./lib/operatorSession.ts";

export function proxy(request: NextRequest) {
  // Backtest and paper-trading APIs require an operator session or bearer token before any handler runs.
  if (isProtectedApiPath(request.nextUrl.pathname)) {
    const denied = requireOperator(request);
    if (denied) return denied;
  }
  const target = pageGateRedirect(request.nextUrl.pathname, request.nextUrl.search, request.cookies.get(SESSION_COOKIE)?.value);
  if (target) return NextResponse.redirect(new URL(target, request.nextUrl.origin));

  // Content-Security-Policy is ENFORCED by default. CSP_REPORT_ONLY=nonce switches to report-only for measurement.
  const reportOnly = process.env.CSP_REPORT_ONLY === "nonce";
  {
    const nonce = newNonce();
    const policy = buildNonceCsp(nonce, process.env.NODE_ENV === "development");
    // Next reads the policy from the REQUEST to attach nonces to its own inline scripts (Next 16 CSP guide).
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", policy);
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    applySecurityHeaders(response.headers, {});
    response.headers.set(reportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy", policy);
    return response;
  }
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
