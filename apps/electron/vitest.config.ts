import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@renderer": resolve(__dirname, "src/renderer/src"),
      "@shared": resolve(__dirname, "src/shared"),
    },
  },
  test: {
    globals: true,
    include: [
      "src/renderer/**/*.test.ts",
      "src/main/**/*.test.ts",
      "src/shared/**/*.test.ts",
    ],
    environment: "node",
  },
});
