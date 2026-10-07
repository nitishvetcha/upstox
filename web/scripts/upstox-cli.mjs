// Shared helpers for the Upstox CLI commands. They only talk to this app's own read-only JSON routes, which never
// contain the access token, client secret or authorization code — so nothing secret can be printed.
import { execFile } from "node:child_process";

export const PORT = process.env.PORT ?? "3123";
export const BASE = `http://localhost:${PORT}`;
export const LOGIN_URL = `${BASE}/api/auth/login`;
export const LINE = "=".repeat(40);

export async function getJson(path, timeoutMs = 60_000) {
  const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
  return res.json();
}

export async function serverUp() {
  try {
    await getJson("/api/auth/status", 3_000);
    return true;
  } catch {
    return false;
  }
}

export async function waitForServer(maxMs = 180_000) {
  const end = Date.now() + maxMs;
  while (Date.now() < end) {
    if (await serverUp()) return true;
    await new Promise((r) => setTimeout(r, 1_000));
  }
  return false;
}

// Opens the system browser exactly once per call site; callers guard against repeats.
export function openBrowser(url) {
  const [cmd, args] =
    process.platform === "darwin" ? ["open", [url]]
    : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
    : ["xdg-open", [url]];
  execFile(cmd, args, (err) => {
    if (err) console.log(`Could not open a browser automatically. Open this URL: ${url}`);
  });
}

// Poll (every 3 s, no browser re-open) until the session is VALID and verified, or time out.
export async function waitForLogin(maxMs = 15 * 60_000) {
  const end = Date.now() + maxMs;
  while (Date.now() < end) {
    try {
      const s = await getJson("/api/auth/status?verify=1", 15_000);
      if (s.connected) return s;
    } catch { /* server busy; keep waiting */ }
    await new Promise((r) => setTimeout(r, 3_000));
  }
  return null;
}

const pad = (s, w) => `${s} ${".".repeat(Math.max(2, w - s.length))}`;

export async function printLiveSummary() {
  const health = await getJson("/api/auth/health", 90_000).catch(() => null);
  for (const [i, name] of [["nifty", "NIFTY"], ["banknifty", "BANK NIFTY"]]) {
    const c = health?.checks?.[i];
    console.log(`[MARKET] ${pad(name, 14)} ${c?.spot?.status ?? "?"} ${c?.spot?.detail ?? ""}`);
    console.log(`[OPTIONS] ${pad(name, 13)} ${c?.optionChain?.status ?? "?"} ${c?.optionChain?.detail ?? ""}`);
  }
  for (const [u, name] of [["NIFTY", "NIFTY"], ["BANKNIFTY", "BANK NIFTY"]]) {
    try {
      const d = await getJson(`/api/recommendations/diagnostic?underlying=${u}`, 90_000);
      const codes = [...new Set((d.blockers ?? []).map((b) => b.code))];
      console.log(`[ANALYSIS] ${pad(name, 12)} READY · data ${d.freshness?.overall}`);
      console.log(`[RECOMMENDATION] ${pad(name, 12)} ${d.finalDecision}${codes.length ? ` — ${codes.join(", ")}` : ""}`);
    } catch (e) {
      console.log(`[ANALYSIS] ${pad(name, 12)} ERROR ${e.message}`);
    }
  }
  if (health?.historicalOptions) console.log(`[HISTORY] Historical options: ${health.historicalOptions.status}${health.historicalOptions.code ? ` — ${health.historicalOptions.code}` : ""} (independent of login)`);
}

export function fmtExpiry(iso) {
  return iso ? `${new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: false })} IST` : "—";
}
