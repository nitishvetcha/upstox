// Pure decision for the operator page gate (no framework imports, so it is testable in plain Node).
// Returns the same-origin path to redirect to, or null when the request may proceed.
import { isValidSession } from "./operatorSession.ts";
import { safeNextPath } from "./redirectSafety.ts";

export function pageGateRedirect(pathname: string, search: string, sessionCookie: string | undefined, now = Date.now()): string | null {
  if (pathname.startsWith("/api/")) return null;                     // API routes enforce their own 401
  if (pathname === "/login" || pathname.startsWith("/login/")) return null;
  if (isValidSession(sessionCookie, now)) return null;
  return "/login?next=" + encodeURIComponent(safeNextPath(pathname + search));
}
