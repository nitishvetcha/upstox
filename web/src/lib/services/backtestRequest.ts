import { NextResponse } from "next/server";
import { upstoxChunkFetcher } from "./upstoxMarket";
import { getAccessToken } from "./upstoxAuth";
import { configFromBody, dataModelFromBody, loadBacktestInputs } from "./backtestInputs";

// Shared by run / scenarios / compare: real chunked Upstox history only (no mock candles).
export async function backtestInputs(request: Request) {
  const body = await request.json().catch(() => ({}));
  const config = configFromBody(body);
  const token = await getAccessToken();
  if (!token) return { error: NextResponse.json({ status: "error", message: "Upstox not connected: historical candles unavailable (no mock candles are generated)" }, { status: 503 }) } as const;
  const inputs = await loadBacktestInputs(config, upstoxChunkFetcher(token), dataModelFromBody(body));
  if (!inputs.candles.length) return { error: NextResponse.json({ status: "error", message: "Historical candles unavailable from Upstox", coverage: inputs.meta.coverage }, { status: 503 }) } as const;
  return { config, ...inputs } as const;
}

