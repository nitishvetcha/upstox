// Phase 30.5 — Live option-contract LTT audit runner.
// Run during NSE session (09:15–15:30 IST Mon–Fri) with a valid Upstox token.
// Output is a JSON audit record written to .data/option-ltt-audits/.
// OPTION_QUOTE_LTT_ENABLED remains false — this script does NOT alter production paths.
// No paper trades are created. No orders are placed.

import fs from "node:fs";
import path from "node:path";
import { getAccessToken } from "../src/lib/services/upstoxAuth.ts";
import { get, normalizeChain } from "../src/lib/services/upstoxMarket.ts";
import {
  buildChainLTTAudit,
  extractEvaluationKeys,
  OPTION_QUOTE_LTT_ENABLED,
} from "../src/lib/services/optionContractLTT.ts";
import { marketStatus } from "../src/lib/time.ts";

// ── Helpers ───────────────────────────────────────────────────────────────────

function istNow(d: Date): string {
  return d.toLocaleString("sv-SE", { timeZone: "Asia/Kolkata" }).replace("T", " ");
}

// ── Main ──────────────────────────────────────────────────────────────────────

const now = new Date();
console.log("\n=== Phase 30.5 — Option LTT Audit ===");
console.log("Session date/time IST :", istNow(now));
console.log("UTC                   :", now.toISOString());
console.log("OPTION_QUOTE_LTT_ENABLED:", OPTION_QUOTE_LTT_ENABLED, "(must be false)");

const ms = marketStatus(now);
console.log("Market status         :", ms);

if (ms !== "OPEN") {
  console.error("\nBLOCKER: Market is not OPEN. This audit requires a live session.");
  console.error("Next NSE session: Mon–Fri 09:15–15:30 IST. Re-run during that window.");
  process.exit(1);
}

const token = await getAccessToken();
if (!token) {
  console.error("\nBLOCKER: No valid Upstox token. Re-authenticate and re-run.");
  process.exit(1);
}
console.log("Token present         : true (not printed)");

// ── Chain fetch ────────────────────────────────────────────────────────────────

console.log("\n--- Fetching NIFTY option chain ---");
const t0 = Date.now();

const expiries = await get(
  token,
  "/v2/option/contract",
  { instrument_key: "NSE_INDEX|Nifty 50", expiry_date: "" },
  { index: "nifty" },
) as { expiry: string }[];

const today = now.toISOString().slice(0, 10);
const valid = expiries.filter((e) => e.expiry >= today).map((e) => e.expiry).sort();
if (!valid.length) {
  console.error("BLOCKER: No valid expiries found.");
  process.exit(1);
}
const exp = valid[0];
console.log("Nearest expiry        :", exp);

const rawChain = await get(
  token,
  "/v2/option/chain",
  { instrument_key: "NSE_INDEX|Nifty 50", expiry_date: exp },
  { index: "nifty", expiry: exp },
);
const chain = normalizeChain(rawChain, "nifty", exp);
const chainFetchMs = Date.now() - t0;

console.log("Chain rows            :", chain.rows.length);
console.log("Underlying spot       :", chain.spot);
console.log("Chain fetch latency   :", chainFetchMs, "ms");
console.log("Chain lastTradeTime   :", chain.lastTradeTime ?? "ABSENT (expected — v2 chain has no LTT)");

// ── Prototype audit ───────────────────────────────────────────────────────────

console.log("\n--- Running prototype LTT audit ---");
const evalKeys = extractEvaluationKeys(chain.rows, chain.spot);
console.log("Evaluation keys       :", evalKeys.length, "(ATM ± 7 strikes × 2 sides)");

const t1 = Date.now();
const audit = await buildChainLTTAudit(chain.rows, chain.spot, "nifty", token, now);
const auditFetchMs = Date.now() - t1;

console.log("Batch fetch latency   :", auditFetchMs, "ms");
console.log("Requested keys        :", audit.requestedKeys);
console.log("Covered keys          :", audit.coveredKeys);
console.log("Missing keys          :", audit.missingKeys.length, audit.missingKeys.length ? audit.missingKeys : "");
console.log("Fetch error           :", audit.error ?? "none");

console.log("\n--- Freshness distribution ---");
console.log("LIVE                  :", audit.liveCount);
console.log("AGING                 :", audit.agingCount);
console.log("STALE / UNAVAILABLE   :", audit.staleCount);
console.log("Eligible              :", audit.eligibleCount);

// LTT age distribution
const ages: number[] = [];
for (const c of audit.contracts) {
  if (c.exchangeTradeTime) {
    const ageS = Math.round((now.getTime() - new Date(c.exchangeTradeTime).getTime()) / 1000);
    ages.push(ageS);
  }
}
if (ages.length) {
  ages.sort((a, b) => a - b);
  const median = ages[Math.floor(ages.length / 2)];
  console.log("\n--- LTT age (seconds) ---");
  console.log("Min                   :", ages[0]);
  console.log("Median                :", median);
  console.log("Max                   :", ages[ages.length - 1]);
  console.log("Contracts with LTT    :", ages.length, "/", audit.requestedKeys);
}

// LTP discrepancy
const discrepancies = audit.contracts
  .filter((c) => c.ltpDiscrepancy !== null)
  .map((c) => c.ltpDiscrepancy!);
if (discrepancies.length) {
  discrepancies.sort((a, b) => a - b);
  const maxDisc = discrepancies[discrepancies.length - 1];
  const inconsistent = audit.contracts.filter((c) => c.ltpConsistent === false).length;
  console.log("\n--- LTP chain vs quote ---");
  console.log("Max discrepancy       :", maxDisc.toFixed(4), "points");
  console.log("LTP inconsistent (>2%):", inconsistent);
}

// IV/Greeks availability
const withIv = audit.contracts.filter((c) => c.iv !== null).length;
const withGreeks = audit.contracts.filter((c) => c.greeksPresent).length;
console.log("\n--- IV / Greeks availability ---");
console.log("IV present (chain)    :", withIv, "/", audit.requestedKeys);
console.log("Greeks present (chain):", withGreeks, "/", audit.requestedKeys);
console.log("IV freshness evidence :", "NONE — no independent timestamp (structural limitation)");

// Sample of eligible contracts
const eligible = audit.contracts.filter((c) => c.eligible).slice(0, 5);
if (eligible.length) {
  console.log("\n--- Sample eligible contracts (up to 5) ---");
  for (const c of eligible) {
    console.log(
      c.instrumentKey,
      "| chainLtp:", c.chainLtp,
      "| quoteLtp:", c.quoteLtp,
      "| tradeFreshness:", c.tradeFreshness,
      "| lttAge:", c.exchangeTradeTime
        ? Math.round((now.getTime() - new Date(c.exchangeTradeTime).getTime()) / 1000) + "s"
        : "n/a",
      "| iv:", c.iv ?? "null",
      "| ivFreshnessEvidence:", c.ivFreshnessEvidence,
    );
  }
}

// ── Write audit record ────────────────────────────────────────────────────────

const outDir = path.join(process.cwd(), ".data", "option-ltt-audits");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `audit_${now.getTime()}.json`);
const record = {
  sessionDate: now.toISOString().slice(0, 10),
  sessionTimeIST: istNow(now),
  marketStatus: ms,
  expiry: exp,
  spot: chain.spot,
  chainRows: chain.rows.length,
  chainFetchLatencyMs: chainFetchMs,
  chainLttPresent: chain.lastTradeTime !== null,
  auditFetchLatencyMs: auditFetchMs,
  requestedKeys: audit.requestedKeys,
  coveredKeys: audit.coveredKeys,
  missingKeys: audit.missingKeys,
  fetchError: audit.error,
  liveCount: audit.liveCount,
  agingCount: audit.agingCount,
  staleCount: audit.staleCount,
  eligibleCount: audit.eligibleCount,
  lttAgeStats: ages.length ? { min: ages[0], median: ages[Math.floor(ages.length / 2)], max: ages[ages.length - 1], count: ages.length } : null,
  ltpMaxDiscrepancy: discrepancies.length ? discrepancies[discrepancies.length - 1] : null,
  ltpInconsistentCount: audit.contracts.filter((c) => c.ltpConsistent === false).length,
  ivPresentCount: withIv,
  greeksPresentCount: withGreeks,
  ivFreshnessEvidence: "NONE",
  contracts: audit.contracts,
};
fs.writeFileSync(outFile, JSON.stringify(record, null, 2));
console.log("\nAudit record written  :", outFile);
console.log("\n=== Audit complete. No paper trades created. No orders placed. ===\n");
