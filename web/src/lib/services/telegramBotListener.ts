// Phase 4+ — Interactive Telegram Bot Listener & Callback Handler.
// Processes inline button clicks ([📌 Save & Track Option], [❌ Remove]) and commands (/picks, /status, /clear).
// Runs via lightweight non-blocking poll.

import { getPaperOpportunity } from "./paperOpportunityStore.ts";
import {
  addTrackedPick,
  removeTrackedPick,
  clearAllTrackedPicks,
  listTrackedPicks,
  type TrackedPick,
} from "./trackedPicksStore.ts";
import { getNotificationConfig, sendTelegramMessage } from "./notificationService.ts";
import { getTradingViewChartUrl } from "../tradingView.ts";

export interface TelegramCallbackQuery {
  id: string;
  from: { id: number; first_name?: string };
  message?: { message_id: number; chat: { id: number | string } };
  data?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: { id: number; first_name?: string };
  chat: { id: number | string };
  text?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export class TelegramBotListener {
  private lastUpdateId = 0;
  private isPolling = false;
  private pollTimer: NodeJS.Timeout | null = null;

  /** Answers a Telegram callback query with an immediate popup alert or toast. */
  public async answerCallbackQuery(callbackQueryId: string, text: string, showAlert = false): Promise<boolean> {
    const cfg = getNotificationConfig();
    const token = cfg.telegramBotToken;
    if (!token) return false;

    try {
      const url = `https://api.telegram.org/bot${token}/answerCallbackQuery`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callback_query_id: callbackQueryId,
          text,
          show_alert: showAlert,
        }),
        signal: AbortSignal.timeout(4000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Handles incoming interactive callback button clicks. */
  public async handleCallbackQuery(cb: TelegramCallbackQuery): Promise<void> {
    const data = cb.data;
    if (!data) return;
    const userId = cb.from.id;
    const isGroup = cb.message?.chat.id ? Number(cb.message.chat.id) < 0 : false;

    if (data.startsWith("track:")) {
      const payload = data.slice(6);
      let createdPick: TrackedPick | null = null;

      // 1. Check self-contained colon-delimited format: UNDERLYING:STRIKE:OPTTYPE:ENTRY:STOP:T1:T2
      const colonParts = payload.split(":");
      if (colonParts.length >= 7) {
        const underlying = colonParts[0].toUpperCase();
        const strike = Number(colonParts[1]) || 0;
        const optType = (colonParts[2].toUpperCase() as "CE" | "PE") || "CE";
        const entry = Number(colonParts[3]) || 100;
        const stop = Number(colonParts[4]) || 80;
        const target1 = Number(colonParts[5]) || 130;
        const target2 = Number(colonParts[6]) || 160;

        createdPick = addTrackedPick({
          underlying,
          strike,
          optionType: optType,
          entry,
          stop,
          target1,
          target2,
          lotSize: underlying.includes("BANK") ? 30 : 65,
          savedByChatId: userId,
        });
      } else {
        // 2. Try resolving from paper opportunity store
        const opp = getPaperOpportunity(payload);
        if (opp) {
          createdPick = addTrackedPick({
            underlying: opp.underlying,
            strike: opp.strike ?? 0,
            optionType: (opp.optionType as "CE" | "PE") || "CE",
            strategyType: opp.strategyType,
            entry: opp.entry,
            stop: opp.stop,
            target1: opp.target1,
            target2: opp.target2,
            lotSize: opp.underlying.includes("BANK") ? 30 : 65,
            instrumentKey: opp.instrumentKey,
            savedByChatId: userId,
          });
        } else {
          // 3. Fallback: parse format like "NIFTY_24200_CE" or "NIFTY_24200_CE_145_115_195"
          const parts = payload.split("_");
          if (parts.length >= 3) {
            const underlying = parts[0].toUpperCase();
            const strike = Number(parts[1]) || 24000;
            const optType = (parts[2].toUpperCase() as "CE" | "PE") || "CE";
            const entry = parts[3] ? Number(parts[3]) || 100 : 100;
            const stop = parts[4] ? Number(parts[4]) || 80 : 80;
            const target1 = parts[5] ? Number(parts[5]) || 130 : 130;
            const target2 = parts[6] ? Number(parts[6]) || 160 : 160;
            createdPick = addTrackedPick({
              underlying,
              strike,
              optionType: optType,
              entry,
              stop,
              target1,
              target2,
              lotSize: underlying.includes("BANK") ? 30 : 65,
              savedByChatId: userId,
            });
          }
        }
      }

      if (createdPick && userId) {
        const tvUrl = getTradingViewChartUrl(createdPick.underlying, "15");
        const text = [
          `🎯 <b>Option Tracked: ${createdPick.underlying} ${createdPick.strike} ${createdPick.optionType}</b>`,
          `• <b>Entry:</b> ₹${createdPick.entry.toFixed(1)}`,
          `• <b>Stop Loss:</b> ₹${createdPick.stop.toFixed(1)}`,
          `• <b>Target 1:</b> ₹${createdPick.target1.toFixed(1)}`,
          `• <b>Target 2:</b> ₹${createdPick.target2.toFixed(1)}`,
          `• <b>Chart:</b> <a href="${tvUrl}">TradingView Live ${createdPick.underlying}</a>`,
          ``,
          `<i>Live price & risk updates (Hold / Trail / Cut) will post directly here in your private chat. Tracking ends at 15:15 IST.</i>`,
        ].join("\n");

        // Send confirmation and card DIRECTLY to the clicking user in private DM (never in the group)
        const sendResult = await sendTelegramMessage(
          text,
          { telegramChatId: String(userId) },
          {
            inline_keyboard: [
              [
                { text: "❌ Stop Tracking", callback_data: `untrack:${createdPick.id}` },
                { text: "📈 TradingView Chart", url: tvUrl },
              ],
              [
                { text: "📊 My Tracked Picks", callback_data: "cmd:picks" },
              ],
            ],
          },
        );

        if (sendResult.success) {
          const toastMsg = isGroup
            ? "✅ Saved! Details sent to your private chat with @Upstox_analyzer_bot."
            : "✅ Option added to active tracking!";
          await this.answerCallbackQuery(cb.id, toastMsg, false);
        } else {
          // If Telegram rejected DM because user hasn't clicked /start on bot yet, show modal alert
          await this.answerCallbackQuery(
            cb.id,
            "⚠️ Please open @Upstox_analyzer_bot in Telegram and click START first so the bot can send you private tracking alerts!",
            true, // modal alert dialog
          );
        }
      } else {
        await this.answerCallbackQuery(cb.id, "⚠️ Could not parse option setup to track.", true);
      }
    } else if (data.startsWith("untrack:")) {
      const targetId = data.slice(8);
      removeTrackedPick(targetId, userId);
      await this.answerCallbackQuery(cb.id, "🗑️ Option removed from your tracked list.", false);
      if (userId) {
        await sendTelegramMessage(
          `🗑️ <b>Option Tracking Removed:</b> <code>${targetId}</code> is no longer being actively monitored.`,
          { telegramChatId: String(userId) },
        );
      }
    } else if (data === "cmd:picks") {
      await this.answerCallbackQuery(cb.id, "📋 Loading your tracked options...", false);
      if (userId) {
        await this.handlePicksCommand(userId, userId);
      }
    }
  }

  /** Lists active tracked picks with live advice (filtered by user if requested in private DM). */
  public async handlePicksCommand(targetChatId: string | number, requestingUserId?: string | number): Promise<void> {
    const isPrivate = Number(targetChatId) > 0;
    // In private user chat, filter strictly to that user's saved picks
    const active = isPrivate && requestingUserId
      ? listTrackedPicks(true, requestingUserId)
      : listTrackedPicks(true);

    if (active.length === 0) {
      const emptyMsg = isPrivate
        ? [
            `📋 <b>Your Active Tracked Options: None</b>`,
            ``,
            `You are not currently tracking any options.`,
            `Click <b>[📌 Save & Track Option]</b> below any signal in the group to track it here.`,
          ].join("\n")
        : [
            `📋 <b>Active Tracked Options: None</b>`,
            ``,
            `No options are currently being tracked.`,
            `Click <b>[📌 Save & Track Option]</b> below any alert to track options.`,
          ].join("\n");

      await sendTelegramMessage(emptyMsg, { telegramChatId: String(targetChatId) });
      return;
    }

    const title = isPrivate
      ? `📋 <b>Your Active Tracked Options (${active.length}):</b>`
      : `📋 <b>Active Tracked Options (${active.length}):</b>`;

    const lines = [title, ``];

    for (const p of active) {
      const pnlSign = (p.lastPnl ?? 0) >= 0 ? "+" : "";
      const tvUrl = getTradingViewChartUrl(p.underlying, "15");
      lines.push(
        `• <b>${p.underlying} ${p.strike} ${p.optionType}</b> (<a href="${tvUrl}">📈 TV Chart</a>)`,
        `  LTP: ₹${p.lastLtp ?? p.entry} | P&L: ${pnlSign}₹${p.lastPnl ?? 0} (${pnlSign}${p.lastPnlPct ?? 0}%)`,
        `  Stop: ₹${p.stop} | T1: ₹${p.target1}`,
        `  Advice: <i>${p.adviceReason}</i>`,
        ``,
      );
    }

    lines.push(`<i>All intraday option tracking automatically closes at 15:15 IST.</i>`);

    await sendTelegramMessage(lines.join("\n"), { telegramChatId: String(targetChatId) });
  }

  /** Processes a single Telegram incoming update. */
  public async processUpdate(update: TelegramUpdate): Promise<void> {
    if (update.update_id >= this.lastUpdateId) {
      this.lastUpdateId = update.update_id + 1;
    }

    if (update.callback_query) {
      await this.handleCallbackQuery(update.callback_query);
      return;
    }

    if (update.message?.text) {
      const rawText = update.message.text.trim();
      // In Telegram groups, commands may arrive as /command@BotUsername (e.g. /status@Upstox_analyzer_bot)
      const command = rawText.split("@")[0].toLowerCase().trim();
      const chatId = update.message.chat.id;
      const fromUserId = update.message.from?.id ?? chatId;

      if (command === "/picks" || command === "/status") {
        await this.handlePicksCommand(chatId, fromUserId);
      } else if (command === "/start" || command === "/help") {
        await sendTelegramMessage(
          [
            `🤖 <b>Upstox Options Terminal Bot</b>`,
            ``,
            `<b>Available Commands:</b>`,
            `• <code>/picks</code> or <code>/status</code> — View your active tracked option contracts with live P&L and risk guidance.`,
            `• <code>/clear</code> — Remove your active tracked contracts.`,
            `• <code>/help</code> — Show this help message.`,
            ``,
            `<b>How Tracking Works:</b>`,
            `When you click <b>[📌 Save & Track Option]</b> on any alert in the group, the option will be privately tracked here in your DM with real-time risk updates (Hold / Trail / Cut)!`,
            ``,
            `<b>Notification Schedule (Mon–Fri):</b>`,
            `• <b>09:35 IST:</b> Opening Range Initial Momentum Scan`,
            `• <b>09:45 IST:</b> Opening Range Breakout Confirmation`,
            `• <b>Every 30 Mins:</b> 10:15, 10:45, 11:15, 11:45, 12:15, 12:45, 13:15, 13:45, 14:15, 14:45, 15:15`,
            `• <b>15:15 IST:</b> Intraday Square-Off Review & Session Archive`,
          ].join("\n"),
          { telegramChatId: String(chatId) },
        );
      } else if (command === "/clear") {
        const isPrivate = Number(chatId) > 0;
        const clearedCount = isPrivate
          ? clearAllTrackedPicks(fromUserId)
          : clearAllTrackedPicks();
        const clearMsg = isPrivate
          ? `🗑️ <b>Cleared:</b> Removed ${clearedCount} of your active tracked contract(s).`
          : `🗑️ <b>Cleared:</b> Removed ${clearedCount} active tracked contract(s).`;
        await sendTelegramMessage(clearMsg, { telegramChatId: String(chatId) });
      }
    }
  }

  /** Performs one polling fetch against Telegram Bot API. */
  public async pollOnce(): Promise<number> {
    const cfg = getNotificationConfig();
    const token = cfg.telegramBotToken;
    if (!token) return 0;

    try {
      const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${this.lastUpdateId}&timeout=1`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return 0;

      const data = (await res.json()) as { ok: boolean; result?: TelegramUpdate[] };
      if (!data.ok || !data.result) return 0;

      for (const update of data.result) {
        await this.processUpdate(update);
      }
      return data.result.length;
    } catch {
      return 0;
    }
  }
}

// Global singleton instance
export const telegramBotListener = new TelegramBotListener();
