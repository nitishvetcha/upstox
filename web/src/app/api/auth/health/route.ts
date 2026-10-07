export const dynamic = "force-dynamic";

import { getAccessToken, tokenStatus } from "@/lib/services/upstoxAuth";
import { get, normalizeChain, normalizeOptionContracts } from "@/lib/services/upstoxMarket";
import { validExpiries } from "@/lib/services/optionChainAnalytics";
import { INSTRUMENTS } from "@/lib/services/instrumentRegistry";
import { upstoxHistoricalOptions } from "@/lib/adapters/upstoxHistoricalOptionsAdapter";
import type { IndexId } from "@/lib/types";

type Check = { status: "PASS" | "FAIL" | "SKIPPED"; detail: string };

// GET /api/auth/health — read-only probes per index (quote, option contracts, option chain) + historical entitlement.
// Authentication and historical entitlement are reported separately: a valid login does not imply Plus access.
export async function GET() {
  const { status, expiresAt } = await tokenStatus();
  const token = status === "VALID" ? await getAccessToken() : null;
  const skipped: Check = { status: "SKIPPED", detail: `token ${status}` };
  const out: Record<string, Record<string, Check>> = {};

  for (const index of ["nifty", "banknifty"] as IndexId[]) {
    const key = INSTRUMENTS[index].underlyingKey;
    if (!token) { out[index] = { spot: skipped, optionContracts: skipped, optionChain: skipped }; continue; }
    const r: Record<string, Check> = {};
    try {
      const q = (await get(token, "/v2/market-quote/quotes", { instrument_key: key }, { index })) as Record<string, { last_price?: number }>;
      r.spot = { status: "PASS", detail: `ltp ${Object.values(q)[0]?.last_price ?? "?"}` };
    } catch (e) { r.spot = { status: "FAIL", detail: (e as Error).message }; }
    let expiry: string | null = null;
    try {
      const c = normalizeOptionContracts(await get(token, "/v2/option/contract", { instrument_key: key }, { index }));
      expiry = validExpiries(c.expiries, new Date())[0] ?? null;
      r.optionContracts = { status: expiry ? "PASS" : "FAIL", detail: `next expiry ${expiry ?? "none"} · lot size ${c.lotSize ?? "unavailable"}` };
    } catch (e) { r.optionContracts = { status: "FAIL", detail: (e as Error).message }; }
    if (expiry) {
      try {
        const ch = normalizeChain(await get(token, "/v2/option/chain", { instrument_key: key, expiry_date: expiry }, { index, expiry }), index, expiry);
        const keys = ch.rows.filter((row) => row.call.instrumentKey && row.put.instrumentKey).length;
        r.optionChain = { status: ch.rows.length ? "PASS" : "FAIL", detail: `${ch.rows.length} strikes · ${keys} with instrument keys · lot ${ch.lotSize ?? "?"}` };
      } catch (e) { r.optionChain = { status: "FAIL", detail: (e as Error).message }; }
    } else r.optionChain = { status: "SKIPPED", detail: "no expiry" };
    out[index] = r;
  }

  const hist = token ? await upstoxHistoricalOptions.getAvailability() : null;
  return Response.json({
    tokenStatus: status,
    expiresAt,
    checks: out,
    historicalOptions: hist
      ? { status: hist.accessStatus, code: hist.blockerCode ?? null, note: "Historical entitlement (Upstox Plus) is independent of login." }
      : { status: "SKIPPED", code: null, note: `token ${status}` },
  });
}
