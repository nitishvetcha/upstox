import { NextResponse } from "next/server";
import { getPaperTradingEngine } from "@/lib/services/paperStore";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const engine = getPaperTradingEngine();
  const trade = engine.getTrade(id);

  if (!trade) {
    return NextResponse.json({ status: "error", message: `Trade ${id} not found` }, { status: 404 });
  }

  const events = engine.getEvents(id);
  return NextResponse.json({ status: "success", data: { trade, events }, mode: "PAPER" });
}
