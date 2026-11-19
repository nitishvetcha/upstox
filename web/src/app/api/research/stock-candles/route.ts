export const dynamic = "force-dynamic";

// GET /api/research/stock-candles?instrumentKey={NSE_EQ|...}&interval=1
// Research-only, read-only. Returns 1-min intraday candles for a single NIFTY 50 equity.
// Never refreshes OAuth, never exposes the token, never accepts arbitrary upstream URLs.

import { get } from "@/lib/services/upstoxMarket";
import { getAccessToken } from "@/lib/services/upstoxAuth";
import { isNseEqKey } from "@/lib/research/stockCandleRequest";

const SUPPORTED_INTERVAL = "1";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const instrumentKey = sp.get("instrumentKey") ?? "";
  const interval = sp.get("interval") ?? "";

  if (!isNseEqKey(instrumentKey)) {
    return Response.json({ error: "invalid instrumentKey: must match NSE_EQ|{ISIN}" }, { status: 400 });
  }
  if (interval !== SUPPORTED_INTERVAL) {
    return Response.json({ error: `unsupported interval: only interval=1 (1-minute) is supported` }, { status: 400 });
  }

  const token = await getAccessToken();
  if (!token) {
    return Response.json({ error: "UPSTOX_NOT_CONNECTED: no active session" }, { status: 401 });
  }

  try {
    const encoded = encodeURIComponent(instrumentKey);
    // ponytail: "nifty" index ctx is a required arg by get(); it drives structured logging only, not the request path.
    const data = await get(token, `/v3/historical-candle/intraday/${encoded}/minutes/1`, {}, { index: "nifty" });
    return Response.json({ candles: (data as { candles?: unknown }).candles ?? data });
  } catch (err) {
    const e = err as { reason?: string; status?: number; message?: string };
    const status = e.status === 429 ? 429 : e.status === 401 ? 401 : 502;
    return Response.json({ error: e.reason ?? e.message ?? "upstream error" }, { status });
  }
}
