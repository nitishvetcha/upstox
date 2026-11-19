// Phase 1.5 read-only proof of concept. Prints sanitized aggregates to stdout only.
// No files, orders, paper trades, collectors, flags, or production recommendation paths are touched.
import { getAccessToken } from "../src/lib/services/upstoxAuth.ts";
import { get } from "../src/lib/services/upstoxMarket.ts";
import { validExpiries } from "../src/lib/services/optionChainAnalytics.ts";
import { INSTRUMENTS } from "../src/lib/services/instrumentRegistry.ts";
import { reconstructOptionSnapshot, type CanonicalOptionContract } from "../src/lib/research/optionChainReconstruction.ts";
import type { IndexId } from "../src/lib/types.ts";

const token = await getAccessToken();
if (!token) { console.error(JSON.stringify({ status: "BLOCKED", reason: "EXISTING_AUTHENTICATION_UNAVAILABLE" })); process.exit(1); }
console.info = () => {};
const output: Record<string, unknown> = { phase: "1.5", generatedAt: new Date().toISOString(), classification: "BOUNDED_TIME_RECONSTRUCTION_NOT_ATOMIC", indices: {} };

for (const index of ["nifty", "banknifty"] as const satisfies readonly IndexId[]) {
  try {
    const underlyingKey = INSTRUMENTS[index].underlyingKey;
    const all = await get(token, "/v2/option/contract", { instrument_key: underlyingKey }, { index }) as CanonicalOptionContract[];
    const expiries = validExpiries(all.map((c) => c.expiry).filter((v): v is string => typeof v === "string"), new Date());
    const expiry = expiries[0];
    if (!expiry) throw new Error("NO_APPLICABLE_EXPIRY");
    const contracts = all.filter((c) => c.expiry === expiry);
    const keys = [...new Set(contracts.map((c) => c.instrument_key).filter((v): v is string => typeof v === "string" && v.length > 0))];
    if (keys.length > 500) { (output.indices as Record<string, unknown>)[index] = { status: "BLOCKED", reason: "UNIVERSE_EXCEEDS_V3_LIMIT", contracts: keys.length, expiry }; continue; }
    const [quotes, chain] = await Promise.all([
      get(token, "/v3/market-quote/quotes", { instrument_key: keys.join(",") }, { index, expiry }),
      get(token, "/v2/option/chain", { instrument_key: underlyingKey, expiry_date: expiry }, { index, expiry }),
    ]);
    (output.indices as Record<string, unknown>)[index] = { status: "COMPLETE", ...reconstructOptionSnapshot({ underlyingKey, expiry, contracts: all, quotes, chain, now: new Date() }) };
  } catch (error) {
    const e = error as { reason?: string; status?: number };
    (output.indices as Record<string, unknown>)[index] = { status: "BLOCKED", reason: e.reason ?? "READ_ONLY_REQUEST_FAILED", httpStatus: e.status ?? null };
  }
}

console.log(JSON.stringify(output, null, 2));
