import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  retries: 0,
  workers: 1, // Electron tests must run serially
  reporter: "list",
  use: {
    trace: "retain-on-failure",
  },
});
