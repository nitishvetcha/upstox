// Playwright E2E config — requires: npm install -D @playwright/test && npx playwright install chromium
// Run: npx playwright test
// Run with visible browser: npx playwright test --headed
// All tests use mock data; no live Upstox auth required.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // sequential to avoid port conflicts during dev
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: "http://localhost:3123",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // All tests run with mock provider so no Upstox token is needed
    extraHTTPHeaders: {},
  },

  // Auto-start a temporary dev server for E2E tests. Stopped after tests complete.
  webServer: {
    command: "MARKET_DATA_PROVIDER=mock TZ=Asia/Kolkata npx next dev -p 3123",
    url: "http://localhost:3123",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      MARKET_DATA_PROVIDER: "mock",
      TZ: "Asia/Kolkata",
      OPTION_QUOTE_LTT_ENABLED: "false",
      OPTION_QUOTE_CANARY_ENABLED: "false",
      APP_DATA_DIR: ".test-data/e2e-runtime",
      UPSTOX_TOKEN_FILE: ".test-data/no-upstox-token.json",
      SESSION_EVIDENCE_DIR: ".test-data/e2e-runtime/paper-sessions",
      PAPER_TRADES_DIR: ".test-data/e2e-runtime/paper-trades",
      PAPER_OPPORTUNITY_DIR: ".test-data/e2e-runtime/paper-opportunities",
      OPPORTUNITY_TRACK_DIR: ".test-data/e2e-runtime/opportunity-tracking",
      RECOMMENDATION_STORE_DIR: ".test-data/e2e-runtime/recommendations",
    },
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
