import type { FallbackReason } from "./types";

export const FALLBACK_LABELS: Record<FallbackReason, string> = {
  UPSTOX_NOT_CONNECTED: "Upstox not connected",
  UPSTOX_AUTH_EXPIRED: "Upstox session expired",
  UPSTOX_FORBIDDEN: "Upstox denied access (403)",
  UPSTOX_RATE_LIMITED: "Upstox rate limit hit",
  UPSTOX_TIMEOUT: "Upstox request timed out",
  UPSTOX_NETWORK: "Network error reaching Upstox",
  UPSTOX_API_ERROR: "Upstox API error",
  UPSTOX_BAD_RESPONSE: "Unexpected response from Upstox",
  UPSTOX_EMPTY_CHAIN: "Upstox returned an empty option chain",
  UPSTOX_NO_EXPIRY: "No valid expiry from Upstox",
  UPSTOX_INVALID_INSTRUMENT: "Instrument not recognised by Upstox",
};
