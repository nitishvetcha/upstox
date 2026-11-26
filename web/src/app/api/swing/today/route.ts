export const dynamic = "force-dynamic";

import { loadTodaySwingScan } from "../../../../lib/stockV2/swingLiveScanner.ts";

export async function GET(): Promise<Response> {
  const data = loadTodaySwingScan();
  if (!data) {
    return Response.json({
      status: "NO_SETUP",
      scannedAt: null,
      signalDate: null,
      universeCount: 0,
      qualifiedCount: 0,
      pick: null,
      reason: "No EOD swing scan has run yet today.",
    });
  }
  return Response.json(data);
}
