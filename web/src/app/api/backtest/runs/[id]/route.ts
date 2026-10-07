import { NextResponse } from "next/server";
import { getBacktestRun } from "@/lib/services/backtestStore";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = getBacktestRun(id);

  if (!run) {
    return NextResponse.json({ status: "error", message: `Backtest run ${id} not found` }, { status: 404 });
  }

  return NextResponse.json({ status: "success", data: run, mode: "BACKTEST" });
}
