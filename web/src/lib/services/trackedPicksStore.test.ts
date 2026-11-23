import { describe, it, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tracked-store-test-"));
process.env.TRACKED_PICKS_DIR = tempDir;

import {
  addTrackedPick,
  removeTrackedPick,
  listTrackedPicks,
  updateTrackedPickQuote,
  evaluateRiskAdvice,
  archiveIntradayPicks,
  clearAllTrackedPicks,
} from "./trackedPicksStore.ts";

describe("trackedPicksStore", () => {
  beforeEach(() => {
    clearAllTrackedPicks();
  });

  after(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it("adds and retrieves multiple concurrent option picks (1, 2, 3+)", () => {
    const pick1 = addTrackedPick({
      underlying: "NIFTY",
      strike: 24200,
      optionType: "CE",
      entry: 120,
      stop: 95,
      target1: 155,
      target2: 190,
      lotSize: 65,
    });

    const pick2 = addTrackedPick({
      underlying: "BANKNIFTY",
      strike: 51800,
      optionType: "PE",
      entry: 250,
      stop: 190,
      target1: 330,
      target2: 410,
      lotSize: 30,
    });

    const pick3 = addTrackedPick({
      underlying: "NIFTY",
      strike: 24300,
      optionType: "CE",
      entry: 80,
      stop: 60,
      target1: 110,
      target2: 140,
      lotSize: 65,
    });

    const active = listTrackedPicks(true);
    assert.equal(active.length, 3);
    assert.equal(active.find((p) => p.id === pick1.id)?.underlying, "NIFTY");
    assert.equal(active.find((p) => p.id === pick2.id)?.underlying, "BANKNIFTY");
    assert.equal(active.find((p) => p.id === pick3.id)?.strike, 24300);
  });

  it("evaluates HOLD advice when price is healthy above stop", () => {
    const advice = evaluateRiskAdvice(
      {
        underlying: "NIFTY",
        strike: 24200,
        optionType: "CE",
        entry: 100,
        stop: 80,
        target1: 130,
        target2: 160,
      },
      110, // In 10% profit
      new Date("2026-11-24T05:00:00.000Z"), // 10:30 IST
    );

    assert.equal(advice.advice, "HOLD");
    assert.ok(advice.reason.includes("WAIT & HOLD"));
    assert.ok(advice.reason.includes("+10%"));
  });

  it("evaluates TRAIL_STOP advice when approaching or reaching Target 1", () => {
    const advice = evaluateRiskAdvice(
      {
        underlying: "NIFTY",
        strike: 24200,
        optionType: "CE",
        entry: 100,
        stop: 80,
        target1: 130,
        target2: 160,
      },
      126, // 126 is 26/30 (86%) of target move
      new Date("2026-11-24T05:00:00.000Z"),
    );

    assert.equal(advice.advice, "TRAIL_STOP");
    assert.ok(advice.reason.includes("TRAIL"));
  });

  it("evaluates CUT advice and marks pick COMPLETED when stop loss breached", () => {
    const pick = addTrackedPick({
      underlying: "NIFTY",
      strike: 24200,
      optionType: "CE",
      entry: 100,
      stop: 80,
      target1: 130,
    });

    const updated = updateTrackedPickQuote(
      pick.id,
      78, // Below 80 stop
      new Date("2026-11-24T05:00:00.000Z"),
    );

    assert.ok(updated !== null);
    assert.equal(updated?.riskAdvice, "CUT");
    assert.equal(updated?.status, "COMPLETED");
    assert.ok(updated?.adviceReason.includes("CUT & REMOVE"));
  });

  it("evaluates SQUARE_OFF advice when past 15:15 IST", () => {
    const advice = evaluateRiskAdvice(
      {
        underlying: "NIFTY",
        strike: 24200,
        optionType: "CE",
        entry: 100,
        stop: 80,
        target1: 130,
        target2: 160,
      },
      105,
      new Date("2026-11-24T09:46:00.000Z"), // 15:16 IST
    );

    assert.equal(advice.advice, "SQUARE_OFF");
    assert.ok(advice.reason.includes("15:15 IST INTRADAY CLOSE"));
  });

  it("removes tracked pick cleanly", () => {
    const pick = addTrackedPick({
      underlying: "NIFTY",
      strike: 24200,
      optionType: "CE",
      entry: 100,
      stop: 80,
      target1: 130,
    });

    assert.equal(listTrackedPicks(true).length, 1);
    const removed = removeTrackedPick(pick.id);
    assert.equal(removed, true);
    assert.equal(listTrackedPicks(true).length, 0);
  });

  it("archives all active intraday picks at square-off", () => {
    addTrackedPick({
      underlying: "NIFTY",
      strike: 24200,
      optionType: "CE",
      entry: 100,
      stop: 80,
      target1: 130,
    });
    addTrackedPick({
      underlying: "BANKNIFTY",
      strike: 51800,
      optionType: "PE",
      entry: 200,
      stop: 160,
      target1: 260,
    });

    assert.equal(listTrackedPicks(true).length, 2);
    const count = archiveIntradayPicks();
    assert.equal(count, 2);
    assert.equal(listTrackedPicks(true).length, 0);
  });
});
