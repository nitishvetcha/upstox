// Phase 8: ONE read-only connectivity test of Upstox V3 market quotes. PREPARED, NOT RUN.
// Refuses to run unless PHASE8_LIVE_TEST_APPROVED=yes is set, and at most 4 instrument keys are accepted.
// Prints only field-population summaries. Never prints the token, account data or raw bodies.
// Usage (after owner approval): PHASE8_LIVE_TEST_APPROVED=yes node --experimental-strip-types scripts/phase8-connectivity-test.ts "<KEY1>" "<KEY2>" ...
import fs from "node:fs";
import { assertCollectionAuthorized } from "./lib/collectionGuard.mjs";
assertCollectionAuthorized("phase8-connectivity-test.ts", "upstox");
import path from "node:path";
import { UPSTOX_API_BASE } from "../src/lib/services/upstoxEndpoints.ts";

if (process.env.PHASE8_LIVE_TEST_APPROVED !== "yes") {
  console.log("NOT RUN: owner approval flag PHASE8_LIVE_TEST_APPROVED=yes is not set. No request made.");
  process.exit(0);
}
const keys = process.argv.slice(2);
if (keys.length === 0 || keys.length > 4) { console.log("Give 1 to 4 instrument keys."); process.exit(1); }
const tokenFile = process.env.UPSTOX_TOKEN_FILE ?? path.join(process.cwd(), ".data", "upstox-token.json");
const token = JSON.parse(fs.readFileSync(tokenFile, "utf8")).accessToken as string;
interface MarketDepthLevel {
  price?: number;
  quantity?: number;
}

interface MarketQuoteEntry {
  instrument_token?: string;
  depth?: {
    buy?: MarketDepthLevel[];
    sell?: MarketDepthLevel[];
  };
  last_trade_time?: number | string | null;
  option_greeks?: unknown;
  iv?: number;
}

const url = `${UPSTOX_API_BASE}/v3/market-quote/quotes?instrument_key=${encodeURIComponent(keys.join(","))}`;
const t0 = Date.now();
const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" });
const latencyMs = Date.now() - t0;
const body = (await res.json().catch(() => null)) as { data?: Record<string, MarketQuoteEntry> } | null;
const summary: Record<string, unknown> = { httpStatus: res.status, latencyMs, keysRequested: keys.length, note: "field presence only; values not printed" };
// Same field mapping as src/lib/services/optionPriceVerification.ts: entries keyed by instrument_token; depth.buy/depth.sell levels with price and quantity.
const entries = Object.values(body?.data ?? {});
const levelsOf = (e: MarketQuoteEntry | null, side: "buy" | "sell"): MarketDepthLevel[] =>
  Array.isArray(e?.depth?.[side]) ? (e?.depth?.[side] ?? []) : [];
for (const k of keys) {
  const e = entries.find((x) => x?.instrument_token === k) ?? null;
  const buy = levelsOf(e, "buy"), sell = levelsOf(e, "sell");
  summary[k] = {
    returned: Boolean(e),
    depthBuyLevels: buy.length,
    depthSellLevels: sell.length,
    bidPricePresent: buy.some((l) => typeof l?.price === "number" && l.price > 0),
    askPricePresent: sell.some((l) => typeof l?.price === "number" && l.price > 0),
    bidQuantityPresent: buy.some((l) => typeof l?.quantity === "number" && l.quantity > 0),
    askQuantityPresent: sell.some((l) => typeof l?.quantity === "number" && l.quantity > 0),
    lastTradeTimePresent: typeof e?.last_trade_time !== "undefined" && e?.last_trade_time !== null,
    greeksOrIvPresent: Boolean(e?.option_greeks) || typeof e?.iv === "number",
  };
}
console.log(JSON.stringify(summary, null, 2));
