import { NextResponse } from "next/server";
import { getNotificationConfig, sendTestNotification } from "@/lib/services/notificationService";

export const dynamic = "force-dynamic";

export async function GET() {
  const cfg = getNotificationConfig();
  return NextResponse.json({
    enabled: cfg.enabled,
    minGrade: cfg.minGrade,
    telegramConfigured: Boolean(cfg.telegramBotToken && cfg.telegramChatId),
    discordConfigured: Boolean(cfg.discordWebhookUrl),
  });
}

export async function POST() {
  const result = await sendTestNotification();
  return NextResponse.json(result);
}
