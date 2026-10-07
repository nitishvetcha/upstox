import { NextResponse } from "next/server";
import { getPaperTradingEngine } from "@/lib/services/paperStore";
import { getSnapshot } from "@/lib/services/market";
import type { IndexId } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { tradeId, index } = body;
    if (!tradeId) {
      return NextResponse.json({ status: "error", message: "tradeId is required" }, { status: 400 });
    }

    const engine = getPaperTradingEngine();
    const trade = engine.getTrade(tradeId);
    if (!trade) {
      return NextResponse.json({ status: "error", message: `Trade ${tradeId} not found` }, { status: 404 });
    }

    const idx: IndexId = index ?? trade.index;
    const snapshot = await getSnapshot(idx);
    const closed = engine.closeTrade(trade, "CLOSED", snapshot);

    return NextResponse.json({
      status: "success",
      data: closed,
      mode: "PAPER",
    });
  } catch (err) {
    return NextResponse.json({ status: "error", message: (err as Error).message }, { status: 400 });
  }
}
