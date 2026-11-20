import test from "node:test";
import assert from "node:assert/strict";
import { analyzeSavedPick, type SavedPick } from "./savedPickAnalytics.ts";

const sampleOptionPick: SavedPick = {
  id: "pick-1",
  savedAt: "2026-11-20T09:30:00.000Z",
  instrument: "NIFTY 2026-11-23 25650 CE",
  instrumentType: "INDEX_OPTION",
  direction: "LONG",
  entry: 72.15,
  stopLoss: 35.53,
  targets: [148.87, 217.07],
  source: "RESEARCH",
  validation: "NOT_VALIDATED",
};

const sampleStockPick: SavedPick = {
  id: "pick-2",
  savedAt: "2026-11-20T09:30:00.000Z",
  instrument: "EICHERMOT",
  instrumentType: "STOCK",
  direction: "LONG",
  entry: 7904,
  stopLoss: 7633.68,
  targets: [8386.13, 8771.83],
  source: "LIVE",
  validation: "NOT_VALIDATED",
};

test("1. No live price returns WATCHLIST verdict and initial breakeven probability", () => {
  const analysis = analyzeSavedPick(sampleOptionPick, { livePrice: null });
  assert.equal(analysis.hasLivePrice, false);
  assert.equal(analysis.verdict, "WATCHLIST");
  assert.equal(analysis.progressPercent, 50);
  assert.equal(analysis.probability, analysis.breakevenWinRate);
  assert.match(analysis.verdictLabel, /WATCHLIST/);
});

test("2. Price advancing toward Target 1 returns STRONG KEEP and higher probability", () => {
  // Price rose to 110 (Entry: 72.15 -> 110 -> Target: 148.87)
  const analysis = analyzeSavedPick(sampleOptionPick, { livePrice: 110 });
  assert.equal(analysis.hasLivePrice, true);
  assert.equal(analysis.verdict, "KEEP");
  assert.equal(analysis.verdictTone, "emerald");
  assert.match(analysis.verdictLabel, /STRONG KEEP/);
  assert.ok(analysis.pnlPercent! > 50); // (+52.5% gain)
  // Probability: (110 - 35.53) / (148.87 - 35.53) = 74.47 / 113.34 = 65.7%
  assert.ok(analysis.probability > 65 && analysis.probability < 67);
  assert.equal(analysis.probabilityTier, "HIGH");
  assert.ok(analysis.statisticalEdge > 30);
  assert.match(analysis.actionableStep, /Hold position/);
});

test("3. Price reaching Target 1 triggers BOOK_PROFIT verdict with 100% odds", () => {
  const analysis = analyzeSavedPick(sampleOptionPick, { livePrice: 150 });
  assert.equal(analysis.verdict, "BOOK_PROFIT");
  assert.equal(analysis.verdictTone, "emerald");
  assert.match(analysis.verdictLabel, /BOOK 50% PROFIT/);
  assert.equal(analysis.probability, 100);
  assert.equal(analysis.urgency, "ACTION_REQUIRED");
  assert.match(analysis.actionableStep, /Trail Stop Loss to Entry/);
});

test("4. Price breaching Stop Loss triggers REMOVE verdict with 0% odds", () => {
  const analysis = analyzeSavedPick(sampleOptionPick, { livePrice: 32 }); // Stop is 35.53
  assert.equal(analysis.verdict, "REMOVE");
  assert.equal(analysis.verdictTone, "red");
  assert.match(analysis.verdictLabel, /REMOVE/);
  assert.equal(analysis.probability, 0);
  assert.equal(analysis.urgency, "CRITICAL_EXIT");
  assert.match(analysis.actionableStep, /Exit position immediately/);
});

test("5. Option held > 45 minutes with stagnant price triggers TIME_EXIT verdict", () => {
  // Saved at 09:30, evaluated at 10:20 (50 minutes later) with price flat at 73
  const now = new Date("2026-11-20T10:20:00.000Z");
  const analysis = analyzeSavedPick(sampleOptionPick, { livePrice: 73, now });
  assert.equal(analysis.verdict, "TIME_EXIT");
  assert.equal(analysis.verdictTone, "amber");
  assert.match(analysis.verdictLabel, /TIME EXIT/);
  assert.match(analysis.verdictReason, /Theta/);
  assert.match(analysis.actionableStep, /Close trade at breakeven/);
});

test("6. Stock pick near stop loss triggers CAUTION verdict", () => {
  // Entry: 7904, Stop: 7633.68, Live: 7650 (within 0.2% of stop)
  const analysis = analyzeSavedPick(sampleStockPick, { livePrice: 7650 });
  assert.equal(analysis.verdict, "KEEP");
  assert.equal(analysis.verdictTone, "amber");
  assert.match(analysis.verdictLabel, /CAUTION/);
  assert.match(analysis.actionableStep, /Strictly honor Stop Loss/);
});
