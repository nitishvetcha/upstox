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
import { sendTelegramMessage, notifyOpportunitySignal } from "./notificationService.ts";
import { sessionWindow, istToday, commoditySessionWindow, commodityMarketStatus } from "../time.ts";
import { COMMODITY_IDS, COMMODITIES, isCommodityId } from "./instrumentRegistry.ts";

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

export const COMMODITY_SCHEDULE_SLOTS: ScheduleSlot[] = [
  { hour: 17, minute: 15, label: "17:15 IST Commodity Evening Opening Scan" },
  { hour: 17, minute: 45, label: "17:45 IST Commodity Breakout Confirmation Scan" },
  { hour: 18, minute: 15, label: "18:15 IST European Overlap Scan" },
  { hour: 18, minute: 45, label: "18:45 IST US Pre-Market Momentum Scan" },
  { hour: 19, minute: 15, label: "19:15 IST US NYMEX Opening Range Scan" },
  { hour: 19, minute: 45, label: "19:45 IST US Energy Morning Expansion Scan" },
  { hour: 20, minute: 15, label: "20:15 IST US Peak Momentum Scan" },
  { hour: 20, minute: 45, label: "20:45 IST EIA Energy Trend Scan" },
  { hour: 21, minute: 15, label: "21:15 IST US Midday Volatility Scan" },
  { hour: 21, minute: 45, label: "21:45 IST Power Hour Continuation Scan" },
  { hour: 22, minute: 15, label: "22:15 IST Institutional Block Window Scan" },
  { hour: 22, minute: 45, label: "22:45 IST Late Session Momentum Scan" },
  { hour: 23, minute: 15, label: "23:15 IST Final Commodity Square-Off & Settlement Scan" },
];

/** Matches current IST time against the scheduled commodity trading window. */
export function isScheduledCommodityScanTime(now = new Date()): { isScheduled: boolean; label: string } {
  const istDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const day = istDate.getDay();
  const isWeekend = day === 0 || day === 6;

  const ymd = istToday(now);
  const win = commoditySessionWindow(ymd);

  if (!win) {
    return { isScheduled: false, label: isWeekend ? "WEEKEND" : "MARKET_CLOSED" };
  }

  const istStr = now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false });
  const [hStr, mStr] = istStr.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const currentMinutes = h * 60 + m;

  if (currentMinutes < win.open || currentMinutes >= win.close) {
    return { isScheduled: false, label: "OUTSIDE_SCHEDULE" };
  }

  for (const slot of COMMODITY_SCHEDULE_SLOTS) {
    if (h === slot.hour && Math.abs(m - slot.minute) <= 1) {
      return { isScheduled: true, label: slot.label };
    }
  }

  return { isScheduled: false, label: "OUTSIDE_SCHEDULE" };
}

/** Matches current IST time against the scheduled trading window (Equity + Commodities). */
export function isScheduledScanTime(now = new Date()): { isScheduled: boolean; label: string } {
  const istDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const day = istDate.getDay();
  const isWeekend = day === 0 || day === 6;

  const ymd = istToday(now);
  const win = sessionWindow(ymd);

  if (!win) {
    // If equity is closed, check if MCX commodity evening session is active
    const commCheck = isScheduledCommodityScanTime(now);
    if (commCheck.isScheduled) {
      return commCheck;
    }
    return { isScheduled: false, label: isWeekend ? "WEEKEND" : "MARKET_CLOSED" };
  }

  const istStr = now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false });
  const [hStr, mStr] = istStr.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const currentMinutes = h * 60 + m;

  // Outside active session window
  if (currentMinutes < win.open || currentMinutes >= win.close) {
    // Check if commodity evening session is active
    const commCheck = isScheduledCommodityScanTime(now);
    if (commCheck.isScheduled) {
      return commCheck;
    }
    return { isScheduled: false, label: "OUTSIDE_SCHEDULE" };
  }

  // Regular standard daytime session (09:15 - 15:30 IST)
  if (win.open === 9 * 60 + 15 && win.close === 15 * 60 + 30) {
    for (const slot of SCHEDULE_SLOTS) {
      if (h === slot.hour && Math.abs(m - slot.minute) <= 1) {
        return { isScheduled: true, label: slot.label };
      }
    }
    return { isScheduled: false, label: "OUTSIDE_SCHEDULE" };
  }

  // Special/Non-standard Session: dynamically generate slots relative to session window
  const fmt = (min: number) => {
    const hh = String(Math.floor(min / 60)).padStart(2, "0");
    const mm = String(min % 60).padStart(2, "0");
    return `${hh}:${mm} IST`;
  };

  const specialSlots: { minutes: number; label: string }[] = [];
  const duration = win.close - win.open;

  if (duration >= 30) {
    specialSlots.push({ minutes: win.open + 10, label: `${fmt(win.open + 10)} Special Session Initial Scan` });
    for (let slotMin = win.open + 30; slotMin < win.close - 15; slotMin += 30) {
      specialSlots.push({ minutes: slotMin, label: `${fmt(slotMin)} Special Session Active Scan` });
    }
    specialSlots.push({ minutes: win.close - 15, label: `${fmt(win.close - 15)} Final Square-Off & Settlement Scan` });
  }

  for (const slot of specialSlots) {
    if (Math.abs(currentMinutes - slot.minutes) <= 1) {
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
  public async executeScan(label: string, now = new Date(), forceOpen = false): Promise<{ runCount: number; errors: string[] }> {
    try {
      let totalGenerated = 0;
      let totalCreated = 0;
      const errors: string[] = [];

      // 1. Run live opportunity discovery across equity indices and stocks
      try {
        const run = await runLiveOpportunityCollection(
          () => getSnapshot("nifty", undefined, now).then((s) => Promise.resolve(evaluateOptionsOpportunity(s, "NIFTY", now))),
          () => getSnapshot("banknifty", undefined, now).then((s) => Promise.resolve(evaluateOptionsOpportunity(s, "BANKNIFTY", now))),
          () => scanStocks("intraday", now),
          now,
          { forceMarketOpen: forceOpen },
        );
        totalGenerated += run.generated;
        totalCreated += run.created;
        errors.push(...run.errors);
      } catch (e) {
        errors.push((e as Error).message);
      }

      // 2. Run live opportunity discovery for MCX Commodities (Crude Oil & Natural Gas)
      const isCommOpen = commodityMarketStatus(now) === "OPEN" || forceOpen;
      if (isCommOpen) {
        for (const commId of COMMODITY_IDS) {
          try {
            const snap = await getSnapshot(commId, undefined, now);
            const opp = evaluateOptionsOpportunity(snap, COMMODITIES[commId].symbol, now);
            totalGenerated += opp.topOpportunities.length;
            for (const top of opp.topOpportunities) {
              if (top.grade === "A" || top.grade === "B") {
                totalCreated++;
                await notifyOpportunitySignal(top, { underlying: COMMODITIES[commId].symbol, lotSize: COMMODITIES[commId].lotSize });
              }
            }
          } catch (err) {
            errors.push(`${commId}: ${(err as Error).message}`);
          }
        }
      }

      // 3. Announce scan completion to Telegram group
      const timestamp = now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false }) + " IST";
      const summaryText = [
        `📡 <b>Scheduled Market Scan Complete · ${label}</b>`,
        `<b>Time:</b> ${timestamp}`,
        `• Evaluated: ${totalGenerated} setups`,
        `• High-Conviction (Grade A/B): ${totalCreated} signals`,
        totalCreated === 0 ? `<i>No new qualifying setups in this slot. Capital protected.</i>` : `<i>New qualifying setups posted above with [📌 Save & Track Option] button.</i>`,
      ].join("\n");

      await sendTelegramMessage(summaryText);

      // 4. Broadcast status of any active tracked picks to the group and admin
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
        trackedLines.push(`<i>All tracking automatically closes at session cutoff.</i>`);
        await sendTelegramMessage(trackedLines.join("\n"));
      }

      return { runCount: totalCreated, errors };
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

    // Check if session intraday cutoff (15 minutes prior to close)
    const istStr = now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false });
    const [hStr, mStr] = istStr.split(":");
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    const currentMinutes = h * 60 + m;

    const ymd = istToday(now);
    const win = sessionWindow(ymd);
    const commWin = commoditySessionWindow(ymd);

    const hasOnlyCommodities = active.every((p) =>
      p.underlying.toUpperCase().includes("CRUDE") || p.underlying.toUpperCase().includes("NATURAL")
    );

    // If tracking only commodities, cutoff is MCX close - 15m (23:15 IST)
    const cutoffMinutes = hasOnlyCommodities
      ? (commWin ? commWin.close - 15 : 23 * 60 + 15)
      : (win ? win.close - 15 : 15 * 60 + 15);

    if (currentMinutes >= cutoffMinutes) {
      // Intraday Square-Off alert
      const archived = archiveIntradayPicks();
      if (archived > 0) {
        const hh = String(Math.floor(cutoffMinutes / 60)).padStart(2, "0");
        const mm = String(cutoffMinutes % 60).padStart(2, "0");
        const cutoffLabel = `${hh}:${mm} IST`;
        await sendTelegramMessage(
          [
            `⏰ <b>${cutoffLabel} INTRADAY CLOSE — SQUARE OFF ALL POSITIONS</b>`,
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
      } else {
        // Fallback: check index snapshot chain for latest option LTP
        try {
          const candidate = pick.underlying.toLowerCase().replace(/\s+/g, "");
          // Commodity picks must query their own chain.  Falling back to NIFTY
          // could silently update a CRUDEOIL/NATURALGAS position with an
          // unrelated premium.
          const idx = isCommodityId(candidate)
            ? candidate
            : pick.underlying.toLowerCase().includes("bank") ? "banknifty" : "nifty";
          const snap = await getSnapshot(idx as import("../types.ts").IndexId, undefined, now);
          const row = snap.chain?.find((r) => r.strike === pick.strike);
          if (row) {
            const sideQuote = pick.optionType === "CE" ? row.call : row.put;
            if (sideQuote && sideQuote.ltp > 0) {
              currentPrice = sideQuote.ltp;
            }
            if (sideQuote && sideQuote.instrumentKey && !pick.instrumentKey) {
              pick.instrumentKey = sideQuote.instrumentKey;
            }
          }
        } catch {}
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

        // Route the risk alert directly to the user who saved this contract (keeps groups clean)
        const userTargetConfig = pick.savedByChatId ? { telegramChatId: String(pick.savedByChatId) } : undefined;

        await sendTelegramMessage(
          alertText,
          userTargetConfig,
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
