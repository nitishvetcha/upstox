// Safe redirect destinations after login. Only same-origin, absolute PATHS are accepted. Anything else
// (external URLs, protocol-relative "//host", backslashes, control characters, the login page itself) falls back to "/".
export const DEFAULT_DESTINATION = "/";

export function safeNextPath(raw: string | null | undefined): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 512) return DEFAULT_DESTINATION;
  if (!raw.startsWith("/") || raw.startsWith("//")) return DEFAULT_DESTINATION;
  if (raw.includes("\\") || /[\u0000-\u001f\u007f]/.test(raw)) return DEFAULT_DESTINATION;
  let url: URL;
  try { url = new URL(raw, "http://internal.invalid"); } catch { return DEFAULT_DESTINATION; }
  if (url.origin !== "http://internal.invalid") return DEFAULT_DESTINATION;
  if (url.pathname === "/login" || url.pathname.startsWith("/login/")) return DEFAULT_DESTINATION;
  if (url.pathname.startsWith("/api/")) return DEFAULT_DESTINATION;
  return url.pathname + url.search;
}
