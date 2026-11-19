// Phase 4 options data audit (docs/options-data-audit.md). Read-only Upstox calls; writes only .data/options-audit/.
//   node scripts/options-data-audit.ts mapping   — check A for all 6 indices (works any time)
//   node scripts/options-data-audit.ts round     — one live sampling round (B/C/D), appended to rounds.jsonl
//   node scripts/options-data-audit.ts report    — verdict per index
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getAccessToken } from "../src/lib/services/upstoxAuth.ts";
import { get, normalizeChain, normalizeQuote } from "../src/lib/services/upstoxMarket.ts";
import { INDICES, INSTRUMENTS } from "../src/lib/services/instrumentRegistry.ts";
import { marketStatus } from "../src/lib/services/liveSessionController.ts";
import { mappingCheck, sampleRound, AUDIT_VERSION, type RawContract, type QuoteEntry } from "../src/lib/optionsAudit.ts";
// options-audit-1a: IV recompute uses fresh index spot, not chain's lagging underlying_spot_price
const AUDIT_VERSION_1A = "options-audit-1a";
import { auditReport } from "../src/lib/optionsAuditReport.ts";
import type { IndexId } from "../src/lib/types.ts";

const mode = process.argv[2];
const dir = path.join(process.cwd(), ".data", "options-audit");
mkdirSync(dir, { recursive: true });
const istDate = (d: Date) => new Date(d.getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);
console.info = () => {};

async function snapshot(token: string, index: IndexId) {
  const key = INSTRUMENTS[index].underlyingKey;
  const contracts = (await get(token, "/v2/option/contract", { instrument_key: key }, { index })) as RawContract[];
  const today = istDate(new Date());
  const expiry = [...new Set(contracts.map((c) => c.expiry!).filter((e) => e && e >= today))].sort()[0];
  if (!expiry) throw new Error("no current expiry");
  const t0 = Date.now();
  const chain = normalizeChain(await get(token, "/v2/option/chain", { instrument_key: key, expiry_date: expiry }, { index, expiry }), index, expiry);
  const sorted = chain.rows;
  const atm = sorted.reduce((b, r) => (Math.abs(r.strike - chain.spot) < Math.abs(b.strike - chain.spot) ? r : b), sorted[0]);
  const i0 = sorted.indexOf(atm);
  const keys = sorted.slice(Math.max(0, i0 - 5), i0 + 6).flatMap((r) => [r.call.instrumentKey, r.put.instrumentKey]).filter((k): k is string => !!k);
  const quotes = new Map<string, QuoteEntry>();
  for (let i = 0; i < keys.length; i += 20) {
    const raw = (await get(token, "/v2/market-quote/quotes", { instrument_key: keys.slice(i, i + 20).join(",") }, { index })) as Record<string, QuoteEntry & { instrument_token?: string }>;
    for (const e of Object.values(raw)) if (e?.instrument_token) quotes.set(e.instrument_token, e);
  }
  // options-audit-1a: fetch fresh index spot for unbiased IV recompute (chain.spot is lagging)
  const idxQuote = normalizeQuote(await get(token, "/v2/market-quote/quotes", { instrument_key: key }, { index }), index);
  const fetchedAt = new Date();
  return { contracts, expiry, chain, keys, quotes, fetchedAt, chainToQuoteMs: fetchedAt.getTime() - t0, indexSpot: idxQuote.spot };
}

const token = mode === "report" ? null : await getAccessToken();
if (mode !== "report" && !token) { console.error("BLOCKER: Upstox not connected"); process.exit(1); }

if (mode === "mapping") {
  const out: Record<string, unknown> = {};
  for (const index of INDICES) {
    try {
      const s = await snapshot(token!, index);
      const lot = s.contracts.find((c) => (c.lot_size ?? 0) > 0)?.lot_size ?? null;
      out[index] = { ...mappingCheck(s.contracts, s.chain.rows, new Set(s.quotes.keys()), s.keys, istDate(new Date())), contracts: s.contracts.length, usedExpiry: s.expiry, lotSize: lot, strikes: s.chain.rows.length, spot: s.chain.spot };
    } catch (e) { out[index] = { pass: false, issues: [`fetch failed: ${(e as Error).message}`] }; }
  }
  writeFileSync(path.join(dir, `mapping_${istDate(new Date())}.json`), JSON.stringify({ version: AUDIT_VERSION, at: new Date().toISOString(), ...out }, null, 2));
  for (const [k, v] of Object.entries(out)) { const r = v as { pass: boolean; issues: string[]; usedExpiry?: string; lotSize?: number; strikes?: number; contracts?: number }; console.log(k.padEnd(11), r.pass ? "PASS" : "FAIL", `expiry ${r.usedExpiry ?? "-"} lot ${r.lotSize ?? "-"} strikes ${r.strikes ?? "-"} contracts ${r.contracts ?? "-"}`, r.issues.slice(0, 3).join(" | ")); }
} else if (mode === "round") {
  if (marketStatus() !== "OPEN") { console.log("market not open — no round recorded"); process.exit(0); }
  for (const index of INDICES) {
    try {
      const s = await snapshot(token!, index);
      const rec = s.chainToQuoteMs > 2000
        ? { version: AUDIT_VERSION_1A, index, session: istDate(s.fetchedAt), at: s.fetchedAt.toISOString(), skipped: `chain→quote gap ${s.chainToQuoteMs} ms > 2000` }
        : { version: AUDIT_VERSION_1A, index, session: istDate(s.fetchedAt), at: s.fetchedAt.toISOString(), expiry: s.expiry, spot: s.indexSpot, chainSpot: s.chain.spot, chainToQuoteMs: s.chainToQuoteMs,
            mappingPass: mappingCheck(s.contracts, s.chain.rows, new Set(s.quotes.keys()), s.keys, istDate(s.fetchedAt)).pass,
            samples: sampleRound(s.chain.rows, s.quotes, s.indexSpot, s.expiry, s.fetchedAt) };
      appendFileSync(path.join(dir, "rounds.jsonl"), JSON.stringify(rec) + "\n");
    } catch (e) {
      appendFileSync(path.join(dir, "rounds.jsonl"), JSON.stringify({ version: AUDIT_VERSION_1A, index, session: istDate(new Date()), at: new Date().toISOString(), error: (e as Error).message.slice(0, 200) }) + "\n");
    }
  }
  console.log(`round recorded for ${INDICES.length} indices`);
} else if (mode === "report") {
  const rep = auditReport(dir, AUDIT_VERSION_1A);
  writeFileSync(path.join(dir, `report_${istDate(new Date())}.json`), JSON.stringify(rep, null, 2));
  if (rep.malformedLines) console.log(`warning: ${rep.malformedLines} malformed line(s) in rounds.jsonl ignored`);
  for (const r of rep.indices) {
    console.log(r.index.padEnd(11), String(r.verdict).padEnd(29), `mapping ${r.mappingPass}  sessions ${r.sessionsWithEnoughRounds}/${r.sessions}  rounds ${r.roundsUsed}/${r.roundsAttempted}  fresh ${r.liveShare?.toFixed(3) ?? "-"}  price-agree ${r.priceAgreeShare?.toFixed(3) ?? "-"}  IV diff median ${r.ivMedianDiff?.toFixed(2) ?? "-"} p95 ${r.ivP95Diff?.toFixed(2) ?? "-"}  errors ${r.roundsErrored} skipped ${r.roundsSkipped}  → ${r.ivPolicy}`);
  }
} else {
  console.error("usage: mapping | round | report");
  process.exit(1);
}
