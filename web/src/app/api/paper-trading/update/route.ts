import { NextResponse } from "next/server";
import { getPaperTradingEngine } from "@/lib/services/paperStore";
import { getSnapshot } from "@/lib/services/market";
import type { IndexId } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const index: IndexId = body.index === "banknifty" ? "banknifty" : "nifty";

    const snapshot = await getSnapshot(index);
    const engine = getPaperTradingEngine();
    const updated = engine.evaluateOpenTrades(snapshot);

    return NextResponse.json({
      status: "success",
      data: updated,
      count: updated.length,
      mode: "PAPER",
    });
  } catch (err) {
    return NextResponse.json({ status: "error", message: (err as Error).message }, { status: 400 });
  }
}
