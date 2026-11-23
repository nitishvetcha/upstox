// Phase 4+ — Market Schedule Runner & Telegram Poll API Route.
// GET: Returns current schedule status, next upcoming scan, and active tracked picks.
// POST: Executes an on-demand or cron runner tick.

import { NextResponse } from "next/server";
import { marketScheduleRunner, isScheduledScanTime, SCHEDULE_SLOTS } from "@/lib/services/marketScheduleRunner";
import { telegramBotListener } from "@/lib/services/telegramBotListener";
import { listTrackedPicks } from "@/lib/services/trackedPicksStore";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const now = new Date();
  const scheduleCheck = isScheduledScanTime(now);
  const activePicks = listTrackedPicks(true);

  return NextResponse.json({
    status: "success",
    timestamp: now.toISOString(),
    istTime: now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false }) + " IST",
    schedule: {
      isScheduledNow: scheduleCheck.isScheduled,
      currentSlot: scheduleCheck.label,
      allSlots: SCHEDULE_SLOTS,
    },
    activeTrackedPicksCount: activePicks.length,
    activeTrackedPicks: activePicks,
  });
}

export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const forceScan = url.searchParams.get("force") === "true";

  // 1. Process any pending Telegram button callbacks
  const polledCount = await telegramBotListener.pollOnce();

  // 2. Execute schedule runner tick
  let scanResult: { ranScan: boolean; label?: string } = { ranScan: false };
  if (forceScan) {
    await marketScheduleRunner.executeScan("Manual Triggered Scan");
    scanResult = { ranScan: true, label: "Manual Triggered Scan" };
  } else {
    scanResult = await marketScheduleRunner.tick();
  }

  return NextResponse.json({
    status: "success",
    polledUpdates: polledCount,
    scanExecuted: scanResult.ranScan,
    slotLabel: scanResult.label ?? null,
  });
}
