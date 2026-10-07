export const dynamic = "force-dynamic";

import { equityMaster, searchInstruments } from "@/lib/services/stockService";

// GET /api/stocks/search?q=REL — NSE equities + NIFTY/BANKNIFTY indices.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const { list, source } = await equityMaster();
  return Response.json({ query: q, source, results: searchInstruments(list, q) });
}
