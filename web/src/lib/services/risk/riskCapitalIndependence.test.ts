// Phase 1: Capital Independence & Recommendation Risk Decoupling Verification Suite
// Offline and deterministic: verifies that trade plan recommendation eligibility is independent
// of user account capital, ZERO_LOTS does not reject valid recommendations, and Strategy 11.4
// baseline is strictly preserved byte-for-byte.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { evaluateTradeRisk } from "./riskService.ts";
import { analyze } from "../../engine/strategy.ts";
import { mockSnapshot } from "../mock.ts";
import type { Snapshot, TradePlan } from "../../types.ts";

const NOW = new Date("2026-10-05T07:00:00Z"); // Monday 12:30 IST

function liveSnapshot(over: (s: Snapshot) => void = () => {}): Snapshot {
  const s = structuredClone(mockSnapshot("nifty", NOW));
  for (const k of Object.keys(s.sources) as (keyof Snapshot["sources"])[]) {
    s.sources[k] = { ...s.sources[k], source: "LIVE", provider: "UPSTOX", fetchedAt: NOW.toISOString() };
  }
  if (s.breadth) s.breadth = { ...s.breadth, status: "LIVE", reason: null };
  s.lotSize = 75;
  s.fallbackReason = null;
  over(s);
  return s;
}

function makePlan(over: Partial<TradePlan> = {}): TradePlan {
  return {
    strategy: "Long Call",
    legs: [],
    credit: false,
    entry: 100,
    entryZone: [98, 102],
    stop: 80,
    target1: 150,
    target2: 200,
    rr: 2.5,
    maxLoss: 100,
    maxProfit: null,
    breakevens: [24950],
    score: 80,
    rejected: null,
    ...over,
  } as TradePlan;
}

// ---------------------------------------------------------------------------
// REQUIREMENT 4: MANDATORY 9 REGRESSION TESTS
// ---------------------------------------------------------------------------

test("1. Missing capital does not block valid recommendations", () => {
  // Call evaluateTradeRisk with undefined inputs and undefined overrideConfig
  const assessment = evaluateTradeRisk(makePlan(), liveSnapshot(), undefined, undefined, NOW);

  assert.equal(assessment.allowed, true, "Valid trade plan must be allowed without account capital");
  assert.equal(assessment.status, "APPROVED");
  assert.deepEqual(assessment.reasons, [], "Rejection reasons must be empty");
  assert.equal(assessment.lots, 0, "Lots is 0 when capital is missing");
  assert.equal(assessment.quantity, 0);
  assert.equal(assessment.sizingStatus, "UNCONFIGURED");
  assert.ok(!(assessment.reasons as string[]).includes("ZERO_LOTS"), "ZERO_LOTS must not be in rejection reasons");
  assert.ok(assessment.warnings.some((w) => /capital not configured/i.test(w)), "Warning explains sizing is decoupled");
});

test("2. Zero capital does not block valid recommendations", () => {
  // Call evaluateTradeRisk with explicit 0 capital
  const assessment = evaluateTradeRisk(
    makePlan(),
    liveSnapshot(),
    { overrideCapital: 0 },
    { accountCapital: 0 },
    NOW,
  );

  assert.equal(assessment.allowed, true, "Trade recommendation must be approved with zero capital");
  assert.equal(assessment.status, "APPROVED");
  assert.deepEqual(assessment.reasons, [], "Must have zero rejection reasons");
  assert.equal(assessment.lots, 0);
  assert.equal(assessment.quantity, 0);
  assert.equal(assessment.sizingStatus, "UNCONFIGURED");
  assert.ok(!(assessment.reasons as string[]).includes("ZERO_LOTS"));
});

test("3. A default capital value is not silently used by recommendation generation", () => {
  // When no capital is passed, capital must evaluate to 0 (genuinely unconfigured),
  // not silently defaulting to ₹1,00,000 or any other positive amount.
  const assessment = evaluateTradeRisk(makePlan(), liveSnapshot(), undefined, undefined, NOW);

  // If ₹1,00,000 were silently used, lots would be calculated (> 0) and sizingStatus would be "SIZED"
  assert.equal(assessment.lots, 0, "Lots must be 0, proving no silent default capital was applied");
  assert.equal(assessment.quantity, 0);
  assert.equal(assessment.totalRisk, 0);
  assert.equal(assessment.sizingStatus, "UNCONFIGURED");
  assert.ok(
    assessment.warnings.some((w) => /capital not configured/i.test(w)),
    "Must output an unconfigured capital warning rather than using a secret default",
  );
});

test("4. Zero affordable lots do not reject a valid recommendation", () => {
  // Configured with small capital: ₹5,000 capital -> 1% risk = ₹50. Net risk per lot (~1,500) > ₹50.
  // Affordability yields 0 lots, but recommendation MUST remain APPROVED.
  const assessment = evaluateTradeRisk(
    makePlan(),
    liveSnapshot(),
    { overrideCapital: 5000 },
    { accountCapital: 5000 },
    NOW,
  );

  assert.equal(assessment.allowed, true, "Valid market recommendation must be approved even if account cannot afford 1 lot");
  assert.equal(assessment.status, "APPROVED");
  assert.deepEqual(assessment.reasons, [], "Market recommendation reasons must not contain rejections");
  assert.equal(assessment.lots, 0);
  assert.equal(assessment.sizingStatus, "ZERO_LOTS");
  assert.ok(!(assessment.reasons as string[]).includes("ZERO_LOTS"), "ZERO_LOTS must not reject recommendation");
  // Portfolio diagnostics track ZERO_LOTS separately
  assert.ok(assessment.portfolioReasons?.includes("ZERO_LOTS"), "Portfolio diagnostics capture ZERO_LOTS separately");
  assert.equal(assessment.portfolioAllowed, false, "Portfolio execution reflects 0 affordable lots");
});

test("5. Daily loss limits do not reject market recommendations", () => {
  const snap = liveSnapshot();
  // Capital: ₹1,00,000, maxDailyLoss: 2% (₹2,000). Realized daily loss: ₹3,000 (breached).
  const assessment = evaluateTradeRisk(
    makePlan(),
    snap,
    { overrideCapital: 100_000, realizedDailyLoss: 3000 },
    { accountCapital: 100_000, maxDailyLossPercent: 2.0 },
    NOW,
  );

  assert.equal(assessment.allowed, true, "Market recommendation must remain allowed despite daily loss limit");
  assert.equal(assessment.status, "APPROVED");
  assert.ok(!(assessment.reasons as string[]).includes("DAILY_LOSS_LIMIT"), "DAILY_LOSS_LIMIT must not be a recommendation rejection");
  // Portfolio execution is blocked, but recommendation eligibility is unaffected
  assert.equal(assessment.portfolioAllowed, false);
  assert.ok(assessment.portfolioReasons?.includes("DAILY_LOSS_LIMIT"));
  assert.ok(assessment.portfolioHumanReasons?.some((w: string) => /daily loss limit/i.test(w)));
});

test("6. Open-risk limits do not reject market recommendations", () => {
  const snap = liveSnapshot();
  // Capital: ₹1,00,000, maxOpenRisk: 6% (₹6,000). Existing open risk: ₹7,000 (breached).
  const assessment = evaluateTradeRisk(
    makePlan(),
    snap,
    { overrideCapital: 100_000, existingOpenRisk: 7000 },
    { accountCapital: 100_000, maxOpenRiskPercent: 6.0 },
    NOW,
  );

  assert.equal(assessment.allowed, true, "Market recommendation must remain allowed despite open-risk limit");
  assert.equal(assessment.status, "APPROVED");
  assert.ok(!(assessment.reasons as string[]).includes("OPEN_RISK_LIMIT"), "OPEN_RISK_LIMIT must not reject recommendation");
  assert.equal(assessment.portfolioAllowed, false);
  assert.ok(assessment.portfolioReasons?.includes("OPEN_RISK_LIMIT"));
  assert.ok(assessment.portfolioHumanReasons?.some((w: string) => /open risk limit/i.test(w)));
});

test("7. Maximum concurrent positions do not reject market recommendations", () => {
  const snap = liveSnapshot();
  // Max positions: 3. Current open positions: 3 (limit reached).
  const assessment = evaluateTradeRisk(
    makePlan(),
    snap,
    { overrideCapital: 100_000, currentOpenPositions: 3 },
    { accountCapital: 100_000, maxConcurrentPositions: 3 },
    NOW,
  );

  assert.equal(assessment.allowed, true, "Market recommendation must remain allowed despite max positions reached");
  assert.equal(assessment.status, "APPROVED");
  assert.ok(!(assessment.reasons as string[]).includes("MAX_CONCURRENT_POSITIONS"), "MAX_CONCURRENT_POSITIONS must not reject recommendation");
  assert.equal(assessment.portfolioAllowed, false);
  assert.ok(assessment.portfolioReasons?.includes("MAX_CONCURRENT_POSITIONS"));
  assert.ok(assessment.portfolioHumanReasons?.some((w: string) => /max concurrent positions/i.test(w)));
});

test("8. Invalid market trade plans still fail closed", () => {
  const snap = liveSnapshot();

  // 8a. NaN entry
  const nanEntry = evaluateTradeRisk(makePlan({ entry: Number.NaN }), snap, undefined, undefined, NOW);
  assert.equal(nanEntry.allowed, false);
  assert.equal(nanEntry.status, "REJECTED");
  assert.ok(nanEntry.reasons.includes("INVALID_ENTRY"));

  // 8b. Stop above entry for long debit trade (negative risk)
  const badStop = evaluateTradeRisk(makePlan({ entry: 100, stop: 110 }), snap, undefined, undefined, NOW);
  assert.equal(badStop.allowed, false);
  assert.equal(badStop.status, "REJECTED");
  assert.ok(badStop.reasons.includes("INVALID_STOP"));

  // 8c. Insufficient R:R
  const lowRR = evaluateTradeRisk(makePlan({ rr: 0.8 }), snap, undefined, undefined, NOW);
  assert.equal(lowRR.allowed, false);
  assert.equal(lowRR.status, "REJECTED");
  assert.ok(lowRR.reasons.includes("INSUFFICIENT_RR"));

  // 8d. Stale market quotes
  const staleSnap = liveSnapshot((s) => {
    s.sources.market = { ...s.sources.market, source: "STALE" };
  });
  const stale = evaluateTradeRisk(makePlan(), staleSnap, undefined, undefined, NOW);
  assert.equal(stale.allowed, false);
  assert.equal(stale.status, "REJECTED");
  assert.ok(stale.reasons.includes("STALE_PRICE"));

  // 8e. END_OF_DAY quotes
  const eodSnap = liveSnapshot((s) => {
    s.sources.market = { ...s.sources.market, source: "END_OF_DAY" };
  });
  const eod = evaluateTradeRisk(makePlan(), eodSnap, undefined, undefined, NOW);
  assert.equal(eod.allowed, false);
  assert.equal(eod.status, "REJECTED");
  assert.ok(eod.reasons.includes("END_OF_DAY_DATA"));
  assert.ok(!eod.reasons.includes("STALE_PRICE"), "END_OF_DAY must not be classified as STALE_PRICE");

  // 8f. Unknown lot size
  const noLotSnap = liveSnapshot((s) => {
    s.lotSize = null;
  });
  const noLot = evaluateTradeRisk(makePlan(), noLotSnap, undefined, undefined, NOW);
  assert.equal(noLot.allowed, false);
  assert.equal(noLot.status, "REJECTED");
  assert.ok(noLot.reasons.includes("UNKNOWN_LOT_SIZE"));
});

test("9. Strategy 11.4 remains byte-for-byte unchanged", () => {
  const candidatePaths = [
    resolve(process.cwd(), "src/lib/engine/strategy.ts"),
    resolve(process.cwd(), "web/src/lib/engine/strategy.ts"),
  ];
  const strategyPath = candidatePaths.find((p) => existsSync(p)) ?? candidatePaths[0];
  const localContent = readFileSync(strategyPath);
  const localHash = createHash("sha256").update(localContent).digest("hex");

  // Read directly from git baseline commit bcdd18a
  const gitBaseline = execSync("git show bcdd18a:web/src/lib/engine/strategy.ts", {
    cwd: existsSync(resolve(process.cwd(), "web")) ? process.cwd() : resolve(process.cwd(), ".."),
  });
  const baselineHash = createHash("sha256").update(gitBaseline).digest("hex");

  assert.equal(localHash, baselineHash, "strategy.ts SHA-256 must match git baseline bcdd18a byte-for-byte");
  assert.equal(localHash, "d0170b40a4b9fb6265697edda03917779b9b8acddcaddc4c43488a4b29eb3f18");
});

// ---------------------------------------------------------------------------
// ADDITIONAL VERIFICATIONS: PAYOFFS, CREDITS, STRATEGY 11.4 & OPTIONAL SIZING
// ---------------------------------------------------------------------------

test("Calculates entry, stop, targets, reward-to-risk, and max theoretical loss without account capital", () => {
  const plan = makePlan({
    entry: 120,
    stop: 90,
    target1: 180,
    target2: 220,
    rr: 2.0,
    maxLoss: 120,
  });

  const assessment = evaluateTradeRisk(plan, liveSnapshot(), undefined, undefined, NOW);

  assert.equal(assessment.entryPrice, 120);
  assert.equal(assessment.stopPrice, 90);
  assert.equal(assessment.targetPrice, 180);
  assert.equal(assessment.riskRewardRatio, 2.0);
  assert.ok((assessment.netRewardRatio ?? 0) > 1.2, "Net R:R must be calculated");
  // Per lot theoretical max loss: 120 * 75 = 9,000 INR
  assert.equal(assessment.maxTheoreticalLoss, 9000, "Theoretical max loss must be populated per contract lot");
});

test("Multi-leg debit spread calculates max loss and net payoff without requiring account capital", () => {
  const debitPlan: TradePlan = {
    strategy: "Bull Call Spread",
    legs: [
      { side: "BUY", type: "CE", strike: 24850, ltp: 145 },
      { side: "SELL", type: "CE", strike: 24950, ltp: 75 },
    ],
    credit: false,
    entry: 70, // 145 - 75 = 70 debit
    entryZone: [68, 72],
    stop: 35, // 50% max loss stop
    target1: 130, // reward 60 / risk 35 = 1.71
    target2: 150,
    rr: 1.71,
    maxLoss: 70,
    maxProfit: 80,
    breakevens: [24920],
    score: 80,
    rejected: null,
  };

  const assessment = evaluateTradeRisk(debitPlan, liveSnapshot(), undefined, undefined, NOW);

  assert.equal(assessment.allowed, true);
  assert.equal(assessment.entryPrice, 70);
  assert.equal(assessment.stopPrice, 35);
  // Max loss: 70 * 75 = 5,250 INR
  assert.equal(assessment.maxTheoreticalLoss, 5250);
  // Max profit: 80 * 75 = 6,000 INR
  assert.equal(assessment.maxProfit, 6000);
});

test("Multi-leg credit spread (Iron Condor) respects 0.4 credit R:R threshold and calculates max loss", () => {
  const snap = liveSnapshot((s) => {
    for (const row of s.chain) {
      if (row.call && row.call.ltp > 0) {
        row.call.bid = Math.round(row.call.ltp * 0.995 * 100) / 100;
        row.call.ask = Math.round(row.call.ltp * 1.005 * 100) / 100;
      }
      if (row.put && row.put.ltp > 0) {
        row.put.bid = Math.round(row.put.ltp * 0.995 * 100) / 100;
        row.put.ask = Math.round(row.put.ltp * 1.005 * 100) / 100;
      }
    }
  });

  const creditPlan: TradePlan = {
    strategy: "Iron Condor",
    legs: [
      { side: "SELL", type: "CE", strike: 25200, ltp: 40 },
      { side: "BUY", type: "CE", strike: 25350, ltp: 15 },
      { side: "SELL", type: "PE", strike: 24500, ltp: 35 },
      { side: "BUY", type: "PE", strike: 24350, ltp: 10 },
    ],
    credit: true,
    entry: 50, // net credit received
    entryZone: [48, 52],
    stop: 100, // 2x credit stop (loss of 50)
    target1: 25, // 50% target (gain of 25)
    target2: 10,
    rr: 0.5, // 25 / 50 = 0.5 (above 0.4 credit threshold, below 1.2 debit threshold)
    maxLoss: 100, // width 150 - credit 50 = 100
    maxProfit: 50,
    breakevens: [24450, 25250],
    score: 75,
    rejected: null,
  };

  const assessment = evaluateTradeRisk(creditPlan, snap, undefined, undefined, NOW);

  assert.equal(assessment.allowed, true, "Iron Condor with R:R 0.5 must be approved under credit threshold 0.4");
  assert.ok(!assessment.reasons.includes("INSUFFICIENT_RR"), "Must NOT reject credit trade with debit 1.2 threshold");
  // Max loss: 100 * 75 = 7,500 INR
  assert.equal(assessment.maxTheoreticalLoss, 7500);
  // Max profit: 50 * 75 = 3,750 INR
  assert.equal(assessment.maxProfit, 3750);
});

test("Strategy 11.4 analyze() produces TRADE status and plan without requiring account capital", () => {
  const s = liveSnapshot();
  const result = analyze(s, NOW);

  assert.equal(result.status, "TRADE", "Strategy 11.4 must produce TRADE on confirmed market data");
  assert.ok(result.plan, "Trade plan must be populated");
  assert.ok(result.plan.risk, "Risk assessment must be attached");
  assert.equal(result.plan.risk.allowed, true, "Risk assessment must be allowed");
  assert.ok(result.plan.entry > 0);
  assert.ok(result.plan.stop > 0);
  assert.ok(result.plan.target1 > 0);
  assert.ok(result.plan.rr >= 1.2 || (result.plan.credit && result.plan.rr >= 0.4));
  assert.ok(result.plan.risk.maxTheoreticalLoss !== null, "Max theoretical loss must be present");
});

test("Optional position sizing works accurately when positive account capital is provided", () => {
  const plan = makePlan({ entry: 10, stop: 8, target1: 15, target2: 20, rr: 2.5, maxLoss: 10 });
  const assessment = evaluateTradeRisk(
    plan,
    liveSnapshot(),
    { overrideCapital: 100_000 },
    { riskPerTradePercent: 1.0, maxLotsPerTrade: 5 },
    NOW,
  );

  assert.equal(assessment.allowed, true);
  assert.equal(assessment.lots, 5);
  assert.equal(assessment.quantity, 375); // 5 * 75
  assert.equal(assessment.sizingStatus, "SIZED");
  assert.ok(assessment.totalRisk <= 1000, "Total risk must not exceed 1% budget");
});

// ---------------------------------------------------------------------------
// NET R:R POLICY RECONCILIATION TESTS
// ---------------------------------------------------------------------------

test("A candidate passing Strategy 11.4 gross R:R is not rejected solely because net R:R is below the threshold", () => {
  // Plan with gross R:R 1.43 (clears 1.2 minimum). Slippage and fixed costs drag net R:R to 0.85.
  // The trade recommendation must remain approved.
  const plan = makePlan({ entry: 10, stop: 9, target1: 11.43, rr: 1.43 });
  const assessment = evaluateTradeRisk(plan, liveSnapshot(), undefined, undefined, NOW);

  assert.equal(assessment.allowed, true, "Recommendation must remain allowed based on Strategy 11.4 gross R:R");
  assert.equal(assessment.status, "APPROVED");
  assert.ok(!assessment.reasons.includes("INSUFFICIENT_RR"), "Must NOT reject with INSUFFICIENT_RR");
  assert.ok(assessment.netRewardRatio !== null && assessment.netRewardRatio !== undefined && assessment.netRewardRatio < 1.2, "Net R:R is below 1.2");
  assert.ok(
    assessment.warnings.some((w) => /Economic diagnostic: Net risk\/reward/i.test(w)),
    "Diagnostic warning informs user of economic net R:R without blocking trade",
  );
});

test("Debit and credit strategies retain their respective gross R:R requirements", () => {
  const snap = liveSnapshot();

  // Debit strategy requires gross R:R >= 1.2
  const debitLow = evaluateTradeRisk(makePlan({ credit: false, rr: 1.15 }), snap, undefined, undefined, NOW);
  assert.equal(debitLow.allowed, false, "Debit strategy with gross R:R 1.15 must be rejected (< 1.2)");
  assert.ok(debitLow.reasons.includes("INSUFFICIENT_RR"));

  const debitPass = evaluateTradeRisk(makePlan({ credit: false, rr: 1.25 }), snap, undefined, undefined, NOW);
  assert.equal(debitPass.allowed, true, "Debit strategy with gross R:R 1.25 must be approved (>= 1.2)");
  assert.ok(!debitPass.reasons.includes("INSUFFICIENT_RR"));

  // Credit strategy requires gross R:R >= 0.4
  const creditLow = evaluateTradeRisk(makePlan({ credit: true, entry: 50, stop: 100, target1: 35, rr: 0.3 }), snap, undefined, undefined, NOW);
  assert.equal(creditLow.allowed, false, "Credit strategy with gross R:R 0.3 must be rejected (< 0.4)");
  assert.ok(creditLow.reasons.includes("INSUFFICIENT_RR"));

  const creditPass = evaluateTradeRisk(makePlan({ credit: true, entry: 50, stop: 100, target1: 25, rr: 0.5 }), snap, undefined, undefined, NOW);
  assert.equal(creditPass.allowed, true, "Credit strategy with gross R:R 0.5 must be approved (>= 0.4)");
  assert.ok(!creditPass.reasons.includes("INSUFFICIENT_RR"));
});

test("Net R:R and transaction costs remain available in diagnostics", () => {
  const plan = makePlan({ entry: 100, stop: 80, target1: 150, rr: 2.5 });
  const assessment = evaluateTradeRisk(plan, liveSnapshot(), undefined, undefined, NOW);

  assert.ok(assessment.netRewardRatio !== null && assessment.netRewardRatio !== undefined && assessment.netRewardRatio > 0, "netRewardRatio is populated");
  assert.ok(assessment.fixedCostsInr !== undefined && assessment.fixedCostsInr > 0, "fixedCostsInr is populated");
  assert.ok(assessment.variableCostsPerLot !== undefined && assessment.variableCostsPerLot > 0, "variableCostsPerLot is populated");
  assert.ok(assessment.entryFill !== undefined && assessment.entryFill > 0, "entryFill slippage is populated");
  assert.ok(assessment.worstStopFill !== undefined && assessment.worstStopFill > 0, "worstStopFill is populated");
  assert.ok(assessment.targetFill !== undefined && assessment.targetFill > 0, "targetFill is populated");
  assert.ok(Array.isArray(assessment.assumptions) && assessment.assumptions.length >= 3, "assumptions are stated");
});
