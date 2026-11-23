import { requireOperator } from "../../../../lib/operatorSession.ts";
import { NextResponse } from "next/server";
import { getPaperTradingEngine } from "@/lib/services/paperStore";
import { circuitBreaker } from "@/lib/services/portfolioCircuitBreaker";
import { getSnapshot } from "@/lib/services/market";
import { analyze } from "@/lib/engine/strategy";
import { updateJournalEntry } from "@/lib/services/recommendationStore";
import type { IndexId } from "@/lib/types";

export async function POST(request: Request) {
  const refused = requireOperator(request);
  if (refused) return refused;
  try {
    const body = await request.json().catch(() => ({}));
    const index: IndexId = body.index === "banknifty" ? "banknifty" : "nifty";
    const recommendationId: string | undefined = body.recommendationId;

    // Portfolio Circuit Breakers & Heat Stops Gate
    const cb = circuitBreaker.canOpenTrade();
    if (!cb.allowed) {
      return NextResponse.json({
        status: "rejected",
        data: null,
        reason: cb.reason,
        code: cb.code,
        mode: "PAPER",
      });
    }

    const snapshot = await getSnapshot(index);
    const analysis = analyze(snapshot);

    const engine = getPaperTradingEngine();
    const result = engine.processRecommendation(analysis);

    // Link paper trade to the originating recommendation if provided
    if (result.created && result.trade && recommendationId) {
      updateJournalEntry(recommendationId, { paperTradeId: result.trade.id });
    }

    return NextResponse.json({
      status: result.created ? "success" : "rejected",
      data: result.trade,
      reason: result.reason,
      mode: "PAPER",
    });
  } catch (err) {
    return NextResponse.json({ status: "error", message: (err as Error).message }, { status: 400 });
  }
}
