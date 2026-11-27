export const dynamic = "force-dynamic";

// Opens a stored paper opportunity. The opportunity's stored price is never used as an execution price.
import { requireOperator } from "../../../../../lib/operatorSession.ts";
import { runOpenFlow } from "@/lib/services/paperOpportunityOpenFlow";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const refused = requireOperator(req);
  if (refused) return refused;
  const { id } = await params;
  return runOpenFlow(id);
}
