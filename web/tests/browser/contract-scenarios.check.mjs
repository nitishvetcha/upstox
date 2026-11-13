// Browser scenarios for informational contract selection: metadata, quantity, expiry reset, stale and error states.
// Loopback only, MOCK data. The stale and error cases alter only the browser's copy of the response (route.fulfill), labelled below.
// Usage: node tests/browser/contract-scenarios.check.cjs <base-url> <operator-token> <screenshot-dir>
import { chromium } from "playwright";

// Connection and credential come from the environment only. Nothing is read from positional arguments.
const BASE = "http://127.0.0.1:3150"; // local test server only
const TOKEN = process.env.PAPER_OPERATOR_CREDENTIAL ?? ""; // operator PIN for the local app (never printed)
const SHOTS = process.env.BROWSER_SHOTS_DIR ?? ".";
const results = [];
const rec = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log((ok ? "PASS " : "FAIL ") + name + (detail ? " :: " + detail : "")); };
const panel = (page) => page.innerText("section[aria-label='Selected contract']");

(async () => {
  const browser = await chromium.launch({ headless: true });
  for (const [label, w, h] of [["desktop", 1440, 900], ["mobile", 390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    await ctx.route("**/*", (r) => (r.request().url().startsWith(BASE) || r.request().url().startsWith("data:")) ? r.continue() : r.abort());
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message.slice(0, 120)));
    await page.goto(BASE + "/login", { waitUntil: "load", timeout: 120000 });
    await page.fill("input[name=pin]", TOKEN);
    await Promise.all([page.waitForURL((u) => !new URL(u).pathname.startsWith("/login"), { timeout: 60000 }), page.click("button[type=submit]")]);
    await page.goto(BASE + "/option-chain?index=nifty", { waitUntil: "load", timeout: 120000 });
    await page.waitForSelector("table[aria-label='Option chain'] tbody tr", { timeout: 60000 });
    const tag = label;

    // 1. Metadata: lot size from backend, instrument key from backend (not "Not provided").
    await page.click("button[aria-label='Select CE 24850']");
    let t = await panel(page);
    rec(`${tag} lot size from backend snapshot shown`, /Lot size\s*65\b/.test(t), t.replace(/\s+/g, " ").slice(0, 200));
    rec(`${tag} instrument key from backend shown`, /Instrument key\s*MOCK_FO\|/.test(t));

    // 2. Quantity = lots x lot size, from backend lot size.
    await page.fill("input[type=number]", "3");
    t = await panel(page);
    rec(`${tag} quantity = 3 x 65 = 195`, /Quantity:\s*195\b/.test(t));

    // 3. Expiry change resets selection and loads the chosen expiry's chain.
    const expiries = await page.$$eval("select[aria-label='Expiry'] option", (o) => o.map((x) => x.value));
    rec(`${tag} two backend expiries offered`, expiries.length === 2, JSON.stringify(expiries));
    const second = expiries[1];
    await page.selectOption("select[aria-label='Expiry']", second);
    await page.waitForFunction((e) => document.querySelector("select[aria-label='Expiry']").value === e, second, { timeout: 30000 });
    await page.waitForFunction(() => !document.body.innerText.includes("Loading expiry"), null, { timeout: 30000 });
    t = await panel(page);
    rec(`${tag} expiry change clears contract selection`, /No contract selected/.test(t));
    const pressed = await page.$$eval("button[aria-pressed=true]", (b) => b.length);
    rec(`${tag} expiry change clears pressed state`, pressed === 0, "pressed=" + pressed);
    const hdr = await page.$$eval("table[aria-label='Option chain'] tbody tr", (r) => r.length);
    rec(`${tag} 31 rows after expiry change`, hdr === 31, "rows=" + hdr);

    // 4. Selecting again on the new expiry shows the new expiry and the same lot size (backend-supplied).
    await page.click("button[aria-label='Select PE 24850']");
    t = await panel(page);
    rec(`${tag} new expiry selection shows that expiry`, t.includes(second), t.replace(/\s+/g, " ").slice(0, 160));

    // 5. Stale provenance: backend returns a fallback message for this expiry (browser-side copy of the response).
    await page.route("**/api/option-chain/nifty?*", async (route) => {
      const resp = await route.fetch();
      const j = await resp.json();
      j.source = "STALE";
      j.fallbackMessage = "Option chain is stale (test fixture). Prices may be out of date.";
      await route.fulfill({ response: resp, json: j });
    });
    await page.selectOption("select[aria-label='Expiry']", expiries[0]);
    await page.waitForFunction(() => !document.body.innerText.includes("Loading expiry"), null, { timeout: 30000 });
    const stale = await page.innerText("body");
    rec(`${tag} stale fallback message shown`, /Option chain is stale/.test(stale));
    await page.unroute("**/api/option-chain/nifty?*");

    // 6. Error: backend fails for the next expiry; nothing is selected and the old chain stays.
    await page.route("**/api/option-chain/nifty?*", (route) => route.fulfill({ status: 500, json: { error: "fixture failure" } }));
    await page.selectOption("select[aria-label='Expiry']", expiries[1]);
    await page.waitForSelector("[role=alert]", { timeout: 30000 });
    const err = await page.innerText("[role=alert]");
    rec(`${tag} error shown with nothing selected`, /Could not load expiry/.test(err) && /Nothing is selected/.test(err), err.slice(0, 120));
    rec(`${tag} old chain kept after failed expiry load`, (await page.$$eval("table[aria-label='Option chain'] tbody tr", (r) => r.length)) === 31);
    await page.unroute("**/api/option-chain/nifty?*");

    if (label === "desktop") await page.screenshot({ path: `${SHOTS}/scenarios-desktop.png` });
    else await page.screenshot({ path: `${SHOTS}/scenarios-mobile.png` });

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    rec(`${tag} no horizontal overflow`, overflow === 0, "overflowPx=" + overflow);
    rec(`${tag} no page errors`, pageErrors.length === 0, pageErrors.join(" | "));
    await ctx.close();
  }
  await browser.close();
  console.log("SUMMARY", results.filter((r) => r.ok).length, "pass,", results.filter((r) => !r.ok).length, "fail");
})().catch((e) => { console.error("HARNESS_ERROR", e.message.slice(0, 300)); process.exit(1); });
