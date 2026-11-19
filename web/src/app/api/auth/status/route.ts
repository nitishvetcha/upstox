export const dynamic = "force-dynamic";

import { tokenStatus, verifyCurrentCredential } from "../../../../lib/services/upstoxAuth.ts";
import { providerMode } from "../../../../lib/services/market.ts";

// Connection state only: never the token, client id or secret. `connected` is true only after a verification request
// succeeded. Verification is opt-in: pass ?verify=1 to make one read-only quote request. Without it, a configured
// credential reports CONFIGURED_UNVERIFIED and connected:false.
export async function GET(req: Request) {
  const verify = new URL(req.url).searchParams.get("verify") === "1";
  const r = verify ? await verifyCurrentCredential() : { ...(await tokenStatus()), connection: null };
  const connected = r.status === "VERIFIED_CONNECTED";
  return Response.json({
    provider: "UPSTOX",
    connected,
    tokenStatus: r.status,
    credentialSource: r.source,
    verificationRequested: verify,
    expiresAt: r.expiresAt,
    loginRequired: r.status === "MISSING" || r.status === "EXPIRED" || r.status === "INVALID" || r.status === "UNKNOWN",
    connection: r.connection,
    marketDataProvider: providerMode() === "upstox" ? (connected ? "UPSTOX" : "MOCK (not connected)") : "MOCK",
  });
}
