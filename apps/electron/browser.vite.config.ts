import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import {
  defineConfig,
  loadEnv,
  type PreviewServer,
  type ProxyOptions,
  type ViteDevServer,
} from "vite";

function guardBrowserRequests(server: ViteDevServer | PreviewServer): void {
  server.middlewares.use((req, res, next) => {
    const origin = req.headers.origin;
    let path: string;
    try {
      path = decodeURIComponent(
        new URL(req.url ?? "/", "http://localhost").pathname,
      );
    } catch {
      res.statusCode = 400;
      res.end("Invalid URL");
      return;
    }
    if (
      (origin && origin !== `http://${req.headers.host}`) ||
      ["cross-site", "same-site"].includes(
        String(req.headers["sec-fetch-site"]),
      ) ||
      /^\/api\/plugins\/[^/]+\/ui(?:\/|$)/.test(path)
    ) {
      res.statusCode = 403;
      res.end(
        "Browser development server accepts first-party requests only; native plugin views require Electron.",
      );
      return;
    }
    next();
  });
}

export function browserProxyTarget(
  env: Record<string, string | undefined>,
): string | null {
  const mode = env.FREESTYLE_BROWSER_MODE || "fixtures";
  if (mode === "fixtures") return null;
  if (mode !== "server") throw new Error(`Unknown browser mode: ${mode}`);
  if (!env.FREESTYLE_BROWSER_SERVER_URL)
    throw new Error(
      "Server mode requires FREESTYLE_BROWSER_SERVER_URL pointing to an isolated development server.",
    );
  const target = new URL(env.FREESTYLE_BROWSER_SERVER_URL);
  if (
    !["http:", "https:"].includes(target.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
    target.username ||
    target.password ||
    target.pathname !== "/" ||
    target.search ||
    target.hash
  ) {
    throw new Error(
      "Browser server target must be a loopback HTTP(S) origin without credentials, path, query, or fragment.",
    );
  }
  return target.origin;
}

export default defineConfig(({ mode }) => {
  const env = {
    ...loadEnv(mode, __dirname, "FREESTYLE_BROWSER_"),
    ...process.env,
  };
  const target = browserProxyTarget(env);
  const proxy: Record<string, ProxyOptions> | undefined = target
    ? Object.fromEntries(
        ["/api", "/stream"].map((path) => [
          path,
          {
            target,
            changeOrigin: true,
            ws: true,
            headers: env.FREESTYLE_BROWSER_SERVER_TOKEN
              ? {
                  Authorization: `Bearer ${env.FREESTYLE_BROWSER_SERVER_TOKEN}`,
                }
              : undefined,
            // The backend's browser-compatible WebSocket auth contract uses a
            // query token. Add it only on the server-side hop, never in JS.
            rewrite:
              path === "/stream" && env.FREESTYLE_BROWSER_SERVER_TOKEN
                ? (requestPath) => {
                    const url = new URL(requestPath, "http://loopback");
                    url.searchParams.set(
                      "token",
                      env.FREESTYLE_BROWSER_SERVER_TOKEN ?? "",
                    );
                    return `${url.pathname}${url.search}`;
                  }
                : undefined,
            configure(proxy) {
              // From the backend's perspective the first-party UI is on another
              // origin. Preserve its plugin guard while proxying that first-party UI.
              proxy.on("proxyReq", (request) =>
                request.setHeader("Sec-Fetch-Site", "cross-site"),
              );
              proxy.on("proxyReqWs", (outgoing, incoming) => {
                if (
                  incoming.headers.origin !== `http://${incoming.headers.host}`
                ) {
                  outgoing.destroy();
                  return;
                }
                outgoing.setHeader("Sec-Fetch-Site", "cross-site");
              });
            },
          },
        ]),
      )
    : undefined;

  return {
    root: resolve(__dirname, "src/renderer"),
    // No envPrefix expansion: only these non-secret values enter the bundle.
    define: {
      __FREESTYLE_BROWSER_MODE__: JSON.stringify(
        target ? "server" : "fixtures",
      ),
      "process.platform": JSON.stringify(process.platform),
    },
    resolve: {
      dedupe: ["react", "react-dom"],
      alias: {
        "@renderer": resolve(__dirname, "src/renderer/src"),
        "@shared": resolve(__dirname, "src/shared"),
        "freestyle-voice": resolve(
          __dirname,
          "../../packages/sdk/src/index.ts",
        ),
        "@freestyle-voice/utils": resolve(
          __dirname,
          "../../packages/utils/src/index.ts",
        ),
        "@freestyle-voice/validations/cleanup-presets": resolve(
          __dirname,
          "../../packages/validations/src/cleanup-presets.ts",
        ),
        "@freestyle-voice/validations": resolve(
          __dirname,
          "../../packages/validations/src/index.ts",
        ),
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: "freestyle-browser-bootstrap",
        transformIndexHtml: {
          order: "pre",
          handler(html) {
            return html.replace(
              /src="\/src\/(?:dashboard|components\/(?:pill|notification))\.tsx"/g,
              'src="/src/browser/bootstrap.ts"',
            );
          },
        },
        configureServer: guardBrowserRequests,
        configurePreviewServer: guardBrowserRequests,
      },
    ],
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      cors: false,
      proxy,
    },
    preview: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      cors: false,
      proxy,
    },
    build: {
      outDir: resolve(__dirname, "out/browser"),
      emptyOutDir: true,
      rollupOptions: {
        input: Object.fromEntries(
          ["index", "panel", "pill", "notification"].map((name) => [
            name,
            resolve(__dirname, `src/renderer/${name}.html`),
          ]),
        ),
      },
    },
  };
});
