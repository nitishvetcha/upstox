export const dynamic = "force-dynamic";

import { handleStockScan } from "./stockScanHandler.ts";

export async function POST(request: Request): Promise<Response> {
  return handleStockScan(request);
}
