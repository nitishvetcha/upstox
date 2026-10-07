export const dynamic = "force-dynamic";

import { getSnapshot } from "@/lib/services/market";
import { analyze } from "@/lib/engine/strategy";
import { diagnose } from "@/lib/recommendationDiagnostic";

// GET /api/recommendations/diagnostic?underlying=NIFTY|BANKNIFTY — read-only; nothing is journaled.
export async function GET(req: Request) {
  const u = new URL(req.url).searchParams.get("underlying")?.toUpperCase() ?? "NIFTY";
  if (u !== "NIFTY" && u !== "BANKNIFTY") return Response.json({ error: "underlying must be NIFTY or BANKNIFTY" }, { status: 400 });
  try {
    const now = new Date();
    const analysis = analyze(await getSnapshot(u === "NIFTY" ? "nifty" : "banknifty"), now);
    return Response.json(diagnose(analysis, now));
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
