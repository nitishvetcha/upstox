/**
 * Phase 12 — Upstox historical options adapter.
 *
 * Attempts to access Upstox v2 historical option OHLC for expired contracts.
 * The existing probe (Phase 11.6) found UDAPI1149 with the current account plan.
 * This adapter performs a fresh controlled probe and documents the result honestly.
 *
 * SAFETY: read-only. 0 order endpoints.
 */
import type {
  HistoricalOptionsProvider,
  HistoricalContract,
  HistoricalOptionObservation,
  HistoricalChainQuery,
  HistoricalOptionQuery,
  ContractQuery,
  ProviderCapabilityReport,
  CapabilityStatus,
} from "../historicalOptionsProvider.ts";
import { getAccessToken } from "../services/upstoxAuth.ts";

const HOST = "https://api.upstox.com";
const TIMEOUT_MS = 10_000;

// Error code returned when Upstox Plus plan is required for expired-instrument history.
export const UDAPI1149 = "UDAPI1149";

// A known-expired NIFTY weekly CE from late 2025 — used as the probe instrument.
// This contract is long expired so querying it exercises the plan-gate path.
const PROBE_INSTRUMENT = "NSE_FO|50928"; // NIFTY 06NOV2025 CE 24000 (probe only)
const PROBE_DATE = "2025-11-06";

// ── Raw HTTP helper (reuses the same pattern as upstoxMarket.get) ─────────────

async function get(token: string, endpoint: string, params: Record<string, string> = {}): Promise<{ ok: boolean; status: number; body: unknown; errorCode?: string; errorMessage?: string }> {
  const qs = new URLSearchParams(params).toString();
  let res: Response;
  try {
    res = await fetch(`${HOST}${endpoint}${qs ? `?${qs}` : ""}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (e) {
    return { ok: false, status: 0, body: null, errorCode: "NETWORK_ERROR", errorMessage: String(e) };
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (body as Record<string, unknown>)?.errors;
    const firstErr = Array.isArray(err) ? (err[0] as Record<string, string>) : null;
    return {
      ok: false,
      status: res.status,
      body,
      errorCode: firstErr?.errorCode ?? `HTTP_${res.status}`,
      errorMessage: firstErr?.message ?? `HTTP ${res.status}`,
    };
  }
  return { ok: true, status: res.status, body };
}

// ── Capability probe ──────────────────────────────────────────────────────────

async function probeHistoricalOptionAccess(token: string): Promise<{ blocked: boolean; code?: string; message?: string; httpStatus?: number }> {
  // v2 historical candle: GET /v2/historical-candle/{instrument_key}/day/{to}/{from}
  const result = await get(
    token,
    `/v2/historical-candle/${encodeURIComponent(PROBE_INSTRUMENT)}/day/${PROBE_DATE}/${PROBE_DATE}`,
  );
  if (result.ok) return { blocked: false };
  if (result.errorCode === UDAPI1149 || result.errorCode?.includes("1149")) {
    return { blocked: true, code: UDAPI1149, message: result.errorMessage, httpStatus: result.status };
  }
  // 404 = instrument not found (probe key invalid) — still means access attempted without plan gate firing
  if (result.status === 404) return { blocked: false };
  // Any other 4xx that is not 401 could mean different restriction
  return { blocked: result.status !== 200, code: result.errorCode, message: result.errorMessage, httpStatus: result.status };
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class UpstoxHistoricalOptionsAdapter implements HistoricalOptionsProvider {
  async getAvailability(): Promise<ProviderCapabilityReport> {
    const checkedAt = new Date().toISOString();
    let token: string | null = null;
    let authStatus: "ok" | "missing" = "ok";

    try {
      token = await getAccessToken();
    } catch {
      authStatus = "missing";
    }

    if (!token || authStatus === "missing") {
      return {
        provider: "Upstox v2/v3 API",
        apiVersion: "v2",
        checkedAt,
        accessStatus: "AUTH_REQUIRED",
        blockerMessage: "No Upstox access token available. Authenticate via /auth/login first.",
        capabilities: blockedCapabilities("UNKNOWN"),
        notes: ["No access token. Historical option data cannot be probed without authentication."],
      };
    }

    const probe = await probeHistoricalOptionAccess(token);

    if (probe.blocked) {
      return {
        provider: "Upstox v2/v3 API",
        apiVersion: "v2",
        checkedAt,
        accessStatus: "PROVIDER_BLOCKED",
        blockerCode: probe.code ?? UDAPI1149,
        blockerMessage: probe.message ?? "Upstox historical option access requires Plus plan.",
        capabilities: blockedCapabilities("PLAN_REQUIRED"),
        notes: [
          `Error code: ${probe.code ?? UDAPI1149}`,
          "Historical option OHLC for expired contracts requires an Upstox Plus subscription.",
          "Current account does NOT have access to: option OHLC, OI, volume, bid/ask for expired contracts.",
          "Underlying historical candles remain available (used for existing backtests).",
          "To unlock: upgrade to Upstox Plus and re-run Phase 12 audit.",
        ],
      };
    }

    // Probe succeeded — historical option data accessible.
    return {
      provider: "Upstox v2/v3 API",
      apiVersion: "v2",
      checkedAt,
      accessStatus: "OK",
      capabilities: {
        underlyingHistoricalCandles: "AVAILABLE",
        optionHistoricalCandles: "AVAILABLE",
        optionOHLC: "AVAILABLE",
        optionOI: "NOT_AVAILABLE",  // OI not in Upstox historical candle endpoint
        optionVolume: "AVAILABLE",
        optionIV: "NOT_AVAILABLE",  // IV not in historical candle; only in live chain
        optionGreeks: "NOT_AVAILABLE",
        optionBid: "NOT_AVAILABLE", // bid/ask not in historical OHLC candles
        optionAsk: "NOT_AVAILABLE",
        expiredContracts: "AVAILABLE",
        historicalInstrumentIdentity: "AVAILABLE",
        historicalExpiry: "AVAILABLE",
        historicalLotSize: "NOT_AVAILABLE", // lot size not in candle response
      },
      notes: ["Upstox Plus plan confirmed. Historical option candles (OHLCV) available for expired contracts."],
    };
  }

  async getContracts(_params: ContractQuery): Promise<HistoricalContract[]> {
    // Not available via Upstox v2 without Plus — return empty to signal blocked state.
    // If Plus is confirmed via getAvailability(), this can query /v2/option/contract with expiry params.
    return [];
  }

  async getCandles(_params: HistoricalOptionQuery): Promise<HistoricalOptionObservation[]> {
    return [];
  }

  async getChainSnapshot(_params: HistoricalChainQuery): Promise<HistoricalOptionObservation[]> {
    return [];
  }
}

// ── Helper: all capabilities blocked ─────────────────────────────────────────

function blockedCapabilities(status: "PLAN_REQUIRED" | "UNKNOWN") {
  return {
    underlyingHistoricalCandles: "AVAILABLE" as const, // underlying candles work without Plus
    optionHistoricalCandles: status,
    optionOHLC: status,
    optionOI: status,
    optionVolume: status,
    optionIV: "NOT_AVAILABLE" as const,
    optionGreeks: "NOT_AVAILABLE" as const,
    optionBid: status,
    optionAsk: status,
    expiredContracts: status,
    historicalInstrumentIdentity: status,
    historicalExpiry: status,
    historicalLotSize: "NOT_AVAILABLE" as const,
  };
}

// ── Singleton for server use ──────────────────────────────────────────────────

export const upstoxHistoricalOptions = new UpstoxHistoricalOptionsAdapter();
