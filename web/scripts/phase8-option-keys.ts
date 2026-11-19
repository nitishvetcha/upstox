// Phase 8 step 1: exactly TWO read-only option-chain requests (NIFTY 2026-11-17, BANK NIFTY 2026-11-23).
// Extracts the ATM CE and PE instrument keys and saves metadata only (no token, no account data).
// Requires owner approval (PHASE8_LIVE_TEST_APPROVED=yes). No retries: any failure stops the run.
// Usage: PHASE8_LIVE_TEST_APPROVED=yes MARKET_DATA_PROVIDER=upstox UPSTOX_COLLECTION_ENABLED=true node --experimental-strip-types scripts/phase8-option-keys.ts
import fs from "node:fs";
import path from "node:path";
import { assertCollectionAuthorized } from "./lib/collectionGuard.mjs";
assertCollectionAuthorized("phase8-option-keys.ts", "upstox");
import { UPSTOX_API_BASE } from "../src/lib/services/upstoxEndpoints.ts";

if (process.env.PHASE8_LIVE_TEST_APPROVED !== "yes") {
  console.log("NOT RUN: PHASE8_LIVE_TEST_APPROVED=yes is not set. No request made.");
  process.exit(0);
}

const REQUESTS = [
  { index: "NIFTY", underlyingKey: "NSE_INDEX|Nifty 50", expiry: "2026-11-17" },
  { index: "BANKNIFTY", underlyingKey: "NSE_INDEX|Nifty Bank", expiry: "2026-11-23" },
];

const tokenFile = path.join(process.cwd(), ".data", "upstox-token.json");
const stored = JSON.parse(fs.readFileSync(tokenFile, "utf8")) as { accessToken?: string; expiresAt?: string; invalidatedAt?: string | null };
if (!stored.accessToken || stored.invalidatedAt || !stored.expiresAt || Date.parse(stored.expiresAt) <= Date.now()) {
  console.log("STOP: stored token is missing, invalidated or expired. No request made. Owner must run npm run upstox:login.");
  process.exit(1);
}
const token = stored.accessToken;

type OptionData = {
  instrument_key?: string;
  [key: string]: unknown;
};

type Row = { strike_price?: number; underlying_spot_price?: number; call_options?: OptionData; put_options?: OptionData };
const results: Record<string, unknown>[] = [];

for (const req of REQUESTS) {
  const url = `${UPSTOX_API_BASE}/v2/option/chain?instrument_key=${encodeURIComponent(req.underlyingKey)}&expiry_date=${req.expiry}`;
  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" });
  } catch (e) {
    console.log(`STOP: ${req.index} request failed at network level (${(e as Error).name}). No retry.`);
    process.exit(1);
  }
  const latencyMs = Date.now() - t0;
  const body = (await res.json().catch(() => null)) as { status?: string; data?: Row[]; errors?: { errorCode?: string; message?: string }[] } | null;
  if (!res.ok || !body || body.status !== "success" || !Array.isArray(body.data)) {
    console.log(JSON.stringify({ index: req.index, expiry: req.expiry, httpStatus: res.status, latencyMs, errorCode: body?.errors?.[0]?.errorCode ?? null, message: body?.errors?.[0]?.message ?? null, note: "STOP. No retry." }, null, 2));
    process.exit(1);
  }
  const rows = body.data.filter((r) => typeof r?.strike_price === "number" && r.strike_price > 0);
  const spot = rows.map((r) => r.underlying_spot_price).find((v): v is number => typeof v === "number" && v > 0);
  if (!rows.length || spot === undefined) {
    console.log(`STOP: ${req.index} chain malformed (no strikes or spot). No retry.`);
    process.exit(1);
  }
  const atm = rows.reduce((best, r) => (Math.abs((r.strike_price as number) - spot) < Math.abs((best.strike_price as number) - spot) ? r : best));
  const ce = atm.call_options?.instrument_key;
  const pe = atm.put_options?.instrument_key;
  if (typeof ce !== "string" || typeof pe !== "string") {
    console.log(`STOP: ${req.index} ATM ${atm.strike_price} lacks CE or PE instrument_key. No retry.`);
    process.exit(1);
  }
  results.push({
    underlying: req.index,
    expiry: req.expiry,
    atmStrike: atm.strike_price,
    spot,
    retrievedAt: new Date().toISOString(),
    sourceEndpoint: "/v2/option/chain",
    httpStatus: res.status,
    latencyMs,
    legs: [
      { optionType: "CE", instrumentKey: ce },
      { optionType: "PE", instrumentKey: pe },
    ],
  });
}

const outFile = path.join(process.cwd(), "docs", "phase0", "phase8-option-keys.json");
fs.writeFileSync(outFile, JSON.stringify({ note: "metadata only; no token or account data", results }, null, 2));
console.log(JSON.stringify({ chainRequestsUsed: REQUESTS.length, saved: outFile, results: results.map((r) => ({ underlying: r.underlying, expiry: r.expiry, atmStrike: r.atmStrike, legs: r.legs })) }, null, 2));
