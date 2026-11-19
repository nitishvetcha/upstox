import { isOptionQuoteCanaryEnabled } from "../../../lib/services/optionContractLTT.ts";
import { runPassiveCanarySample } from "../../../lib/services/optionQuoteCanary.ts";
import { getAccessToken, verifyCurrentCredential } from "../../../lib/services/upstoxAuth.ts";
import { getSnapshot } from "../../../lib/services/market.ts";
import type { IndexId, Snapshot } from "../../../lib/types.ts";
import { timingSafeEqual } from "node:crypto";

export interface OptionsCanaryRouteDeps {
  getSecret?: () => string | undefined;
  isCanaryEnabled?: () => boolean;
  getTokenStatus?: () => Promise<{ status: string }>;
  getAccessToken?: () => Promise<string | null>;
  getSnapshot?: (index: IndexId) => Promise<Pick<Snapshot, "chain" | "spot">>;
  runCanarySample?: typeof runPassiveCanarySample;
}

export async function handleOptionsCanaryRequest(
  req: Request,
  deps: OptionsCanaryRouteDeps = {},
) {
  // 1. Authorization configuration guard: fail closed if CANARY_AUTH_SECRET is missing or empty
  const secret = deps.getSecret ? deps.getSecret() : process.env.CANARY_AUTH_SECRET;
  if (!secret || secret.trim() === "") {
    return Response.json(
      { error: "AUTH_NOT_CONFIGURED", message: "Server-side canary authorization secret is not configured." },
      { status: 500 },
    );
  }

  // 2. Request authorization guard: verify Bearer token matches configured secret in constant time
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return Response.json(
      { error: "UNAUTHORIZED", message: "Missing or invalid authorization header." },
      { status: 401 },
    );
  }

  const token = authHeader.slice(7).trim();
  const tokenBuf = Buffer.from(token, "utf8");
  const secretBuf = Buffer.from(secret, "utf8");
  if (tokenBuf.length !== secretBuf.length || !timingSafeEqual(tokenBuf, secretBuf)) {
    return Response.json(
      { error: "UNAUTHORIZED", message: "Invalid authorization token." },
      { status: 401 },
    );
  }

  // 3. Operational enable flag guard: check OPTION_QUOTE_CANARY_ENABLED
  const isEnabled = deps.isCanaryEnabled ? deps.isCanaryEnabled() : isOptionQuoteCanaryEnabled();
  if (!isEnabled) {
    return Response.json(
      { error: "CANARY_DISABLED", message: "Passive canary execution is currently disabled in configuration." },
      { status: 403 },
    );
  }

  // 4. Session authentication check: check Upstox token validity
  const getStatus = deps.getTokenStatus ? deps.getTokenStatus : async () => (await verifyCurrentCredential());
  const currentTokenStatus = await getStatus();

  if (currentTokenStatus.status !== "VERIFIED_CONNECTED") {
    return Response.json(
      { error: "AUTH_INVALID", message: `Upstox token status is ${currentTokenStatus.status}. Valid session required.` },
      { status: 401 },
    );
  }

  const fetchToken = deps.getAccessToken ? deps.getAccessToken : getAccessToken;
  const upstoxToken = await fetchToken();
  if (!upstoxToken) {
    return Response.json(
      { error: "TOKEN_MISSING", message: "No active Upstox access token available." },
      { status: 401 },
    );
  }

  // 5. Query execution: parse index and optional sample size
  const url = new URL(req.url);
  const indexParam = (url.searchParams.get("index") || "nifty").toLowerCase();
  const maxSamplesParam = parseInt(url.searchParams.get("maxSamples") || "6", 10);
  const maxSamples = isNaN(maxSamplesParam) ? 6 : Math.max(1, Math.min(maxSamplesParam, 20));

  if (indexParam !== "nifty" && indexParam !== "banknifty") {
    return Response.json(
      { error: "INVALID_INDEX", message: `Unsupported index: ${indexParam}. Supported: nifty, banknifty.` },
      { status: 400 },
    );
  }

  const index = indexParam as IndexId;

  try {
    const fetchSnapshot = deps.getSnapshot ? deps.getSnapshot : getSnapshot;
    const snapshot = await fetchSnapshot(index);

    if (!snapshot || !snapshot.chain || snapshot.chain.length === 0) {
      return Response.json(
        { error: "SNAPSHOT_UNAVAILABLE", message: `No active option chain available for ${index}.` },
        { status: 503 },
      );
    }

    const runner = deps.runCanarySample ? deps.runCanarySample : runPassiveCanarySample;
    const result = await runner(
      snapshot.chain,
      snapshot.spot,
      index,
      upstoxToken,
      new Date(),
    );
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: "CANARY_FAILED", message: (err as Error).message },
      { status: 500 },
    );
  }
}
