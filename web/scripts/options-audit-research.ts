import { assertCollectionAuthorized } from "./lib/collectionGuard.mjs";
assertCollectionAuthorized("options-audit-research.ts", "upstox");

// Research Protocol options-audit-2-research CLI.
//   node scripts/options-audit-research.ts round   — one read-only sampling round (refuses unless NSE market is OPEN)
//   node scripts/options-audit-research.ts report  — rebuild the report from every raw record in rounds-research.jsonl
// Expiry window: 2–7 IST calendar days (see RESEARCH_DTE_BASIS); exact days remaining are recorded alongside.
//
// STRICT PROTECTION: Research-only. Writes ONLY to .data/options-audit-research/. Reads nothing from production
// audit storage, does NOT alter production thresholds, and does NOT modify the frozen strategy or risk settings.

import { appendFileSync, mkdirSync, writeFileSync, openSync, closeSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import { getAccessToken } from "../src/lib/services/upstoxAuth.ts";
import { get, normalizeChain, normalizeQuote } from "../src/lib/services/upstoxMarket.ts";
import { INDICES, INSTRUMENTS } from "../src/lib/services/instrumentRegistry.ts";
import type { IndexId } from "../src/lib/types.ts";
import { mappingCheck, MIN_SESSIONS, MIN_ROUNDS_PER_SESSION, type RawContract } from "../src/lib/optionsAudit.ts";
import { marketStatus } from "../src/lib/time.ts";
import {
  RESEARCH_AUDIT_VERSION,
  istDate,
  selectResearchExpiry,
  sampleResearchRound,
  researchReport,
  type ResearchRound,
  type QuoteDepthEntry,
} from "../src/lib/research/optionsAuditResearch.ts";
import { readJsonl } from "../src/lib/ops/jsonl.ts";
import { UpstoxError } from "../src/lib/services/errors.ts";

const researchDir = path.join(process.cwd(), ".data", "options-audit-research");
const roundsFile = path.join(researchDir, "rounds-research.jsonl");
mkdirSync(researchDir, { recursive: true });
const mode = process.argv[2] ?? "round";

if (mode === "round") {
  const runStart = new Date();
  const state = marketStatus(runStart);
  if (state !== "OPEN") { console.log(`market ${state} (holiday-aware) — no research round recorded`); process.exit(0); }
  // One run at a time: a second invocation exits instead of interleaving writes. A lock older than 10 min is from a dead run.
  const lockFile = path.join(researchDir, ".round.lock");
  try { if (Date.now() - statSync(lockFile).mtimeMs > 10 * 60_000) unlinkSync(lockFile); } catch { /* no lock */ }
  let lockFd: number;
  try { lockFd = openSync(lockFile, "wx"); } catch { console.error("another research round is running — exiting"); process.exit(1); }
  process.on("exit", () => { closeSync(lockFd); try { unlinkSync(lockFile); } catch { /* already gone */ } });

  const runId = runStart.toISOString();
  const exchangeStatus: Record<"NFO" | "BFO", string> = { NFO: "UNKNOWN", BFO: "UNKNOWN" };
  const exchangeOf = (index: IndexId) => (INSTRUMENTS[index].underlyingKey.startsWith("BSE_") ? "BFO" as const : "NFO" as const);
  let failures = 0;
  // Every index of an open-market run leaves a record, so failures cannot silently drop out of the denominators.
  const recordFailure = (index: IndexId, e: unknown, reason?: string) => {
    failures++;
    const now = new Date();
    const ue = e instanceof UpstoxError ? e : null;
    const errorReason = reason ?? ue?.reason ?? "UNCLASSIFIED";
    appendFileSync(roundsFile, JSON.stringify({ version: RESEARCH_AUDIT_VERSION, index, runId, exchange: exchangeOf(index), exchangeStatus: exchangeStatus[exchangeOf(index)], session: istDate(now), at: now.toISOString(), marketState: marketStatus(now), error: (e as Error).message.slice(0, 200), errorReason, httpStatus: ue?.status ?? null }) + "\n");
    console.error(`${index.padEnd(11)} FAILED [${errorReason}]: ${(e as Error).message}`);
  };

  const token = await getAccessToken();
  if (!token) {
    for (const index of INDICES) recordFailure(index, new Error("not attempted: no valid Upstox token on disk"), "NO_VALID_TOKEN");
    console.error("BLOCKER: no valid Upstox token — run `npm run upstox:login`");
    process.exit(1);
  }

  // No retries: once Upstox rejects the token (401) every later request fails the same way, so the rest of the run is
  // recorded as not attempted instead of burning requests.
  let authRejected: UpstoxError | null = null;
  const isAuthRejection = (e: unknown): e is UpstoxError => e instanceof UpstoxError && e.reason === "UPSTOX_AUTH_EXPIRED";

  // Exchange-reported F&O status, not just the local clock. Unreadable status is recorded and cannot qualify.
  for (const ex of ["NFO", "BFO"] as const) {
    if (authRejected) break;
    try { exchangeStatus[ex] = String(((await get(token, `/v2/market/status/${ex}`, {}, { index: "nifty" })) as { status?: string }).status ?? "UNKNOWN"); }
    catch (e) { exchangeStatus[ex] = `UNREADABLE: ${(e as Error).message.slice(0, 80)}`; if (isAuthRejection(e)) authRejected = e; }
  }
  console.log(`exchange status NFO=${exchangeStatus.NFO} BFO=${exchangeStatus.BFO}`);

  for (const index of INDICES) {
    if (authRejected) { recordFailure(index, new UpstoxError(authRejected.reason, `not attempted: token rejected earlier in this run (${authRejected.message})`, authRejected.status)); continue; }
    const uKey = INSTRUMENTS[index].underlyingKey;
    const base = { version: RESEARCH_AUDIT_VERSION, index, runId, exchange: exchangeOf(index), exchangeStatus: exchangeStatus[exchangeOf(index)] } as const;
    try {
      const contracts = (await get(token, "/v2/option/contract", { instrument_key: uKey }, { index })) as RawContract[];
      const selection = selectResearchExpiry(contracts.map((c) => c.expiry ?? ""), new Date());
      if (!selection) throw new Error("no listed expiry ≥ 2 IST calendar days away");
      const expiry = selection.expiry;

      const chainRequestedAt = new Date();
      const chain = normalizeChain(await get(token, "/v2/option/chain", { instrument_key: uKey, expiry_date: expiry }, { index, expiry }), index, expiry);
      const chainReceivedAt = new Date();
      if (!chain.rows.length) throw new Error("empty option chain");

      const atm = chain.rows.reduce((b, r) => (Math.abs(r.strike - chain.spot) < Math.abs(b.strike - chain.spot) ? r : b), chain.rows[0]);
      const i0 = chain.rows.indexOf(atm);
      const keys = chain.rows.slice(Math.max(0, i0 - 5), i0 + 6).flatMap((r) => [r.call.instrumentKey, r.put.instrumentKey]).filter((k): k is string => !!k);

      const quotesRaw = (await get(token, "/v2/market-quote/quotes", { instrument_key: keys.join(",") }, { index })) as Record<string, QuoteDepthEntry & { instrument_token?: string }>;
      const quotes = new Map<string, QuoteDepthEntry>();
      for (const e of Object.values(quotesRaw)) if (e?.instrument_token) quotes.set(e.instrument_token, e);

      const idxQuote = normalizeQuote(await get(token, "/v2/market-quote/quotes", { instrument_key: uKey }, { index }), index);
      const fetchedAt = new Date();
      const master = new Map(contracts.map((c) => [c.instrument_key, c]));

      const round: ResearchRound = {
        ...base,
        session: istDate(fetchedAt),
        at: fetchedAt.toISOString(),
        marketState: marketStatus(fetchedAt),
        expiry,
        calendarDays: selection.calendarDays,
        exactDays: selection.exactDays,
        horizon: selection.horizon,
        seriesType: selection.seriesType,
        mappingPass: mappingCheck(contracts, chain.rows, new Set(quotes.keys()), keys, istDate(fetchedAt)).pass,
        expiryMatchesContractMaster: keys.every((k) => master.get(k)?.expiry === expiry),
        chainRequestedAt: chainRequestedAt.toISOString(),
        chainReceivedAt: chainReceivedAt.toISOString(),
        quotesReceivedAt: fetchedAt.toISOString(),
        spot: idxQuote.spot,
        chainSpot: chain.spot,
        spotDriftPct: idxQuote.spot > 0 ? (Math.abs(idxQuote.spot - chain.spot) / idxQuote.spot) * 100 : 0,
        chainToQuoteMs: fetchedAt.getTime() - chainRequestedAt.getTime(),
        samples: sampleResearchRound(chain.rows, quotes, idxQuote.spot, chain.spot, expiry, fetchedAt),
      };
      appendFileSync(roundsFile, JSON.stringify(round) + "\n");
      console.log(`${index.padEnd(11)} ${expiry} cal ${selection.calendarDays}d exact ${selection.exactDays}d ${selection.horizon}/${selection.seriesType} samples ${round.samples!.length} mapping ${round.mappingPass} ${round.chainToQuoteMs}ms`);
    } catch (e) {
      recordFailure(index, e);
      if (isAuthRejection(e)) authRejected = e;
    }
  }
  if (authRejected) console.error("BLOCKER: token rejected (401) — run `npm run upstox:login`");
  if (failures) process.exit(1);
} else if (mode === "report") {
  const { records, malformed } = readJsonl<ResearchRound>(roundsFile);
  const rep = researchReport(records, marketStatus, MIN_SESSIONS, MIN_ROUNDS_PER_SESSION, malformed);
  const out = path.join(researchDir, `report-research_${istDate(new Date())}_${Date.now()}.json`);
  writeFileSync(out, JSON.stringify(rep, null, 2));
  console.log(JSON.stringify(rep.rawCounts, null, 1));
  console.log("exclusions:", rep.exclusions);
  for (const i of rep.indices) console.log(i.index.padEnd(11), `qualifying rounds ${i.qualifyingRounds}  sessions ${i.qualifyingSessions.length}/${MIN_SESSIONS}`);
  for (const s of rep.sessions) console.log(`session ${s.session}: attempted ${s.attempted} succeeded ${s.succeeded} qualifying ${s.qualifying}`, s.byMarketState, "errors", s.errorsByReason, "obs", s.observations);
  console.log(`live validation: ${rep.liveValidation.status}`);
  for (const w of rep.warnings) console.log("WARNING:", w);
  console.log(`report: ${out}`);
} else {
  console.error("usage: round | report");
  process.exit(1);
}
