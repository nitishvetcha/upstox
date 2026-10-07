import { DEFAULT_RISK_CONFIG } from "@/lib/services/risk/riskConfig";

export async function GET() {
  return Response.json({
    config: DEFAULT_RISK_CONFIG,
    label: "Configured Risk Parameters",
    note: "No live account balance connected. Configured parameters are server-side risk limits.",
  });
}
