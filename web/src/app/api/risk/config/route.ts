import { DEFAULT_RISK_CONFIG } from "@/lib/services/risk/riskConfig";
import { requireOperator } from "../../../../lib/operatorSession.ts";

// Shows the account capital and risk limits, so it needs an operator session (no UI or script reads it today).
export async function GET(req: Request) {
  const refused = requireOperator(req);
  if (refused) return refused;
  return Response.json({
    config: DEFAULT_RISK_CONFIG,
    label: "Configured Risk Parameters",
    note: "No live account balance connected. Configured parameters are server-side risk limits.",
  });
}
