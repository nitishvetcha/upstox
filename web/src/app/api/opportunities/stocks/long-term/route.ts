export const dynamic = "force-dynamic";

import { scanLongTerm, NO_FUNDAMENTAL_PROVIDER } from "@/lib/engine/longTermEngine";

export async function GET() {
  try {
    const result = await scanLongTerm(NO_FUNDAMENTAL_PROVIDER);
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
