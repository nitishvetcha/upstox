// Browser check: dashboard price chart and technical indicators.
// Real mock response is checked as-is. LIVE / STALE / error / loading / switching cases use TEST FIXTURES served only inside
// the browser (page.route). Fixture values are fixed test inputs for rendering checks; they are not market data.
// Loopback only. No live Upstox or NSE requests.
// Usage: node tests/browser/technical-chart.check.cjs <base-url> <operator-token> <screenshot-dir>
import { chromium } from "playwright";

// Connection and credential come from the environment only. Nothing is read from positional arguments.
const BASE = "http://127.0.0.1:3150"; // local test server only
const TOKEN = process.env.PAPER_OPERATOR_CREDENTIAL ?? ""; // operator PIN for the local app (never printed)
const SHOTS = process.env.BROWSER_SHOTS_DIR ?? ".";
const results = [];
const rec = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log((ok ? "PASS " : "FAIL ") + name + (detail ? " :: " + detail : "")); };

// TEST FIXTURE (rendering input only). Values are fixed so the displayed numbers can be compared exactly.
function fixture(index, status) {
  const series = [0, 1, 2, 3, 4].map((i) => ({
    t: new Date(Date.UTC(2026, 10, 11, 4, 0 + i * 15)).toISOString(),
    close: 25000 + i * 10,
    ema9: 24990 + i * 10,
    ema21: 24980 + i * 10,
    vwap: 25005 + i * 5,
  }));
  return {
    index, timeframe: "15m", status, source: status, provider: "TEST_FIXTURE", fetchedAt: "2026-11-11T04:30:00.000Z",
    lastCandleCloseAt: "2026-11-11T04:45:00.000Z", unavailableReason: null,
    ema9: 25090, ema21: 25045, ema50: 24960, ema200: null,
    rsi: 61.44, rsiState: "BULLISH", macd: 12.5, macdSignal: 6.25, macdHistogram: 6.25, macdState: "RISING",
    atr: 182.3, atrPercent: 0.73, dailyAtr: 410,
    vwap: null,
    futuresVwap: { instrument: "NIFTY FUT 26 NOV 26", price: 25120, vwap: 25100.5, distance: 19.5, distancePercent: 0.08, state: "ABOVE" },
    previousDayHigh: 25064, previousDayLow: 24921, previousDayClose: 25012, openingRangeHigh: 25096, openingRangeLow: 25038,
    series,
  };
}

// Value of one indicator row, read from the DOM (the note sits between label and value in innerText).
const valueOf = (page, label) => page.evaluate((l) => {
  const dt = [...document.querySelectorAll("[aria-label='Technical indicators'] dt")].find((d) => d.firstChild && d.firstChild.textContent.trim() === l);
  return dt ? dt.nextElementSibling.textContent.trim() : null;
}, label);
const noteOf = (page, label) => page.evaluate((l) => {
  const dt = [...document.querySelectorAll("[aria-label='Technical indicators'] dt")].find((d) => d.firstChild && d.firstChild.textContent.trim() === l);
  return dt ? dt.textContent : null;
}, label);

const json = (body, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });

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

    // A. Real mock response (no fixture). Chart indicators must equal the technicals cards and the snapshot values.
    await page.goto(BASE + "/", { waitUntil: "load", timeout: 120000 });
    await page.waitForSelector("[aria-label='Technical indicators']", { timeout: 60000 });
    let body = await page.innerText("body");
    rec(`${label} mock: no candles, so the price line is NOT AVAILABLE`, /Technical data: NOT AVAILABLE/.test(body));
    rec(`${label} mock: header badge is MOCK DATA · NOT LIVE`, /NIFTY 50[\s\S]{0,80}MOCK DATA · NOT LIVE/.test(body));
    const niftyEma9 = await valueOf(page, "EMA 9");
    rec(`${label} mock NIFTY: chart EMA 9 = snapshot 25,090.00`, niftyEma9 === "25,090.00", "shown=" + niftyEma9);
    rec(`${label} mock NIFTY: cards show the same EMA 9 / 21 (25,090 / 25,045)`, body.includes("25,090 / 25,045"));
    rec(`${label} mock NIFTY: EMA 200 = snapshot 24,610.00`, (await valueOf(page, "EMA 200")) === "24,610.00");
    rec(`${label} mock NIFTY: RSI 14 = snapshot 61.4`, (await valueOf(page, "RSI 14")) === "61.4");
    rec(`${label} mock NIFTY: MACD histogram = snapshot 6.20`, (await valueOf(page, "MACD histogram")) === "6.20");
    rec(`${label} mock NIFTY: daily ATR = snapshot 182.00 (not shown as 15m ATR)`, (await valueOf(page, "Daily ATR")) === "182.00" && (await valueOf(page, "ATR 14 (candles)")) === "N/A");
    rec(`${label} mock NIFTY: previous day high = snapshot 25,064`, (await valueOf(page, "Previous day high")) === "25,064");
    rec(`${label} mock NIFTY: MACD signal not in snapshot, shown N/A`, (await valueOf(page, "MACD signal")) === "N/A");
    if (label === "desktop") await page.screenshot({ path: `${SHOTS}/technical-mock-desktop.png`, fullPage: true });

    // A2. BANK NIFTY mock: own snapshot values, no LIVE label.
    await page.click("button[aria-pressed][aria-pressed]:has-text('BANK NIFTY')");
    await page.waitForTimeout(1500);
    body = await page.innerText("body");
    const bEma9 = await valueOf(page, "EMA 9");
    rec(`${label} mock BANK NIFTY: chart EMA 9 = snapshot 56,280.00`, bEma9 === "56,280.00", "shown=" + bEma9);
    rec(`${label} mock BANK NIFTY: cards show 56,280 / 56,310`, body.includes("56,280 / 56,310"));
    rec(`${label} mock BANK NIFTY: RSI 14 = snapshot 47.2`, (await valueOf(page, "RSI 14")) === "47.2");
    rec(`${label} mock BANK NIFTY: still MOCK, never LIVE`, /MOCK DATA · NOT LIVE/.test(body) && !/\bLIVE\b\s*\n?\s*(15m|Last)/.test(body));
    if (label === "desktop") await page.screenshot({ path: `${SHOTS}/technical-mock-banknifty-desktop.png`, fullPage: true });
    await page.click("button[aria-pressed][aria-pressed]:has-text('NIFTY 50')");
    await page.waitForTimeout(1000);

    // B. LIVE fixture for NIFTY: series and every displayed value.
    const seen = [];
    await page.route("**/api/technical/nifty?*", (route) => { seen.push(route.request().url()); return route.fulfill(json(fixture("NIFTY 50", "LIVE"))); });
    await page.reload({ waitUntil: "load", timeout: 120000 });
    await page.waitForSelector("[aria-label='Technical indicators']", { timeout: 60000 });
    body = await page.innerText("body");
    const panel = await page.innerText("[aria-label='Technical indicators']");
    rec(`${label} LIVE: index, timeframe and LIVE badge shown`, /NIFTY 50/.test(body) && /15m candles/.test(body) && /\bLIVE\b/.test(body));
    rec(`${label} LIVE: chart rendered from series`, (await page.$("[role=img][aria-label*='EMA 9']")) !== null);
    rec(`${label} LIVE: EMA 9 matches backend value 25,090.00`, /EMA 9\s*25,090\.00/.test(panel), panel.replace(/\s+/g, " ").slice(0, 120));
    rec(`${label} LIVE: EMA 200 null shown as N/A, not zero`, /EMA 200\s*N\/A/.test(panel));
    const rsi = await valueOf(page, "RSI 14");
    rec(`${label} LIVE: RSI 14 matches backend value 61.44 (shown 61.4)`, rsi === "61.4", "shown=" + rsi);
    rec(`${label} LIVE: RSI state shown as note`, /BULLISH/.test((await noteOf(page, "RSI 14")) ?? ""));
    const mh = await valueOf(page, "MACD histogram");
    rec(`${label} LIVE: MACD histogram matches backend 6.25`, mh === "6.25", "shown=" + mh);
    rec(`${label} LIVE: spot VWAP null shows reason`, /Spot VWAP[\s\S]*Index candles carry no volume/.test(panel));
    const fv = await valueOf(page, "Futures VWAP");
    rec(`${label} LIVE: futures VWAP matches backend 25,100.50`, fv === "25,100.50", "shown=" + fv);
    rec(`${label} LIVE: futures VWAP shows instrument and state`, /NIFTY FUT 26 NOV 26 · ABOVE/.test((await noteOf(page, "Futures VWAP")) ?? ""));
    rec(`${label} LIVE: previous day high 25,064`, /Previous day high\s*25,064/.test(panel));
    rec(`${label} LIVE: last candle shown`, /Last candle/.test(body));
    if (label === "desktop") await page.screenshot({ path: `${SHOTS}/technical-live-nifty-desktop.png`, fullPage: true });
    await page.unroute("**/api/technical/nifty?*");

    // C. STALE fixture.
    await page.route("**/api/technical/nifty?*", (route) => route.fulfill(json(fixture("NIFTY 50", "STALE"))));
    await page.reload({ waitUntil: "load", timeout: 120000 });
    await page.waitForSelector("[aria-label='Technical indicators']", { timeout: 60000 });
    rec(`${label} STALE: badge shows STALE, not LIVE`, /\bSTALE\b/.test(await page.innerText("body")));
    await page.unroute("**/api/technical/nifty?*");

    // D. Failed response (HTTP 500).
    await page.route("**/api/technical/nifty?*", (route) => route.fulfill(json({ error: "fixture failure" }, 500)));
    await page.reload({ waitUntil: "load", timeout: 120000 });
    await page.waitForSelector("text=Request failed", { timeout: 60000 }).catch(() => {});
    body = await page.innerText("body");
    rec(`${label} error: failure shown, no indicator numbers`, /Request failed/.test(body) && !/EMA 9\s*\d/.test(body));
    await page.unroute("**/api/technical/nifty?*");

    // E. Loading state: response delayed.
    await page.route("**/api/technical/nifty?*", async (route) => { await new Promise((r) => setTimeout(r, 2500)); return route.fulfill(json(fixture("NIFTY 50", "LIVE"))); });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
    rec(`${label} loading state shown while request pending`, (await page.innerText("body")).includes("Loading candles"));
    await page.waitForSelector("[aria-label='Technical indicators']", { timeout: 60000 });
    await page.unroute("**/api/technical/nifty?*");

    // F. Index switch to BANK NIFTY: request and header follow the selection.
    const bankReqs = [];
    await page.route("**/api/technical/banknifty?*", (route) => { bankReqs.push(route.request().url()); return route.fulfill(json({ ...fixture("BANKNIFTY", "LIVE"), index: "BANKNIFTY", ema9: 56280 })); });
    await page.route("**/api/technical/nifty?*", (route) => route.fulfill(json(fixture("NIFTY 50", "LIVE"))));
    await page.reload({ waitUntil: "load", timeout: 120000 });
    await page.waitForSelector("[aria-label='Technical indicators']", { timeout: 60000 });
    await page.click("button[aria-pressed][aria-pressed]:has-text('BANK NIFTY')");
    await page.waitForFunction(() => /BANKNIFTY/.test(document.body.innerText), null, { timeout: 30000 });
    const bpanel = await page.innerText("[aria-label='Technical indicators']");
    rec(`${label} switch: BANK NIFTY EMA 9 shows its own backend value 56,280.00`, /EMA 9\s*56,280\.00/.test(bpanel), bpanel.replace(/\s+/g, " ").slice(0, 80));
    rec(`${label} switch: BANK NIFTY request issued for 15m`, bankReqs.some((u) => /banknifty\?timeframe=15m/.test(u)), bankReqs[0] ?? "none");
    if (label === "desktop") await page.screenshot({ path: `${SHOTS}/technical-banknifty-desktop.png`, fullPage: true });
    await page.unroute("**/api/technical/banknifty?*");
    await page.unroute("**/api/technical/nifty?*");

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    rec(`${label} no horizontal overflow`, overflow === 0, "overflowPx=" + overflow);
    rec(`${label} no page errors`, pageErrors.length === 0, pageErrors.join(" | "));
    await ctx.close();
  }
  await browser.close();
  console.log("SUMMARY", results.filter((r) => r.ok).length, "pass,", results.filter((r) => !r.ok).length, "fail");
})().catch((e) => { console.error("HARNESS_ERROR", e.message.slice(0, 300)); process.exit(1); });
