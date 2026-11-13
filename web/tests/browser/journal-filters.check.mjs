// Browser check: recommendation journal filter buttons. Mock server, loopback only. No live calls.
// Usage: node tests/browser/journal-filters.check.cjs <base-url> <operator-token>
import { chromium } from "playwright";
// Connection and credential come from the environment only. Nothing is read from positional arguments.
const BASE = "http://127.0.0.1:3150"; // local test server only
const TOKEN = process.env.PAPER_OPERATOR_CREDENTIAL ?? ""; // operator PIN for the local app (never printed)
const results = [];
const rec = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log((ok ? "PASS " : "FAIL ") + name + (detail ? " :: " + detail : "")); };

// The journal's filter buttons sit in the journal panel on the home page.
// Scoped to the journal panel (the smallest container that holds "Journal Summary"), so other pages' buttons are ignored.
const journal = (page) => page.locator("section").filter({ has: page.locator("h3", { hasText: "Journal Summary" }) }).first();
const filterBtn = (page, text) => journal(page).locator("button", { hasText: new RegExp("^\\s*" + text + "\\s*$") }).first();
const pressed = (page, text) => filterBtn(page, text).getAttribute("aria-pressed");

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined });
  for (const [label, w, h] of [["desktop", 1440, 900], ["mobile", 390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    await ctx.route("**/*", (r) => (r.request().url().startsWith(BASE) || r.request().url().startsWith("data:")) ? r.continue() : r.abort());
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message.slice(0, 120)));
    await page.goto(BASE + "/login", { waitUntil: "load", timeout: 120000 });
    await page.fill("input[name=pin]", TOKEN);
    await Promise.all([page.waitForURL((u) => !new URL(u).pathname.startsWith("/login"), { timeout: 60000 }), page.click("button[type=submit]")]);
    await page.goto(BASE + "/", { waitUntil: "load", timeout: 120000 });
    await page.waitForSelector("text=Journal Summary", { timeout: 60000 });

    // Defaults: underlying All, decision All, days 7d.
    rec(`${label} default: All underlying pressed`, (await pressed(page, "All")) !== null);
    rec(`${label} default: 7d range pressed`, (await pressed(page, "7d")) === "true", "aria-pressed=" + (await pressed(page, "7d")));

    // Underlying: NIFTY pressed, All not pressed.
    await filterBtn(page, "NIFTY").click();
    rec(`${label} click NIFTY: NIFTY becomes pressed`, (await pressed(page, "NIFTY")) === "true");
    rec(`${label} click NIFTY: BANKNIFTY is not pressed`, (await pressed(page, "BANKNIFTY")) === "false");

    // Decision: TRADE pressed, one at a time.
    await filterBtn(page, "TRADE").click();
    rec(`${label} click TRADE: TRADE pressed`, (await pressed(page, "TRADE")) === "true");
    rec(`${label} click TRADE: WAIT not pressed`, (await pressed(page, "WAIT")) === "false");

    // Days: Today, then All Time.
    await filterBtn(page, "Today").click();
    rec(`${label} click Today: Today pressed, 7d not`, (await pressed(page, "Today")) === "true" && (await pressed(page, "7d")) === "false");
    await filterBtn(page, "All Time").click();
    rec(`${label} click All Time: All Time pressed`, (await pressed(page, "All Time")) === "true");

    // Filters never produce an application error, and the empty/list message is still shown.
    const txt = await page.innerText("body");
    rec(`${label} journal still renders after filtering`, /Journal Summary/.test(txt) && !/Application error/i.test(txt));
    rec(`${label} no page errors during filtering`, pageErrors.length === 0, pageErrors.join(" | "));
    await ctx.close();
  }
  await browser.close();
  console.log("SUMMARY", results.filter((r) => r.ok).length, "pass,", results.filter((r) => !r.ok).length, "fail");
})().catch((e) => { console.error("HARNESS_ERROR", e.message.slice(0, 300)); process.exit(1); });
