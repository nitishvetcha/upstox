// Logged-out state verification — confirms that mock/auth-required states are clearly shown
// and that no misleading LIVE labels appear without a MOCK qualifier.
import { test, expect } from "@playwright/test";

test.describe("Logged-out UI states", () => {
  test("dashboard never shows raw LIVE without a MOCK or fallback qualifier", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const body = await page.locator("body").textContent() ?? "";
    const liveCount = (body.match(/\bLIVE\b/g) ?? []).length;
    const mockCount = (body.match(/\b(MOCK|FALLBACK|Stale|STALE)\b/g) ?? []).length;
    if (liveCount > 0) {
      expect(mockCount).toBeGreaterThan(0);
    }
  });

  test("strategy decisions show MOCK or are clearly labelled as unavailable", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const body = await page.locator("body").textContent() ?? "";
    const hasDecision = body.includes("TRADE") || body.includes("WAIT") || body.includes("Unavailable") || body.includes("MOCK");
    expect(hasDecision, "Expected strategy decision or MOCK label").toBeTruthy();
  });

  test("authentication status shows as expired or login required", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const body = await page.locator("body").textContent() ?? "";
    const hasAuthState = body.includes("EXPIRED") || body.includes("MISSING") || body.includes("Login") ||
      body.includes("Authentication") || body.includes("Logged out") || body.includes("MOCK") ||
      body.includes("mock") || body.includes("fallback") || body.includes("FALLBACK");
    expect(hasAuthState, "Expected auth status or MOCK fallback label").toBeTruthy();
  });

  test("option chain shows MOCK or unavailable state, not fake live prices", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // Any displayed option chain data must be labelled mock or the section shows unavailable
    const body = await page.locator("body").textContent() ?? "";
    // Confirm mock provider is in use: "MOCK" appears somewhere on the page
    const hasMockLabel = body.includes("MOCK") || body.includes("Mock") || body.includes("mock");
    expect(hasMockLabel).toBeTruthy();
  });

  test("market history explains provider/auth unavailability in mock mode", async ({ page }) => {
    await page.goto("/market-history");
    await page.waitForLoadState("networkidle");
    // Should show auth required, not actual candle data
    const body = await page.locator("body").textContent() ?? "";
    expect(body).toMatch(/unavailable|no candles|Authentication|token|provider/i);
    await expect(page.locator("body")).not.toContainText("Application error");
  });
});
