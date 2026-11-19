export const dynamic = "force-dynamic";

import { getSnapshot } from "@/lib/services/market";
import { analyze } from "@/lib/engine/strategy";
import { diagnose } from "@/lib/recommendationDiagnostic";
import { INSTRUMENTS, INDICES } from "@/lib/services/instrumentRegistry";
import type { IndexId } from "@/lib/types";

// GET /api/recommendations/diagnostic?underlying=NIFTY|BANKNIFTY|FINNIFTY|... — read-only; nothing is journaled.
export async function GET(req: Request) {
  const u = new URL(req.url).searchParams.get("underlying")?.toUpperCase() ?? "NIFTY";
  const indexId = INDICES.find((id) => INSTRUMENTS[id].symbol === u) as IndexId | undefined;
  if (!indexId) return Response.json({ error: `unknown underlying: ${u}` }, { status: 400 });
  try {
    const now = new Date();
    const analysis = analyze(await getSnapshot(indexId), now);
    return Response.json(diagnose(analysis, now));
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
