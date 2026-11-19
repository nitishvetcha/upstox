// Dashboard E2E tests — mock data only, no Upstox auth required.
// Prerequisites: @playwright/test installed, dev server running on :3123 with MARKET_DATA_PROVIDER=mock
import { test, expect } from "@playwright/test";

test.describe("Dashboard — logged-out / mock state", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for the main content to settle (mock data loads synchronously)
    await page.waitForLoadState("networkidle");
  });

  test("dashboard loads without a 500 error", async ({ page }) => {
    await expect(page).not.toHaveTitle(/error/i);
    // No Next.js error overlay
    await expect(page.locator("body")).not.toContainText("Application error");
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
  });

  test("no raw [object Object] or undefined visible on page", async ({ page }) => {
    const body = await page.locator("body").textContent();
    expect(body).not.toContain("[object Object]");
    // "undefined" appears in legitimate text (e.g. "undefined behavior") so only flag bare 'undefined' as a value
    expect(body).not.toMatch(/:\s*undefined\b/);
  });

  test("NIFTY market card renders", async ({ page }) => {
    await expect(page.getByText("NIFTY", { exact: false }).first()).toBeVisible({ timeout: 5000 });
  });

  test("BANKNIFTY market card renders", async ({ page }) => {
    await expect(page.getByText("BANKNIFTY", { exact: false }).first()).toBeVisible({ timeout: 5000 });
  });

  test("authentication status is visible (MOCK or auth required label)", async ({ page }) => {
    // Either a MOCK FALLBACK banner OR an auth required message should be present
    const body = await page.locator("body").textContent() ?? "";
    const hasMock = body.includes("MOCK") || body.includes("Mock");
    const hasAuth = body.includes("Authentication") || body.includes("Login") || body.includes("EXPIRED");
    expect(hasMock || hasAuth, "Expected MOCK label or auth status").toBeTruthy();
  });

  test("recommendation card or wait/no-trade state renders", async ({ page }) => {
    // Strategy produces TRADE / WAIT / NO TRADE — one of these must appear in body text
    const body = await page.locator("body").textContent() ?? "";
    const hasDecision = body.includes("TRADE") || body.includes("WAIT") || body.includes("NO TRADE") || body.includes("Recommendation");
    expect(hasDecision, "Expected TRADE/WAIT/NO TRADE or Recommendation text").toBeTruthy();
  });

  test("news panel renders with at least one item or a no-news state", async ({ page }) => {
    // Either news items or an empty state message
    const body = await page.locator("body").textContent() ?? "";
    const hasNews = body.includes("News") || body.includes("Sentiment") || body.includes("events") || body.includes("event");
    expect(hasNews, "Expected news or sentiment section text").toBeTruthy();
  });

  test("data source label is not misleadingly LIVE when logged out", async ({ page }) => {
    // When logged out, the source must never show as plain LIVE without qualification
    const body = await page.locator("body").textContent();
    // A naked "LIVE" badge without MOCK context is a misleading label
    // (MOCK FALLBACK and STALE are acceptable)
    const nakedLive = (body?.match(/\bLIVE\b/g) ?? []).length;
    const mockCount = (body?.match(/\bMOCK\b/g) ?? []).length;
    if (nakedLive > 0) {
      // If LIVE appears, MOCK must also appear somewhere to indicate fallback context
      expect(mockCount).toBeGreaterThan(0);
    }
  });
});
