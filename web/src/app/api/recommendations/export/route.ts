export const dynamic = "force-dynamic";

import { getAllJournalEntries } from "@/lib/services/recommendationStore";

const csvHeader = [
  "recommendationId", "timestamp", "underlying", "decision", "strategy",
  "instrumentKey", "strike", "optionType", "expiry",
  "entry", "stopLoss", "target1", "target2", "quantity", "risk", "rr",
  "score", "confidence", "status", "exitPrice", "exitReason",
  "pnl", "rMultiple", "mfe", "mae", "duration",
].join(",");

function esc(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET() {
  try {
    const entries = getAllJournalEntries();
    const rows = entries.map((e) => {
      const r = e.snapshot;
      const ex = r.execution;
      const o = e.outcome;
      return [
        r.recommendationId, r.generatedAt, r.underlying, r.decision, r.strategy,
        r.contract?.instrumentKey ?? "", r.contract?.strike ?? "", r.contract?.optionType ?? "", r.contract?.expiry ?? "",
        ex?.entry ?? "", ex?.stopLoss ?? "", ex?.target1 ?? "", ex?.target2 ?? "", ex?.quantity ?? "", ex?.plannedRisk ?? "", ex?.rrTarget1 ?? "",
        r.score.total, r.confidence, e.status, o?.exitPrice ?? "", o?.exitReason ?? "",
        o?.pnl ?? "", o?.rMultiple ?? "", o?.mfe ?? "", o?.mae ?? "", o?.durationMinutes ?? "",
      ].map(esc).join(",");
    });

    const csv = [csvHeader, ...rows].join("\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="recommendations-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
