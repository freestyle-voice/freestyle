import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

export default defineConfig({
  main: {
    define: {
      "process.env.NODE_ENV": JSON.stringify(
        process.env.NODE_ENV || "production",
      ),
    },
    build: {
      externalizeDeps: false,
      rollupOptions: {
        external: [
          "electron",
          "bufferutil",
          "utf-8-validate",
          // Spawns the bundled Claude Code binary at runtime; must not be
          // inlined by the bundler (and is asarUnpack'd — see electron-builder.yml).
          "@anthropic-ai/claude-agent-sdk",
        ],
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
        "@renderer": resolve("src/renderer/src"),
      },
    },
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: {
          index: resolve("src/renderer/index.html"),
          pill: resolve("src/renderer/pill.html"),
          bar: resolve("src/renderer/bar.html"),
          overlay: resolve("src/renderer/overlay.html"),
        },
      },
    },
  },
});
