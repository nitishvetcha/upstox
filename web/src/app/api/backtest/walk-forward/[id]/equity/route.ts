import { NextResponse } from "next/server";
import { getWalkForwardRun } from "@/lib/services/walkForwardStore";
import { realizedEquity } from "@/lib/services/performance/metrics";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = getWalkForwardRun(id);
  if (!run) {
    return NextResponse.json({ status: "error", message: "Walk-forward run not found" }, { status: 404 });
  }
  const equity = realizedEquity(run.oosTrades, run.wfConfig.initialCapital, run.config.startDate);
  return NextResponse.json({ status: "success", data: equity });
}
