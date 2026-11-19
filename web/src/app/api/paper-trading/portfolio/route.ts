import { requireOperator } from "../../../../lib/operatorSession.ts";
import { NextResponse } from "next/server";
import { getPaperTradingEngine } from "@/lib/services/paperStore";
import { buildPaperLedgerReport, reconcileLedger } from "@/lib/paperReport";

export const dynamic = "force-dynamic";

// `data` is the portfolio summary (unchanged contract). `report` and `reconciliation` come from the same ledger,
// so the dashboard, this API and the report cannot disagree; reconciliation.ok=false would show if they did.
export async function GET(req: Request) {
  const refused = requireOperator(req);
  if (refused) return refused;
  const engine = getPaperTradingEngine();
  const summary = engine.getPortfolioSummary();
  const trades = engine.getTrades();
  return NextResponse.json({
    status: "success",
    data: summary,
    report: buildPaperLedgerReport(trades),
    reconciliation: reconcileLedger(trades, engine.getEvents()),
    persistError: engine.lastPersistError,
    mode: "PAPER",
  });
}
