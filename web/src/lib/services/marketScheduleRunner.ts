// Phase 4+ — Market Timing Schedule & Live Tracked Option Monitor Runner.
// Executes automated scans at:
// - 09:35 IST (Opening Range Initial Formation Scan)
// - 09:45 IST (Opening Range Breakout Confirmation Scan)
// - Every 30 minutes thereafter: 10:15, 10:45, 11:15, 11:45, 12:15, 12:45, 13:15, 13:45, 14:15, 14:45, 15:15
// - Strictly ends at 15:15 IST with final square-off review.

import { runLiveOpportunityCollection } from "./liveOpportunityCollector.ts";
import { getSnapshot } from "./market.ts";
import { evaluateOptionsOpportunity } from "../engine/opportunityEngine.ts";
import { scanStocks } from "../engine/stockOpportunityEngine.ts";
import {
  listTrackedPicks,
  updateTrackedPickQuote,
  archiveIntradayPicks,
  markAdviceAlerted,
  type TrackedPick,
} from "./trackedPicksStore.ts";
import { quoteManager } from "./streamingQuoteManager.ts";
import { sendTelegramMessage } from "./notificationService.ts";

export interface ScheduleSlot {
  hour: number;
  minute: number;
  label: string;
}

export const SCHEDULE_SLOTS: ScheduleSlot[] = [
  { hour: 9, minute: 35, label: "09:35 IST Opening Range Scan" },
  { hour: 9, minute: 45, label: "09:45 IST Opening Range Breakout Scan" },
  { hour: 10, minute: 15, label: "10:15 IST Morning Momentum Scan" },
  { hour: 10, minute: 45, label: "10:45 IST Mid-Morning Scan" },
  { hour: 11, minute: 15, label: "11:15 IST Institutional Trend Scan" },
  { hour: 11, minute: 45, label: "11:45 IST Lunch Break Scan" },
  { hour: 12, minute: 15, label: "12:15 IST European Pre-Open Scan" },
  { hour: 12, minute: 45, label: "12:45 IST Midday Range Scan" },
  { hour: 13, minute: 15, label: "13:15 IST European Open Scan" },
  { hour: 13, minute: 45, label: "13:45 IST Afternoon Expansion Scan" },
  { hour: 14, minute: 15, label: "14:15 IST Institutional Block Window Scan" },
  { hour: 14, minute: 45, label: "14:45 IST Power Hour Momentum Scan" },
  { hour: 15, minute: 15, label: "15:15 IST Final Square-Off & Settlement Scan" },
];

/** Matches current IST time against the scheduled trading window. */
export function isScheduledScanTime(now = new Date()): { isScheduled: boolean; label: string } {
  const istStr = now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false });
  const [hStr, mStr] = istStr.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);

  const istDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const day = istDate.getDay();
  const isWeekday = day >= 1 && day <= 5; // Monday to Friday

  if (!isWeekday) {
    return { isScheduled: false, label: "WEEKEND" };
  }

  for (const slot of SCHEDULE_SLOTS) {
    if (h === slot.hour && Math.abs(m - slot.minute) <= 1) {
      return { isScheduled: true, label: slot.label };
    }
  }

  return { isScheduled: false, label: "OUTSIDE_SCHEDULE" };
}

export class MarketScheduleRunner {
  private lastExecutedSlot: string | null = null;
  private isRunning = false;

  /**
   * Executes a scheduled market scan cycle.
   */
  public async executeScan(label: string, now = new Date()): Promise<{ runCount: number; errors: string[] }> {
    try {
      // 1. Run live opportunity discovery across indices and stocks
      const run = await runLiveOpportunityCollection(
        () => getSnapshot("nifty").then((s) => Promise.resolve(evaluateOptionsOpportunity(s, "NIFTY", now))),
        () => getSnapshot("banknifty").then((s) => Promise.resolve(evaluateOptionsOpportunity(s, "BANKNIFTY", now))),
        () => scanStocks("intraday", now),
        now,
      );

      // 2. Announce scan completion to Telegram group
      const timestamp = now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false }) + " IST";
      const summaryText = [
        `📡 <b>Scheduled Market Scan Complete · ${label}</b>`,
        `<b>Time:</b> ${timestamp}`,
        `• Evaluated: ${run.generated} setups`,
        `• High-Conviction (Grade A/B): ${run.created} signals`,
        run.created === 0 ? `<i>No new qualifying setups in this slot. Capital protected.</i>` : `<i>New qualifying setups posted above with [📌 Save & Track Option] button.</i>`,
      ].join("\n");

      await sendTelegramMessage(summaryText);

      // 3. Broadcast status of any active tracked picks to the group and admin
      const activePicks = listTrackedPicks(true);
      if (activePicks.length > 0) {
        const trackedLines = [
          `📊 <b>Live Tracked Options (${activePicks.length} Active) · ${label}</b>`,
          ``,
        ];
        for (const p of activePicks) {
          const pnlSign = (p.lastPnl ?? 0) >= 0 ? "+" : "";
          trackedLines.push(
            `• <b>${p.underlying} ${p.strike} ${p.optionType}</b> (Entry: ₹${p.entry.toFixed(1)})`,
            `  LTP: ₹${p.lastLtp?.toFixed(1) ?? p.entry.toFixed(1)} | P&L: ${pnlSign}₹${p.lastPnl ?? 0} (${pnlSign}${p.lastPnlPct ?? 0}%)`,
            `  Stop: ₹${p.stop.toFixed(1)} | T1: ₹${p.target1.toFixed(1)}`,
            `  Advice: <i>${p.adviceReason}</i>`,
            ``,
          );
        }
        trackedLines.push(`<i>All tracking automatically closes at 15:15 IST.</i>`);
        await sendTelegramMessage(trackedLines.join("\n"));
      }

      return { runCount: run.created, errors: run.errors };
    } catch (err) {
      return { runCount: 0, errors: [(err as Error).message] };
    }
  }

  /**
   * Evaluates all actively tracked picks and sends live risk guidance updates.
   */
  public async monitorTrackedPicks(now = new Date()): Promise<{ monitoredCount: number }> {
    const active = listTrackedPicks(true);
    if (active.length === 0) return { monitoredCount: 0 };

    // Check if 15:15 IST intraday cutoff
    const istStr = now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false });
    const [hStr, mStr] = istStr.split(":");
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);

    if (h > 15 || (h === 15 && m >= 15)) {
      // 15:15 Square-Off alert
      const archived = archiveIntradayPicks();
      if (archived > 0) {
        await sendTelegramMessage(
          [
            `⏰ <b>15:15 IST INTRADAY CLOSE — SQUARE OFF ALL POSITIONS</b>`,
            ``,
            `The institutional intraday options window is now closed.`,
            `Archived ${archived} active tracked pick(s). Do not carry naked intraday options overnight.`,
          ].join("\n")
        );
      }
      return { monitoredCount: active.length };
    }

    // Monitor each tracked pick using streaming or snapshot quote
    for (const pick of active) {
      let currentPrice = pick.lastLtp ?? pick.entry;

      // Check if quoteManager has a streaming tick for this contract
      const quote = pick.instrumentKey ? quoteManager.getQuote(pick.instrumentKey) : null;
      if (quote && quote.ltp > 0) {
        currentPrice = quote.ltp;
      }

      const updated = updateTrackedPickQuote(pick.id, currentPrice, now);
      if (!updated) continue;

      // If urgent advice triggered (TRAIL_STOP or CUT) and hasn't already been alerted for this pick
      if (
        (updated.riskAdvice === "CUT" || updated.riskAdvice === "TRAIL_STOP") &&
        updated.riskAdvice !== pick.lastAlertedAdvice
      ) {
        markAdviceAlerted(pick.id, updated.riskAdvice);
        const pnlSign = (updated.lastPnl ?? 0) >= 0 ? "+" : "";
        const alertText = [
          `⚠️ <b>ACTION REQUIRED · ${updated.underlying} ${updated.strike} ${updated.optionType}</b>`,
          `<b>Status:</b> ${updated.riskAdvice}`,
          `<b>Current Premium:</b> ₹${updated.lastLtp?.toFixed(1)} | P&L: ${pnlSign}₹${updated.lastPnl}`,
          ``,
          `<b>Guidance:</b> ${updated.adviceReason}`,
        ].join("\n");

        await sendTelegramMessage(
          alertText,
          undefined, // Broadcast to all configured recipients (Admin DM + Group)
          {
            inline_keyboard: [
              [{ text: "❌ Remove from Monitor", callback_data: `untrack:${updated.id}` }],
            ],
          }
        );
      }
    }

    return { monitoredCount: active.length };
  }

  /**
   * Single tick called by background runner or cron job.
   */
  public async tick(now = new Date()): Promise<{ ranScan: boolean; label?: string }> {
    if (this.isRunning) return { ranScan: false };
    this.isRunning = true;

    try {
      // 1. Check scheduled market scans (09:35, 09:45, and every 30 mins)
      const schedule = isScheduledScanTime(now);
      if (schedule.isScheduled && this.lastExecutedSlot !== schedule.label) {
        this.lastExecutedSlot = schedule.label;
        await this.executeScan(schedule.label, now);
        await this.monitorTrackedPicks(now);
        return { ranScan: true, label: schedule.label };
      }

      // 2. Regular monitor check for actively tracked picks
      await this.monitorTrackedPicks(now);
      return { ranScan: false };
    } finally {
      this.isRunning = false;
    }
  }
}

// Global singleton instance
export const marketScheduleRunner = new MarketScheduleRunner();
