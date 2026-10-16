// Phase 24 — Live opportunity collector.
// Connects Phase 22 opportunity engines to Phase 23 paper store.
// Only creates paper trades from LIVE sources during an open market session.
// Idempotent: duplicate identities are skipped, not re-created.
import * as fs from "node:fs";
import * as path from "node:path";
import { isMarketOpen, marketStatus } from "./liveSessionController.ts";
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
  stockCount: number;
  durationMs: number;
  errors: string[];
}

const COLLECTION_LOG_DIR =
  process.env.COLLECTION_LOG_DIR ??
  path.join(process.cwd(), ".data", "collection-logs");

export function saveCollectionRun(run: LiveCollectionRun): void {
  fs.mkdirSync(COLLECTION_LOG_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(COLLECTION_LOG_DIR, `run_${run.id}.json`),
    JSON.stringify(run, null, 2),
  );
}

export function listCollectionRuns(): LiveCollectionRun[] {
  try {
    if (!fs.existsSync(COLLECTION_LOG_DIR)) return [];
    return fs.readdirSync(COLLECTION_LOG_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        try { return JSON.parse(fs.readFileSync(path.join(COLLECTION_LOG_DIR, f), "utf8")) as LiveCollectionRun; }
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
  underlying: "NIFTY" | "BANKNIFTY",
  spot: number,
): PaperOpportunity {
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
    regime: "LIVE",
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
    regime: "LIVE",
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
  stockCount: number;
  errors: string[];
  reason?: string;
}

// ── Main collector ────────────────────────────────────────────────────────────

export async function runLiveOpportunityCollection(
  fetchNifty: () => Promise<OptionsOpportunityResult>,
  fetchBankNifty: () => Promise<OptionsOpportunityResult>,
  fetchStocks: () => Promise<StockOpportunityResult>,
  now = new Date(),
): Promise<CollectionResult> {
  const mStatus = marketStatus(now);
  if (mStatus !== "OPEN") {
    return { market: mStatus, source: "NONE", generated: 0, accepted: 0, created: 0, duplicates: 0, rejected: 0, niftyCount: 0, bankNiftyCount: 0, stockCount: 0, errors: [], reason: "MARKET_CLOSED" };
  }

  const existing = listPaperOpportunities();
  const openOpps = existing.filter((o) => o.status === "OPEN");
  const openKeys = new Set(openOpps.map(buildIdentityKey));
  const openStockSymbols = new Set(
    openOpps.filter((o) => o.instrumentType === "STOCK" && o.symbol).map((o) => o.symbol!)
  );
  const existingKeys = new Set(existing.map(buildIdentityKey));

  const result: CollectionResult = { market: mStatus, source: "LIVE", generated: 0, accepted: 0, created: 0, duplicates: 0, rejected: 0, niftyCount: 0, bankNiftyCount: 0, stockCount: 0, errors: [] };

  // ── Options ──────────────────────────────────────────────────────────────
  for (const [fetchFn, label] of [
    [fetchNifty, "NIFTY"],
    [fetchBankNifty, "BANKNIFTY"],
  ] as const) {
    try {
      const r = await fetchFn();
      result.generated += r.topOpportunities.length + r.rejectedContracts.length;
      result.rejected += r.rejectedContracts.length;

      // Source quality check
      if (!isAllLive(r.dataQuality)) {
        result.rejected += r.topOpportunities.length;
        result.errors.push(`${label}: non-LIVE data quality`);
        continue;
      }

      for (const c of r.topOpportunities) {
        result.accepted++;
        const paper = optionToPaper(c, label as "NIFTY" | "BANKNIFTY", r.spot);
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
        if (label === "NIFTY") result.niftyCount++;
        else result.bankNiftyCount++;
      }
    } catch (e) {
      result.errors.push(`${label}: ${(e as Error).message}`);
    }
  }

  // ── Stocks ───────────────────────────────────────────────────────────────
  try {
    const stockResult = await fetchStocks();
    result.generated += stockResult.topOpportunities.length;

    const stockSourceOk = stockResult.source === "UPSTOX";
    const stockFreshnessOk = stockResult.freshness === "LIVE";
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
        const paper = stockToPaper(s);
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

  // Record session evidence
  try {
    const { tokenStatus } = await import("./upstoxAuth.ts");
    const { recordCollectionCycle } = await import("./sessionEvidenceStore.ts");
    const st = await tokenStatus();
    const authStatus = st.status === "VALID" ? "CONNECTED" : st.status === "EXPIRED" || st.status === "INVALID" ? "EXPIRED" : "NOT_CONNECTED";
    recordCollectionCycle(result, authStatus, now);
  } catch {
    try {
      const { recordCollectionCycle } = await import("./sessionEvidenceStore.ts");
      recordCollectionCycle(result, "UNKNOWN", now);
    } catch {
      // Ignore session store errors if unwriteable in isolated tests
    }
  }

  return result;
}
