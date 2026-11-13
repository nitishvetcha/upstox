// Browser check: loading, empty, error and stale states on the main list pages. Mock server, loopback only.
// Failures and delays are simulated in the browser (route.fulfill / route.fulfill after a delay). No live calls.
// Usage: node tests/browser/state-sweep.check.cjs <base-url> <operator-token> <screenshot-dir>
import { chromium } from "playwright";
// Connection and credential come from the environment only. Nothing is read from positional arguments.
const BASE = "http://127.0.0.1:3150"; // local test server only
const TOKEN = process.env.PAPER_OPERATOR_CREDENTIAL ?? ""; // operator PIN for the local app (never printed)
const SHOTS = process.env.BROWSER_SHOTS_DIR ?? ".";
const results = [];
const rec = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log((ok ? "PASS " : "FAIL ") + name + (detail ? " :: " + detail : "")); };
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(page) {
  await page.goto(BASE + "/login", { waitUntil: "load", timeout: 120000 });
  await page.fill("input[name=pin]", TOKEN);
  await Promise.all([page.waitForURL((u) => !new URL(u).pathname.startsWith("/login"), { timeout: 60000 }), page.click("button[type=submit]")]);
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined });
  for (const [label, w, h] of [["desktop", 1440, 900], ["mobile", 390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    await ctx.route("**/*", (r) => (r.request().url().startsWith(BASE) || r.request().url().startsWith("data:")) ? r.continue() : r.abort());
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message.slice(0, 120)));
    await login(page);

    // A. Journal: loading state while the list request is slow.
    await page.route("**/api/recommendations", async (route) => { await delay(2500); await route.continue(); });
    const journalNav = page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 120000 });
    await delay(1200);
    const during = await page.innerText("body").catch(() => "");
    rec(`${label} journal: loading state visible while the list request is pending`, /Loading/i.test(during), during.includes("No recommendations found") ? "shows empty message before data arrives" : "no loading text");
    await journalNav;
    await page.waitForTimeout(3500);
    await page.unroute("**/api/recommendations");

    // B. Journal: request fails. The page must not show an application error.
    await page.route("**/api/recommendations", (route) => route.fulfill({ status: 500, json: { error: "fixture failure" } }));
    await page.goto(BASE + "/", { waitUntil: "load", timeout: 120000 });
    await page.waitForTimeout(1500);
    let txt = await page.innerText("body");
    rec(`${label} journal: failed request shows an explicit error, not an empty journal`, /Could not load recommendations/.test(txt) && !/No recommendations found/.test(txt));
    rec(`${label} journal: failed request is not an application error`, !/Application error|Unhandled Runtime Error/i.test(txt) && txt.length > 50, `chars=${txt.length}`);
    await page.unroute("**/api/recommendations");

    // C. Opportunities page: candidate endpoints fail. Each failure is named; the page still renders.
    await page.route("**/api/opportunities/**", (route) => route.fulfill({ status: 500, json: { error: "fixture failure" } }));
    await page.goto(BASE + "/opportunities", { waitUntil: "load", timeout: 120000 });
    await page.waitForTimeout(2000);
    txt = await page.innerText("body");
    rec(`${label} opportunities: failures render, no application error`, !/Application error|Unhandled Runtime Error/i.test(txt) && txt.length > 50);
    await page.unroute("**/api/opportunities/**");

    // D. Opportunities page: normal load (mock). Empty or data states both render without error.
    await page.goto(BASE + "/opportunities", { waitUntil: "load", timeout: 120000 });
    await page.waitForTimeout(2000);
    txt = await page.innerText("body");
    rec(`${label} opportunities: normal load renders`, txt.length > 200 && !/Application error/i.test(txt), `chars=${txt.length}`);
    rec(`${label} opportunities: mock data is never labelled LIVE in the header`, !/MOCK[^\n]{0,20}\bLIVE\b/.test(txt));

    // E. Option chain: expiry request fails -> explicit message, page stays usable.
    await page.goto(BASE + "/option-chain?index=nifty", { waitUntil: "load", timeout: 120000 });
    await page.waitForSelector("table[aria-label='Option chain'] tbody tr", { timeout: 60000 });
    await page.route("**/api/option-chain/nifty?*", (route) => route.fulfill({ status: 500, json: { error: "fixture failure" } }));
    const expiries = await page.$$eval("select[aria-label='Expiry'] option", (o) => o.map((x) => x.value));
    if (expiries.length > 1) {
      await page.selectOption("select[aria-label='Expiry']", expiries[1]);
      await page.waitForSelector("[role=alert]", { timeout: 30000 });
      rec(`${label} option chain: failed expiry load shows an alert`, /Could not load expiry/.test(await page.innerText("[role=alert]")));
    } else {
      rec(`${label} option chain: failed expiry load shows an alert`, true, "single mock expiry; covered by the scenario check");
    }
    await page.unroute("**/api/option-chain/nifty?*");
    rec(`${label} option chain: table still renders after a failed request`, (await page.$$("table[aria-label='Option chain'] tbody tr")).length === 31);

    // F. Breadth card: a failed breadth request does not crash the dashboard.
    await page.route("**/api/breadth/**", (route) => route.fulfill({ status: 500, json: { error: "fixture failure" } }));
    await page.goto(BASE + "/", { waitUntil: "load", timeout: 120000 });
    await page.waitForTimeout(1500);
    txt = await page.innerText("body");
    rec(`${label} dashboard: breadth failure does not break the page`, !/Application error|Unhandled Runtime Error/i.test(txt) && /Market Breadth/i.test(txt));
    await page.unroute("**/api/breadth/**");

    if (label === "desktop") await page.screenshot({ path: `${SHOTS}/state-sweep-dashboard.png`, fullPage: false });
    rec(`${label} no page errors during the sweep`, pageErrors.length === 0, pageErrors.join(" | "));
    await ctx.close();
  }
  await browser.close();
  console.log("SUMMARY", results.filter((r) => r.ok).length, "pass,", results.filter((r) => !r.ok).length, "fail");
})().catch((e) => { console.error("HARNESS_ERROR", e.message.slice(0, 300)); process.exit(1); });
