import { requireOperator } from "../../../lib/operatorSession.ts";
// Saved picks API. Stores user-selected picks in their own file. Never touches the recommendation journal.
export const dynamic = "force-dynamic";
import * as path from "node:path";
import {
  loadPicks,
  savePick,
  removePick,
  statusLabel,
  isPickCompleted,
  isIntradayPick,
  removeCompletedPicks,
  type PickInput,
} from "../../../lib/savedPicks.ts";

function picksFile(): string {
  return process.env.SAVED_PICKS_FILE || path.join(process.cwd(), ".data", "saved-picks", "picks.json");
}

export async function GET(req: Request) {
  const __refused = requireOperator(req);
  if (__refused) return __refused;
  const url = new URL(req.url);
  if (url.searchParams.get("cleanCompleted") === "true") {
    removeCompletedPicks(picksFile());
  }
  const picks = loadPicks(picksFile()).map((p) => ({
    ...p,
    statusLabel: statusLabel(p),
    isIntraday: isIntradayPick(p),
    isCompleted: isPickCompleted(p),
  }));
  return Response.json({ picks, note: "Research records. Unvalidated picks are not profitable signals." });
}

export async function POST(request: Request) {
  const __refused = requireOperator(request);
  if (__refused) return __refused;
  let body: PickInput;
  try { body = (await request.json()) as PickInput; } catch { return Response.json({ error: "invalid JSON" }, { status: 400 }); }
  const r = savePick(picksFile(), body);
  if ("duplicate" in r) return Response.json({ error: "already saved today", existing: { ...r.existing, statusLabel: statusLabel(r.existing) } }, { status: 409 });
  if (!r.ok) return Response.json({ error: "validation failed", details: r.errors }, { status: 422 });
  return Response.json({ pick: { ...r.pick, statusLabel: statusLabel(r.pick), isIntraday: isIntradayPick(r.pick), isCompleted: isPickCompleted(r.pick) } }, { status: 201 });
}

export async function DELETE(request: Request) {
  const __refused = requireOperator(request);
  if (__refused) return __refused;
  const url = new URL(request.url);
  if (url.searchParams.get("purgeCompleted") === "true") {
    const result = removeCompletedPicks(picksFile());
    return Response.json({
      purged: true,
      removedCount: result.removed.length,
      removedIds: result.removed.map((p) => p.id),
      remainingCount: result.remaining.length,
    });
  }
  const id = url.searchParams.get("id") ?? "";
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const ok = removePick(picksFile(), id);
  return ok ? Response.json({ deleted: id }) : Response.json({ error: "not found" }, { status: 404 });
}
