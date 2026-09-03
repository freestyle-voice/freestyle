import { createRequire } from "node:module";
import { resolve } from "node:path";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import { visualizer } from "rollup-plugin-visualizer";

const require = createRequire(import.meta.url);
const { version: electronVersion } = require("./package.json") as {
  version: string;
};

const workspaceAliases = {
  "freestyle-voice": resolve("../../packages/sdk/src/index.ts"),
  "@freestyle-voice/server": resolve("../server/src/index.ts"),
  "@freestyle-voice/utils": resolve("../../packages/utils/src/index.ts"),
  "@freestyle-voice/validations/cleanup-presets": resolve(
    "../../packages/validations/src/cleanup-presets.ts",
  ),
  "@freestyle-voice/validations": resolve(
    "../../packages/validations/src/index.ts",
  ),
};

// Bundle analysis is opt-in via `ANALYZE=1` (see the `analyze` npm script).
// Each build target writes its own treemap so reports don't clobber each other.
const analyze = process.env.ANALYZE === "1";
const uploadSentrySourceMaps = process.env.SENTRY_UPLOAD_SOURCEMAPS === "1";
const emitSourceMaps = analyze || uploadSentrySourceMaps;

type ElectronBuildTarget = "main" | "preload" | "renderer";

function sentrySourceMapPlugins(target: ElectronBuildTarget) {
  if (!uploadSentrySourceMaps) return [];

  const { SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT } = process.env;
  if (!SENTRY_AUTH_TOKEN || !SENTRY_ORG || !SENTRY_PROJECT) {
    throw new Error(
      "SENTRY_AUTH_TOKEN, SENTRY_ORG, and SENTRY_PROJECT are required when uploading source maps.",
    );
  }

  const release = { name: electronVersion, inject: false };
  if (target === "renderer") {
    return [
      sentryVitePlugin({
        org: SENTRY_ORG,
        project: SENTRY_PROJECT,
        authToken: SENTRY_AUTH_TOKEN,
        telemetry: false,
        sourcemaps: { disable: true },
        // Renderer failures are forwarded to the embedded server instead of
        // captured by a renderer SDK, so upload release artifacts that match
        // the app://renderer URLs in their forwarded stack frames.
        release: {
          ...release,
          uploadLegacySourcemaps: {
            paths: ["out/renderer"],
            urlPrefix: "app://renderer",
            rewrite: true,
            stripCommonPrefix: true,
          },
        },
      }),
    ];
  }

  return [
    sentryVitePlugin({
      org: SENTRY_ORG,
      project: SENTRY_PROJECT,
      authToken: SENTRY_AUTH_TOKEN,
      telemetry: false,
      release,
      sourcemaps: {
        filesToDeleteAfterUpload: [`out/${target}/**/*.map`],
      },
    }),
  ];
}

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
    plugins: sentrySourceMapPlugins("main"),
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
      sourcemap: emitSourceMaps,
      rollupOptions: {
        external: ["electron", "bufferutil", "utf-8-validate"],
        plugins: analyze ? [mkVisualizer("main")] : [],
      },
    },
  },
  preload: {
    plugins: sentrySourceMapPlugins("preload"),
    build: {
      sourcemap: emitSourceMaps,
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
      // Several restored legacy surfaces and the current notification client
      // share React. Force one renderer copy across the multi-page build so a
      // provider from one entry never invokes hooks against another copy.
      dedupe: ["react", "react-dom"],
      alias: {
        ...workspaceAliases,
        "@renderer": resolve("src/renderer/src"),
        "@shared": resolve("src/shared"),
      },
    },
    plugins: [react(), tailwindcss(), ...sentrySourceMapPlugins("renderer")],
    build: {
      sourcemap: emitSourceMaps,
      rollupOptions: {
        input: {
          index: resolve("src/renderer/index.html"),
          companion: resolve("src/renderer/companion.html"),
          notification: resolve("src/renderer/notification.html"),
          panel: resolve("src/renderer/panel.html"),
          pill: resolve("src/renderer/pill.html"),
        },
        plugins: analyze ? [mkVisualizer("renderer")] : [],
      },
    },
  },
});
