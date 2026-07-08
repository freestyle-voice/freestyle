import { createAppLogger } from "@freestyle-voice/utils";
import { type ServerType, serve } from "@hono/node-server";
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { requestId } from "hono/request-id";
import { timeout } from "hono/timeout";
import { isTransientCloudError } from "./lib/freestyle-cloud.js";
import { startHistoryRetentionSweep } from "./lib/history-store.js";
import { reconcileUnsupportedMlxVoiceDefault } from "./lib/mlx-asr/reconcile.js";
import {
  activateManagedMlxRuntimeForAppVersion,
  prefetchManagedMlxRuntimeForAppRelease,
} from "./lib/mlx-asr/runtime.js";
import { configureNetwork } from "./lib/network.js";
import {
  disposeServerPlugins,
  initServerPlugins,
  plugins,
} from "./lib/plugins/index.js";
import { captureException, shutdownPosthog } from "./lib/posthog.js";
import { trustedOriginMiddleware } from "./lib/trusted-origin.js";
import routes from "./routes";
import { autoStartMlxAsrServer } from "./routes/mlx-asr.js";
import { autoStartWhisperServer } from "./routes/whisper.js";

const httpLog = createAppLogger("http");

// Lightweight CRUD routers get a request timeout. Transcription, post-process,
// model downloads (whisper/mlx-asr), and the auth device-flow poll are
// intentionally excluded — they can legitimately run longer than this window.
const REQUEST_TIMEOUT_MS = 30_000;
const TIMEOUT_PREFIXES = [
  "/api/settings",
  "/api/keys",
  "/api/dictionary",
  "/api/vocabulary",
  "/api/history",
  "/api/models",
  "/api/plugins",
  "/api/usage",
];

async function shutdownServer(): Promise<void> {
  await disposeServerPlugins().catch(() => {});
  await shutdownPosthog();
}

process.on("SIGINT", () => shutdownServer().finally(() => process.exit(0)));
process.on("SIGTERM", () => shutdownServer().finally(() => process.exit(0)));

/**
 * Build the Hono app with plugin middleware injected in resolved order between
 * the hardcoded security middleware and routes. Called after plugins are loaded
 * so `middleware` contributions are available at construction time.
 */
function createApp(pluginMiddleware: MiddlewareHandler[] = []) {
  const base = new Hono()
    .use(trustedOriginMiddleware)
    // CORS for renderer requests
    .use(cors())
    // Correlation id per request (also surfaced via the X-Request-Id header).
    .use(requestId())
    // Access log — routed through the app logger at debug level, so it shows in
    // dev but stays quiet in production. Only method/path/status are logged.
    .use(
      logger((message, ...rest) => httpLog.debug([message, ...rest].join(" "))),
    );

  // Request timeout on lightweight CRUD routers only (see TIMEOUT_PREFIXES).
  for (const prefix of TIMEOUT_PREFIXES) {
    base.use(prefix, timeout(REQUEST_TIMEOUT_MS));
    base.use(`${prefix}/*`, timeout(REQUEST_TIMEOUT_MS));
  }

  // Mount plugin middleware in resolved order (enforce: pre → none → post).
  for (const mw of pluginMiddleware) {
    base.use(mw);
  }

  const app = base
    .onError((err, c) => {
      // Let Hono's own exceptions (e.g. bearerAuth's 401) keep their response,
      // but still report genuine server errors.
      if (err instanceof HTTPException) {
        if (err.status >= 500) captureException(err);
        const res = err.getResponse();
        // Preserve CORS so the cross-origin renderer can read auth errors.
        const origin = c.req.header("origin");
        if (origin) res.headers.set("Access-Control-Allow-Origin", origin);
        return res;
      }
      // Transient network faults (e.g. `fetch failed` / ECONNRESET when calling
      // Freestyle Cloud) and upstream 5xx responses aren't app defects. Every
      // route already guards its own reporting; guard here too so anything that
      // escapes to this catch-all still gets a graceful 500 without polluting
      // error tracking with outages outside our control.
      if (!isTransientCloudError(err)) captureException(err);
      return c.json({ error: "Internal server error" }, 500);
    })
    .get("/", (c) => c.text("Freestyle API"))
    .route("/", routes);

  return app;
}

export interface StartServerOptions {
  /** Port to listen on. Defaults to 4649. Use 0 for a random free port. */
  port?: number;
  /**
   * Host/interface to bind to. Defaults to "127.0.0.1" (loopback only).
   * Set to "0.0.0.0" to accept connections from outside the machine
   * (e.g. when running the server standalone inside a container/VM).
   */
  host?: string;
}

export interface RunningServer {
  server: ServerType;
  /** The actual port bound (useful when `port` was 0). */
  port: number;
}

/**
 * Start the Freestyle HTTP server.
 *
 * Shared by the Electron main process (loopback, in-process) and the
 * standalone container entrypoint (see startup.ts).
 *
 * Plugins are loaded first so their contributed middleware is available when the
 * Hono app is constructed. User plugins are discovered from settings + disk.
 */
export async function startServer(
  options: StartServerOptions = {},
): Promise<RunningServer> {
  const { port = 4649, host = "127.0.0.1" } = options;

  // Install the global network dispatcher (corporate proxy + custom CA) before
  // anything issues a fetch, so model downloads and cloud/API calls honor it.
  configureNetwork();

  // Load plugins (built-in + user) before constructing the app so middleware
  // contributions are mounted at the correct position in the chain.
  await initServerPlugins();

  const pluginMiddleware = plugins().collectMiddleware();
  const app = createApp(pluginMiddleware);

  startHistoryRetentionSweep();

  return new Promise((resolve, reject) => {
    const server = serve(
      {
        fetch: app.fetch,
        port,
        hostname: host,
      },
      (info) => {
        resolve({ server, port: info.port });
      },
    );
    // Reject if the server fails to bind (e.g. EADDRINUSE) before listening.
    server.once("error", reject);
  });
}

export { closeDb, writeSetting } from "./lib/db.js";
export { stopMlxServer } from "./lib/mlx-asr/server.js";
export { configureNetwork } from "./lib/network.js";
export {
  disposeServerPlugins,
  reloadServerPlugins,
} from "./lib/plugins/index.js";
export {
  type InstalledPackage,
  installPackage,
  type ResolvedPackage,
  resolvePackage,
  uninstallPackage,
} from "./lib/plugins/installer.js";
export { captureException, shutdownPosthog } from "./lib/posthog.js";
export { stopServer as stopWhisperServer } from "./lib/whisper/server.js";
export {
  activateManagedMlxRuntimeForAppVersion,
  autoStartMlxAsrServer,
  autoStartWhisperServer,
  prefetchManagedMlxRuntimeForAppRelease,
  reconcileUnsupportedMlxVoiceDefault,
};

export type AppType = ReturnType<typeof createApp>;

export default createApp;
