// Browser check: the "Refresh data" button re-fetches the dashboard and the "Last refresh" time changes. Mock, loopback only.
// Usage: node tests/browser/refresh.check.cjs <base-url> <pin>
import { chromium } from "playwright";
// Connection and credential come from the environment only. Nothing is read from positional arguments.
const BASE = "http://127.0.0.1:3150"; // local test server only
const PIN = process.env.PAPER_OPERATOR_CREDENTIAL ?? ""; // operator PIN for the local app (never printed)
const results = [];
const rec = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log((ok ? "PASS " : "FAIL ") + name + (detail ? " :: " + detail : "")); };
const lastRefresh = (page) => page.evaluate(() => { const m = document.body.innerText.match(/Last refresh ([^\n]+?) IST/); return m ? m[1] : null; });

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined });
  for (const [label, w, h] of [["desktop", 1440, 900], ["mobile", 390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    await ctx.route("**/*", (r) => (r.request().url().startsWith(BASE) || r.request().url().startsWith("data:")) ? r.continue() : r.abort());
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message.slice(0, 120)));
    await page.goto(BASE + "/login", { waitUntil: "load", timeout: 120000 });
    await page.fill("input[name=pin]", PIN);
    await Promise.all([page.waitForURL((u) => !new URL(u).pathname.startsWith("/login"), { timeout: 60000 }), page.click("button[type=submit]")]);
    await page.goto(BASE + "/", { waitUntil: "load", timeout: 120000 });
    await page.waitForSelector("text=Refresh data", { timeout: 60000 });
    const before = await lastRefresh(page);
    rec(`${label} refresh button is visible`, (await page.locator("button", { hasText: "Refresh data" }).count()) === 1);
    await page.waitForTimeout(1100); // the displayed time is to the second
    await page.locator("button", { hasText: "Refresh data" }).click();
    await page.waitForFunction((b) => {
      const m = document.body.innerText.match(/Last refresh ([^\n]+?) IST/);
      return m && m[1] !== b;
    }, before, { timeout: 60000 }).catch(() => {});
    const after = await lastRefresh(page);
    rec(`${label} refresh fetches new data (Last refresh time changes)`, before !== null && after !== null && before !== after, `before=${before} after=${after}`);
    rec(`${label} no page errors`, errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  await browser.close();
  console.log("SUMMARY", results.filter((r) => r.ok).length, "pass,", results.filter((r) => !r.ok).length, "fail");
})().catch((e) => { console.error("HARNESS_ERROR", e.message.slice(0, 300)); process.exit(1); });
