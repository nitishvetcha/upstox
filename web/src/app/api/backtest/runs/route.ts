import { NextResponse } from "next/server";
import { getAllBacktestRuns } from "@/lib/services/backtestStore";

export async function GET() {
  const runs = getAllBacktestRuns();
  return NextResponse.json({ status: "success", data: runs, mode: "BACKTEST" });
}
