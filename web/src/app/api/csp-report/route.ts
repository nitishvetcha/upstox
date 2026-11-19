// LOCAL-ONLY CSP report receiver (report-only validation). Refuses non-loopback hosts, bounds the body, stores
// only aggregate counts by category in memory, and never persists or echoes report contents.
import { parseCspReport, isLocalHost, MAX_REPORT_BYTES } from "../../../lib/cspReport.ts";
import { requireOperator } from "../../../lib/operatorSession.ts";

export const dynamic = "force-dynamic";

const counts = new Map<string, number>();
const MAX_KEYS = 200;

export async function POST(req: Request) {
  if (!isLocalHost(req.headers.get("host"))) return new Response(null, { status: 403 });
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_REPORT_BYTES) return new Response(null, { status: 413 });
  const text = await req.text();
  const parsed = parseCspReport(text);
  if (!parsed.ok) return new Response(null, { status: parsed.reason === "TOO_LARGE" ? 413 : 400 });
  const key = `${parsed.summary.directive}|${parsed.summary.blockedScheme}|${parsed.summary.blockedHost}`;
  if (counts.has(key) || counts.size < MAX_KEYS) counts.set(key, (counts.get(key) ?? 0) + 1);
  return new Response(null, { status: 204 });
}

// Aggregate view for the isolated run only (local host guard applies, and an operator session is required).
export async function GET(req: Request) {
  const refused = requireOperator(req);
  if (refused) return refused;
  if (!isLocalHost(req.headers.get("host"))) return new Response(null, { status: 403 });
  return Response.json({ violations: Object.fromEntries(counts) });
}
