export const dynamic = "force-dynamic";

import { upstoxHistoricalOptions } from "@/lib/adapters/upstoxHistoricalOptionsAdapter";
import { buildPhase12Report } from "@/lib/historicalOptionsDataset";

/**
 * GET /api/historical-options/data-quality
 *
 * Performs a live capability audit against the Upstox account and returns
 * the Phase 12 data quality report. Read-only. 0 order endpoints.
 */
export async function GET() {
  const providerReport = await upstoxHistoricalOptions.getAvailability();
  // No observations yet — provider is audited, dataset is empty until Plus plan confirmed
  const report = buildPhase12Report(providerReport, [], null);
  return Response.json(report);
}
