export const dynamic = "force-dynamic";

import { getAccessToken, tokenStatus, verifyConnection } from "@/lib/services/upstoxAuth";
import { providerMode } from "@/lib/services/market";

// Connection state only: never the token, client id or secret. ?verify=1 adds one read-only quote check.
export async function GET(req: Request) {
  const { status, expiresAt } = await tokenStatus();
  const verify = new URL(req.url).searchParams.get("verify") === "1";
  const token = status === "VALID" && verify ? await getAccessToken() : null;
  const connection = token ? await verifyConnection(token) : null;
  const connected = status === "VALID" && (connection === null || connection === "UPSTOX_CONNECTED");
  return Response.json({
    provider: "UPSTOX",
    connected,
    tokenStatus: connection === "UPSTOX_AUTH_EXPIRED" ? "INVALID" : status,
    expiresAt,
    loginRequired: !connected,
    connection,
    marketDataProvider: providerMode() === "upstox" ? (connected ? "UPSTOX" : "MOCK (not connected)") : "MOCK",
  });
}
