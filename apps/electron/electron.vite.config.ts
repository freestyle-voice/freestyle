import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import { visualizer } from "rollup-plugin-visualizer";

const workspaceAliases = {
  "freestyle-voice": resolve("../../packages/sdk/src/index.ts"),
  "@freestyle-voice/server": resolve("../server/src/index.ts"),
  "@freestyle-voice/utils": resolve("../../packages/utils/src/index.ts"),
  "@freestyle-voice/validations": resolve(
    "../../packages/validations/src/index.ts",
  ),
};

// Bundle analysis is opt-in via `ANALYZE=1` (see the `analyze` npm script).
// Each build target writes its own treemap so reports don't clobber each other.
const analyze = process.env.ANALYZE === "1";
const mkVisualizer = (name: string) =>
  visualizer({
    filename: resolve(`stats/${name}.html`),
    template: "treemap",
    gzipSize: true,
    brotliSize: true,
    emitFile: false,
  });

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
      sourcemap: analyze,
      rollupOptions: {
        external: ["electron", "bufferutil", "utf-8-validate"],
        plugins: analyze ? [mkVisualizer("main")] : [],
      },
    },
  },
  preload: {
    build: {
      sourcemap: analyze,
      rollupOptions: {
        input: {
          index: resolve("src/preload/index.ts"),
          "plugin-bridge": resolve("src/preload/plugin-bridge.ts"),
        },
        plugins: analyze ? [mkVisualizer("preload")] : [],
      },
    },
  },
  renderer: {
    define: {
      "process.platform": JSON.stringify(process.platform),
    },
    resolve: {
      alias: {
        ...workspaceAliases,
        "@renderer": resolve("src/renderer/src"),
        "@shared": resolve("src/shared"),
      },
    },
    plugins: [react(), tailwindcss()],
    build: {
      sourcemap: analyze,
      rollupOptions: {
        input: {
          index: resolve("src/renderer/index.html"),
          pill: resolve("src/renderer/pill.html"),
        },
        plugins: analyze ? [mkVisualizer("renderer")] : [],
      },
    },
  },
});
