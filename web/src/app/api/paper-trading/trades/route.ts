import { requireOperator } from "../../../../lib/operatorSession.ts";
import { NextResponse } from "next/server";
import { getPaperTradingEngine } from "@/lib/services/paperStore";

export async function GET(req: Request) {
  const refused = requireOperator(req);
  if (refused) return refused;
  const engine = getPaperTradingEngine();
  const trades = engine.getTrades();
  return NextResponse.json({ status: "success", data: trades, mode: "PAPER" });
}
