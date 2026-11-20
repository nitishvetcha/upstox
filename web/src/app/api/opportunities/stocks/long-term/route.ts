export const dynamic = "force-dynamic";

import { scanLongTerm } from "@/lib/engine/longTermEngine";

export async function GET() {
  try {
    const result = await scanLongTerm();
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
