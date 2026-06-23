import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

const workspaceAliases = {
  "@freestyle/sdk": resolve("../../packages/sdk/src/index.ts"),
  "@freestyle/server": resolve("../server/src/index.ts"),
  "@freestyle/utils": resolve("../../packages/utils/src/index.ts"),
  "@freestyle/validations": resolve("../../packages/validations/src/index.ts"),
};

export default defineConfig({
  main: {
    resolve: {
      alias: workspaceAliases,
    },
    define: {
      "process.env.NODE_ENV": JSON.stringify(
        process.env.NODE_ENV || "production",
      ),
    },
    build: {
      externalizeDeps: false,
      rollupOptions: {
        external: ["electron", "bufferutil", "utf-8-validate"],
      },
    },
  },
  preload: {},
  renderer: {
    define: {
      "process.platform": JSON.stringify(process.platform),
    },
    resolve: {
      alias: {
        ...workspaceAliases,
        "@renderer": resolve("src/renderer/src"),
      },
    },
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: {
          index: resolve("src/renderer/index.html"),
          pill: resolve("src/renderer/pill.html"),
        },
      },
    },
  },
});
