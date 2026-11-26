export const dynamic = "force-dynamic";

import { handleSwingScan } from "./swingScanHandler.ts";

export async function POST(request: Request): Promise<Response> {
  return handleSwingScan(request);
}
