// npm run dev:upstox — start the app, make sure Upstox is connected (opening the login page once if needed),
// then print one live evaluation of NIFTY and BANK NIFTY. Read-only: no orders, ever.
import { spawn } from "node:child_process";
import { BASE, LINE, LOGIN_URL, PORT, fmtExpiry, getJson, openBrowser, printLiveSummary, serverUp, waitForLogin, waitForServer } from "./upstox-cli.mjs";

console.log(`${LINE}\nOPTIONS ANALYZER\n${LINE}\n`);

let child = null;
if (await serverUp()) {
  console.log(`Server already running at ${BASE} — attaching.`);
} else {
  console.log("Starting Options Analyzer...");
  child = spawn("npx", ["next", "dev", "-p", PORT], { stdio: "inherit", env: process.env });
  const stop = () => child?.kill("SIGINT");
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  child.on("exit", (code) => process.exit(code ?? 0));
  if (!(await waitForServer())) {
    console.log("Server did not start within 3 minutes.");
    stop();
    process.exit(1);
  }
}
console.log(`\nServer:\n${BASE}\n\nChecking Upstox...`);

let status = await getJson("/api/auth/status?verify=1").catch((e) => ({ error: e.message }));
if (status.error) {
  console.log(`[AUTH] Status check failed: ${status.error}`);
} else if (status.connected) {
  console.log(`[AUTH] Upstox connected · token VALID · expires ${fmtExpiry(status.expiresAt)}`);
} else {
  console.log(`[AUTH] ${status.tokenStatus === "MISSING" ? "Not connected" : `Session ${status.tokenStatus.toLowerCase()}`}`);
  console.log("[AUTH] Opening Upstox login...\n\nComplete login in your browser.\n");
  openBrowser(LOGIN_URL); // once per startup; never re-opened by the poll below
  status = await waitForLogin();
  if (!status) {
    console.log(`[AUTH] Login not completed within 15 minutes. Retry with: npm run upstox:login  (or open ${LOGIN_URL})`);
  } else {
    console.log(`\n[AUTH] Upstox connected · token VALID · expires ${fmtExpiry(status.expiresAt)}`);
  }
}

if (status?.connected) {
  console.log("");
  await printLiveSummary();
}
console.log(`\nOpen:\n${BASE}\n${LINE}`);
if (!child) process.exit(0);
