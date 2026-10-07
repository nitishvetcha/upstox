import type { FallbackReason } from "../types.ts";

// An Upstox failure the dashboard recovers from by falling back to mock data.
export class UpstoxError extends Error {
  reason: FallbackReason;
  status: number | null;
  constructor(reason: FallbackReason, message: string, status: number | null = null) {
    super(message);
    this.reason = reason;
    this.status = status;
  }
}

// The caller asked for something that doesn't exist (e.g. an expiry not on offer): a 400, not a fallback.
export class InvalidRequestError extends Error {}

// A news-provider failure: news becomes UNAVAILABLE (never mock). `reason` is safe to show; never contains the key.
export class NewsError extends Error {
  reason: "NEWS_NOT_CONFIGURED" | "NEWS_AUTH" | "NEWS_RATE_LIMITED" | "NEWS_TIMEOUT" | "NEWS_NETWORK" | "NEWS_API_ERROR" | "NEWS_BAD_RESPONSE";
  constructor(reason: NewsError["reason"], message: string) {
    super(message);
    this.reason = reason;
  }
}
