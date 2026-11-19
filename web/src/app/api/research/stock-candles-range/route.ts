export const dynamic = "force-dynamic";

// GET /api/research/stock-candles-range?instrumentKey={NSE_EQ|...}&from=YYYY-MM-DD&to=YYYY-MM-DD
// Research-only, read-only. Returns 1-min historical candles for a single equity over a date range.
// Chunks the request automatically (Upstox V3 limit: ≤28 calendar days per 1-min request).
// Never refreshes OAuth, never exposes the token.

import { get } from "@/lib/services/upstoxMarket";
import { getAccessToken } from "@/lib/services/upstoxAuth";
import { isIsoDate, isNseEqKey, planChunks } from "@/lib/research/stockCandleRequest";

const RATE_DELAY_MS = 150; // 130 ms enforced inside upstoxMarket.get; add a small buffer here too

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const instrumentKey = sp.get("instrumentKey") ?? "";
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";

  if (!isNseEqKey(instrumentKey)) {
    return Response.json({ error: "invalid instrumentKey: must match NSE_EQ|{ISIN}" }, { status: 400 });
  }
  if (!isIsoDate(from) || !isIsoDate(to)) {
    return Response.json({ error: "from and to must be YYYY-MM-DD" }, { status: 400 });
  }
  if (from > to) {
    return Response.json({ error: "from must be <= to" }, { status: 400 });
  }

  const token = await getAccessToken();
  if (!token) {
    return Response.json({ error: "UPSTOX_NOT_CONNECTED: no active session" }, { status: 401 });
  }

  const encoded = encodeURIComponent(instrumentKey);
  const chunks = planChunks(from, to);
  const allCandles: unknown[] = [];
  const failedChunks: { from: string; to: string; error: string }[] = [];

  for (const chunk of chunks) {
    try {
      // ponytail: "nifty" index ctx is a required arg by get(); drives structured logging only.
      const data = await get(token, `/v3/historical-candle/${encoded}/minutes/1/${chunk.to}/${chunk.from}`, {}, { index: "nifty" });
      const raw = (data as { candles?: unknown }).candles;
      if (Array.isArray(raw)) allCandles.push(...raw);
    } catch (err) {
      const e = err as { reason?: string; message?: string };
      failedChunks.push({ from: chunk.from, to: chunk.to, error: e.reason ?? e.message ?? "unknown" });
    }
    if (chunks.length > 1) await new Promise((r) => setTimeout(r, RATE_DELAY_MS));
  }

  return Response.json({
    instrumentKey,
    from,
    to,
    chunks: chunks.length,
    failedChunks,
    candleCount: allCandles.length,
    candles: allCandles,
  });
}
