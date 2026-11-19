// Opportunities and paper-trading E2E tests.
import { test, expect } from "@playwright/test";

test.describe("Opportunities page", () => {
  test("loads without crashing", async ({ page }) => {
    await page.goto("/opportunities");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).not.toContainText("Application error");
    const body = await page.locator("body").textContent();
    expect(body).not.toContain("[object Object]");
  });

  test("renders opportunity grading or no-opportunities state", async ({ page }) => {
    await page.goto("/opportunities");
    await page.waitForLoadState("networkidle");
    // Either opportunity cards or an empty/unavailable state should be visible
    const body = await page.locator("body").textContent() ?? "";
    const hasContent = body.includes("NIFTY") || body.includes("BANKNIFTY") ||
      body.includes("No opportunities") || body.includes("Unavailable") || body.includes("opportunity");
    expect(hasContent, "Expected opportunity content or empty state").toBeTruthy();
  });
});

test.describe("Opportunity Journal page", () => {
  test("loads without crashing", async ({ page }) => {
    await page.goto("/opportunity-journal");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).not.toContainText("Application error");
  });

  test("shows paper trading section or auth banner", async ({ page }) => {
    await page.goto("/opportunity-journal");
    await page.waitForLoadState("networkidle");
    const body = await page.locator("body").textContent();
    // Either a paper trade list or an empty/auth state
    const hasPaperContent = (body?.includes("paper") || body?.includes("Paper") ||
      body?.includes("Session") || body?.includes("No trade") || body?.includes("authentication")) ?? false;
    expect(hasPaperContent).toBeTruthy();
  });
});

test.describe("Section router — paper trading section", () => {
  test("paper-trading section via router loads without crash", async ({ page }) => {
    await page.goto("/paper-trading");
    await page.waitForLoadState("networkidle");
    // Either the paper trading section or a redirect to the dashboard
    await expect(page.locator("body")).not.toContainText("Application error");
  });
});
