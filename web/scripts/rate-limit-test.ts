// Rate-limit and endpoint-limit test: CLI wrapper. PREPARED, NOT RUN. Specification: docs/phase0/RATE_LIMIT_TEST_EXECUTION_SPEC.md
// Runs only with RATE_LIMIT_TEST_APPROVED=yes. Exactly the 35-request plan in src/lib/rateLimitTest/runner.ts.
// Zero retries. Stops on any stop condition. Refuses to reuse its output directory.
import fs from "node:fs";
import path from "node:path";
import { assertCollectionAuthorized } from "./lib/collectionGuard.mjs";
assertCollectionAuthorized("rate-limit-test.ts", "upstox");
import { UPSTOX_API_BASE } from "../src/lib/services/upstoxEndpoints.ts";
import { plannedRequests, runRateLimitTest } from "../src/lib/rateLimitTest/runner.ts";

if (process.env.RATE_LIMIT_TEST_APPROVED !== "yes") {
  console.log("NOT RUN: RATE_LIMIT_TEST_APPROVED=yes is not set. No request made.");
  process.exit(0);
}

const tokenFile = path.join(process.cwd(), ".data", "upstox-token.json");
const stored = JSON.parse(fs.readFileSync(tokenFile, "utf8")) as { accessToken?: string; expiresAt?: string; invalidatedAt?: string | null };
const usable = Boolean(stored.accessToken) && !stored.invalidatedAt && Date.parse(stored.expiresAt ?? "") > Date.now();

const send = async (p: string, headers: Record<string, string>) => {
  const res = await fetch(`${UPSTOX_API_BASE}${p}`, { headers, cache: "no-store" });
  const out: Record<string, string> = {};
  res.headers.forEach((v, k) => { out[k] = v; });
  return { status: res.status, headers: out, body: await res.text() };
};

const summary = await runRateLimitTest({
  requests: plannedRequests(),
  send,
  token: stored.accessToken ?? "",
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => new Date().toISOString(),
  outDir: path.join(process.cwd(), ".research-data", "rate-limit-test"),
  tokenUsable: usable,
});
console.log(JSON.stringify({ requestsSent: summary.requestsSent, stopped: summary.stopped, stopReason: summary.stopReason }, null, 2));
