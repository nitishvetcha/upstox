import { getSnapshot } from "@/lib/services/market";
import { INDICES } from "@/lib/services/instrumentRegistry";

export async function GET() {
  const snapshots = await Promise.all(INDICES.map((id) => getSnapshot(id)));
  const breadthData = snapshots.map((s) => s.breadth);
  return Response.json({
    indices: breadthData,
    generatedAt: new Date().toISOString(),
  });
}
