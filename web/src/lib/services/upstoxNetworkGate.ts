// Single enforcement point for every outbound request to Upstox hosts (api.upstox.com, assets.upstox.com).
// Every Upstox HTTP call in src must call assertUpstoxNetworkAllowed() immediately before fetch().
// Rule: unless MARKET_DATA_PROVIDER is exactly "upstox", no Upstox request is sent, whatever token exists.
// Reads the environment directly (not via market.ts) to avoid an import cycle with upstoxMarket.ts.

export class UpstoxNetworkBlockedError extends Error {
  readonly code = "UPSTOX_NETWORK_BLOCKED";
  constructor(endpoint: string) {
    super(`Upstox request blocked: provider is not "upstox" (endpoint: ${endpoint})`);
    this.name = "UpstoxNetworkBlockedError";
  }
}

export function upstoxProviderActive(): boolean {
  return process.env.MARKET_DATA_PROVIDER === "upstox";
}

export function assertUpstoxNetworkAllowed(endpoint: string): void {
  if (upstoxProviderActive()) return;
  // Log the attempt without any credential, then refuse.
  console.warn(JSON.stringify({ evt: "upstox_blocked", endpoint, reason: "MARKET_DATA_PROVIDER_NOT_UPSTOX" }));
  throw new UpstoxNetworkBlockedError(endpoint);
}
