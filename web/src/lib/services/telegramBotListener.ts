// Phase 4+ — Interactive Telegram Bot Listener & Callback Handler.
// Processes inline button clicks ([📌 Save & Track Option], [❌ Remove]) and commands (/picks, /status, /clear).
// Runs via lightweight non-blocking poll.

import { getPaperOpportunity } from "./paperOpportunityStore.ts";
import {
  addTrackedPick,
  removeTrackedPick,
  listTrackedPicks,
  type TrackedPick,
} from "./trackedPicksStore.ts";
import { getNotificationConfig, sendTelegramMessage } from "./notificationService.ts";

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

  /** Answers a Telegram callback query with an immediate popup alert. */
  public async answerCallbackQuery(callbackQueryId: string, text: string): Promise<boolean> {
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
          show_alert: false,
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
    const chatId = cb.message?.chat.id ?? cb.from.id;

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
          savedByChatId: cb.from.id,
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
            savedByChatId: cb.from.id,
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
              savedByChatId: cb.from.id,
            });
          }
        }
      }

      await this.answerCallbackQuery(cb.id, "✅ Option added to active tracking!");

      if (createdPick && chatId) {
        const text = [
          `🎯 <b>Option Tracked: ${createdPick.underlying} ${createdPick.strike} ${createdPick.optionType}</b>`,
          `• <b>Entry:</b> ₹${createdPick.entry.toFixed(1)}`,
          `• <b>Stop Loss:</b> ₹${createdPick.stop.toFixed(1)}`,
          `• <b>Target 1:</b> ₹${createdPick.target1.toFixed(1)}`,
          `• <b>Target 2:</b> ₹${createdPick.target2.toFixed(1)}`,
          ``,
          `<i>Live price & risk updates (Hold / Trail / Cut) will post automatically. Tracking ends at 15:15 IST.</i>`,
        ].join("\n");

        await sendTelegramMessage(
          text,
          { telegramChatId: String(chatId) },
          {
            inline_keyboard: [
              [
                { text: "❌ Stop Tracking", callback_data: `untrack:${createdPick.id}` },
                { text: "📊 All Tracked Picks", callback_data: "cmd:picks" },
              ],
            ],
          },
        );
      }
    } else if (data.startsWith("untrack:")) {
      const targetId = data.slice(8);
      removeTrackedPick(targetId);
      await this.answerCallbackQuery(cb.id, "🗑️ Option removed from active tracking.");
      if (chatId) {
        await sendTelegramMessage(
          `🗑️ <b>Option Tracking Removed:</b> <code>${targetId}</code> is no longer being actively monitored.`,
          { telegramChatId: String(chatId) },
        );
      }
    } else if (data === "cmd:picks") {
      await this.answerCallbackQuery(cb.id, "📋 Loading active picks...");
      if (chatId) {
        await this.handlePicksCommand(chatId);
      }
    }
  }

  /** Lists all active tracked picks with live advice. */
  public async handlePicksCommand(chatId: string | number): Promise<void> {
    const active = listTrackedPicks(true);
    if (active.length === 0) {
      await sendTelegramMessage(
        [
          `📋 <b>Active Tracked Options: None</b>`,
          ``,
          `You are not currently tracking any options.`,
          `Click <b>[📌 Save & Track Option]</b> below any signal alert to start tracking.`,
        ].join("\n"),
        { telegramChatId: String(chatId) },
      );
      return;
    }

    const lines = [
      `📋 <b>Active Tracked Options (${active.length}):</b>`,
      ``,
    ];

    for (const p of active) {
      const pnlSign = (p.lastPnl ?? 0) >= 0 ? "+" : "";
      lines.push(
        `• <b>${p.underlying} ${p.strike} ${p.optionType}</b>`,
        `  LTP: ₹${p.lastLtp ?? p.entry} | P&L: ${pnlSign}₹${p.lastPnl ?? 0} (${pnlSign}${p.lastPnlPct ?? 0}%)`,
        `  Stop: ₹${p.stop} | T1: ₹${p.target1}`,
        `  Advice: <i>${p.adviceReason}</i>`,
        ``,
      );
    }

    lines.push(`<i>All intraday option tracking automatically closes at 15:15 IST.</i>`);

    await sendTelegramMessage(lines.join("\n"), { telegramChatId: String(chatId) });
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

      if (command === "/picks" || command === "/status") {
        await this.handlePicksCommand(chatId);
      } else if (command === "/start" || command === "/help") {
        await sendTelegramMessage(
          [
            `🤖 <b>Upstox Options Terminal Bot</b>`,
            ``,
            `<b>Available Commands:</b>`,
            `• <code>/picks</code> or <code>/status</code> — View all active tracked option contracts with live P&L and risk advice.`,
            `• <code>/clear</code> — Remove all active tracked contracts.`,
            `• <code>/help</code> — Show this help message.`,
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
        const active = listTrackedPicks(true);
        for (const p of active) {
          removeTrackedPick(p.id);
        }
        await sendTelegramMessage(
          `🗑️ <b>Cleared:</b> Removed ${active.length} active tracked contract(s).`,
          { telegramChatId: String(chatId) },
        );
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
