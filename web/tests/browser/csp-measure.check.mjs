// Measurement only: loads pages under the REPORT-ONLY nonce CSP and records every securitypolicyviolation event.
// Enforcement is not enabled by this script. Mock server, loopback only.
// Usage: node tests/browser/csp-measure.check.cjs <base-url> <pin> <screenshot-dir>
import { chromium } from "playwright";
// Connection and credential come from the environment only. Nothing is read from positional arguments.
const BASE = "http://127.0.0.1:3150"; // local test server only
const PIN = process.env.PAPER_OPERATOR_CREDENTIAL ?? ""; // operator PIN for the local app (never printed)
const SHOTS = process.env.BROWSER_SHOTS_DIR ?? ".";
const PAGES = ["/", "/saved-picks", "/option-chain?index=nifty", "/option-chain?index=banknifty", "/recommendations", "/strategies", "/change-pin", "/opportunities", "/stock-v2", "/options-research", "/market-history", "/strategy-evidence", "/performance"];

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route("**/*", (r) => (r.request().url().startsWith(BASE) || r.request().url().startsWith("data:")) ? r.continue() : r.abort());
  const page = await ctx.newPage();
  const violations = [];
  await page.exposeFunction("__cspReport", (v) => violations.push(v));
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      window.__cspReport({ page: location.pathname, directive: e.violatedDirective, blocked: (e.blockedURI || "").slice(0, 80), sample: (e.sample || "").slice(0, 60) });
    });
  });
  await page.goto(BASE + "/login", { waitUntil: "load", timeout: 120000 });
  await page.fill("input[name=pin]", PIN);
  await Promise.all([page.waitForURL((u) => !new URL(u).pathname.startsWith("/login"), { timeout: 60000 }), page.click("button[type=submit]")]);
  for (const p of PAGES) {
    await page.goto(BASE + p, { waitUntil: "load", timeout: 120000 });
    await page.waitForTimeout(1200);
  }
  const counts = {};
  for (const v of violations) {
    const key = `${v.directive} | ${v.blocked}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  console.log("PAGES_CHECKED", PAGES.length);
  console.log("VIOLATION_EVENTS", violations.length);
  for (const smp of [...new Set(violations.map((v) => v.page + " :: " + v.sample))].slice(0, 6)) console.log("SAMPLE", smp);
  for (const [k, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log("COUNT", n, k);
  await page.screenshot({ path: `${SHOTS}/csp-measure-dashboard.png`, fullPage: false });
  await browser.close();
})().catch((e) => { console.error("HARNESS_ERROR", e.message.slice(0, 300)); process.exit(1); });
