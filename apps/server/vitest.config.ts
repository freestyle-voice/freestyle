import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@freestyle-voice/validations": resolve(
        __dirname,
        "../../packages/validations/src/index.ts",
      ),
      "freestyle-voice": resolve(__dirname, "../../packages/sdk/src/index.ts"),
      "@freestyle-voice/utils": resolve(
        __dirname,
        "../../packages/utils/src/index.ts",
      ),
    },
  },
  test: {
    globals: true,
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    testTimeout: 10_000,
    pool: "forks",
  },
});
