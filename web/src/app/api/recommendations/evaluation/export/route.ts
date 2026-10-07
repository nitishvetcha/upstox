export const dynamic = "force-dynamic";

import { getAllJournalEntries } from "@/lib/services/recommendationStore";
import { computeEvaluation } from "@/lib/evaluationEngine";

export async function GET() {
  try {
    const entries = getAllJournalEntries();
    const report = computeEvaluation(entries);
    const p = report.performance;

    const headers = [
      "strategyVersion", "sampleSize", "completedTrades", "wins", "losses",
      "winRate", "winRateCI_lower", "winRateCI_upper",
      "averageWin", "averageLoss", "expectancyPnl", "expectancyR",
      "averageR", "medianR", "stdR", "profitFactor",
      "netPnl", "grossProfit", "grossLoss",
      "maxDrawdown", "maxDrawdownPct",
      "sharpe", "sortino", "calmar",
      "maxConsecWins", "maxConsecLosses",
      "largestWin", "largestLoss",
      "evidenceClassification", "status",
    ];

    const row = [
      report.strategyVersion,
      report.dataQuality.totalRecords,
      p.n,
      p.wins,
      p.losses,
      p.winRate ?? "",
      p.winRateCI?.lower ?? "",
      p.winRateCI?.upper ?? "",
      p.avgWin ?? "",
      p.avgLoss ?? "",
      p.expectancyPnl ?? "",
      p.expectancyR ?? "",
      p.avgR ?? "",
      p.medianR ?? "",
      p.stdR ?? "",
      p.profitFactor ?? "",
      p.netPnl ?? "",
      p.grossProfit ?? "",
      p.grossLoss ?? "",
      p.drawdown.maxDrawdown ?? "",
      p.drawdown.maxDrawdownPct ?? "",
      p.sharpe ?? "",
      p.sortino ?? "",
      p.calmar ?? "",
      p.maxConsecWins,
      p.maxConsecLosses,
      p.largestWin ?? "",
      p.largestLoss ?? "",
      report.evidenceClassification,
      report.status,
    ];

    const csv = [headers.join(","), row.join(",")].join("\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="evaluation-${report.strategyVersion}-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
