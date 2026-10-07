export const dynamic = "force-dynamic";

import { getAllJournalEntries } from "@/lib/services/recommendationStore";
import { computeEvaluation } from "@/lib/evaluationEngine";
import type { EvaluationFilters } from "@/lib/evaluationEngine";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filters: EvaluationFilters = {};
    if (searchParams.get("strategyVersion")) filters.strategyVersion = searchParams.get("strategyVersion")!;
    if (searchParams.get("underlying")) filters.underlying = searchParams.get("underlying")!;
    if (searchParams.get("strategy")) filters.strategy = searchParams.get("strategy")!;
    if (searchParams.get("decision")) filters.decision = searchParams.get("decision")!;
    if (searchParams.get("regime")) filters.regime = searchParams.get("regime")!;
    if (searchParams.get("startDate")) filters.startDate = searchParams.get("startDate")!;
    if (searchParams.get("endDate")) filters.endDate = searchParams.get("endDate")!;
    if (searchParams.get("confidenceMin")) filters.confidenceMin = Number(searchParams.get("confidenceMin"));
    if (searchParams.get("confidenceMax")) filters.confidenceMax = Number(searchParams.get("confidenceMax"));

    const entries = getAllJournalEntries();
    const report = computeEvaluation(entries, filters);
    return Response.json(report);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
