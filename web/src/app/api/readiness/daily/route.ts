export const dynamic = "force-dynamic";

import { requireOperator } from "@/lib/operatorSession";
import { listPaperOpportunities } from "@/lib/services/paperOpportunityStore";
import { buildStrategyReadiness } from "@/lib/services/strategyReadiness";

// Compact daily evidence export for a scheduler, spreadsheet, or operator log.
// It deliberately reports only observed paper outcomes and never issues a trade instruction.
export async function GET(request: Request) {
  const refused = requireOperator(request);
  if (refused) return refused;
  const generatedAt = new Date();
  const strategies = buildStrategyReadiness(listPaperOpportunities());
  return Response.json({
    generatedAt: generatedAt.toISOString(),
    date: generatedAt.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
    realMoneyEligible: false,
    totalCompletedLivePaperTrades: strategies.reduce((sum, strategy) => sum + strategy.completedTrades, 0),
    strategies: strategies.map((strategy) => ({
      strategy: strategy.strategy,
      completedTrades: strategy.completedTrades,
      netR: strategy.netR,
      profitFactor: strategy.profitFactor,
      maxDrawdownR: strategy.maxDrawdownR,
      verdict: strategy.verdict,
      blockers: strategy.blockers,
    })),
  });
}
