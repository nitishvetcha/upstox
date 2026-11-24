export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { validateHistoricalStrategy } from "@/lib/services/strategyHistoricalValidator";
import { getAccessToken } from "@/lib/services/upstoxAuth";
import { get } from "@/lib/services/upstoxMarket";
import { normalizeCandles, mergeCandles } from "@/lib/services/candles";
import { getTradingViewSymbol, getTradingViewChartUrl } from "@/lib/tradingView";
import { dataRoot } from "@/lib/dataRoot";
import type { Candle } from "@/lib/types";

// Standard instruments lookup
const INSTRUMENT_MAP: Record<string, { key: string; name: string }> = {
  NIFTY: { key: "NSE_INDEX|Nifty 50", name: "NIFTY 50" },
  "NIFTY 50": { key: "NSE_INDEX|Nifty 50", name: "NIFTY 50" },
  BANKNIFTY: { key: "NSE_INDEX|Nifty Bank", name: "BANK NIFTY" },
  "BANK NIFTY": { key: "NSE_INDEX|Nifty Bank", name: "BANK NIFTY" },
  FINNIFTY: { key: "NSE_INDEX|Nifty Fin Service", name: "FIN NIFTY" },
  RELIANCE: { key: "NSE_EQ|INE002A01018", name: "RELIANCE" },
  HDFCBANK: { key: "NSE_EQ|INE040A01034", name: "HDFC BANK" },
  TCS: { key: "NSE_EQ|INE467B01029", name: "TCS" },
  INFY: { key: "NSE_EQ|INE009A01021", name: "INFOSYS" },
  ICICIBANK: { key: "NSE_EQ|INE090A01021", name: "ICICI BANK" },
};

function planDateChunks(totalDays: number, maxChunkDays = 26): { to: string; from: string }[] {
  const chunks: { to: string; from: string }[] = [];
  const nowMs = Date.now();
  let currentOffset = 0;

  while (currentOffset < totalDays) {
    const chunkSpan = Math.min(maxChunkDays, totalDays - currentOffset);
    const toDate = new Date(nowMs - currentOffset * 86_400_000).toISOString().slice(0, 10);
    const fromDate = new Date(nowMs - (currentOffset + chunkSpan) * 86_400_000).toISOString().slice(0, 10);
    chunks.push({ to: toDate, from: fromDate });
    currentOffset += chunkSpan + 1;
  }

  return chunks;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const rawSymbol = url.searchParams.get("symbol")?.toUpperCase().trim() || "NIFTY";
  const timeframe = url.searchParams.get("timeframe")?.trim() || "15m";
  const days = Math.min(Math.max(Number(url.searchParams.get("days") || 30), 5), 180);
  const rrTarget1 = Number(url.searchParams.get("rr1") || 1.5);
  const rrTarget2 = Number(url.searchParams.get("rr2") || 2.5);
  const atrBuffer = Number(url.searchParams.get("atrBuffer") || 0.15);

  const matched = INSTRUMENT_MAP[rawSymbol] ?? {
    key: `NSE_EQ|${rawSymbol}`,
    name: rawSymbol,
  };

  let candles: Candle[] = [];
  let dataSource = "NONE";

  // 1. Fetch Real Historical Market Data from Upstox Live API
  try {
    const token = await getAccessToken();
    if (token) {
      const encoded = encodeURIComponent(matched.key);
      const unit = timeframe === "1d" ? "days" : timeframe === "1h" ? "hours" : "minutes";
      const intervalVal = timeframe === "5m" ? "5" : timeframe === "30m" ? "30" : timeframe === "1h" ? "1" : timeframe === "1d" ? "1" : "15";

      const chunks = planDateChunks(days, 26);
      let accumulated: Candle[] = [];

      for (const chunk of chunks) {
        try {
          const endpoint = `/v3/historical-candle/${encoded}/${unit}/${intervalVal}/${chunk.to}/${chunk.from}`;
          const rawData = await get(token, endpoint, {}, { index: matched.name.toLowerCase().includes("bank") ? "banknifty" : "nifty" });
          const parsed = normalizeCandles(rawData);
          if (parsed && parsed.length > 0) {
            accumulated = mergeCandles(accumulated, parsed);
          }
        } catch {
          // Individual chunk error; continue accumulating available chunks
        }
      }

      if (accumulated.length >= 20) {
        candles = accumulated;
        dataSource = "UPSTOX_LIVE_HISTORICAL_API";
      }
    }
  } catch {
    // Upstox live fetch failed
  }

  // 2. Fallback to Local Verified Historical NSE Datasets on Disk (No Synthetic Data)
  if (candles.length < 20) {
    try {
      const historyDir = path.join(dataRoot(), "history");
      if (fs.existsSync(historyDir)) {
        const files = fs.readdirSync(historyDir);
        const searchPattern = matched.key.replace(/[^\w]/g, "_");
        const matchingFiles = files.filter((f) => f.includes(searchPattern));
        let diskCandles: Candle[] = [];
        for (const f of matchingFiles.slice(0, 10)) {
          const content = JSON.parse(fs.readFileSync(path.join(historyDir, f), "utf8"));
          if (content?.candles && Array.isArray(content.candles)) {
            const parsed = normalizeCandles(content);
            diskCandles = mergeCandles(diskCandles, parsed);
          }
        }
        if (diskCandles.length >= 20) {
          candles = diskCandles;
          dataSource = "REAL_NSE_HISTORICAL_CACHE";
        }
      }
    } catch {
      // Disk cache read failed
    }
  }

  // 3. Strict Check: If no real data is available, do NOT fabricate mock data
  if (candles.length < 20) {
    return NextResponse.json(
      {
        ok: false,
        error: `Real market data unavailable for ${matched.name}. Mock data fallback has been permanently removed. Please ensure your Upstox connection is active or select a supported instrument.`,
        symbol: matched.name,
      },
      { status: 404 },
    );
  }

  // Run quantitative strategy validation on pure real historical candles
  const report = validateHistoricalStrategy(candles, {
    symbol: matched.name,
    timeframe,
    rrTarget1,
    rrTarget2,
    atrBuffer,
  });

  const tvSymbol = getTradingViewSymbol(matched.name);
  const tvUrl = getTradingViewChartUrl(tvSymbol, timeframe === "5m" ? "5" : timeframe === "30m" ? "30" : "15");

  return NextResponse.json({
    ok: true,
    symbol: matched.name,
    tvSymbol,
    tvUrl,
    timeframe,
    dataSource,
    candleCount: candles.length,
    candles,
    validation: report,
  });
}
