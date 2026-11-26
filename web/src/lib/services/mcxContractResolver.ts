// Dynamic MCX futures contract resolver.
// Queries Upstox's instrument search API (MCX_FO FUT contracts) to automatically
// pick the active front-month and roll over when < 3 calendar days remain to expiry.
// Resolved keys/expiries are cached in memory for up to 20 hours.
// Falls back to MCX_CRUDEOIL_KEY / MCX_NATURALGAS_KEY env vars on any network failure.
//
// Frozen constraint: NO Strategy 11.4 options math is touched here.

import { assertUpstoxNetworkAllowed } from "./upstoxNetworkGate.ts";
import { UPSTOX_API_BASE } from "./upstoxEndpoints.ts";
import type { CommodityId } from "./instrumentRegistry.ts";

// --- Configuration ----------------------------------------------------------

/** If fewer than ROLLOVER_THRESHOLD_DAYS calendar days remain to expiry, pick the next contract. */
export const ROLLOVER_THRESHOLD_DAYS = 3;

/** How long a successful resolution is kept in memory before a fresh API call is made. */
export const RESOLVER_TTL_MS = 20 * 60 * 60_000; // 20 hours

/** Upstox instrument search endpoint (v2). */
const SEARCH_PATH = "/v2/instruments/search";

// --- Public types -----------------------------------------------------------

export interface ResolvedMcxContract {
  commodityId: CommodityId;
  /** Upstox instrument_key for the futures contract (e.g. "MCX_FO|576264"). */
  instrumentKey: string;
  /** Exchange trading symbol (e.g. "CRUDEOIL26DECFUT"). */
  tradingSymbol: string;
  /** Contract lot size as reported by Upstox, or the env/default fallback. */
  lotSize: number;
  /** ISO-8601 date string of contract expiry, e.g. "2026-12-19". */
  expiry: string;
  /** Calendar days remaining until expiry at resolution time. */
  daysToExpiry: number;
  /** Whether the rollover threshold caused the near-month to be skipped. */
  rolledOver: boolean;
  /** Source of this resolution (live API or env/default fallback). */
  source: "API" | "ENV_FALLBACK" | "DEFAULT_FALLBACK";
}

export interface McxResolverError {
  commodityId: CommodityId;
  error: string;
}

// --- Raw Upstox shapes (never leak beyond this module) ----------------------

interface RawSearchInstrument {
  instrument_key?: unknown;
  trading_symbol?: unknown;
  expiry?: unknown;
  lot_size?: unknown;
  instrument_type?: unknown;
  segment?: unknown;
  exchange?: unknown;
  name?: unknown;
}

// --- Static fallback configuration ------------------------------------------
// These match the defaults in instrumentRegistry.ts and are updated each cycle.

interface CommodityFallbackConfig {
  defaultKey: string;
  defaultLotSize: number;
  envKeyVar: string;
  searchQuery: string;
}

const COMMODITY_CONFIG: Record<CommodityId, CommodityFallbackConfig> = {
  crudeoil: {
    defaultKey: "MCX_FO|576264",
    defaultLotSize: 100,
    envKeyVar: "MCX_CRUDEOIL_KEY",
    searchQuery: "CRUDEOIL",
  },
  naturalgas: {
    defaultKey: "MCX_FO|578249",
    defaultLotSize: 1250,
    envKeyVar: "MCX_NATURALGAS_KEY",
    searchQuery: "NATURALGAS",
  },
  goldm: {
    defaultKey: "",
    defaultLotSize: 100,
    envKeyVar: "MCX_GOLDM_KEY",
    searchQuery: "GOLDM",
  },
  silverm: {
    defaultKey: "",
    defaultLotSize: 5,
    envKeyVar: "MCX_SILVERM_KEY",
    searchQuery: "SILVERM",
  },
};

// --- In-memory cache (server process lifetime) ------------------------------

interface CacheEntry {
  contract: ResolvedMcxContract;
  expiresAt: number;
}

const resolverCache = new Map<CommodityId, CacheEntry>();

/** Clear the resolver cache (used in tests). */
export function clearMcxResolverCache(): void {
  resolverCache.clear();
}

// --- Pure helpers (exported for tests) --------------------------------------

/**
 * Returns the number of whole calendar days between `now` (UTC midnight) and
 * `expiryDateStr` (a "YYYY-MM-DD" UTC date). Negative when already expired.
 */
export function daysUntilExpiry(expiryDateStr: string, now: Date): number {
  const expiryMs = Date.parse(`${expiryDateStr}T00:00:00Z`);
  const nowDayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((expiryMs - nowDayMs) / 86_400_000);
}

/**
 * Given a list of raw Upstox search results for a commodity, select the
 * appropriate contract per the rollover rule:
 *   - Sort active contracts (expiry >= today) by expiry ascending.
 *   - If the nearest has < ROLLOVER_THRESHOLD_DAYS calendar days remaining, skip it.
 *   - Return the chosen contract or null if none qualify.
 */
export function selectActiveContract(
  instruments: RawSearchInstrument[],
  now: Date,
): {
  instrumentKey: string;
  tradingSymbol: string;
  expiry: string;
  lotSize: number;
  daysToExpiry: number;
  rolledOver: boolean;
} | null {
  const today = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;

  const normalizeExpiry = (raw: unknown): string | null => {
    if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
      return new Date(raw).toISOString().slice(0, 10);
    }
    return null;
  };

  // Filter to FUT contracts with valid fields
  const futures = instruments
    .flatMap((inst) => {
      const expiry = normalizeExpiry(inst.expiry);
      const itype = typeof inst.instrument_type === "string" ? inst.instrument_type.toUpperCase() : "";
      if (
        typeof inst.instrument_key !== "string" ||
        !inst.instrument_key.startsWith("MCX_FO|") ||
        typeof inst.trading_symbol !== "string" ||
        !expiry ||
        expiry < today ||
        (itype !== "FUT" && itype !== "FUTCOM")
      ) {
        return [];
      }
      return [{
        instrumentKey: inst.instrument_key,
        tradingSymbol: inst.trading_symbol,
        expiry,
        lotSize: typeof inst.lot_size === "number" && inst.lot_size > 0 ? inst.lot_size : 0,
      }];
    })
    .sort((a, b) => a.expiry.localeCompare(b.expiry));

  if (futures.length === 0) return null;

  const nearMonth = futures[0];
  const daysNear = daysUntilExpiry(nearMonth.expiry, now);

  if (daysNear >= ROLLOVER_THRESHOLD_DAYS) {
    return { ...nearMonth, daysToExpiry: daysNear, rolledOver: false };
  }

  // Near-month is too close to expiry — roll to next
  if (futures.length >= 2) {
    const next = futures[1];
    const daysNext = daysUntilExpiry(next.expiry, now);
    return { ...next, daysToExpiry: daysNext, rolledOver: true };
  }

  // Only one contract left and it's < threshold — still use it rather than failing
  return { ...nearMonth, daysToExpiry: daysNear, rolledOver: false };
}

// --- Network layer ----------------------------------------------------------

const MCX_MASTER_URL = "https://assets.upstox.com/market-quote/instruments/exchange/MCX.json.gz";
let mcxMasterCache: { expiresAt: number; rows: RawSearchInstrument[] } | null = null;

async function fetchMcxMaster(now: Date): Promise<RawSearchInstrument[]> {
  if (mcxMasterCache && mcxMasterCache.expiresAt > now.getTime()) {
    return mcxMasterCache.rows;
  }
  assertUpstoxNetworkAllowed("/market-quote/instruments/exchange/MCX.json.gz");
  const res = await fetch(MCX_MASTER_URL, { signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (!res.ok || !res.body) throw new Error(`MCX master HTTP ${res.status}`);
  const json = (await new Response(res.body.pipeThrough(new DecompressionStream("gzip"))).json()) as RawSearchInstrument[];
  const rows = Array.isArray(json) ? json : [];
  mcxMasterCache = { expiresAt: now.getTime() + RESOLVER_TTL_MS, rows };
  return rows;
}

async function fetchSearchResults(
  token: string,
  query: string,
  now = new Date(),
): Promise<RawSearchInstrument[]> {
  assertUpstoxNetworkAllowed(SEARCH_PATH);
  const url = `${UPSTOX_API_BASE}${SEARCH_PATH}?q=${encodeURIComponent(query)}&exchanges=MCX&segment=MCX_FO`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (res.ok) {
      const body = (await res.json()) as { status?: string; data?: unknown };
      if (body?.status === "success" && Array.isArray(body?.data) && body.data.length > 0) {
        return body.data as RawSearchInstrument[];
      }
    }
  } catch {
    // Fall through to BOD MCX master
  }
  const master = await fetchMcxMaster(now);
  const qUpper = query.toUpperCase();
  return master.filter(
    (r) =>
      typeof r.trading_symbol === "string" &&
      r.trading_symbol.toUpperCase().startsWith(qUpper)
  );
}

// --- Env / default fallback -------------------------------------------------

function envFallback(commodityId: CommodityId, now: Date): ResolvedMcxContract {
  const cfg = COMMODITY_CONFIG[commodityId];
  // Always read env vars at call time so test overrides are respected.
  const envKey = process.env[cfg.envKeyVar]?.trim();
  const instrumentKey = envKey ?? cfg.defaultKey;
  const source: ResolvedMcxContract["source"] = envKey ? "ENV_FALLBACK" : "DEFAULT_FALLBACK";

  // Try to read the expiry from the sibling expiry env var
  const expiryEnvMap: Record<CommodityId, string> = {
    crudeoil: "MCX_CRUDEOIL_EXPIRY",
    naturalgas: "MCX_NATURALGAS_EXPIRY",
    goldm: "MCX_GOLDM_EXPIRY",
    silverm: "MCX_SILVERM_EXPIRY",
  };
  const expiryEnvVar = expiryEnvMap[commodityId];
  const expiry = process.env[expiryEnvVar]?.trim() ?? "1970-01-01";
  const days = daysUntilExpiry(expiry, now);

  return {
    commodityId,
    instrumentKey,
    tradingSymbol: `${commodityId.toUpperCase()} FUT`,
    lotSize: cfg.defaultLotSize,
    expiry,
    daysToExpiry: days,
    rolledOver: false,
    source,
  };
}

// --- Primary public API -----------------------------------------------------

/**
 * Resolve the active MCX futures contract for `commodityId`.
 *
 * - Checks the in-memory cache first (20-hour TTL).
 * - On cache miss, queries Upstox instrument search and applies the rollover rule.
 * - On any network/parse failure, returns an env/default fallback immediately
 *   (never throws).
 * - `token` must be a valid Upstox bearer token; pass `""` in test environments
 *   where `MARKET_DATA_PROVIDER !== "upstox"` to use the fallback directly.
 */
export async function resolveMcxContract(
  commodityId: CommodityId,
  token: string,
  now = new Date(),
): Promise<ResolvedMcxContract> {
  // 1. Cache hit
  const hit = resolverCache.get(commodityId);
  if (hit && hit.expiresAt > now.getTime()) {
    return hit.contract;
  }
  resolverCache.delete(commodityId);

  // 2. Attempt live API resolution
  try {
    const cfg = COMMODITY_CONFIG[commodityId];
    const raw = await fetchSearchResults(token, cfg.searchQuery);
    const chosen = selectActiveContract(raw, now);
    if (!chosen) {
      console.warn(
        JSON.stringify({
          evt: "mcx_resolver_no_contract",
          commodity: commodityId,
          message: "No active FUT contracts found; using env/default fallback",
        }),
      );
      return envFallback(commodityId, now);
    }

    // Use env lot size override if search returned 0
    const lotSize =
      chosen.lotSize > 0
        ? chosen.lotSize
        : COMMODITY_CONFIG[commodityId].defaultLotSize;

    const contract: ResolvedMcxContract = {
      commodityId,
      instrumentKey: chosen.instrumentKey,
      tradingSymbol: chosen.tradingSymbol,
      lotSize,
      expiry: chosen.expiry,
      daysToExpiry: chosen.daysToExpiry,
      rolledOver: chosen.rolledOver,
      source: "API",
    };

    console.info(
      JSON.stringify({
        evt: "mcx_contract_resolved",
        commodity: commodityId,
        instrumentKey: contract.instrumentKey,
        tradingSymbol: contract.tradingSymbol,
        expiry: contract.expiry,
        daysToExpiry: contract.daysToExpiry,
        rolledOver: contract.rolledOver,
      }),
    );

    resolverCache.set(commodityId, {
      contract,
      expiresAt: now.getTime() + RESOLVER_TTL_MS,
    });
    return contract;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      JSON.stringify({
        evt: "mcx_resolver_fallback",
        commodity: commodityId,
        error: msg,
        message: "API resolution failed; using env/default fallback",
      }),
    );
    return envFallback(commodityId, now);
  }
}

/**
 * Resolve both MCX commodities in parallel.
 * Returns a map of CommodityId → ResolvedMcxContract.
 * Never throws — each commodity independently falls back on error.
 */
export async function resolveAllMcxContracts(
  token: string,
  now = new Date(),
): Promise<Record<CommodityId, ResolvedMcxContract>> {
  const [crude, gas, goldm, silverm] = await Promise.all([
    resolveMcxContract("crudeoil", token, now),
    resolveMcxContract("naturalgas", token, now),
    resolveMcxContract("goldm", token, now),
    resolveMcxContract("silverm", token, now),
  ]);
  return { crudeoil: crude, naturalgas: gas, goldm, silverm };
}

/**
 * Synchronously returns the cached contract if available, or null.
 * Used by callers that cannot await (e.g. module-level initialization).
 */
export function getCachedMcxContract(commodityId: CommodityId, now = new Date()): ResolvedMcxContract | null {
  const hit = resolverCache.get(commodityId);
  if (hit && hit.expiresAt > now.getTime()) return hit.contract;
  return null;
}

/**
 * Warm the cache for both commodities. Call once at app startup or when the
 * scheduler triggers a contract refresh. Never throws.
 */
export async function warmMcxContractCache(token: string, now = new Date()): Promise<void> {
  try {
    await resolveAllMcxContracts(token, now);
  } catch {
    // already guarded inside resolveAllMcxContracts, but be defensive
  }
}
