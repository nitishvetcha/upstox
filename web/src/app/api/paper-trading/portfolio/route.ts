import { NextResponse } from "next/server";
import { getPaperTradingEngine } from "@/lib/services/paperStore";

export async function GET() {
  const engine = getPaperTradingEngine();
  const summary = engine.getPortfolioSummary();
  return NextResponse.json({ status: "success", data: summary, mode: "PAPER" });
}
