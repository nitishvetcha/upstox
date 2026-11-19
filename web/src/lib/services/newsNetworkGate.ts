// Fail-closed gate for external news providers (NewsAPI, RSS feeds).
// External news is off by default, in every mode. It is enabled only when BOTH:
//   NEWS_EXTERNAL_ENABLED=true   (explicit news authorisation), and
//   MARKET_DATA_PROVIDER=upstox  (the separately authorised live configuration).
// In MOCK mode no news request is sent, whatever API key or feed configuration exists.

export class NewsNetworkBlockedError extends Error {
  readonly code = "NEWS_NETWORK_BLOCKED";
  constructor(endpoint: string) {
    super(`External news request blocked: NEWS_EXTERNAL_ENABLED and MARKET_DATA_PROVIDER=upstox are both required (endpoint: ${endpoint})`);
    this.name = "NewsNetworkBlockedError";
  }
}

export function newsExternalEnabled(): boolean {
  return process.env.NEWS_EXTERNAL_ENABLED === "true" && process.env.MARKET_DATA_PROVIDER === "upstox";
}

export function assertNewsAllowed(endpoint: string): void {
  if (newsExternalEnabled()) return;
  console.warn(JSON.stringify({ evt: "news_blocked", endpoint, reason: "NEWS_EXTERNAL_DISABLED" }));
  throw new NewsNetworkBlockedError(endpoint);
}
