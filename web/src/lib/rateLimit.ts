// Fixed-window rate limiter. Pure logic: the caller supplies the clock and the client key.
// NOT wired into any route yet. Design and trade-offs: docs/SECURITY_CSP_AND_RATE_LIMIT_DESIGN_2026-11-10.md
//
// Client identity: only the direct socket address is trusted by default. X-Forwarded-For is honoured ONLY when the
// caller explicitly passes trustedProxy=true (i.e. the app sits behind a proxy the operator controls). Otherwise a
// client could forge its key and evade every limit.

export interface RateLimitRule {
  limit: number;      // requests allowed per window
  windowMs: number;   // window length
}

export interface RateDecision {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number; // 0 when allowed
}

export function clientKey(input: { socketAddress: string | null; forwardedFor?: string | null; trustedProxy: boolean }): string {
  if (input.trustedProxy && input.forwardedFor) {
    // The left-most entry is the original client when the proxy appends its own address.
    const first = input.forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  return input.socketAddress ?? "unknown";
}

export class FixedWindowLimiter {
  private readonly buckets = new Map<string, { start: number; count: number }>();
  private readonly rule: RateLimitRule;
  private readonly maxKeys: number;
  constructor(rule: RateLimitRule, maxKeys = 10_000) {
    this.rule = rule;
    this.maxKeys = maxKeys;
  }

  check(key: string, nowMs: number): RateDecision {
    const b = this.buckets.get(key);
    if (!b || nowMs - b.start >= this.rule.windowMs) {
      this.evictIfFull();
      this.buckets.set(key, { start: nowMs, count: 1 });
      return { allowed: true, remaining: this.rule.limit - 1, retryAfterMs: 0 };
    }
    if (b.count < this.rule.limit) {
      b.count += 1;
      return { allowed: true, remaining: this.rule.limit - b.count, retryAfterMs: 0 };
    }
    return { allowed: false, remaining: 0, retryAfterMs: this.rule.windowMs - (nowMs - b.start) };
  }

  // Bounded memory: when full, drop the oldest window. Never grows without limit under key flooding.
  private evictIfFull() {
    if (this.buckets.size < this.maxKeys) return;
    const oldest = this.buckets.keys().next().value;
    if (oldest !== undefined) this.buckets.delete(oldest);
  }

  size(): number {
    return this.buckets.size;
  }
}
