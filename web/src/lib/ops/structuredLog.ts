// Structured, redacted operational log lines (one JSON object per line on stderr/stdout).
// Redaction runs on every field. Keys that look like credentials and values that look like bearer tokens are removed.
export type LogLevel = "info" | "warn" | "error";

const SECRET_KEY = /(token|secret|password|passwd|pin|apikey|api_key|authorization|cookie|key)$/i;
const BEARER = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;

export function redactValue(v: unknown): unknown {
  if (typeof v === "string") return v.replace(BEARER, "Bearer [REDACTED]");
  if (Array.isArray(v)) return v.map(redactValue);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (SECRET_KEY.test(k)) out[k] = "[REDACTED]";
      else out[k] = redactValue(val);
    }
    return out;
  }
  return v;
}

// Returns the line that would be written. Pure, so it can be tested without I/O.
export function formatLogLine(level: LogLevel, event: string, fields: Record<string, unknown> = {}, at = new Date()): string {
  return JSON.stringify({ at: at.toISOString(), level, event, ...(redactValue(fields) as object) });
}

export function logEvent(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
  const line = formatLogLine(level, event, fields);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
