// Real-Time Notification Service — Telegram & Discord Bot Dispatcher.
// Provides instantaneous alerts for high-conviction signals (Grade A / A+)
// and lifecycle milestones (Target Hit, Stop Hit, Trailing Stop).
// Fail-safe, non-blocking, and deduplicated.

import type { PaperOpportunity } from "./paperOpportunityStore.ts";
import type { ContractOpportunity, OpportunityGrade } from "../engine/opportunityEngine.ts";
import { getTradingViewChartUrl } from "../tradingView.ts";

export interface NotificationConfig {
  enabled: boolean;
  minGrade: "A+" | "A" | "B";
  allowedUnderlyings: string[];
  telegramBotToken?: string;
  telegramChatId?: string;
  discordWebhookUrl?: string;
}

export interface DispatchResult {
  alerted: boolean;
  telegram: boolean;
  discord: boolean;
  reason?: string;
  error?: string;
}

// In-memory alert deduplication cache: key -> timestamp (epoch ms)
const alertCache = new Map<string, number>();
const DEDUPLICATION_WINDOW_MS = 30 * 60 * 1000; // 30 minutes throttle for identical setups

export function clearAlertCache(): void {
  alertCache.clear();
}

/** Reads notification settings from environment variables. */
export function getNotificationConfig(): NotificationConfig {
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN?.trim() || undefined;
  const telegramChatId = process.env.TELEGRAM_CHAT_ID?.trim() || undefined;
  const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL?.trim() || undefined;

  const hasCredentials = Boolean((telegramBotToken && telegramChatId) || discordWebhookUrl);
  const envEnabled = process.env.NOTIFICATION_ENABLED?.toLowerCase();
  const enabled = envEnabled !== undefined ? envEnabled === "true" || envEnabled === "1" : hasCredentials;

  const rawMinGrade = (process.env.NOTIFICATION_MIN_GRADE?.trim().toUpperCase() || "A") as "A+" | "A" | "B";
  const minGrade = rawMinGrade === "A+" || rawMinGrade === "A" || rawMinGrade === "B" ? rawMinGrade : "A";

  const rawAllowed = process.env.NOTIFICATION_ALLOWED_UNDERLYINGS?.trim();
  const allowedUnderlyings =
    rawAllowed !== undefined && rawAllowed !== ""
      ? rawAllowed
          .split(",")
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean)
      : ["NIFTY"];

  return {
    enabled,
    minGrade,
    allowedUnderlyings,
    telegramBotToken,
    telegramChatId,
    discordWebhookUrl,
  };
}

/** Determines if an underlying asset is allowed to fire execution alerts. */
export function isUnderlyingAllowed(underlying: string, allowed: string[]): boolean {
  if (!allowed || allowed.length === 0 || allowed.includes("*") || allowed.includes("ALL")) return true;
  const upper = underlying.toUpperCase().replace(/\s+/g, "");
  return allowed.some((item) => {
    const clean = item.toUpperCase().replace(/\s+/g, "");
    if (clean === upper) return true;
    if (clean === "NIFTY" && (upper === "NIFTY" || upper === "NIFTY50")) return true;
    if (clean === "BANKNIFTY" && (upper === "BANKNIFTY" || upper === "NIFTYBANK")) return true;
    if (clean === "MCX" && (upper.includes("CRUDE") || upper.includes("NATURAL") || upper.includes("MCX"))) return true;
    return false;
  });
}

/** Determines if a candidate grade meets the minimum notification threshold. */
export function isGradeEligible(grade: OpportunityGrade, minGrade: "A+" | "A" | "B"): boolean {
  if (grade === "REJECT" || grade === "C") return false;
  if (minGrade === "A+") return grade === "A+";
  if (minGrade === "A") return grade === "A+" || grade === "A";
  if (minGrade === "B") return grade === "A+" || grade === "A" || grade === "B";
  return false;
}

/** Sends an HTML-formatted message to Telegram Bot API. Supports single ID, group ID, or comma-separated recipient IDs, and optional inline keyboard. */
export async function sendTelegramMessage(
  text: string,
  config?: Partial<NotificationConfig>,
  replyMarkup?: unknown,
): Promise<{ success: boolean; error?: string }> {
  const fullConfig = { ...getNotificationConfig(), ...config };
  const token = fullConfig.telegramBotToken;
  const rawChatId = fullConfig.telegramChatId;

  if (!token || !rawChatId) {
    return { success: false, error: "Telegram bot token or chat ID not configured" };
  }

  const chatIds = rawChatId
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (chatIds.length === 0) {
    return { success: false, error: "No valid Telegram chat IDs configured" };
  }

  let anySuccess = false;
  const errors: string[] = [];

  for (const chatId of chatIds) {
    try {
      const url = `https://api.telegram.org/bot${token}/sendMessage`;
      const payload: Record<string, unknown> = {
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      };
      if (replyMarkup) {
        payload.reply_markup = replyMarkup;
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(6000),
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        errors.push(`Chat ${chatId}: ${res.status} (${errBody})`);
      } else {
        anySuccess = true;
      }
    } catch (err) {
      errors.push(`Chat ${chatId}: ${(err as Error).message}`);
    }
  }

  if (!anySuccess) {
    return { success: false, error: errors.join("; ") };
  }

  return { success: true };
}

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbedPayload {
  title: string;
  description?: string;
  color?: number; // integer hex color
  fields?: DiscordEmbedField[];
  footer?: { text: string };
  timestamp?: string;
}

/** Sends a rich embed payload to a Discord Webhook. */
export async function sendDiscordWebhook(
  embed: DiscordEmbedPayload,
  config?: Partial<NotificationConfig>,
): Promise<{ success: boolean; error?: string }> {
  const fullConfig = { ...getNotificationConfig(), ...config };
  const webhookUrl = fullConfig.discordWebhookUrl;

  if (!webhookUrl) {
    return { success: false, error: "Discord webhook URL not configured" };
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "Upstox Options Terminal",
        embeds: [{
          ...embed,
          timestamp: embed.timestamp || new Date().toISOString(),
          footer: embed.footer || { text: "Upstox Analyzer · Autonomous Engine v20.2" },
        }],
      }),
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      return { success: false, error: `Discord Webhook error ${res.status}: ${errBody}` };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: `Discord network error: ${(err as Error).message}` };
  }
}

/** Formats and broadcasts a new high-conviction opportunity signal. */
export async function notifyOpportunitySignal(
  item: PaperOpportunity | ContractOpportunity,
  context?: { underlying?: string; lotSize?: number; accountCapital?: number },
): Promise<DispatchResult> {
  const cfg = getNotificationConfig();
  if (!cfg.enabled) {
    return { alerted: false, telegram: false, discord: false, reason: "Notifications disabled" };
  }

  const underlying = context?.underlying || item.underlying || "NIFTY";
  if (!isUnderlyingAllowed(underlying, cfg.allowedUnderlyings)) {
    return {
      alerted: false,
      telegram: false,
      discord: false,
      reason: `Underlying ${underlying} not in allowed list (${cfg.allowedUnderlyings.join(", ")})`,
    };
  }

  if (!isGradeEligible(item.grade, cfg.minGrade)) {
    return { alerted: false, telegram: false, discord: false, reason: `Grade ${item.grade} below min ${cfg.minGrade}` };
  }

  // Deduplication check
  const strike = "strike" in item && item.strike != null ? item.strike : "STOCK";
  const optType = "optionType" in item && item.optionType != null ? item.optionType : item.direction;
  const dedupKey = `SIGNAL|${underlying}|${strike}|${optType}|${item.grade}`;

  const lastAlertAt = alertCache.get(dedupKey);
  const now = Date.now();
  if (lastAlertAt && now - lastAlertAt < DEDUPLICATION_WINDOW_MS) {
    return { alerted: false, telegram: false, discord: false, reason: "Throttled (recently alerted)" };
  }

  alertCache.set(dedupKey, now);

  const thetaExitTime =
    new Date(now + 45 * 60 * 1000).toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }) + " IST";

  const score = "opportunityScore" in item ? item.opportunityScore : item.score;
  const strategy = item.strategyType || (optType === "CE" ? "LONG_CALL" : "LONG_PUT");
  const entry = item.entry;
  const stop = item.stop;
  const t1 = item.target1;
  const t2 = item.target2;
  const rr = "rr" in item ? item.rr : ("rrTarget1" in item ? item.rrTarget1 : 1.5);
  const lotSize = context?.lotSize || 65;
  const riskPerUnit = Math.max(Math.abs(entry - stop), 0.01);
  const riskPerLot = Math.round(riskPerUnit * lotSize);
  const capitalPerLot = Math.round(entry * lotSize);

  const isBullish = ("direction" in item && item.direction === "BULLISH") || optType === "CE";
  const emoji = isBullish ? "🟢" : "🔴";
  const gradeBadge = item.grade === "A+" ? "⭐ GRADE A+" : `GRADE ${item.grade}`;

  // 1. Telegram HTML format
  const tgHtml = [
    `<b>${emoji} ${gradeBadge} SIGNAL · ${underlying}</b>`,
    `<b>Contract:</b> ${underlying} ${strike} ${optType} (<code>${strategy}</code>)`,
    `<b>Score:</b> ${score}/100 | <b>Confidence:</b> ${item.confidence}%`,
    ``,
    `📊 <b>Trade Plan:</b>`,
    `• <b>Entry:</b> ₹${entry.toFixed(1)} <i>(LIMIT ONLY)</i>`,
    `• <b>Stop Loss:</b> ₹${stop.toFixed(1)}`,
    `• <b>Target 1:</b> ₹${t1.toFixed(1)} (R:R ${rr.toFixed(2)}x)`,
    `• <b>Target 2:</b> ₹${t2.toFixed(1)}`,
    ``,
    `⚖ <b>Sizing (1 Lot = ${lotSize} qty):</b>`,
    `• Risk per lot: ₹${riskPerLot.toLocaleString("en-IN")}`,
    `• Capital per lot: ₹${capitalPerLot.toLocaleString("en-IN")}`,
    ``,
    `🛡 <b>Rules:</b>`,
    `• Place LIMIT order at ₹${entry.toFixed(1)}. No market orders.`,
    `• <b>45m Theta Stop:</b> Exit by ${thetaExitTime} if T1 not reached.`,
    item.reasons && item.reasons.length > 0 ? `• <i>${item.reasons.slice(0, 2).join(" · ")}</i>` : "",
    ``,
    `📈 <b>Chart:</b> <a href="${getTradingViewChartUrl(underlying, "15")}">TradingView Live ${underlying}</a>`,
  ].filter(Boolean).join("\n");

  // 2. Discord Embed format
  const discordColor = isBullish ? 0x10b981 : 0xef4444; // Green / Red
  const discordEmbed: DiscordEmbedPayload = {
    title: `${emoji} ${gradeBadge} SIGNAL: ${underlying} ${strike} ${optType}`,
    description: `High-conviction ${strategy} candidate generated by Opportunity Engine.`,
    color: discordColor,
    fields: [
      { name: "Opportunity Score", value: `**${score}/100** (${item.confidence}% Confidence)`, inline: true },
      { name: "R:R Quality", value: `**${rr.toFixed(2)}x** Risk/Reward`, inline: true },
      { name: "Strategy Type", value: `\`${strategy}\``, inline: true },
      { name: "Entry (Limit)", value: `₹${entry.toFixed(1)}`, inline: true },
      { name: "Stop Loss", value: `₹${stop.toFixed(1)}`, inline: true },
      { name: "Targets (T1 / T2)", value: `₹${t1.toFixed(1)} / ₹${t2.toFixed(1)}`, inline: true },
      { name: "Risk per Lot", value: `₹${riskPerLot.toLocaleString("en-IN")}`, inline: true },
      { name: "Capital per Lot", value: `₹${capitalPerLot.toLocaleString("en-IN")}`, inline: true },
      { name: "TradingView Chart", value: `[Open ${underlying} Chart](${getTradingViewChartUrl(underlying, "15")})`, inline: true },
      { name: "Mandatory Safeguard", value: `Zero slippage: Exchange LIMIT only. 45m Theta time-stop (Exit by ${thetaExitTime} if T1 not reached).`, inline: false },
    ],
  };

  if (item.reasons && item.reasons.length > 0) {
    discordEmbed.fields?.push({
      name: "Top Catalysts",
      value: item.reasons.slice(0, 3).map((r) => `• ${r}`).join("\n"),
      inline: false,
    });
  }

  // Interactive Telegram Inline Keyboard (self-contained tracking data < 45 bytes, well within 64-byte Telegram limit)
  const selfContainedTrackData = `track:${underlying}:${strike}:${optType}:${Math.round(entry)}:${Math.round(stop)}:${Math.round(t1)}:${Math.round(t2)}`;
  const tvUrl = getTradingViewChartUrl(underlying, "15");

  const inlineKeyboard = {
    inline_keyboard: [
      [
        { text: "📌 Save & Track Option", callback_data: selfContainedTrackData },
        { text: "📈 TradingView Chart", url: tvUrl },
      ],
      [
        { text: "📊 View Tracked Picks", callback_data: "cmd:picks" },
      ],
    ],
  };

  // Dispatch in parallel
  const [tgRes, dcRes] = await Promise.all([
    sendTelegramMessage(tgHtml, cfg, inlineKeyboard),
    sendDiscordWebhook(discordEmbed, cfg),
  ]);

  return {
    alerted: tgRes.success || dcRes.success,
    telegram: tgRes.success,
    discord: dcRes.success,
    error: tgRes.error || dcRes.error,
  };
}

/** Formats and broadcasts trade lifecycle events (Target Hit, Stop Loss Hit). */
export async function notifyTradeExit(
  opp: PaperOpportunity,
  exitReason: string,
  realizedPnl: number,
  realizedR: number,
): Promise<DispatchResult> {
  const cfg = getNotificationConfig();
  if (!cfg.enabled) {
    return { alerted: false, telegram: false, discord: false, reason: "Notifications disabled" };
  }

  if (!isUnderlyingAllowed(opp.underlying, cfg.allowedUnderlyings)) {
    return {
      alerted: false,
      telegram: false,
      discord: false,
      reason: `Underlying ${opp.underlying} not in allowed list (${cfg.allowedUnderlyings.join(", ")})`,
    };
  }

  const dedupKey = `EXIT|${opp.id}|${exitReason}`;
  if (alertCache.has(dedupKey)) {
    return { alerted: false, telegram: false, discord: false, reason: "Already alerted exit" };
  }
  alertCache.set(dedupKey, Date.now());

  const isWin = realizedR > 0;
  const emoji = isWin ? "🏆" : "🛑";
  const titleText = isWin
    ? `PROFIT TARGET HIT: ${opp.underlying} ${opp.strike || ""} ${opp.optionType || ""}`
    : `POSITION CLOSED: ${opp.underlying} ${opp.strike || ""} ${opp.optionType || ""}`;

  const tgHtml = [
    `<b>${emoji} ${titleText}</b>`,
    `<b>Outcome:</b> ${exitReason}`,
    `<b>Realized P&L:</b> ${realizedPnl >= 0 ? "+" : ""}₹${realizedPnl.toFixed(1)}/unit`,
    `<b>Realized R:</b> <b>${realizedR >= 0 ? "+" : ""}${realizedR.toFixed(2)}R</b>`,
    `<b>Exit Price:</b> ₹${(opp.exitPrice ?? opp.lastLivePrice ?? 0).toFixed(1)} (Entry: ₹${opp.entry.toFixed(1)})`,
  ].join("\n");

  const discordColor = isWin ? 0x10b981 : 0xef4444;
  const discordEmbed: DiscordEmbedPayload = {
    title: `${emoji} ${titleText}`,
    description: `Paper trade reached lifecycle completion: **${exitReason}**`,
    color: discordColor,
    fields: [
      { name: "Realized P&L", value: `${realizedPnl >= 0 ? "+" : ""}₹${realizedPnl.toFixed(1)} / unit`, inline: true },
      { name: "Realized R", value: `**${realizedR >= 0 ? "+" : ""}${realizedR.toFixed(2)}R**`, inline: true },
      { name: "Exit Price", value: `₹${(opp.exitPrice ?? opp.lastLivePrice ?? 0).toFixed(1)}`, inline: true },
    ],
  };

  const [tgRes, dcRes] = await Promise.all([
    sendTelegramMessage(tgHtml, cfg),
    sendDiscordWebhook(discordEmbed, cfg),
  ]);

  return {
    alerted: tgRes.success || dcRes.success,
    telegram: tgRes.success,
    discord: dcRes.success,
    error: tgRes.error || dcRes.error,
  };
}

/** Sends a test ping to verify connectivity. */
export async function sendTestNotification(
  overrideConfig?: Partial<NotificationConfig>,
): Promise<{
  telegram: { configured: boolean; success: boolean; error?: string };
  discord: { configured: boolean; success: boolean; error?: string };
}> {
  const cfg = { ...getNotificationConfig(), ...overrideConfig };
  const timestamp = new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false }) + " IST";

  const tgText = [
    `🔔 <b>Upstox Options Terminal — Test Ping</b>`,
    `Your Telegram notification channel is active and verified!`,
    `<b>Scanned Time:</b> ${timestamp}`,
    `<b>Alert Threshold:</b> Grade ${cfg.minGrade}+ only`,
  ].join("\n");

  const discordEmbed: DiscordEmbedPayload = {
    title: "🔔 Upstox Options Terminal — Test Ping",
    description: "Your Discord webhook channel is active and ready to receive real-time signals.",
    color: 0x38bdf8, // Sky blue
    fields: [
      { name: "Time", value: timestamp, inline: true },
      { name: "Minimum Grade", value: `Grade ${cfg.minGrade}+`, inline: true },
      { name: "Status", value: "Verified ✓", inline: true },
    ],
  };

  const [tgRes, dcRes] = await Promise.all([
    cfg.telegramBotToken && cfg.telegramChatId
      ? sendTelegramMessage(tgText, cfg)
      : Promise.resolve({ success: false, error: "Not configured" }),
    cfg.discordWebhookUrl
      ? sendDiscordWebhook(discordEmbed, cfg)
      : Promise.resolve({ success: false, error: "Not configured" }),
  ]);

  return {
    telegram: {
      configured: Boolean(cfg.telegramBotToken && cfg.telegramChatId),
      success: tgRes.success,
      error: tgRes.error,
    },
    discord: {
      configured: Boolean(cfg.discordWebhookUrl),
      success: dcRes.success,
      error: dcRes.error,
    },
  };
}

/** Sends a dedicated Telegram alert for today's #1 Swing-V1 Mode B (₹10k) pick. */
export async function sendSwingPickAlert(pick: {
  symbol: string;
  setupType: "BREAKOUT" | "PULLBACK";
  signalDate: string;
  referenceEntry: number;
  qty: number;
  stopLoss: number;
  stopPct: number;
  target: number;
  breakevenTrigger: number;
  maxExitDate: string;
  rsVsNiftyPct: number;
  volumeRatio: number;
}): Promise<{ ok: boolean; error?: string }> {
  const cfg = getNotificationConfig();
  if (!cfg.telegramBotToken || !cfg.telegramChatId) {
    return { ok: false, error: "Telegram not configured" };
  }

  const text = [
    `📈 <b>Swing-V1 Mode B (₹10k Delivery Pick)</b>`,
    `<b>Symbol:</b> <code>${pick.symbol}</code> (${pick.setupType})`,
    `<b>Signal Date:</b> ${pick.signalDate}`,
    `<b>Next-Day Open Entry Ref:</b> ₹${pick.referenceEntry.toFixed(2)}`,
    `<b>Exact Qty (₹10,000):</b> ${pick.qty} shares (₹${Math.round(pick.qty * pick.referenceEntry).toLocaleString("en-IN")})`,
    `<b>Structural SL:</b> ₹${pick.stopLoss.toFixed(2)} (-${pick.stopPct.toFixed(2)}%)`,
    `<b>2.5x Target:</b> ₹${pick.target.toFixed(2)}`,
    `<b>Breakeven Trigger (+1.5R):</b> ₹${pick.breakevenTrigger.toFixed(2)}`,
    `<b>15-Trading-Day Max Exit:</b> ${pick.maxExitDate}`,
    `<b>Conviction:</b> RS vs NIFTY +${pick.rsVsNiftyPct.toFixed(2)}% | Vol ${pick.volumeRatio.toFixed(2)}x`,
  ].join("\n");

  const res = await sendTelegramMessage(text, cfg);
  return { ok: res.success, error: res.error };
}
