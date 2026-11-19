// Verifies, against the running production server in mock mode, that the four news routes make zero outbound requests
// and serve the expected mock responses. Requires a prior `NEXT_DIST_DIR=.next-prod-verify next build`.
// Writes only under .test-data/ (not a protected directory). Never starts a runner, scheduler or live collector.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = join(ROOT, ".test-data", "news-mock-verify");
const LOG = join(OUT, "outbound.log");
const PORT = 3137;
const BASE = `http://127.0.0.1:${PORT}`;
const ROUTES = ["/api/news", "/api/news/nifty", "/api/news/banknifty", "/api/events", "/api/events/nifty", "/api/sentiment/nifty", "/api/sentiment/banknifty"];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
writeFileSync(LOG, "");

const env = {
  ...process.env,
  MARKET_DATA_PROVIDER: "mock",
  NEXT_DIST_DIR: ".next-prod-verify",
  NEXT_TELEMETRY_DISABLED: "1",
  OUTBOUND_LOG: LOG,
  NEWS_API_KEY: "verify-dummy-key", // a key is configured on purpose: mock mode must still not call NewsAPI
  UPSTOX_ANALYTICS_TOKEN: "",
  UPSTOX_CLIENT_ID: "",
  UPSTOX_CLIENT_SECRET: "",
  UPSTOX_REDIRECT_URI: "",
  OPTION_QUOTE_LTT_ENABLED: "false",
  OPTION_QUOTE_CANARY_ENABLED: "false",
};
// node --require, not NODE_OPTIONS: NODE_OPTIONS splits on spaces, and this project path contains spaces.
const nextBin = join(ROOT, "node_modules", "next", "dist", "bin", "next");
const server = spawn(process.execPath, ["--require", join(ROOT, "scripts", "outbound-recorder.cjs"), nextBin, "start", "-p", String(PORT)], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
const serverLog = [];
server.stdout.on("data", (d) => serverLog.push(String(d)));
server.stderr.on("data", (d) => serverLog.push(String(d)));

async function waitReady() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${BASE}/api/news/nifty`); if (r.status) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server did not start: " + serverLog.join("").slice(-400));
}

// Positive control: the recorder must see a request. A local server is used, so this makes no external request.
async function recorderSelfCheck() {
  const http = await import("node:http");
  const srv = http.createServer((_req, res) => res.end("ok"));
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const port = srv.address().port;
  const probeLog = join(OUT, "selfcheck.log");
  writeFileSync(probeLog, "");
  const probe = spawn(process.execPath, ["--require", join(ROOT, "scripts", "outbound-recorder.cjs"), "-e",
    `fetch("http://127.0.0.1:${port}/probe").then(r => r.text()).then(() => process.exit(0))`],
    { env: { ...process.env, OUTBOUND_LOG: probeLog }, stdio: "ignore" });
  await new Promise((r) => probe.on("exit", r));
  await new Promise((r) => srv.close(r));
  const seen = readFileSync(probeLog, "utf8").split("\n").filter(Boolean);
  if (!seen.includes("127.0.0.1")) throw new Error("recorder self-check failed: a request was not recorded");
  return seen;
}
const selfCheck = await recorderSelfCheck();

const report = { recorderSelfCheck: selfCheck, routes: [], hostsRecorded: [], externalHosts: [], pass: false };
try {
  await waitReady();
  for (const path of ROUTES) {
    const r = await fetch(BASE + path);
    const body = await r.json();
    // Shapes: /api/news → { indices[] } (sentiment summaries); /api/events → { indices[] } (event summaries);
    // /api/events/[index] → one event summary (newsStatus); /api/news/[index] and /api/sentiment/[index] → one summary (status).
    const statuses = path === "/api/news" ? body.indices.map((i) => i.status)
      : path === "/api/events" ? body.indices.map((i) => i.newsStatus)
      : path.startsWith("/api/events/") ? [body.newsStatus]
      : [body.status];
    report.routes.push({ path, http: r.status, statuses, mockOnly: statuses.every((s) => s === "MOCK") });
  }
} finally {
  server.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 1000));
}

const hosts = existsSync(LOG) ? readFileSync(LOG, "utf8").split("\n").filter(Boolean) : [];
report.hostsRecorded = [...new Set(hosts)];
report.externalHosts = report.hostsRecorded.filter((h) => !["localhost", "127.0.0.1", "::1"].includes(h));
report.pass = report.externalHosts.length === 0 && report.routes.every((r) => r.http === 200 && r.mockOnly);
console.log(JSON.stringify(report, null, 2));
process.exit(report.pass ? 0 : 1);
