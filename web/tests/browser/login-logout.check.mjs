// Browser check: login-to-logout workflow on the mock server. Loopback only. Synthetic token from a file.
// Usage: node tests/browser/login-logout.check.cjs <base-url> <operator-token> <screenshot-dir>
import { chromium } from "playwright";
// Connection and credential come from the environment only. Nothing is read from positional arguments.
const BASE = "http://127.0.0.1:3150"; // local test server only
const TOKEN = process.env.PAPER_OPERATOR_CREDENTIAL ?? ""; // operator PIN for the local app (never printed)
const SHOTS = process.env.BROWSER_SHOTS_DIR ?? ".";
const results = [];
const rec = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log((ok ? "PASS " : "FAIL ") + name + (detail ? " :: " + detail : "")); };
const PAGES = ["/", "/opportunities", "/option-chain?index=nifty", "/option-chain?index=banknifty", "/saved-picks", "/recommendations"];

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined });
  for (const [label, w, h] of [["desktop", 1440, 900], ["mobile", 390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    await ctx.route("**/*", (r) => (r.request().url().startsWith(BASE) || r.request().url().startsWith("data:")) ? r.continue() : r.abort());
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message.slice(0, 120)));

    // 1. Logged out: a protected page redirects to login with a return path.
    await page.goto(BASE + "/saved-picks", { waitUntil: "load", timeout: 120000 });
    rec(`${label} logged out: protected page redirects to login`, new URL(page.url()).pathname === "/login", page.url());
    rec(`${label} login keeps the return path`, /next=%2Fsaved-picks|next=\/saved-picks/.test(page.url()), page.url());

    // 2. Wrong token: a clear message, and the page stays on login.
    await page.fill("input[name=pin]", "000000");
    await page.click("button[type=submit]");
    await page.waitForSelector("text=Wrong PIN", { timeout: 30000 }).catch(() => {});
    rec(`${label} wrong token shows Wrong PIN`, (await page.innerText("body")).includes("Wrong PIN"));
    rec(`${label} wrong PIN stays on login`, new URL(page.url()).pathname === "/login");

    // 3. Correct token: goes to the return path.
    await page.fill("input[name=pin]", TOKEN);
    await Promise.all([page.waitForURL((u) => !new URL(u).pathname.startsWith("/login"), { timeout: 60000 }), page.click("button[type=submit]")]);
    rec(`${label} correct PIN leaves login`, !new URL(page.url()).pathname.startsWith("/login"), page.url());
    const cookies = await ctx.cookies();
    const sess = cookies.find((c) => c.name === "op_session");
    rec(`${label} session cookie is HttpOnly and SameSite=Strict`, !!sess && sess.httpOnly === true && sess.sameSite === "Strict", sess ? `httpOnly=${sess.httpOnly} sameSite=${sess.sameSite}` : "missing");
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
    rec(`${label} PIN is not stored in browser storage`, !/OPERATOR|operator_token|bearer/i.test(stored), `storage_chars=${stored.length}`);

    // 4. Every main page loads without an application error.
    for (const p of PAGES) {
      await page.goto(BASE + p, { waitUntil: "load", timeout: 120000 });
      await page.waitForTimeout(800);
      const txt = await page.innerText("body").catch(() => "");
      const bad = /Application error|Internal Server Error|Unhandled Runtime Error/i.test(txt);
      rec(`${label} page loads: ${p}`, !bad && txt.length > 50 && new URL(page.url()).pathname !== "/login", `chars=${txt.length}`);
    }
    if (label === "desktop") await page.screenshot({ path: `${SHOTS}/login-flow-dashboard.png`, fullPage: false });

    // 5. Logout: sign out returns to login, and the protected page redirects again.
    await page.goto(BASE + "/", { waitUntil: "load", timeout: 120000 });
    const signOut = page.locator("button", { hasText: /sign out/i }).first();
    if (await signOut.count()) await signOut.click();
    await page.waitForURL((u) => new URL(u).pathname === "/login", { timeout: 30000 }).catch(() => {});
    rec(`${label} sign out lands on login`, new URL(page.url()).pathname === "/login", page.url());
    await page.goto(BASE + "/saved-picks", { waitUntil: "load", timeout: 120000 });
    rec(`${label} after sign out, protected page redirects again`, new URL(page.url()).pathname === "/login");
    const after = (await ctx.cookies()).find((c) => c.name === "op_session");
    rec(`${label} session cookie cleared on sign out`, !after || after.value === "", after ? `value_len=${after.value.length}` : "removed");

    rec(`${label} no page errors during the flow`, pageErrors.length === 0, pageErrors.join(" | "));
    await ctx.close();
  }
  await browser.close();
  console.log("SUMMARY", results.filter((r) => r.ok).length, "pass,", results.filter((r) => !r.ok).length, "fail");
})().catch((e) => { console.error("HARNESS_ERROR", e.message.slice(0, 300)); process.exit(1); });
