export const dynamic = "force-dynamic";

import { getAllBacktestRuns } from "@/lib/services/backtestStore";
import { getAllJournalEntries } from "@/lib/services/recommendationStore";
import { getAllWalkForwardRuns } from "@/lib/services/walkForwardStore";
import { computeStrategyEvidence } from "@/lib/strategyEvidenceEngine";

export async function GET() {
  const r = computeStrategyEvidence(
    getAllBacktestRuns(),
    getAllJournalEntries(),
    getAllWalkForwardRuns(),
  );

  const rows: string[][] = [];
  rows.push([
    "generatedAt",
    "strategyVersion",
    "finalDecision",
    "storedBacktests",
    "walkForwardCompleted",
    "oosWindows",
    "positiveOOSWindows",
    "negativeOOSWindows",
    "liveObservations",
    "liveTrades",
    "liveCompletedTrades",
    "liveEvidenceStatus",
    "sampleAdequacy",
    "nifty_closeOnly_trades",
    "nifty_closeOnly_winRate",
    "nifty_closeOnly_netPnl",
    "nifty_closeOnly_profitFactor",
    "nifty_closeOnly_maxDD",
    "nifty_intrabar_trades",
    "nifty_intrabar_winRate",
    "nifty_intrabar_netPnl",
    "nifty_intrabar_profitFactor",
    "nifty_intrabar_maxDD",
    "bank_closeOnly_trades",
    "bank_closeOnly_winRate",
    "bank_closeOnly_netPnl",
    "bank_closeOnly_profitFactor",
    "bank_closeOnly_maxDD",
    "bank_intrabar_trades",
    "bank_intrabar_winRate",
    "bank_intrabar_netPnl",
    "bank_intrabar_profitFactor",
    "bank_intrabar_maxDD",
    "niftyExecution_classification",
    "bankExecution_classification",
    "slippageRobustLabel",
    "costRobustnessLabel",
    "maxDrawdownPct",
    "datasetMode",
    "finalRationale",
  ]);

  const n = r.niftyCloseOnly;
  const ni = r.niftyIntrabar;
  const b = r.bankCloseOnly;
  const bi = r.bankIntrabar;

  rows.push([
    r.generatedAt,
    r.strategyVersion,
    r.finalDecision,
    String(r.storedBacktests.length),
    String(r.walkForwardCompleted),
    String(r.oosWindows.length),
    String(r.positiveOOSWindows),
    String(r.negativeOOSWindows),
    String(r.liveObservations),
    String(r.liveTrades),
    String(r.liveCompletedTrades),
    r.liveEvidenceStatus,
    r.sampleAdequacy,
    n ? String(n.trades) : "",
    n ? String(n.winRate) : "",
    n ? String(n.netPnl) : "",
    n ? String(n.profitFactor ?? "") : "",
    n ? String(n.maxDrawdownPct) : "",
    ni ? String(ni.trades) : "",
    ni ? String(ni.winRate) : "",
    ni ? String(ni.netPnl) : "",
    ni ? String(ni.profitFactor ?? "") : "",
    ni ? String(ni.maxDrawdownPct) : "",
    b ? String(b.trades) : "",
    b ? String(b.winRate) : "",
    b ? String(b.netPnl) : "",
    b ? String(b.profitFactor ?? "") : "",
    b ? String(b.maxDrawdownPct) : "",
    bi ? String(bi.trades) : "",
    bi ? String(bi.winRate) : "",
    bi ? String(bi.netPnl) : "",
    bi ? String(bi.profitFactor ?? "") : "",
    bi ? String(bi.maxDrawdownPct) : "",
    r.niftyExecution.classification,
    r.bankExecution.classification,
    r.slippageRobustLabel,
    r.costRobustnessLabel,
    r.maxDrawdownPct !== null ? String(r.maxDrawdownPct) : "",
    r.datasetMode,
    `"${r.finalRationale.replace(/"/g, '""')}"`,
  ]);

  const csv = rows.map((row) => row.join(",")).join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="strategy-evidence-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
