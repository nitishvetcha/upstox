import { allNews, eventSummary } from "@/lib/services/newsApi";

export async function GET() {
  return Response.json({ indices: (await allNews()).map(eventSummary) });
}
