// Browser check: informational contract selection on the option-chain page. Loopback only, mock data, no orders.
// Usage: node tests/browser/contract-selection.check.cjs <base-url> <operator-token> <screenshot-dir>
import { chromium } from "playwright";

// Connection and credential come from the environment only. Nothing is read from positional arguments.
const BASE = "http://127.0.0.1:3150"; // local test server only
const TOKEN = process.env.PAPER_OPERATOR_CREDENTIAL ?? ""; // operator PIN for the local app (never printed)
const SHOTS = process.env.BROWSER_SHOTS_DIR ?? ".";
const results = [];
const rec = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log((ok ? "PASS " : "FAIL ") + name + (detail ? " :: " + detail : "")); };

(async () => {
  const browser = await chromium.launch({ headless: true });
  for (const [label, w, h] of [["desktop", 1440, 900], ["tablet", 768, 1024], ["mobile", 390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    await ctx.route("**/*", (r) => (r.request().url().startsWith(BASE) || r.request().url().startsWith("data:")) ? r.continue() : r.abort());
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message.slice(0, 120)));
    await page.goto(BASE + "/login", { waitUntil: "load", timeout: 120000 });
    await page.fill("input[name=pin]", TOKEN);
    await Promise.all([page.waitForURL((u) => !new URL(u).pathname.startsWith("/login"), { timeout: 60000 }), page.click("button[type=submit]")]);

    for (const idx of ["nifty", "banknifty"]) {
      await page.goto(BASE + "/option-chain?index=" + idx, { waitUntil: "load", timeout: 120000 });
      await page.waitForSelector("table[aria-label='Option chain'] tbody tr", { timeout: 60000 });
      const tag = `${label} ${idx}`;
      const rowCount = await page.$$eval("table[aria-label='Option chain'] tbody tr", (r) => r.length);
      rec(`${tag} 31-row display`, rowCount === 31, "rows=" + rowCount);

      const panelBefore = await page.innerText("section[aria-label='Selected contract']");
      rec(`${tag} no selection by default`, /No contract selected/.test(panelBefore));

      // CE and PE at two different strikes; each click must change only its own side.
      const strikes = await page.$$eval("table[aria-label='Option chain'] tbody tr", (rows) => rows.map((r) => r.querySelector("td.text-center").firstChild.textContent.trim()));
      const s1 = strikes[10], s2 = strikes[20];
      await page.click(`button[aria-label='Select CE ${s1.replace(/,/g, "")}']`);
      let panel = await page.innerText("section[aria-label='Selected contract']");
      rec(`${tag} CE selection shows CE`, /Option type\s*CE/.test(panel), panel.replace(/\s+/g, " ").slice(0, 140));
      await page.click(`button[aria-label='Select PE ${s2.replace(/,/g, "")}']`);
      panel = await page.innerText("section[aria-label='Selected contract']");
      rec(`${tag} PE selection replaces it with PE`, /Option type\s*PE/.test(panel) && /Strike\s*\S+/.test(panel));
      const pressed = await page.$$eval("button[aria-pressed=true]", (b) => b.length);
      rec(`${tag} only one contract active`, pressed === 1, "pressed=" + pressed);

      // Lots and quantity: quantity only when lot size is present in the backend data.
      const lotText = await page.innerText("section[aria-label='Selected contract']");
      const lotUnavailable = /Lot size\s*Unavailable/.test(lotText);
      if (lotUnavailable) {
        rec(`${tag} lot size unavailable is shown, quantity not invented`, /Quantity: Unavailable/.test(lotText));
      } else {
        const m = lotText.match(/Lot size\s*(\d+)/);
        await page.fill("input[type=number]", "3");
        const after = await page.innerText("section[aria-label='Selected contract']");
        rec(`${tag} quantity = 3 x lot size`, m && new RegExp("Quantity: " + (3 * Number(m[1]))).test(after));
      }
      await page.fill("input[type=number]", "0");
      const bad = await page.innerText("section[aria-label='Selected contract']");
      rec(`${tag} invalid lots rejected`, /Lots must be a whole number/.test(bad));
      await page.fill("input[type=number]", "1");

      const expiryOpts = await page.$$eval("select[aria-label='Expiry'] option", (o) => o.map((x) => x.value));
      rec(`${tag} expiry options from backend (>=1)`, expiryOpts.length >= 1, JSON.stringify(expiryOpts.slice(0, 4)));
      if (expiryOpts.length > 1) {
        await page.selectOption("select[aria-label='Expiry']", expiryOpts[1]);
        await page.waitForFunction((e) => document.querySelector("select[aria-label='Expiry']").value === e, expiryOpts[1], { timeout: 30000 });
        const reset = await page.innerText("section[aria-label='Selected contract']");
        rec(`${tag} expiry change resets selection`, /No contract selected/.test(reset));
      }
      if (label === "desktop") await page.screenshot({ path: `${SHOTS}/contract-${idx}-desktop.png`, fullPage: false });
      if (label === "mobile" && idx === "nifty") await page.screenshot({ path: `${SHOTS}/contract-${idx}-mobile.png`, fullPage: false });
    }

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    rec(`${label} no page horizontal overflow`, overflow === 0, "overflowPx=" + overflow);
    rec(`${label} no page errors`, pageErrors.length === 0, pageErrors.join(" | "));
    await ctx.close();
  }
  await browser.close();
  console.log("SUMMARY", results.filter((r) => r.ok).length, "pass,", results.filter((r) => !r.ok).length, "fail");
})().catch((e) => { console.error("HARNESS_ERROR", e.message.slice(0, 300)); process.exit(1); });
