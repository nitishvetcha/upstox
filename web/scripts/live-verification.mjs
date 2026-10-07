// READ-ONLY Live Verification Script for Phase 5.1 / 6A.1
// Fetches live Upstox market data, verifies breadth, measures cold/warm requests & latency, and runs risk verification.
// Run: node scripts/live-verification.mjs

import { readFileSync } from "node:fs";
import { clearUpstoxCache, upstoxProvider } from "../src/lib/services/upstoxMarket.ts";
import { calculateBreadth } from "../src/lib/services/breadthService.ts";
import { evaluateTradeRisk } from "../src/lib/services/risk/riskService.ts";
import { analyze } from "../src/lib/engine/strategy.ts";

const tokenData = JSON.parse(readFileSync(new URL("../.data/upstox-token.json", import.meta.url), "utf8"));
const token = tokenData.accessToken; // stored field is accessToken (access_token was undefined → "Bearer undefined" → HTTP 401)

console.log("=== STEP 1: LIVE BREADTH & REQUEST / LATENCY MEASUREMENT ===");

let requestCount = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (...args) => {
  requestCount++;
  return originalFetch(...args);
};

// Cold cache test
clearUpstoxCache();
requestCount = 0;
const t0 = Date.now();
const provider = upstoxProvider(token);

let niftyBreadth = null;
let bankBreadth = null;
let liveError = null;

try {
  niftyBreadth = await provider.getBreadth("nifty");
  const niftyLatencyMs = Date.now() - t0;
  const niftyColdReqs = requestCount;

  requestCount = 0;
  const t1 = Date.now();
  bankBreadth = await provider.getBreadth("banknifty");
  const bankLatencyMs = Date.now() - t1;
  const bankColdReqs = requestCount;

  console.log(`NIFTY Breadth Cold: status=${niftyBreadth.status}, adv=${niftyBreadth.advances}, dec=${niftyBreadth.declines}, unch=${niftyBreadth.unchanged}, total=${niftyBreadth.total}, coverage=${niftyBreadth.coverage}%, signal=${niftyBreadth.signal}, class=${niftyBreadth.classification}, lat=${niftyLatencyMs}ms, reqs=${niftyColdReqs}`);
  console.log(`BANK NIFTY Breadth Cold: status=${bankBreadth.status}, adv=${bankBreadth.advances}, dec=${bankBreadth.declines}, unch=${bankBreadth.unchanged}, total=${bankBreadth.total}, coverage=${bankBreadth.coverage}%, signal=${bankBreadth.signal}, class=${bankBreadth.classification}, lat=${bankLatencyMs}ms, reqs=${bankColdReqs}`);

  // Warm cache test
  requestCount = 0;
  const t2 = Date.now();
  const niftyBreadthWarm = await provider.getBreadth("nifty");
  const bankBreadthWarm = await provider.getBreadth("banknifty");
  const warmLatencyMs = Date.now() - t2;
  const warmReqs = requestCount;

  console.log(`Warm Cache Breadth: NIFTY status=${niftyBreadthWarm.status}, BANK status=${bankBreadthWarm.status}, lat=${warmLatencyMs}ms, reqs=${warmReqs}`);
} catch (e) {
  liveError = e.message || String(e);
  console.log(`Live Upstox API Attempt: FAILED (${liveError} - Token Expired / HTTP 401)`);
}

console.log("\n=== STEP 2: INDEPENDENT BREADTH CALCULATION CHECK ===");

import { mockSnapshot } from "../src/lib/services/mock.ts";

const mockNiftySnap = mockSnapshot("nifty");
const b = mockNiftySnap.breadth;
let mismatches = 0;
if (b) {
  const signalMath = (b.advances - b.declines) / b.total;
  const pctMath = signalMath * 100;
  const adRatioMath = b.advances / Math.max(b.declines, 1);

  console.log(`Independent NIFTY Signal Math: ${signalMath.toFixed(4)} vs App Signal: ${b.signal.toFixed(4)}`);
  console.log(`Independent NIFTY Breadth % Math: ${pctMath.toFixed(2)}% vs App %: ${b.breadthPercent.toFixed(2)}%`);
  console.log(`Independent NIFTY A/D Ratio Math: ${adRatioMath.toFixed(2)} vs App A/D Ratio: ${b.advanceDeclineRatio.toFixed(2)}`);

  if (Math.abs(signalMath - b.signal) > 1e-4) mismatches++;
  if (Math.abs(pctMath - b.breadthPercent) > 1e-2) mismatches++;
}
console.log(`Independent Breadth Math Mismatches: ${mismatches} (TEST FIXTURE / MOCK)`);

console.log("\n=== STEP 3: INDEPENDENT RISK VERIFICATION CHECK ===");

const testPlan = {
  strategy: "Long Call",
  legs: [{ side: "BUY", type: "CE", strike: 25100, ltp: 100 }],
  credit: false,
  entry: 100,
  entryZone: [97, 103],
  stop: 80,
  target1: 150,
  target2: 200,
  rr: 2.5,
  maxLoss: 100,
  maxProfit: null,
  breakevens: [25200],
  score: 80,
  rejected: null,
};

const fullSnap = mockSnapshot("nifty");
const riskConfig = { accountCapital: 200_000, riskPerTradePercent: 1.0, maxPositionValuePercent: 20.0, maxLotsPerTrade: 5, optionSlippagePercent: 1.0 };
const assessment = evaluateTradeRisk(testPlan, fullSnap, undefined, riskConfig);

// Manual math calculation
const rawRiskPerUnit = 100 - 80; // 20
const slippageMult = 1 + 1.0 / 100; // 1.01
const effectiveRiskPerUnit = 20 * 1.01; // 20.2
const lotSize = fullSnap.lotSize ?? 65;
const manualRiskPerLot = Math.round(effectiveRiskPerUnit * lotSize * 100) / 100; // 1313
const maxAllowedRisk = 200_000 * 0.01; // 2000
const manualLots = Math.floor(maxAllowedRisk / manualRiskPerLot); // 1
const manualTotalRisk = Math.round(manualRiskPerLot * manualLots); // 1313
const manualRR = 2.5;

console.log("Independent Risk Verification Comparison:");
console.log(`- Entry/Stop/Target: Entry=100, Stop=80, Target=150`);
console.log(`- Lot Size: Manual=${lotSize} vs Engine=${assessment.lotSize}`);
console.log(`- Risk/Lot: Manual=₹${manualRiskPerLot} vs Engine=₹${assessment.riskPerLot}`);
console.log(`- Lots Allocated: Manual=${manualLots} vs Engine=${assessment.lots}`);
console.log(`- Total Risk: Manual=₹${manualTotalRisk} vs Engine=₹${assessment.totalRisk}`);
console.log(`- Risk/Reward: Manual=1:${manualRR} vs Engine=1:${assessment.riskRewardRatio}`);

let riskMismatches = 0;
if (assessment.lotSize !== lotSize) riskMismatches++;
if (assessment.riskPerLot !== manualRiskPerLot) riskMismatches++;
if (assessment.lots !== manualLots) riskMismatches++;
if (assessment.totalRisk !== manualTotalRisk) riskMismatches++;
if (assessment.riskRewardRatio !== manualRR) riskMismatches++;

console.log(`Independent Risk Mismatches: ${riskMismatches}`);
