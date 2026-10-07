import { NextResponse } from "next/server";
import { getWalkForwardRun } from "@/lib/services/walkForwardStore";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = getWalkForwardRun(id);
  if (!run) {
    return NextResponse.json({ status: "error", message: "Walk-forward run not found" }, { status: 404 });
  }
  return NextResponse.json({ status: "success", data: run.oosTrades });
}
