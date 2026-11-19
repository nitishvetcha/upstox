import { spawn } from "node:child_process";
import * as http from "node:http";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as fs from "node:fs";
import { healthRecord, isSupervisorReady } from "./runner-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDir = path.resolve(__dirname, "..");

process.chdir(webDir);
process.env.PORT = process.env.PORT ?? "3123";

export function checkServerStatus(port = process.env.PORT ?? "3123") {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/api/auth/status?verify=1`, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        try {
          const json = JSON.parse(body);
          resolve({
            httpOk: res.statusCode === 200,
            connected: Boolean(json.connected),
            tokenStatus: json.tokenStatus ?? "UNKNOWN",
          });
        } catch {
          resolve({
            httpOk: res.statusCode === 200,
            connected: false,
            tokenStatus: "MALFORMED_JSON",
          });
        }
      });
    });
    req.on("error", () => resolve({ httpOk: false, connected: false, tokenStatus: "UNREACHABLE" }));
    req.setTimeout(3000, () => {
      req.destroy();
      resolve({ httpOk: false, connected: false, tokenStatus: "TIMEOUT" });
    });
  });
}

async function main() {
  console.log(`[${new Date().toISOString()}] [SUPERVISOR] Starting Paper Supervisor (PID ${process.pid})...`);
  // Keep the Mac from idle-sleeping mid-session (system sleep is 1 min). caffeinate -w exits with this process.
  if (process.platform === "darwin") {
    spawn("/usr/bin/caffeinate", ["-i", "-w", String(process.pid)], { stdio: "ignore", detached: true }).unref();
    console.log(`[${new Date().toISOString()}] [SUPERVISOR] Idle-sleep prevention active for PID ${process.pid}.`);
  }

  let serverStatus = await checkServerStatus();
  let serverProcess = null;

  if (!serverStatus.httpOk) {
    console.log(`[${new Date().toISOString()}] [SUPERVISOR] Next.js server not running on port ${process.env.PORT}. Starting server...`);
    serverProcess = spawn(process.execPath, [path.join(webDir, "node_modules", "next", "dist", "bin", "next"), "start", "-p", process.env.PORT], {
      cwd: webDir,
      stdio: "inherit",
      env: process.env,
    });

    serverProcess.on("exit", (code) => {
      console.log(`[${new Date().toISOString()}] [SUPERVISOR] Next.js server exited with code ${code}`);
    });

    // Wait for server health
    let healthy = false;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      serverStatus = await checkServerStatus();
      if (serverStatus.httpOk) {
        healthy = true;
        break;
      }
    }

    if (!healthy) {
      console.error(`[${new Date().toISOString()}] [SUPERVISOR] ERROR: Next.js server failed to become healthy within 30s.`);
      fs.mkdirSync(path.join(webDir, ".data"), { recursive: true });
      fs.appendFileSync(path.join(webDir, ".data", "runner-health.jsonl"), JSON.stringify(healthRecord("SERVER_START_FAILED", new Date())) + "\n");
      if (serverProcess) serverProcess.kill("SIGTERM");
      process.exit(1);
    }
    console.log(`[${new Date().toISOString()}] [SUPERVISOR] Next.js server HTTP 200 is ready.`);
  } else {
    console.log(`[${new Date().toISOString()}] [SUPERVISOR] Next.js server is already running.`);
  }

  // Hardened readiness check: HTTP 200 ALONE DOES NOT ESTABLISH READINESS!
  // The supervisor must inspect the actual authentication status and connection state.
  if (!isSupervisorReady(serverStatus)) {
    console.warn(`[${new Date().toISOString()}] [SUPERVISOR] AUTH_NOT_READY: Next.js server responded HTTP 200, but authentication is invalid (connected=${serverStatus.connected}, tokenStatus=${serverStatus.tokenStatus}). Supervisor halting without launching paper runner.`);
    fs.mkdirSync(path.join(webDir, ".data"), { recursive: true });
    fs.appendFileSync(path.join(webDir, ".data", "runner-health.jsonl"), JSON.stringify(healthRecord("SUPERVISOR_AUTH_NOT_READY", new Date(), {
      connected: serverStatus.connected,
      tokenStatus: serverStatus.tokenStatus,
    })) + "\n");
    if (serverProcess) serverProcess.kill("SIGTERM");
    process.exit(0);
  }

  console.log(`[${new Date().toISOString()}] [SUPERVISOR] Authentication verified (connected=true, tokenStatus=VERIFIED_CONNECTED). Launching paper-live.mjs...`);

  // Run the paper runner
  console.log(`[${new Date().toISOString()}] [SUPERVISOR] Launching paper-live.mjs...`);
  const runner = spawn(process.execPath, [path.join(webDir, "scripts", "paper-live.mjs")], {
    cwd: webDir,
    stdio: "inherit",
    env: process.env,
  });

  const forwardSignal = (sig) => {
    runner.kill(sig);
    if (serverProcess) serverProcess.kill(sig);
  };

  process.on("SIGINT", () => forwardSignal("SIGINT"));
  process.on("SIGTERM", () => forwardSignal("SIGTERM"));

  runner.on("exit", (code) => {
    console.log(`[${new Date().toISOString()}] [SUPERVISOR] paper-live.mjs exited with code ${code}.`);
    if (serverProcess) {
      console.log(`[${new Date().toISOString()}] [SUPERVISOR] Stopping server process...`);
      serverProcess.kill("SIGTERM");
    }
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error(`[${new Date().toISOString()}] [SUPERVISOR] Fatal error:`, err);
  process.exit(1);
});
