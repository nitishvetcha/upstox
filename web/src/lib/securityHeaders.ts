// Baseline response headers for every page and API response. Applied by src/proxy.ts.
// A Content-Security-Policy is NOT enforced. Report-only validation is available behind CSP_REPORT_ONLY=1 and
// sends violations to the local-only receiver at /api/csp-report. Nothing here blocks content.
export const SECURITY_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Cross-Origin-Opener-Policy": "same-origin",
};

// Report-only policy used for validation runs. Inline scripts and styles are allowed here on purpose: the goal is to
// MEASURE what the framework needs, not to block it. Enforcement needs a nonce or hash design validated from this data.
export const CSP_REPORT_ONLY_POLICY =
  "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; " +
  "form-action 'self'; report-uri /api/csp-report";

// Strict variant: what an enforced policy would look like WITHOUT inline or eval. Used only to measure breakage.
export const CSP_STRICT_REPORT_ONLY_POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; " +
  "form-action 'self'; report-uri /api/csp-report";

export function applySecurityHeaders(headers: Headers, env: Partial<Record<string, string | undefined>> = process.env): Headers {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  if (env.CSP_REPORT_ONLY === "1") headers.set("Content-Security-Policy-Report-Only", CSP_REPORT_ONLY_POLICY);
  if (env.CSP_REPORT_ONLY === "strict") headers.set("Content-Security-Policy-Report-Only", CSP_STRICT_REPORT_ONLY_POLICY);
  return headers;
}

// Nonce-based report-only policy (Next.js documented approach: a fresh nonce per request, set by the proxy).
// 'unsafe-eval' is included ONLY in development, because React uses eval there for debugging (Next docs).
export function buildNonceCsp(nonce: string, isDev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'", // approved: React style={} attributes cannot take a nonce; scripts stay nonce-only
    // Owner decision (stage C): the chart library injects a <style> element without a nonce. Styles only; scripts stay nonce-only.
    "style-src-elem 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.tradingview.com",
    "font-src 'self' data:",
    "connect-src 'self' https://*.tradingview.com wss://*.tradingview.com",
    "frame-src 'self' https://*.tradingview.com https://*.tradingview-widget.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "report-uri /api/csp-report",
  ].join("; ");
}

export function newNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}
