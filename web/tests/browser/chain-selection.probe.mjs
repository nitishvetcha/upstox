// Probe: can a user select a strike or contract on the option-chain page? Loopback, synthetic token, mock data only.
// Usage: node tests/browser/chain-selection.probe.cjs <base-url> <operator-token>
import { chromium } from "playwright";
// Connection and credential come from the environment only. Nothing is read from positional arguments.
const BASE = "http://127.0.0.1:3150"; // local test server only
const TOKEN = process.env.PAPER_OPERATOR_CREDENTIAL ?? ""; // operator PIN for the local app (never printed)

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route("**/*", (r) => (r.request().url().startsWith(BASE) || r.request().url().startsWith("data:")) ? r.continue() : r.abort());
  const page = await ctx.newPage();
  await page.goto(BASE + "/login", { waitUntil: "load", timeout: 120000 });
  await page.fill("input[name=pin]", TOKEN);
  await Promise.all([page.waitForURL((u) => !new URL(u).pathname.startsWith("/login"), { timeout: 60000 }), page.click("button[type=submit]")]);
  await page.goto(BASE + "/option-chain", { waitUntil: "load", timeout: 120000 });
  await page.waitForTimeout(2000);
  const info = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("table tbody tr")];
    const first = rows[0];
    return {
      rowCount: rows.length,
      rowHasButton: rows.filter((r) => r.querySelector("button, a, [role=button], input[type=radio]")).length,
      rowClickable: rows.filter((r) => r.onclick !== null || r.getAttribute("role") === "button").length,
      selects: [...document.querySelectorAll("select")].map((s) => ({ name: s.name, options: [...s.options].map((o) => o.textContent.trim()).slice(0, 8) })),
      tabs: [...document.querySelectorAll("button")].map((b) => b.textContent.trim()).filter((t) => /^(NIFTY|BANKNIFTY|FINNIFTY|MIDCPNIFTY|SENSEX|BANKEX)$/.test(t)),
      contractDetailPanel: /Contract details|Selected contract|lot size/i.test(document.body.innerText),
      firstRowText: first ? first.innerText.replace(/\s+/g, " ").slice(0, 160) : null,
    };
  });
  console.log("PROBE_RESULT " + JSON.stringify(info));
  await browser.close();
})().catch((e) => { console.error("PROBE_ERROR " + e.message.slice(0, 200)); process.exit(1); });
