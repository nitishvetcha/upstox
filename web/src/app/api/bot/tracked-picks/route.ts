// Phase 4+ — Active Tracked Picks Management API Route.
// GET: Returns list of active tracked picks with live risk recommendations.
// POST: Adds an option contract to active tracking.
// DELETE: Removes a pick by ID or symbol.

import { NextResponse } from "next/server";
import {
  listTrackedPicks,
  addTrackedPick,
  removeTrackedPick,
  type TrackedPickInput,
} from "@/lib/services/trackedPicksStore";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const picks = listTrackedPicks(true);
  return NextResponse.json({
    status: "success",
    count: picks.length,
    data: picks,
  });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as TrackedPickInput;
    if (!body.underlying || !body.strike || !body.optionType || !body.entry || !body.stop || !body.target1) {
      return NextResponse.json(
        { status: "error", message: "underlying, strike, optionType, entry, stop, and target1 are required" },
        { status: 400 }
      );
    }

    const created = addTrackedPick(body);
    return NextResponse.json({
      status: "success",
      message: `Option ${created.underlying} ${created.strike} ${created.optionType} is now actively tracked`,
      data: created,
    });
  } catch (err) {
    return NextResponse.json(
      { status: "error", message: (err as Error).message },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { status: "error", message: "id parameter is required" },
      { status: 400 }
    );
  }

  const removed = removeTrackedPick(id);
  return NextResponse.json({
    status: removed ? "success" : "not_found",
    removed,
  });
}
