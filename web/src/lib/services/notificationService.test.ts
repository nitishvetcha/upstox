import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  isGradeEligible,
  isUnderlyingAllowed,
  getNotificationConfig,
  notifyOpportunitySignal,
  notifyTradeExit,
  sendTestNotification,
  sendSwingPickAlert,
  sendDailyWrapHeartbeat,
  clearAlertCache,
} from "./notificationService.ts";
import type { PaperOpportunity } from "./paperOpportunityStore.ts";

function createDummyOpportunity(overrides?: Partial<PaperOpportunity>): PaperOpportunity {
  return {
    id: "test-opp-1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: "LIVE",
    instrumentType: "OPTION",
    underlying: "NIFTY",
    symbol: null,
    instrumentKey: "NSE_INDEX|Nifty 50",
    optionType: "CE",
    strike: 24200,
    expiry: "2026-11-26",
    strategyType: "LONG_CALL",
    direction: "BULLISH",
    entry: 125,
    stop: 98,
    target1: 160,
    target2: 195,
    riskPerUnit: 27,
    rewardToTarget1: 35,
    rewardToTarget2: 70,
    rrTarget1: 1.3,
    rrTarget2: 2.6,
    spotAtEntry: 24150,
    iv: 14.5,
    delta: 0.48,
    oi: 45000,
    volume: 12000,
    spread: 0.8,
    atr: 110,
    score: 82,
    confidence: 75,
    grade: "A",
    signalAgreement: 4,
    regime: "LIVE",
    eventRisk: null,
    reasons: ["15m ORB Breakout", "RVOL 2.1x volume surge"],
    reasonCodes: ["ORB_BREAKOUT", "RVOL_HIGH"],
    strategyVersion: "20.2",
    status: "OPEN",
    openedAt: new Date().toISOString(),
    closedAt: null,
    exitPrice: null,
    exitReason: null,
    realizedPnl: null,
    realizedR: null,
    mfe: null,
    mae: null,
    mfeR: null,
    maeR: null,
    underlyingEntry: 24150,
    underlyingExit: null,
    underlyingMfe: null,
    underlyingMae: null,
    durationSeconds: null,
    events: [],
    ...overrides,
  };
}

describe("notificationService — Grade Threshold & Config", () => {
  beforeEach(() => {
    clearAlertCache();
  });

  it("isGradeEligible enforces strict grade hierarchy and mutes Grade C & REJECT", () => {
    // REJECT and C must always be muted
    assert.equal(isGradeEligible("REJECT", "B"), false);
    assert.equal(isGradeEligible("C", "B"), false);
    assert.equal(isGradeEligible("C", "A"), false);
    assert.equal(isGradeEligible("C", "A+"), false);

    // Min grade "A"
    assert.equal(isGradeEligible("A+", "A"), true);
    assert.equal(isGradeEligible("A", "A"), true);
    assert.equal(isGradeEligible("B", "A"), false);

    // Min grade "A+"
    assert.equal(isGradeEligible("A+", "A+"), true);
    assert.equal(isGradeEligible("A", "A+"), false);
    assert.equal(isGradeEligible("B", "A+"), false);

    // Min grade "B"
    assert.equal(isGradeEligible("A+", "B"), true);
    assert.equal(isGradeEligible("A", "B"), true);
    assert.equal(isGradeEligible("B", "B"), true);
  });

  it("getNotificationConfig returns defaults when environment variables are unset", () => {
    const originalEnv = { ...process.env };
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    delete process.env.DISCORD_WEBHOOK_URL;
    delete process.env.NOTIFICATION_ENABLED;
    delete process.env.NOTIFICATION_MIN_GRADE;

    const cfg = getNotificationConfig();
    assert.equal(cfg.minGrade, "A");
    assert.equal(cfg.telegramBotToken, undefined);
    assert.equal(cfg.discordWebhookUrl, undefined);

    process.env = originalEnv;
  });
});

describe("notificationService — Dispatch, Deduplication & Fail-Safe", () => {
  beforeEach(() => {
    clearAlertCache();
    process.env.NOTIFICATION_ENABLED = "true";
    process.env.NOTIFICATION_MIN_GRADE = "A";
  });

  afterEach(() => {
    delete process.env.NOTIFICATION_ENABLED;
    delete process.env.NOTIFICATION_MIN_GRADE;
  });

  it("notifyOpportunitySignal suppresses candidates failing the min grade threshold", async () => {
    const oppGradeB = createDummyOpportunity({ grade: "B" });
    const res = await notifyOpportunitySignal(oppGradeB);
    assert.equal(res.alerted, false);
    assert.ok(res.reason?.includes("below min"));
  });

  it("notifyOpportunitySignal throttles duplicate setups within the 30-minute window", async () => {
    const opp = createDummyOpportunity({ grade: "A+" });
    // First call without credentials returns not alerted (or false without error crashing)
    const res1 = await notifyOpportunitySignal(opp);
    // Second call with same contract key must be throttled by the alertCache
    const res2 = await notifyOpportunitySignal(opp);
    assert.equal(res2.alerted, false);
    assert.equal(res2.reason, "Throttled (recently alerted)");
  });

  it("notifyTradeExit deduplicates identical exit events", async () => {
    const opp = createDummyOpportunity({ id: "trade-exit-test", status: "TARGET1_HIT", exitPrice: 160 });
    const res1 = await notifyTradeExit(opp, "TARGET1_HIT", 35, 1.3);
    const res2 = await notifyTradeExit(opp, "TARGET1_HIT", 35, 1.3);
    assert.equal(res2.alerted, false);
    assert.equal(res2.reason, "Already alerted exit");
  });

  it("sendTestNotification safely reports unconfigured status without throwing", async () => {
    const res = await sendTestNotification();
    assert.ok("telegram" in res);
    assert.ok("discord" in res);
    assert.equal(typeof res.telegram.configured, "boolean");
    assert.equal(typeof res.discord.configured, "boolean");
  });

  it("handles multiple comma-separated Telegram chat IDs safely", async () => {
    const res = await sendTestNotification({
      telegramBotToken: "mock_token",
      telegramChatId: "1008179235, 1470303763",
    });
    assert.equal(res.telegram.configured, true);
  });

  it("isUnderlyingAllowed correctly filters assets while preventing naive substring matches", () => {
    // Default NIFTY only
    assert.equal(isUnderlyingAllowed("NIFTY", ["NIFTY"]), true);
    assert.equal(isUnderlyingAllowed("NIFTY 50", ["NIFTY"]), true);
    // BANKNIFTY must NOT match NIFTY
    assert.equal(isUnderlyingAllowed("BANKNIFTY", ["NIFTY"]), false);
    assert.equal(isUnderlyingAllowed("NIFTY BANK", ["NIFTY"]), false);

    // MCX alias
    assert.equal(isUnderlyingAllowed("CRUDEOIL", ["NIFTY", "MCX"]), true);
    assert.equal(isUnderlyingAllowed("NATURALGAS", ["NIFTY", "MCX"]), true);
    assert.equal(isUnderlyingAllowed("BANKNIFTY", ["NIFTY", "MCX"]), false);

    // Wildcard
    assert.equal(isUnderlyingAllowed("BANKNIFTY", ["*"]), true);
  });

  it("suppresses BANKNIFTY alerts when only NIFTY is allowed", async () => {
    delete process.env.NOTIFICATION_ALLOWED_UNDERLYINGS; // defaults to NIFTY
    const bankOpp = createDummyOpportunity({ underlying: "BANKNIFTY", grade: "A" });
    const res = await notifyOpportunitySignal(bankOpp);
    assert.equal(res.alerted, false);
    assert.ok(res.reason?.includes("not in allowed list"));
  });

  it("formats Grade A alert with exact IST Theta Stop wall-clock timestamp", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "mock_bot_token";
    process.env.TELEGRAM_CHAT_ID = "123456";

    let sentBody = "";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      sentBody = String(init?.body ?? "");
      return { ok: true, status: 200, json: async () => ({ ok: true }), text: async () => "" } as Response;
    }) as typeof fetch;

    try {
      const opp = createDummyOpportunity({ grade: "A" });
      const res = await notifyOpportunitySignal(opp);
      assert.equal(res.telegram, true);
      assert.ok(sentBody.includes("PAPER VALIDATION"));
      assert.ok(sentBody.includes("45m Theta Stop:</b> Exit by"));
      assert.ok(sentBody.includes("IST if T1 not reached"));
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.TELEGRAM_BOT_TOKEN;
      delete process.env.TELEGRAM_CHAT_ID;
    }
  });

  it("prefixes sendSwingPickAlert with ACTIONABLE ₹10K SWING — MODE B", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "mock_bot_token";
    process.env.TELEGRAM_CHAT_ID = "123456";

    let sentBody = "";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      sentBody = String(init?.body ?? "");
      return { ok: true, status: 200, json: async () => ({ ok: true }), text: async () => "" } as Response;
    }) as typeof fetch;

    try {
      const res = await sendSwingPickAlert({
        symbol: "TATAMOTORS",
        setupType: "BREAKOUT",
        signalDate: "2026-11-26",
        referenceEntry: 850,
        qty: 11,
        stopLoss: 820,
        stopPct: 3.53,
        target: 925,
        breakevenTrigger: 895,
        maxExitDate: "2026-12-17",
        rsVsNiftyPct: 4.2,
        volumeRatio: 1.8,
      });
      assert.equal(res.ok, true);
      assert.ok(sentBody.includes("ACTIONABLE ₹10K SWING — MODE B"));
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.TELEGRAM_BOT_TOKEN;
      delete process.env.TELEGRAM_CHAT_ID;
    }
  });

  it("formats sendDailyWrapHeartbeat with NO_SETUP status", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "mock_bot_token";
    process.env.TELEGRAM_CHAT_ID = "123456";

    let sentBody = "";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      sentBody = String(init?.body ?? "");
      return { ok: true, status: 200, json: async () => ({ ok: true }), text: async () => "" } as Response;
    }) as typeof fetch;

    try {
      const res = await sendDailyWrapHeartbeat({
        dateIst: "26 Nov",
        swingStatus: "NO_SETUP",
        paperOptionsCount: 3,
      });
      assert.equal(res.ok, true);
      assert.ok(sentBody.includes("Daily Wrap (26 Nov IST)"));
      assert.ok(sentBody.includes("Swing-V1: NO_SETUP"));
      assert.ok(sentBody.includes("Options Paper Trades Today: 3"));
      assert.ok(sentBody.includes("Bot Healthy"));
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.TELEGRAM_BOT_TOKEN;
      delete process.env.TELEGRAM_CHAT_ID;
    }
  });
});
