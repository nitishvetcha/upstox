// API integration smoke tests — exercises the service layer wired to each API route.
// Routes cannot be imported directly (Next.js @/ aliasing, NextResponse), so we test
// the underlying service functions they delegate to. These are the exact same calls
// the route handlers make; if the service contracts break, the routes break.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// ── Auth status service (used by GET /api/auth/status) ───────────────────────
import { tokenStatus } from "./upstoxAuth.ts";

// ── Risk service (used by POST /api/risk/assess) ──────────────────────────────
import { evaluateTradeRisk } from "./risk/riskService.ts";
import { mockSnapshot } from "./mock.ts";

// ── Paper trading engine (used by GET /api/paper-trading/portfolio) ───────────
import { getPaperTradingEngine } from "./paperStore.ts";
import { buildPaperLedgerReport, reconcileLedger } from "../paperReport.ts";

// ── Opportunity engine (used by GET /api/opportunities/top) ──────────────────
import { evaluateOptionsOpportunity } from "../engine/opportunityEngine.ts";

// ─────────────────────────────────────────────────────────────────────────────

let tempDir: string;
const origEnv: Record<string, string | undefined> = {};
const ISOLATED_VARS = ["UPSTOX_TOKEN_FILE", "PAPER_TRADES_DIR", "SESSION_EVIDENCE_DIR"];

before(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "api-integration-test-"));
  for (const k of ISOLATED_VARS) origEnv[k] = process.env[k];
  process.env.UPSTOX_TOKEN_FILE = path.join(tempDir, "no-token.json");
  process.env.PAPER_TRADES_DIR = path.join(tempDir, "paper-trades");
  process.env.SESSION_EVIDENCE_DIR = path.join(tempDir, "paper-sessions");
});

after(() => {
  for (const k of ISOLATED_VARS) {
    if (origEnv[k] === undefined) delete process.env[k];
    else process.env[k] = origEnv[k];
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
});

// ── Auth status ───────────────────────────────────────────────────────────────
describe("Auth status service (GET /api/auth/status)", () => {
  // Each case clears UPSTOX_ANALYTICS_TOKEN itself, so the result never depends on the shell that runs the tests.
  const withoutAnalytics = async (fn: () => Promise<void>) => {
    const saved = process.env.UPSTOX_ANALYTICS_TOKEN;
    delete process.env.UPSTOX_ANALYTICS_TOKEN;
    try { await fn(); } finally { if (saved !== undefined) process.env.UPSTOX_ANALYTICS_TOKEN = saved; }
  };

  it("returns MISSING status when token file does not exist", () => withoutAnalytics(async () => {
    const result = await tokenStatus();
    assert.ok("status" in result, "result must have a status field");
    assert.ok("expiresAt" in result, "result must have an expiresAt field");
    assert.equal(result.status, "MISSING");
    assert.equal(result.expiresAt, null);
  }));

  it("returns EXPIRED status when token file contains an expired token", () => withoutAnalytics(async () => {
    const tokenFile = path.join(tempDir, "expired-token.json");
    fs.writeFileSync(tokenFile, JSON.stringify({
      accessToken: "fake_token",
      expiresAt: new Date(Date.now() - 3600_000).toISOString(), // 1 hour ago
    }), "utf8");
    // A token past its expiresAt (but not explicitly invalidated) is EXPIRED
    const result = await tokenStatus(new Date(), tokenFile);
    assert.equal(result.status, "EXPIRED");
    assert.ok(result.expiresAt !== null);
  }));
});

// ── Risk assessment ───────────────────────────────────────────────────────────
describe("Risk service (POST /api/risk/assess)", () => {
  it("returns a risk assessment with approved/rejected status for a valid plan", () => {
    const snap = mockSnapshot("nifty", new Date("2026-10-26T04:30:00Z"));
    const plan = {
      strategy: "Long Call" as const,
      legs: [{ type: "CE" as const, action: "BUY" as const, side: "BUY" as const, strike: snap.spot + 100, qty: 1, ltp: 150 }],
      entry: 150,
      stop: 75,
      target1: 300,
      target2: 450,
      credit: false,
      rr: 2,
      score: 70,
      entryZone: [145, 155] as [number, number],
      rejected: null,
      maxLoss: 150,
      maxProfit: null,
      breakevens: [snap.spot + 250],
    };
    const result = evaluateTradeRisk(plan, snap, undefined, undefined, new Date("2026-10-26T04:30:00Z"));
    assert.ok("status" in result, "assessment must have a status field");
    assert.ok(result.status === "APPROVED" || result.status === "REJECTED", `unexpected status: ${result.status}`);
    assert.ok(typeof result.totalRisk === "number", "totalRisk must be a number");
  });

  it("rejects a plan with unknown index snapshot (lotSize 0)", () => {
    const snap = mockSnapshot("nifty", new Date("2026-10-26T04:30:00Z"));
    const badSnap = { ...snap, lotSize: 0 };
    const plan = {
      strategy: "Long Call" as const,
      legs: [],
      entry: 100,
      stop: 50,
      target1: 200,
      target2: 300,
      credit: false,
      rr: 2,
      score: 70,
      entryZone: [95, 105] as [number, number],
      rejected: null,
      maxLoss: 100,
      maxProfit: null,
      breakevens: [],
    };
    const result = evaluateTradeRisk(plan, badSnap);
    assert.equal(result.status, "REJECTED");
  });

  it("returns 400-equivalent for invalid index (non-existing)", () => {
    // Simulates the route's isIndexId guard — just verify the guard function exists and rejects garbage
    import("./instrumentRegistry.ts").then(({ isIndexId }) => {
      assert.equal(isIndexId("garbage_index_xyz"), false);
    });
  });
});

// ── Paper portfolio ───────────────────────────────────────────────────────────
describe("Paper portfolio service (GET /api/paper-trading/portfolio)", () => {
  it("returns a summary, report and reconciliation for an empty ledger", () => {
    const engine = getPaperTradingEngine();
    const summary = engine.getPortfolioSummary();
    const trades = engine.getTrades();
    const report = buildPaperLedgerReport(trades);
    const reconciliation = reconcileLedger(trades, engine.getEvents());

    assert.ok("openPositions" in summary, "summary must have openPositions");
    assert.ok("openRisk" in summary, "summary must have openRisk");
    assert.ok("counts" in report, "report must have counts");
    assert.ok("ok" in reconciliation, "reconciliation must have ok field");
    assert.equal(summary.openPositions, 0, "fresh ledger has no open positions");
    assert.equal(report.counts.open, 0, "fresh ledger report has no open trades");
    assert.equal(reconciliation.ok, true, "fresh ledger reconciles cleanly");
  });
});

// ── Options opportunity engine (GET /api/opportunities/top) ──────────────────
describe("Options opportunity engine (GET /api/opportunities/top)", () => {
  it("returns a structured result with topOpportunities array for NIFTY", () => {
    const snap = mockSnapshot("nifty", new Date("2026-10-26T04:30:00Z"));
    const result = evaluateOptionsOpportunity(snap, "NIFTY", new Date("2026-10-26T04:30:00Z"));
    assert.ok(Array.isArray(result.topOpportunities), "topOpportunities must be an array");
    assert.ok("marketRegime" in result, "result must have marketRegime");
    assert.ok("marketDirection" in result, "result must have marketDirection");
  });

  it("returns a structured result for BANKNIFTY", () => {
    const snap = mockSnapshot("banknifty", new Date("2026-10-26T04:30:00Z"));
    const result = evaluateOptionsOpportunity(snap, "BANKNIFTY", new Date("2026-10-26T04:30:00Z"));
    assert.ok(Array.isArray(result.topOpportunities), "topOpportunities must be an array");
  });

  it("each opportunity in the list has required fields", () => {
    const snap = mockSnapshot("nifty", new Date("2026-10-26T04:30:00Z"));
    const result = evaluateOptionsOpportunity(snap, "NIFTY", new Date("2026-10-26T04:30:00Z"));
    for (const opp of result.topOpportunities) {
      assert.ok(typeof opp.opportunityScore === "number", "score must be a number");
      assert.ok(typeof opp.strategyType === "string", "strategyType must be a string");
    }
  });
});
