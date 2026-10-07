export const dynamic = "force-dynamic";

import { getAllBacktestRuns } from "@/lib/services/backtestStore";
import { getAllJournalEntries } from "@/lib/services/recommendationStore";
import { getAllWalkForwardRuns } from "@/lib/services/walkForwardStore";
import { computeStrategyEvidence } from "@/lib/strategyEvidenceEngine";

export async function GET() {
  const report = computeStrategyEvidence(
    getAllBacktestRuns(),
    getAllJournalEntries(),
    getAllWalkForwardRuns(),
  );
  return Response.json(report);
}
