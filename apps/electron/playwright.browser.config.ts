import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./browser-tests",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
  ],
  webServer: [
    {
      command: "pnpm build:browser && pnpm preview:browser",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: false,
      timeout: 120_000,
      env: { FREESTYLE_BROWSER_MODE: "fixtures" },
    },
    {
      command:
        "pnpm --workspace-root exec turbo build --filter=@freestyle-voice/server... && node scripts/browser-test-server.mjs",
      url: "http://127.0.0.1:4651/api/health",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "pnpm dev:browser --port 5174",
      url: "http://127.0.0.1:5174",
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        FREESTYLE_BROWSER_MODE: "server",
        FREESTYLE_BROWSER_SERVER_URL: "http://127.0.0.1:4651",
        FREESTYLE_BROWSER_SERVER_TOKEN: "browser-e2e-only",
      },
    },
  ],
});
