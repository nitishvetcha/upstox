import { getDashboard } from "@/lib/services/market";

export async function GET() {
  const { today, generatedAt } = await getDashboard();
  return Response.json({ generatedAt, recommendation: today });
}
