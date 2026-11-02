import { defineConfig, devices } from "@playwright/test";

// Live walkthrough for presentations: visible browser, slowed down, data is kept afterwards.
// Runs only against the Neon dev branch (same guard as e2e). Run: npm run demo
export default defineConfig({
  testDir: "./demo",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 15 * 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    headless: false,
    viewport: { width: 1440, height: 900 },
    launchOptions: { slowMo: 350 },
    acceptDownloads: true,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: true, timeout: 120000 },
});
