// Browser check: saved picks page on an ISOLATED server (scratch SAVED_PICKS_FILE). Loopback only, no live calls.
// Usage: node tests/browser/saved-picks.check.cjs <base-url> <operator-token> <screenshot-dir>
import { chromium } from "playwright";
// Connection and credential come from the environment only. Nothing is read from positional arguments.
const BASE = "http://127.0.0.1:3150"; // local test server only
const TOKEN = process.env.PAPER_OPERATOR_CREDENTIAL ?? ""; // operator PIN for the local app (never printed)
const SHOTS = process.env.BROWSER_SHOTS_DIR ?? ".";
const results = [];
import fs from "node:fs";
const SCRATCH = process.env.SAVED_PICKS_SCRATCH || process.env.SAVED_PICKS_FILE || "";
const rec = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log((ok ? "PASS " : "FAIL ") + name + (detail ? " :: " + detail : "")); };

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined });
  for (const [label, w, h] of [["desktop", 1440, 900], ["tablet", 768, 1024], ["mobile", 390, 844]]) {
    // Each viewport starts from an empty scratch list (the server reads this file on every request).
    if (SCRATCH) fs.writeFileSync(SCRATCH, "[]");
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    await ctx.route("**/*", (r) => (r.request().url().startsWith(BASE) || r.request().url().startsWith("data:")) ? r.continue() : r.abort());
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message.slice(0, 120)));
    await page.goto(BASE + "/login", { waitUntil: "load", timeout: 120000 });
    await page.fill("input[name=pin]", TOKEN);
    await Promise.all([page.waitForURL((u) => !new URL(u).pathname.startsWith("/login"), { timeout: 60000 }), page.click("button[type=submit]")]);
    await page.goto(BASE + "/saved-picks", { waitUntil: "load", timeout: 120000 });
    await page.waitForSelector("text=No saved picks yet", { timeout: 60000 }).catch(() => {});
    rec(`${label} empty state shown`, (await page.innerText("body")).includes("No saved picks yet"));

    const save = async (instrument, type, source, note) => {
      await page.fill("input[aria-label=Instrument]", instrument);
      await page.selectOption("select[aria-label='Instrument type']", type);
      await page.selectOption("select[aria-label=Source]", source);
      await page.fill("input[aria-label=Note]", note);
      await page.click("button:has-text('Save pick')");
      await page.waitForFunction((i) => document.body.innerText.includes(i), instrument, { timeout: 30000 });
    };
    await save("RELIANCE", "STOCK", "RESEARCH", "breakout test");
    await save("NIFTY 25000 CE", "INDEX_OPTION", "MOCK", "mock test");
    await save("TCS", "STOCK", "LIVE", "range test");
    let body = await page.innerText("body");
    rec(`${label} three picks listed`, body.includes("RELIANCE") && body.includes("NIFTY 25000 CE") && body.includes("TCS"));
    rec(`${label} MOCK pick labelled not validated, never live`, /MOCK DATA: NOT VALIDATED/.test(body));
    rec(`${label} count line shows 3 of 3`, body.includes("Showing 3 of 3"));

    await page.fill("input[aria-label='Search saved picks']", "tcs");
    rec(`${label} search narrows to 1`, body.includes("TCS") && (await page.innerText("body")).includes("Showing 1 of 3"));
    await page.fill("input[aria-label='Search saved picks']", "");
    await page.selectOption("select[aria-label='Filter by type']", "INDEX_OPTION");
    rec(`${label} type filter shows only the option`, (await page.innerText("body")).includes("Showing 1 of 3") && !(await page.innerText("table")).includes("RELIANCE"));
    await page.fill("input[aria-label='Search saved picks']", "zzz-no-match");
    rec(`${label} no-match state shown`, (await page.innerText("body")).includes("No saved picks match these filters"));
    await page.click("button:has-text('Clear filters')");
    await page.selectOption("select[aria-label='Filter by type']", "ALL").catch(() => page.selectOption("select[aria-label='Filter by type']", "ALL"));
    rec(`${label} clear filters restores all 3`, (await page.innerText("body")).includes("Showing 3 of 3"));

    // Error state: the list cannot be loaded.
    await page.route("**/api/saved-picks", (route) => (route.request().method() === "GET" ? route.fulfill({ status: 500, json: { error: "fixture" } }) : route.continue()));
    await page.reload({ waitUntil: "load" });
    await page.waitForSelector("[role=alert]", { timeout: 30000 });
    rec(`${label} load failure shown as alert`, /Could not load saved picks/.test(await page.innerText("[role=alert]")));
    await page.unroute("**/api/saved-picks");

    await page.reload({ waitUntil: "load" });
    await page.waitForSelector("text=RELIANCE", { timeout: 30000 });
    await page.click("button[aria-label='Delete RELIANCE']");
    await page.waitForFunction(() => !document.querySelector("table").innerText.includes("RELIANCE"), null, { timeout: 30000 });
    rec(`${label} delete removes the pick and it stays gone after reload`, true);
    await page.reload({ waitUntil: "load" });
    await page.waitForSelector("text=TCS", { timeout: 30000 });
    rec(`${label} after reload the deleted pick is still gone`, !(await page.innerText("table")).includes("RELIANCE"));
    if (label === "desktop") await page.screenshot({ path: `${SHOTS}/saved-picks-desktop.png`, fullPage: true });
    if (label === "mobile") await page.screenshot({ path: `${SHOTS}/saved-picks-mobile.png`, fullPage: true });

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    rec(`${label} no page-level horizontal overflow (table scrolls inside its box)`, overflow === 0, "overflowPx=" + overflow);
    rec(`${label} no page errors`, pageErrors.length === 0, pageErrors.join(" | "));
    await ctx.close();
  }
  await browser.close();
  console.log("SUMMARY", results.filter((r) => r.ok).length, "pass,", results.filter((r) => !r.ok).length, "fail");
})().catch((e) => { console.error("HARNESS_ERROR", e.message.slice(0, 300)); process.exit(1); });
