import { spawn } from "node:child_process";
import * as http from "node:http";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDir = path.resolve(__dirname, "..");

process.chdir(webDir);
process.env.PORT = process.env.PORT ?? "3123";

function checkServer() {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${process.env.PORT}/api/auth/status`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(3000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function main() {
  console.log(`[${new Date().toISOString()}] [SUPERVISOR] Starting Paper Supervisor (PID ${process.pid})...`);

  const isHealthy = await checkServer();
  let serverProcess = null;

  if (!isHealthy) {
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
      if (await checkServer()) {
        healthy = true;
        break;
      }
    }

    if (!healthy) {
      console.error(`[${new Date().toISOString()}] [SUPERVISOR] ERROR: Next.js server failed to become healthy within 30s.`);
      if (serverProcess) serverProcess.kill("SIGTERM");
      process.exit(1);
    }
    console.log(`[${new Date().toISOString()}] [SUPERVISOR] Next.js server is ready and healthy.`);
  } else {
    console.log(`[${new Date().toISOString()}] [SUPERVISOR] Next.js server is already running and healthy.`);
  }

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
