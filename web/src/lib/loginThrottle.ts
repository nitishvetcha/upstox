const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60_000;
const IDLE_RESET_MS = 15 * 60_000;
const MAX_TRACKED = 1000;

interface Entry {
  failures: number;
  lockedUntil: number;
  lastAt: number;
}

const entries = new Map<string, Entry>();

function prune(now: number): void {
  for (const [ip, e] of entries) {
    if (now - e.lastAt > IDLE_RESET_MS && e.lockedUntil <= now) entries.delete(ip);
  }
  while (entries.size > MAX_TRACKED) entries.delete(entries.keys().next().value as string);
}

export function ipLockRemainingMs(ip: string, now: number): number {
  const e = entries.get(ip);
  return e && e.lockedUntil > now ? e.lockedUntil - now : 0;
}

export function recordIpFailure(ip: string, now: number): void {
  prune(now);
  const prev = entries.get(ip);
  const base = prev && now - prev.lastAt <= IDLE_RESET_MS ? prev : { failures: 0, lockedUntil: 0, lastAt: now };
  const failures = base.failures + 1;
  const locked = failures >= MAX_FAILURES;
  entries.delete(ip);
  entries.set(ip, { failures: locked ? 0 : failures, lockedUntil: locked ? now + LOCK_MS : base.lockedUntil, lastAt: now });
}

export function clearIpFailures(ip: string): void {
  entries.delete(ip);
}

// Render's router appends the connecting client's address last, so the rightmost entry is the one to trust.
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  const last = forwarded.split(",").map((s) => s.trim()).filter(Boolean).pop();
  return last ?? req.headers.get("x-real-ip") ?? "unknown";
}
