import { timingSafeEqual, createHash } from "node:crypto";
import { scanStocks } from "../../../../lib/engine/stockOpportunityEngine.ts";
import { marketStatus } from "../../../../lib/services/liveSessionController.ts";
import { saveCollectionRun } from "../../../../lib/services/liveOpportunityCollector.ts";

function equal(a: string, b: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest()
  );
}

export interface StockScanCronDeps {
  scanFn?: typeof scanStocks;
  marketStatusFn?: typeof marketStatus;
  saveCollectionFn?: typeof saveCollectionRun;
  now?: Date;
  token?: string;
}

export async function handleStockScan(
  request: Request,
  deps: StockScanCronDeps = {}
): Promise<Response> {
  const token = deps.token ?? process.env.SCHEDULER_TOKEN;
  const supplied = request.headers.get("x-scheduler-token") ?? "";
  if (!token || !supplied || !equal(token, supplied)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = deps.now ?? new Date();
  const getMarket = deps.marketStatusFn ?? marketStatus;
  const market = getMarket(now);

  if (market !== "OPEN") {
    return Response.json({
      ok: true,
      skipped: true,
      reason: `NSE_MARKET_${market}`,
      market,
      timestamp: now.toISOString(),
    });
  }

  const start = Date.now();
  try {
    const scanner = deps.scanFn ?? scanStocks;
    const scanResult = await scanner("intraday", now);

    const isLive =
      scanResult.freshness === "LIVE" || scanResult.source === "UPSTOX";
    const sourceStatus = isLive ? "LIVE" : scanResult.freshness || "UNAVAILABLE";

    const saver = deps.saveCollectionFn ?? saveCollectionRun;
    saver({
      id: `${start}_api`,
      timestamp: new Date().toISOString(),
      marketStatus: "OPEN",
      sourceStatus,
      generatedCount: scanResult.topOpportunities.length,
      acceptedCount: scanResult.topOpportunities.length,
      createdCount: 0,
      duplicateCount: 0,
      rejectedCount: scanResult.stocksRejected,
      niftyCount: 0,
      bankNiftyCount: 0,
      stockCount: scanResult.stocksAvailable,
      durationMs: Date.now() - start,
      errors: scanResult.noOpportunityReason ? [scanResult.noOpportunityReason] : [],
    });

    return Response.json({
      ok: true,
      timestamp: new Date().toISOString(),
      source: scanResult.source,
      freshness: scanResult.freshness,
      stocksScanned: scanResult.stocksScanned,
      stocksAvailable: scanResult.stocksAvailable,
      stocksRejected: scanResult.stocksRejected,
      topOpportunitiesCount: scanResult.topOpportunities.length,
      durationMs: Date.now() - start,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[CRON:STOCK_SCAN_ERROR] ${message}`);
    return Response.json({ error: message }, { status: 500 });
  }
}
