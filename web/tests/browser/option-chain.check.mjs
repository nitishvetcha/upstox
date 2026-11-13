// Isolated browser check: option chain page after operator login. Loopback only, synthetic mock data, no live calls.
// Usage: node tests/browser/option-chain.check.cjs <base-url> <operator-token> <screenshot-dir>
import { chromium } from "playwright";

// Connection and credential come from the environment only. Nothing is read from positional arguments.
const BASE = "http://127.0.0.1:3150"; // local test server only
const TOKEN = process.env.PAPER_OPERATOR_CREDENTIAL ?? ""; // operator PIN for the local app (never printed)
const SHOTS = process.env.BROWSER_SHOTS_DIR ?? ".";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  const rec = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log((ok ? "PASS " : "FAIL ") + name + (detail ? " :: " + detail : "")); };
  for (const [label, w, h] of [["desktop", 1440, 900], ["tablet", 768, 1024], ["mobile", 390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    await ctx.route("**/*", (r) => (r.request().url().startsWith(BASE) || r.request().url().startsWith("data:")) ? r.continue() : r.abort());
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message.slice(0, 120)));
    await page.goto(BASE + "/login", { waitUntil: "load", timeout: 120000 });
    await page.fill("input[name=pin]", TOKEN);
    await Promise.all([page.waitForURL((u) => !new URL(u).pathname.startsWith("/login"), { timeout: 60000 }), page.click("button[type=submit]")]);
    await page.goto(BASE + "/option-chain", { waitUntil: "load", timeout: 120000 });
    await page.waitForTimeout(2500);
    const text = await page.evaluate(() => document.body.innerText);
    const rows = await page.$$eval("table tbody tr", (r) => r.length).catch(() => 0);
    const headers = await page.$$eval("table thead th", (h) => h.map((x) => x.innerText.trim())).catch(() => []);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    rec(label + " option chain page renders", /option chain/i.test(text) || rows > 0, "rows=" + rows);
    rec(label + " no horizontal overflow", overflow === 0, "overflowPx=" + overflow);
    rec(label + " no page errors", pageErrors.length === 0, pageErrors.join(" | "));
    if (label === "desktop") {
      rec("desktop chain headers present", headers.length > 0, JSON.stringify(headers.slice(0, 14)));
      rec("desktop ATM marked", /ATM/.test(text), "");
      const itm = (text.match(/CE ITM/g) || []).length, otm = (text.match(/CE OTM/g) || []).length;
      rec("desktop ITM and OTM labels present on both sides of spot", itm > 0 && otm > 0, "CE ITM rows=" + itm + " CE OTM rows=" + otm);
      rec("desktop provenance label shown", /\b(LIVE|MOCK|STALE|UNAVAILABLE|END OF DAY|AGING)\b/.test(text), "");
      await page.screenshot({ path: SHOTS + "/option-chain-desktop.png" });
    } else {
      await page.screenshot({ path: SHOTS + "/option-chain-" + label + ".png" });
    }
    await ctx.close();
  }
  await browser.close();
  console.log("SUMMARY", results.filter((r) => r.ok).length, "pass,", results.filter((r) => !r.ok).length, "fail");
})().catch((e) => { console.error("HARNESS_ERROR", e.message.slice(0, 300)); process.exit(1); });
