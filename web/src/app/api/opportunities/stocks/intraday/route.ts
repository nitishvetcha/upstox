export const dynamic = "force-dynamic";

import { scanStocks } from "@/lib/engine/stockOpportunityEngine";

export async function GET() {
  try {
    const result = await scanStocks("intraday");
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
