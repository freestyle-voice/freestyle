import { defineConfig } from "vitest/config";
import config from "./vitest.config.js";

export default defineConfig({
  ...config,
  test: {
    ...config.test,
    include: ["tests/standalone-lifecycle.e2e.ts"],
    setupFiles: [],
    testTimeout: 30_000,
  },
});
