// CSP violation report parsing for the LOCAL-ONLY report-only receiver.
// Privacy rules: keep only the directive, the blocked resource's scheme and host, and the document PATH (never the
// query string, fragment, cookies, headers, or any token-looking value). Reports larger than MAX_REPORT_BYTES are rejected.
export const MAX_REPORT_BYTES = 8 * 1024;

export interface CspViolationSummary {
  directive: string;          // effective-directive, e.g. "script-src-elem"
  category: "SCRIPT" | "STYLE" | "IMAGE" | "CONNECT" | "FONT" | "FRAME" | "OTHER";
  blockedScheme: string;      // e.g. "https", "inline", "eval", "data", "" when unknown
  blockedHost: string;        // hostname only, "" for inline/eval
  documentPath: string;       // pathname only
  sample: string;             // empty: samples are never stored (they can contain page content)
}

export type CspParseResult = { ok: true; summary: CspViolationSummary } | { ok: false; reason: string };

const CATEGORY: Array<[RegExp, CspViolationSummary["category"]]> = [
  [/^script-src/, "SCRIPT"],
  [/^style-src/, "STYLE"],
  [/^img-src/, "IMAGE"],
  [/^connect-src/, "CONNECT"],
  [/^font-src/, "FONT"],
  [/^frame-(src|ancestors)/, "FRAME"],
];

function categoryOf(directive: string): CspViolationSummary["category"] {
  for (const [re, cat] of CATEGORY) if (re.test(directive)) return cat;
  return "OTHER";
}

// Blocked-URI forms: a URL, or one of the keywords "inline", "eval", "data", "self", "blob".
function splitBlocked(uri: string): { scheme: string; host: string } {
  if (!uri) return { scheme: "", host: "" };
  if (["inline", "eval", "self", "blob"].includes(uri)) return { scheme: uri, host: "" };
  try {
    const u = new URL(uri);
    return { scheme: u.protocol.replace(":", ""), host: u.hostname };
  } catch {
    return { scheme: "unknown", host: "" };
  }
}

function pathOf(uri: string): string {
  try {
    return new URL(uri).pathname;
  } catch {
    return "";
  }
}

export function parseCspReport(text: string): CspParseResult {
  if (new TextEncoder().encode(text).length > MAX_REPORT_BYTES) return { ok: false, reason: "TOO_LARGE" };
  let body: unknown;
  try { body = JSON.parse(text); } catch { return { ok: false, reason: "INVALID_JSON" }; }
  const r = (body as { "csp-report"?: Record<string, unknown> })?.["csp-report"];
  if (!r || typeof r !== "object") return { ok: false, reason: "MISSING_CSP_REPORT" };
  const directive = typeof r["effective-directive"] === "string" ? (r["effective-directive"] as string) : null;
  if (!directive || directive.length > 64) return { ok: false, reason: "BAD_DIRECTIVE" };
  const blocked = typeof r["blocked-uri"] === "string" ? (r["blocked-uri"] as string) : "";
  const doc = typeof r["document-uri"] === "string" ? (r["document-uri"] as string) : "";
  const { scheme, host } = splitBlocked(blocked);
  return {
    ok: true,
    summary: { directive, category: categoryOf(directive), blockedScheme: scheme, blockedHost: host, documentPath: pathOf(doc), sample: "" },
  };
}

// Local-only guard: the receiver answers only to loopback Host headers.
export function isLocalHost(hostHeader: string | null): boolean {
  if (!hostHeader) return false;
  const host = hostHeader.replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}
