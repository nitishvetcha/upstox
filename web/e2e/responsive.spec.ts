import { test, expect } from "@playwright/test";

const routes = ["/", "/option-chain", "/paper-trading", "/performance", "/market-history"];
const sizes = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "laptop", width: 1280, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
];

for (const size of sizes) {
  test(`${size.name} layouts avoid document-level horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    for (const route of routes) {
      const consoleErrors: string[] = [];
      page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).not.toContainText("Application error");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${route} overflow at ${size.width}px`).toBeLessThanOrEqual(1);
      const jsErrors = consoleErrors.filter((x) => !x.includes("favicon") && !x.includes("server responded with a status of 5"));
      expect(jsErrors, `${route} console errors`).toEqual([]);
    }
  });
}
