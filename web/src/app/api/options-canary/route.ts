export const dynamic = "force-dynamic";

import { handleOptionsCanaryRequest } from "./canaryHandler.ts";

export async function GET(req: Request) {
  return handleOptionsCanaryRequest(req);
}
