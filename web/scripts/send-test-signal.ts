// Send an interactive test option signal to Telegram Group & Admin DM with the [📌 Save & Track Option] button.
import { notifyOpportunitySignal } from "../src/lib/services/notificationService.ts";
import { savePaperOpportunity } from "../src/lib/services/paperOpportunityStore.ts";
import { createPaperOpportunity } from "../src/lib/services/paperOpportunityMonitor.ts";

async function main() {
  console.log("[TEST-SIGNAL] Preparing high-conviction test signal...");

  const opp = createPaperOpportunity({
    instrumentType: "OPTION",
    underlying: "NIFTY",
    symbol: null,
    instrumentKey: "NSE_FO|NIFTY24200CE",
    optionType: "CE",
    strike: 24200,
    expiry: "2026-11-27",
    strategyType: "LONG_CALL",
    direction: "BULLISH",
    entry: 145.5,
    stop: 115.0,
    target1: 195.0,
    target2: 235.0,
    spotAtEntry: 24180.0,
    score: 92,
    confidence: 94,
    grade: "A+",
    reasons: [
      "15m Opening Range Breakout above VWAP with institutional surge",
      "Major Put writer support established at 24100-24150",
      "FII long positioning expansion confirmed in morning blocks",
    ],
    regime: "BULLISH_TREND",
    strategyVersion: "11.4",
    source: "LIVE",
    provenance: "LIVE_COLLECTOR",
  });

  savePaperOpportunity(opp);

  console.log(`[TEST-SIGNAL] Dispatching test signal (${opp.underlying} ${opp.strike} ${opp.optionType}, Grade: ${opp.grade}) to Telegram...`);
  const res = await notifyOpportunitySignal(opp, { underlying: "NIFTY", lotSize: 65 });
  console.log("[TEST-SIGNAL] Result:", res);
  if (res.telegram) {
    console.log("[TEST-SIGNAL] SUCCESS: Alert delivered to Telegram Admin DM and Group with [📌 Save & Track Option] button!");
  } else {
    console.error("[TEST-SIGNAL] FAILED to deliver to Telegram:", res.reason || res.error);
  }
}

main().catch(console.error);
