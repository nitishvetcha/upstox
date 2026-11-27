// Phase 24 — Live opportunity collector.
// Connects Phase 22 opportunity engines to Phase 23 paper store.
// Only creates paper trades from LIVE sources during an open market session.
// Idempotent: duplicate identities are skipped, not re-created.
import * as fs from "node:fs";
import * as path from "node:path";
import { isMarketOpen, marketStatus } from "./liveSessionController.ts";
import { notifyOpportunitySignal } from "./notificationService.ts";
import {
  listPaperOpportunities,
  savePaperOpportunity,
  type PaperOpportunity,
} from "./paperOpportunityStore.ts";
import {
  createPaperOpportunity,
} from "./paperOpportunityMonitor.ts";
import type { ContractOpportunity, OptionsOpportunityResult } from "../engine/opportunityEngine.ts";
import { OPPORTUNITY_ENGINE_VERSION } from "../engine/opportunityEngine.ts";
import { STOCK_OPPORTUNITY_VERSION } from "../engine/stockOpportunityEngine.ts";
import type { StockOpportunity, StockOpportunityResult } from "../engine/stockOpportunityEngine.ts";
import { commodityMarketStatus, tradeFreshnessOf } from "../time.ts";
import { pruneRunFiles } from "./runLogRetention.ts";

// ── Audit log ─────────────────────────────────────────────────────────────────

export interface LiveCollectionRun {
  id: string;
  timestamp: string;
  marketStatus: string;
  sourceStatus: string;
  generatedCount: number;
  acceptedCount: number;
  createdCount: number;
  duplicateCount: number;
  rejectedCount: number;
  niftyCount: number;
  bankNiftyCount: number;
  crudeOilCount?: number;
  naturalGasCount?: number;
  stockCount: number;
  durationMs: number;
  errors: string[];
}

// Resolved on every call (not at import), so tests that set COLLECTION_LOG_DIR never write into the real logs.
const collectionLogDir = () => process.env.COLLECTION_LOG_DIR ?? path.join(process.cwd(), ".data", "collection-logs");

export function saveCollectionRun(run: LiveCollectionRun): void {
  fs.mkdirSync(collectionLogDir(), { recursive: true });
  fs.writeFileSync(
    path.join(/* turbopackIgnore: true */ collectionLogDir(), `run_${run.id}.json`),
    JSON.stringify(run, null, 2),
  );
  // The newest genuinely LIVE run is kept even when it is older than the newest 200 (ops status reads it).
  pruneRunFiles(collectionLogDir(), "run_", 200, (file) => {
    try { return (JSON.parse(fs.readFileSync(file, "utf8")) as LiveCollectionRun).sourceStatus === "LIVE"; }
    catch { return false; }
  });
}

export function listCollectionRuns(): LiveCollectionRun[] {
  try {
    // turbopackIgnore: the collection log directory is a runtime data path (COLLECTION_LOG_DIR or .data), not bundled.
    if (!fs.existsSync(/* turbopackIgnore: true */ collectionLogDir())) return [];
    return fs.readdirSync(/* turbopackIgnore: true */ collectionLogDir())
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        try { return JSON.parse(fs.readFileSync(path.join(/* turbopackIgnore: true */ collectionLogDir(), f), "utf8")) as LiveCollectionRun; }
        catch { return null; }
      })
      .filter((r): r is LiveCollectionRun => r !== null)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  } catch { return []; }
}

// ── Deduplication identity ────────────────────────────────────────────────────
// A paper opportunity is a duplicate if an OPEN opportunity exists with the
// same identity. Once terminal, a new paper trade with the same identity may
// be created only if the entry/stop/targets genuinely changed (new setup).
//
// Identity key: underlying + instrumentKey + direction + strategyType + entry + stop + target1 + strategyVersion

function identityKey(
  underlying: string,
  instrumentKey: string | null,
  direction: string,
  strategyType: string,
  entry: number,
  stop: number,
  target1: number,
  strategyVersion: string,
): string {
  return [underlying, instrumentKey ?? "stock", direction, strategyType, entry, stop, target1, strategyVersion].join("|");
}

function buildIdentityKey(opp: PaperOpportunity): string {
  return identityKey(
    opp.underlying, opp.instrumentKey, opp.direction,
    opp.strategyType, opp.entry, opp.stop, opp.target1, opp.strategyVersion,
  );
}

// ── Source validation ─────────────────────────────────────────────────────────

function isAllLive(dq: Record<string, string>): boolean {
  return Object.values(dq).every((v) => v === "LIVE");
}

// ── Option opportunity → PaperOpportunity ────────────────────────────────────

function optionToPaper(
  c: ContractOpportunity,
  underlying: string,
  spot: number,
  regime: string,
): PaperOpportunity {
  if (
    c.strategyType === "BEAR_PUT_SPREAD" ||
    c.strategyType === "BULL_CALL_SPREAD" ||
    Boolean(c.isMultiLeg) ||
    ((c.legs?.length ?? 0) > 1)
  ) {
    throw new Error(`Multi-leg strategy ${c.strategyType ?? "spread"} is not supported by single-contract paper trading model`);
  }
  const direction = c.optionType === "CE" ? "BULLISH" : "BEARISH";
  return createPaperOpportunity({
    instrumentType: "OPTION",
    underlying,
    symbol: null,
    instrumentKey: c.instrumentKey,
    optionType: c.optionType,
    strike: c.strike,
    expiry: c.expiry,
    strategyType: c.strategyType,
    direction,
    entry: c.entry,
    stop: c.stop,
    target1: c.target1,
    target2: c.target2,
    spotAtEntry: spot,
    iv: c.iv,
    delta: c.delta,
    oi: c.oi,
    volume: c.volume,
    spread: c.spreadPct,
    score: c.opportunityScore,
    confidence: c.confidence,
    grade: c.grade,
    signalAgreement: c.signalAgreement,
    regime,
    eventRisk: null,
    reasons: c.reasons,
    reasonCodes: [],
    strategyVersion: OPPORTUNITY_ENGINE_VERSION,
    source: "LIVE",
    provenance: "LIVE_COLLECTOR",
  });
}

// ── Stock opportunity → PaperOpportunity ─────────────────────────────────────

function stockToPaper(s: StockOpportunity): PaperOpportunity {
  return createPaperOpportunity({
    instrumentType: "STOCK",
    underlying: s.symbol,
    symbol: s.symbol,
    instrumentKey: s.instrumentKey,
    optionType: null,
    strike: null,
    expiry: null,
    strategyType: String(s.setup),
    direction: s.direction,
    entry: s.entry,
    stop: s.stop,
    target1: s.target1,
    target2: s.target2,
    spotAtEntry: s.ltp,
    iv: null,
    delta: null,
    oi: null,
    volume: s.volume,
    spread: null,
    score: s.opportunityScore,
    confidence: 70,
    grade: s.grade,
    signalAgreement: 0,
    // Sector trend is the only verified cross-sectional regime currently
    // produced by the stock scanner. Do not label raw source provenance as a
    // market regime: that would invalidate evidence diversity checks.
    regime: s.sectorTrend ?? "UNCLASSIFIED",
    eventRisk: null,
    reasons: s.reasons,
    reasonCodes: [],
    strategyVersion: STOCK_OPPORTUNITY_VERSION,
    source: "LIVE",
    provenance: "LIVE_COLLECTOR",
  });
}

// ── Collection result ─────────────────────────────────────────────────────────

export interface CollectionResult {
  market: string;
  source: string;
  generated: number;
  accepted: number;
  created: number;
  duplicates: number;
  rejected: number;
  niftyCount: number;
  bankNiftyCount: number;
  crudeOilCount?: number;
  naturalGasCount?: number;
  stockCount: number;
  errors: string[];
  reason?: string;
  createdIndexOpportunityIds?: string[];
}

export const ENTRY_CUTOFF_IST_MIN = 14 * 60 + 30;

// ── Main collector ────────────────────────────────────────────────────────────

export async function runLiveOpportunityCollection(
  fetchNifty: () => Promise<OptionsOpportunityResult>,
  fetchBankNifty: () => Promise<OptionsOpportunityResult>,
  fetchStocks: () => Promise<StockOpportunityResult>,
  now = new Date(),
  options?: {
    forceMarketOpen?: boolean;
    commodityFetchers?: Array<{ label: "CRUDEOIL" | "NATURALGAS"; fetch: () => Promise<OptionsOpportunityResult> }>;
  },
): Promise<CollectionResult> {
  const isForced = options?.forceMarketOpen || process.env.FORCE_MARKET_OPEN === "true";
  const equityStatus = isForced ? "OPEN" : marketStatus(now);
  const commodityStatus = isForced ? "OPEN" : commodityMarketStatus(now);
  const equityOpen = equityStatus === "OPEN";
  const commodityOpen = commodityStatus === "OPEN";
  const mStatus = equityOpen || commodityOpen ? "OPEN" : equityStatus;
  if (!equityOpen && !commodityOpen) {
    return { market: mStatus, source: "NONE", generated: 0, accepted: 0, created: 0, duplicates: 0, rejected: 0, niftyCount: 0, bankNiftyCount: 0, crudeOilCount: 0, naturalGasCount: 0, stockCount: 0, errors: [], reason: "MARKET_CLOSED" };
  }
  // Phase 2 evaluation rule (docs/intraday-evaluation-rules.md): no new entries at or after 14:30 IST.
  const istMin = Math.floor(((now.getTime() + 5.5 * 3600e3) % 86_400_000) / 60_000);
  if (!isForced && equityOpen && !commodityOpen && istMin >= ENTRY_CUTOFF_IST_MIN) {
    return { market: mStatus, source: "NONE", generated: 0, accepted: 0, created: 0, duplicates: 0, rejected: 0, niftyCount: 0, bankNiftyCount: 0, crudeOilCount: 0, naturalGasCount: 0, stockCount: 0, errors: [], reason: "ENTRY_CUTOFF" };
  }

  const existing = listPaperOpportunities();
  const openOpps = existing.filter((o) => o.status === "OPEN");
  const openKeys = new Set(openOpps.map(buildIdentityKey));
  const openStockSymbols = new Set(
    openOpps.filter((o) => o.instrumentType === "STOCK" && o.symbol).map((o) => o.symbol!)
  );
  const existingKeys = new Set(existing.map(buildIdentityKey));

  const result: CollectionResult = {
    market: mStatus,
    source: "UNAVAILABLE", // Never initialize as LIVE before verifying actual data source
    generated: 0,
    accepted: 0,
    created: 0,
    duplicates: 0,
    rejected: 0,
    niftyCount: 0,
    bankNiftyCount: 0,
    crudeOilCount: 0,
    naturalGasCount: 0,
    stockCount: 0,
    errors: [],
    createdIndexOpportunityIds: [],
  };

  let hasLive = false;
  let hasMock = false;
  let hasAuthExpired = false;
  let hasAuthUnavailable = false;

  // ── Options ──────────────────────────────────────────────────────────────
  const optionSources: Array<{ label: "NIFTY" | "BANKNIFTY" | "CRUDEOIL" | "NATURALGAS"; fetch: () => Promise<OptionsOpportunityResult> }> = [];
  if (equityOpen) optionSources.push({ label: "NIFTY", fetch: fetchNifty }, { label: "BANKNIFTY", fetch: fetchBankNifty });
  if (commodityOpen) optionSources.push(...(options?.commodityFetchers ?? []));
  for (const { fetch: fetchFn, label } of optionSources) {
    try {
      const r = await fetchFn();
      result.generated += r.topOpportunities.length + r.rejectedContracts.length;
      result.rejected += r.rejectedContracts.length;

      const dqValues = Object.values(r.dataQuality ?? {});
      if (dqValues.some((v) => v === "MOCK")) hasMock = true;
      if (dqValues.some((v) => v === "AUTH_EXPIRED")) hasAuthExpired = true;
      if (dqValues.some((v) => v === "AUTH_UNAVAILABLE")) hasAuthUnavailable = true;

      // Source quality check
      if (!isAllLive(r.dataQuality)) {
        result.rejected += r.topOpportunities.length;
        result.errors.push(`${label}: non-LIVE data quality`);
        continue;
      }
      hasLive = true;

      for (const c of r.topOpportunities) {
        if (
          c.strategyType === "BEAR_PUT_SPREAD" ||
          c.strategyType === "BULL_CALL_SPREAD" ||
          Boolean(c.isMultiLeg) ||
          ((c.legs?.length ?? 0) > 1)
        ) {
          result.rejected++;
          result.errors.push(`${label} ${c.strike}${c.optionType}: Multi-leg strategy ${c.strategyType ?? "spread"} rejected (single-contract paper model only)`);
          continue;
        }
        if (c.grade === "REJECT" || c.grade === "C") {
          result.rejected++;
          result.errors.push(`${label} ${c.strike}${c.optionType}: ${c.grade} grade (${c.grade === "C" ? "watch-only" : "unverified or poor quality"})`);
          continue;
        }
        if (c.spreadPct !== null && c.spreadPct > 5.0) {
          result.rejected++;
          result.errors.push(`${label} ${c.strike}${c.optionType}: spread ${c.spreadPct.toFixed(1)}% exceeds 5.0% actionable limit`);
          continue;
        }
        if (c.spreadPct === null) {
          result.rejected++;
          result.errors.push(`${label} ${c.strike}${c.optionType}: missing bid/ask quote`);
          continue;
        }
        if (c.delta === null || !Number.isFinite(c.delta) || Math.abs(c.delta) < 0.10 || Math.abs(c.delta) > 0.80) {
          result.rejected++;
          result.errors.push(`${label} ${c.strike}${c.optionType}: delta ${c.delta} invalid or outside [0.10, 0.80]`);
          continue;
        }
        if (c.lastTradeTime !== undefined) {
          if (!c.lastTradeTime || tradeFreshnessOf(c.lastTradeTime, now).freshness !== "LIVE") {
            result.rejected++;
            result.errors.push(`${label} ${c.strike}${c.optionType}: unverified contract quote freshness`);
            continue;
          }
        }
        result.accepted++;
        let paper: PaperOpportunity;
        try { paper = optionToPaper(c, label, r.spot, r.marketRegime); }
        catch (e) { result.rejected++; result.errors.push(`${label} ${c.strike}${c.optionType}: ${(e as Error).message}`); continue; }
        const key = buildIdentityKey(paper);

        if (openKeys.has(key)) {
          result.duplicates++;
          continue;
        }
        // Also skip if this exact setup was already created (even if terminal) — prevent same-session re-entry
        if (existingKeys.has(key)) {
          result.duplicates++;
          continue;
        }

        savePaperOpportunity(paper);
        openKeys.add(key);
        existingKeys.add(key);
        result.created++;
        if (label === "NIFTY" || label === "BANKNIFTY") result.createdIndexOpportunityIds!.push(paper.id);
        if (label === "NIFTY") result.niftyCount++;
        else if (label === "BANKNIFTY") result.bankNiftyCount++;
        else if (label === "CRUDEOIL") result.crudeOilCount = (result.crudeOilCount ?? 0) + 1;
        else result.naturalGasCount = (result.naturalGasCount ?? 0) + 1;

        // Broadcast real-time signal to Telegram / Discord (non-blocking)
        void notifyOpportunitySignal(paper, { underlying: label, lotSize: label === "NIFTY" ? 65 : label === "BANKNIFTY" ? 30 : label === "CRUDEOIL" ? 100 : 1250 });
      }
    } catch (e) {
      result.errors.push(`${label}: ${(e as Error).message}`);
    }
  }

  // ── Stocks ───────────────────────────────────────────────────────────────
  if (equityOpen) try {
    const stockResult = await fetchStocks();
    result.generated += stockResult.topOpportunities.length;

    if ((stockResult.source as string) === "MOCK") hasMock = true;
    const stockSourceOk = stockResult.source === "UPSTOX";
    const stockFreshnessOk = stockResult.freshness === "LIVE";
    if (stockSourceOk && stockFreshnessOk) hasLive = true;

    if (!stockSourceOk) {
      // Source failure always reported — something went wrong fetching
      result.rejected += stockResult.topOpportunities.length;
      result.errors.push(`Stocks: non-LIVE source (${stockResult.source})`);
    } else if (!stockFreshnessOk && stockResult.topOpportunities.length > 0) {
      // Freshness failure only matters when there are candidates to block
      result.rejected += stockResult.topOpportunities.length;
      result.errors.push(`Stocks: non-LIVE freshness (${stockResult.freshness})`);
    } else {
      for (const s of stockResult.topOpportunities) {
        // Per-stock freshness: only LIVE quotes enter paper store
        if (s.freshness !== "LIVE") {
          result.rejected++;
          result.errors.push(`Stock ${s.symbol}: non-LIVE freshness (${s.freshness})`);
          continue;
        }
        result.accepted++;
        // Portfolio exposure policy (Decision 4): prevent duplicate concurrent positions on the same stock
        if (openStockSymbols.has(s.symbol)) {
          result.duplicates++;
          continue;
        }
        let paper: PaperOpportunity;
        try { paper = stockToPaper(s); }
        catch (e) { result.rejected++; result.errors.push(`Stock ${s.symbol}: ${(e as Error).message}`); continue; }
        const key = buildIdentityKey(paper);
        if (openKeys.has(key) || existingKeys.has(key)) {
          result.duplicates++;
          continue;
        }
        savePaperOpportunity(paper);
        openKeys.add(key);
        openStockSymbols.add(s.symbol);
        existingKeys.add(key);
        result.created++;
        result.stockCount++;
      }
    }
  } catch (e) {
    result.errors.push(`Stocks: ${(e as Error).message}`);
  }

  // Provenance resolution: never default to LIVE unless verified
  if (hasAuthExpired) {
    result.source = "AUTH_EXPIRED";
  } else if (hasAuthUnavailable) {
    result.source = "AUTH_UNAVAILABLE";
  } else if (hasMock) {
    result.source = "MOCK";
  } else if (hasLive) {
    result.source = "LIVE";
  } else {
    result.source = "UNAVAILABLE";
  }

  // Record session evidence
  try {
    const { tokenStatus, evidenceAuthStatus } = await import("./upstoxAuth.ts");
    const { recordCollectionCycle } = await import("./sessionEvidenceStore.ts");
    const st = await tokenStatus();
    const authStatus = evidenceAuthStatus(st.status);
    recordCollectionCycle(result, authStatus, now);
  } catch {
    try {
      const { recordCollectionCycle } = await import("./sessionEvidenceStore.ts");
      recordCollectionCycle(result, "UNKNOWN", now);
    } catch (fallbackErr: unknown) {
      const msg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      result.errors.push(`Session evidence persistence failed: ${msg}`);
    }
  }

  return result;
}
