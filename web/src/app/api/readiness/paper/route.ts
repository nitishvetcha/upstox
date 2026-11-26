export const dynamic = "force-dynamic";

import { requireOperator } from "@/lib/operatorSession";
import { listPaperOpportunities } from "@/lib/services/paperOpportunityStore";
import { buildStrategyReadiness, PAPER_READINESS_REQUIREMENTS } from "@/lib/services/strategyReadiness";
import { mcxContractHealth } from "@/lib/services/mcxContractHealth";
import { warmMcxContractCache } from "@/lib/services/mcxContractResolver";
import { getAccessToken } from "@/lib/services/upstoxAuth";
import { getPaperTradingEngine } from "@/lib/services/paperStore";

// Read-only operator report. It cannot place orders or mark a strategy ready
// for real money; see `realMoneyEligible: false` on every returned strategy.
export async function GET(request: Request) {
  const refused = requireOperator(request);
  if (refused) return refused;
  return Response.json({
    generatedAt: new Date().toISOString(),
    requirements: PAPER_READINESS_REQUIREMENTS,
    strategies: buildStrategyReadiness(listPaperOpportunities(), {
      costedTrades: getPaperTradingEngine().getTrades(),
      requireCostedLedger: true,
    }),
    mcxContractHealth: mcxContractHealth(),
    disclaimer: "Readiness counts only closed, costed UPSTOX_LIVE ledger trades. Live-paper evidence is research only and does not authorize real-money trading.",
  });
}
