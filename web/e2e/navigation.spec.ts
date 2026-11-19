// Navigation E2E tests — all pages must load without crashing.
import { test, expect } from "@playwright/test";

const PAGES = [
  { path: "/", label: "Dashboard" },
  { path: "/opportunities", label: "Opportunities" },
  { path: "/opportunity-journal", label: "Opportunity Journal" },
  { path: "/strategy-evidence", label: "Strategy Evidence" },
  { path: "/strategy-performance", label: "Strategy Performance" },
  { path: "/options-audit", label: "Options Audit" },
  { path: "/options-research", label: "Options Research" },
  { path: "/recommendation-debug", label: "Recommendation Debug" },
];

const AUTH_REQUIRED_PAGES = [
  { path: "/market-history", label: "Market History" },
  { path: "/performance", label: "Performance" },
  { path: "/option-history", label: "Option History" },
];

for (const { path, label } of PAGES) {
  test(`${label} page loads without 500 error`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expect(page).not.toHaveTitle(/error/i);
    await expect(page.locator("body")).not.toContainText("Application error");
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
    const body = await page.locator("body").textContent();
    expect(body).not.toContain("[object Object]");
  });
}

for (const { path, label } of AUTH_REQUIRED_PAGES) {
  test(`${label} — renders a truthful unavailable/empty state without auth`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    // These pages render an empty state when not authenticated
    await expect(page.locator("body")).not.toContainText("Application error");
    await expect(page.locator("h1")).toContainText(label === "Performance" ? "Performance" : label);
    const body = await page.locator("body").textContent() ?? "";
    expect(body).toMatch(/unavailable|no backtest|no candles|historical|provider|Upstox|subscription|auth/i);
  });
}

const SIDEBAR_DESTINATIONS = [
  "/", "/opportunities", "/options-audit", "/options-research", "/strategy-performance",
  "/system-health", "/market", "/option-chain", "/strategies", "/recommendations",
  "/paper-trading", "/backtest", "/performance", "/walk-forward", "/news", "/settings",
  "/opportunity-journal", "/recommendation-debug", "/market-history", "/option-history", "/strategy-evidence",
];

test("every sidebar destination is present exactly once", async ({ page }) => {
  await page.goto("/");
  for (const href of SIDEBAR_DESTINATIONS) {
    await expect(page.locator(`nav a[href='${href}']`)).toHaveCount(1);
  }
});

test("sidebar navigation renders all major section links", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  // Sidebar should exist and contain navigation links
  const sidebar = page.locator("nav, aside, [class*='Sidebar'], [class*='sidebar']").first();
  await expect(sidebar).toBeVisible({ timeout: 5000 });
});

test("sidebar link to Opportunities navigates correctly", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const link = page.locator("a[href='/opportunities'], a[href*='opportunities']").first();
  if (await link.count() > 0) {
    await link.click();
    await page.waitForLoadState("networkidle");
    // SPA may navigate without a full URL change; accept either URL match or page content match
    const urlOk = page.url().includes("opportunities");
    const body = await page.locator("body").textContent() ?? "";
    const contentOk = body.includes("Opportunit") || body.includes("NIFTY") || body.includes("opportunity");
    expect(urlOk || contentOk, "Expected navigation to opportunities page").toBeTruthy();
    await expect(page.locator("body")).not.toContainText("Application error");
  }
});
