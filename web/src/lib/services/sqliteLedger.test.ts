import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  getSqliteDb,
  saveOpportunityToSqlite,
  getOpportunityFromSqlite,
  listOpportunitiesFromSqlite,
  deleteOpportunityFromSqlite,
  countOpportunitiesInSqlite,
  syncFlatFilesToSqlite,
  initSchema,
} from "./sqliteLedger.ts";
import type { PaperOpportunity } from "./paperOpportunityStore.ts";
import { DatabaseSync } from "node:sqlite";

function createMockOpportunity(overrides?: Partial<PaperOpportunity>): PaperOpportunity {
  const id = overrides?.id || ("popp_test_" + Math.random().toString(36).slice(2, 8));
  return {
    id,
    createdAt: "2026-11-23T04:30:00.000Z",
    updatedAt: "2026-11-23T04:30:00.000Z",
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
    reasons: ["15m ORB Breakout", "RVOL 2.1x"],
    reasonCodes: ["ORB_BREAKOUT"],
    strategyVersion: "20.2",
    status: "OPEN",
    openedAt: "2026-11-23T04:30:00.000Z",
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
    events: [
      {
        id: "evt_1",
        opportunityId: id,
        timestamp: "2026-11-23T04:30:00.000Z",
        fromStatus: "OPEN",
        toStatus: "OPEN",
        price: 125,
        underlyingPrice: 24150,
        reason: "Initial open",
        source: "LIVE",
        metadata: { fill: 125 },
      },
    ],
    ...overrides,
  };
}

describe("sqliteLedger — Schema & CRUD Operations", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    // Pure in-memory SQLite instance for isolated, fast unit testing
    db = new DatabaseSync(":memory:");
    initSchema(db);
  });

  it("saves and retrieves an opportunity with full fidelity", () => {
    const opp = createMockOpportunity({ id: "opp_101", score: 88, grade: "A+" });
    saveOpportunityToSqlite(opp, db);

    const fetched = getOpportunityFromSqlite("opp_101", db);
    assert.ok(fetched);
    assert.equal(fetched.id, "opp_101");
    assert.equal(fetched.score, 88);
    assert.equal(fetched.grade, "A+");
    assert.equal(fetched.underlying, "NIFTY");
    assert.equal(fetched.strike, 24200);
    assert.equal(fetched.entry, 125);
    assert.equal(fetched.events.length, 1);
  });

  it("updates existing record on state transition without duplicating rows", () => {
    const opp = createMockOpportunity({ id: "opp_transition", status: "OPEN" });
    saveOpportunityToSqlite(opp, db);

    const updated = {
      ...opp,
      status: "TARGET1_HIT" as const,
      exitPrice: 160,
      exitReason: "Target 1 crossed",
      realizedPnl: 35,
      realizedR: 1.3,
      closedAt: "2026-11-23T05:15:00.000Z",
    };
    saveOpportunityToSqlite(updated, db);

    const fetched = getOpportunityFromSqlite("opp_transition", db);
    assert.ok(fetched);
    assert.equal(fetched.status, "TARGET1_HIT");
    assert.equal(fetched.exitPrice, 160);
    assert.equal(fetched.realizedPnl, 35);
    assert.equal(fetched.realizedR, 1.3);

    const counts = countOpportunitiesInSqlite(db);
    assert.equal(counts.total, 1);
    assert.equal(counts.open, 0);
    assert.equal(counts.closed, 1);
  });

  it("lists opportunities sorted by created_at descending and filters by status", () => {
    const opp1 = createMockOpportunity({ id: "opp_early", createdAt: "2026-11-23T04:00:00.000Z", status: "OPEN" });
    const opp2 = createMockOpportunity({ id: "opp_late", createdAt: "2026-11-23T05:00:00.000Z", status: "TARGET1_HIT" });
    saveOpportunityToSqlite(opp1, db);
    saveOpportunityToSqlite(opp2, db);

    const all = listOpportunitiesFromSqlite({}, db);
    assert.equal(all.length, 2);
    assert.equal(all[0].id, "opp_late"); // newest first
    assert.equal(all[1].id, "opp_early");

    const openOnly = listOpportunitiesFromSqlite({ status: "OPEN" }, db);
    assert.equal(openOnly.length, 1);
    assert.equal(openOnly[0].id, "opp_early");
  });

  it("deletes opportunity cleanly", () => {
    const opp = createMockOpportunity({ id: "opp_to_delete" });
    saveOpportunityToSqlite(opp, db);

    const deleted = deleteOpportunityFromSqlite("opp_to_delete", db);
    assert.equal(deleted, true);

    const fetched = getOpportunityFromSqlite("opp_to_delete", db);
    assert.equal(fetched, null);
  });
});

describe("sqliteLedger — Flat File Migration", () => {
  let db: DatabaseSync;
  let tempDir: string;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    initSchema(db);
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "popp_migration_test_"));
  });

  it("migrates existing popp_*.json files into SQLite without dropping records", () => {
    const opp1 = createMockOpportunity({ id: "opp_json_1", score: 77 });
    const opp2 = createMockOpportunity({ id: "opp_json_2", score: 85 });

    fs.writeFileSync(path.join(tempDir, "popp_opp_json_1.json"), JSON.stringify(opp1, null, 2));
    fs.writeFileSync(path.join(tempDir, "popp_opp_json_2.json"), JSON.stringify(opp2, null, 2));

    const syncRes = syncFlatFilesToSqlite(tempDir, db);
    assert.equal(syncRes.imported, 2);
    assert.equal(syncRes.skipped, 0);

    const counts = countOpportunitiesInSqlite(db);
    assert.equal(counts.total, 2);

    const f1 = getOpportunityFromSqlite("opp_json_1", db);
    assert.ok(f1);
    assert.equal(f1.score, 77);

    // Clean up temp dir
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
