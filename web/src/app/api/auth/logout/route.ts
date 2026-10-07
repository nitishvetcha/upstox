export const dynamic = "force-dynamic";

import { clearToken } from "@/lib/services/upstoxAuth";

export async function POST() {
  await clearToken();
  return Response.json({ connected: false, tokenStatus: "MISSING" });
}
