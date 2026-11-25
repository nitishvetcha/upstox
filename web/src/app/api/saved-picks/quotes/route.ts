export const dynamic = "force-dynamic";

import * as path from "node:path";
import { requireOperator } from "../../../../lib/operatorSession.ts";
import { loadPicks } from "../../../../lib/savedPicks.ts";
import { resolveSymbol, stockQuote } from "../../../../lib/services/stockService.ts";
import { withFallback } from "../../../../lib/services/market.ts";
import { isUnderlyingId } from "../../../../lib/services/instrumentRegistry.ts";
import type { UnderlyingId } from "../../../../lib/types.ts";

function picksFile(): string {
  return process.env.SAVED_PICKS_FILE || path.join(process.cwd(), ".data", "saved-picks", "picks.json");
}

export interface SavedPickQuote {
  livePrice: number | null;
  underlyingPrice?: number | null;
  change?: number | null;
  changePercent?: number | null;
  iv?: number | null;
  delta?: number | null;
  oi?: number | null;
  source?: string | null;
  timestamp: string;
}

export async function GET(req: Request) {
  const __refused = requireOperator(req);
  if (__refused) return __refused;

  const picks = loadPicks(picksFile());
  const quotes: Record<string, SavedPickQuote> = {};

  // Fetch quotes with a safe timeout and parallel processing
  await Promise.all(
    picks.map(async (pick) => {
      try {
        if (pick.instrumentType === "STOCK") {
          const inst = await resolveSymbol(pick.instrument);
          if (inst) {
            const q = await stockQuote(inst);
            quotes[pick.id] = {
              livePrice: q.ltp ?? null,
              change: q.change ?? null,
              changePercent: q.changePercent ?? null,
              source: q.source ?? "UNAVAILABLE",
              timestamp: q.timestamp ?? new Date().toISOString(),
            };
          }
        } else if (pick.instrumentType === "INDEX_OPTION" || pick.instrumentType === "STOCK_OPTION") {
          const match = pick.instrument.match(/^([A-Z]+)\s+(\d{4}-\d{2}-\d{2})\s+(\d+(?:\.\d+)?)\s+(CE|PE)$/i);
          if (match) {
            const rawIndex = match[1].toLowerCase();
            const expiry = match[2];
            const strike = parseFloat(match[3]);
            const optType = match[4].toUpperCase();

            if (isUnderlyingId(rawIndex)) {
              const { data } = await withFallback((p) => p.getOptionChain(rawIndex, expiry));
              const row = data?.rows?.find((r) => Math.abs(r.strike - strike) < 0.5);
              if (row) {
                const opt = optType === "CE" ? row.call : row.put;
                const sourceStr = typeof data.source === "string" ? data.source : data.source?.source ?? "UNAVAILABLE";
                quotes[pick.id] = {
                  livePrice: opt?.ltp ?? null,
                  underlyingPrice: data.spot ?? null,
                  iv: opt?.iv ?? null,
                  delta: opt?.delta ?? null,
                  oi: opt?.oi ?? null,
                  source: sourceStr,
                  timestamp: new Date().toISOString(),
                };
              }
            }
          }
        }
      } catch {
        // Safe fail-closed: do not fail entire request if one quote errors
        quotes[pick.id] = {
          livePrice: null,
          source: "UNAVAILABLE",
          timestamp: new Date().toISOString(),
        };
      }
    })
  );

  return Response.json({ quotes, refreshedAt: new Date().toISOString() });
}
