"use client";

import { useEffect, useState } from "react";

interface NotificationStatus {
  enabled: boolean;
  minGrade: string;
  telegramConfigured: boolean;
  discordConfigured: boolean;
}

interface TestResult {
  telegram: { configured: boolean; success: boolean; error?: string };
  discord: { configured: boolean; success: boolean; error?: string };
}

export function NotificationControl() {
  const [status, setStatus] = useState<NotificationStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    fetch("/api/notifications/test")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setStatus(data);
      })
      .catch(() => {});
  }, []);

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/notifications/test", { method: "POST" });
      const data = await res.json();
      setTestResult(data);
    } catch (err) {
      setTestResult({
        telegram: { configured: false, success: false, error: (err as Error).message },
        discord: { configured: false, success: false, error: (err as Error).message },
      });
    } finally {
      setTesting(false);
    }
  }

  const anyConfigured = status?.telegramConfigured || status?.discordConfigured;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="text-base">🔔</span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-zinc-100">Real-Time Alert Bot (Telegram &amp; Discord)</h3>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-medium ${
                  anyConfigured
                    ? "bg-emerald-950 text-emerald-300 border border-emerald-800/40"
                    : "bg-zinc-900 text-zinc-400 border border-zinc-800"
                }`}
              >
                {anyConfigured ? "CHANNELS ACTIVE" : "SETUP READY"}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Instant mobile push notifications when high-conviction Grade {status?.minGrade || "A"}+ signals trigger.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {anyConfigured && (
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-medium px-2.5 py-1 text-xs transition-colors"
            >
              {testing ? "Testing..." : "Send Test Ping"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            {isOpen ? "Hide Setup" : "Setup / Status"}
          </button>
        </div>
      </div>

      {testResult && (
        <div className="mt-3 rounded border border-zinc-800 bg-zinc-900/60 p-2.5 text-[11px] space-y-1">
          <div className="font-semibold text-zinc-200">Test Ping Results:</div>
          <div className="flex flex-wrap items-center gap-4">
            <span>
              Telegram:{" "}
              {testResult.telegram.configured ? (
                testResult.telegram.success ? (
                  <strong className="text-emerald-400">Delivered ✓</strong>
                ) : (
                  <span className="text-red-400">Failed: {testResult.telegram.error}</span>
                )
              ) : (
                <span className="text-zinc-500">Not configured</span>
              )}
            </span>
            <span>
              Discord:{" "}
              {testResult.discord.configured ? (
                testResult.discord.success ? (
                  <strong className="text-emerald-400">Delivered ✓</strong>
                ) : (
                  <span className="text-red-400">Failed: {testResult.discord.error}</span>
                )
              ) : (
                <span className="text-zinc-500">Not configured</span>
              )}
            </span>
          </div>
        </div>
      )}

      {isOpen && (
        <div className="mt-3 pt-3 border-t border-zinc-800/80 space-y-2.5 text-[11px] text-zinc-300">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Telegram setup */}
            <div className="rounded border border-zinc-800/80 bg-zinc-900/40 p-2.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sky-400">Telegram Bot</span>
                <span className={status?.telegramConfigured ? "text-emerald-400" : "text-zinc-500"}>
                  {status?.telegramConfigured ? "Connected ✓" : "Not Configured"}
                </span>
              </div>
              <p className="text-zinc-400 leading-relaxed text-[10px]">
                1. Message <code>@BotFather</code> on Telegram to create a bot &amp; copy token.<br />
                2. Message your bot, then get your chat ID via <code>@userinfobot</code>.<br />
                3. Add to <code>web/.env.local</code>:
              </p>
              <pre className="rounded bg-black/60 p-1.5 font-mono text-[10px] text-zinc-300 overflow-x-auto">
{`TELEGRAM_BOT_TOKEN="your_bot_token"
TELEGRAM_CHAT_ID="your_chat_id"`}
              </pre>
            </div>

            {/* Discord setup */}
            <div className="rounded border border-zinc-800/80 bg-zinc-900/40 p-2.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-indigo-400">Discord Channel</span>
                <span className={status?.discordConfigured ? "text-emerald-400" : "text-zinc-500"}>
                  {status?.discordConfigured ? "Connected ✓" : "Not Configured"}
                </span>
              </div>
              <p className="text-zinc-400 leading-relaxed text-[10px]">
                1. In Discord channel: <i>Settings → Integrations → Webhooks → New Webhook</i>.<br />
                2. Click <i>Copy Webhook URL</i>.<br />
                3. Add to <code>web/.env.local</code>:
              </p>
              <pre className="rounded bg-black/60 p-1.5 font-mono text-[10px] text-zinc-300 overflow-x-auto">
{`DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..."`}
              </pre>
            </div>
          </div>

          <div className="text-[10px] text-zinc-500 flex items-center justify-between">
            <span>Alert filter: Grade {status?.minGrade || "A"}+ only (Grade C &amp; REJECT automatically muted)</span>
            <span>Zero latency dispatch · non-blocking</span>
          </div>
        </div>
      )}
    </div>
  );
}
