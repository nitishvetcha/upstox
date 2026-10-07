import { NextResponse } from "next/server";
import { getPaperTradingEngine } from "@/lib/services/paperStore";

export async function GET() {
  const engine = getPaperTradingEngine();
  const trades = engine.getTrades();
  return NextResponse.json({ status: "success", data: trades, mode: "PAPER" });
}
