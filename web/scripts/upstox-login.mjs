// npm run upstox:login — with the dev server running, open the Upstox login once and wait for the callback.
import { BASE, LOGIN_URL, fmtExpiry, openBrowser, serverUp, waitForLogin } from "./upstox-cli.mjs";

if (!(await serverUp())) {
  console.log(`Server is not running at ${BASE}. Start it with: npm run dev:upstox`);
  process.exit(1);
}
console.log("Opening Upstox authentication...");
openBrowser(LOGIN_URL);
const s = await waitForLogin();
if (!s) {
  console.log(`[FAIL] Login not completed within 15 minutes. Open ${LOGIN_URL} to retry.`);
  process.exit(1);
}
console.log("[OK] Login completed");
console.log("[OK] Token stored (server-side)");
console.log(`[OK] Live API verified (${s.connection ?? "UPSTOX_CONNECTED"})`);
console.log(`\nUpstox is ready. Session expires ${fmtExpiry(s.expiresAt)}.`);
