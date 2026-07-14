import { createAppLogger } from "@freestyle-voice/utils";
import { type ServerType, serve } from "@hono/node-server";
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { requestId } from "hono/request-id";
import { timeout } from "hono/timeout";
import { formatError } from "./lib/format-error.js";
import { isTransientCloudError } from "./lib/freestyle-cloud.js";
import { startHistoryRetentionSweep } from "./lib/history-store.js";
import { reconcileUnsupportedMlxVoiceDefault } from "./lib/mlx-asr/reconcile.js";
import {
  activateManagedMlxRuntimeForAppVersion,
  prefetchManagedMlxRuntimeForAppRelease,
} from "./lib/mlx-asr/runtime.js";
import { configureNetwork } from "./lib/network.js";
import { pluginApiGuard } from "./lib/plugin-api-guard.js";
import {
  disposeServerPlugins,
  initServerPlugins,
  plugins,
} from "./lib/plugins/index.js";
import { captureException, shutdownPosthog } from "./lib/posthog.js";
import { trustedOriginMiddleware } from "./lib/trusted-origin.js";
import routes from "./routes";

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
 * A stable middleware that dispatches the *current* plugin middleware chain
 * (read from the live registry on every request) in resolved order. Mounting
 * this once at construction — instead of spreading the middleware array in —
 * means a runtime `reloadServerPlugins()` is observed immediately: a
 * newly-enabled plugin's routes become reachable, and a disabled plugin's stop
 * responding, all without reconstructing the app or restarting the server.
 *
 * Each plugin middleware may short-circuit (return a `Response`) or call its
 * own `next()` to defer to the following one; when the whole chain defers, the
 * outer `next()` hands off to the app's routes.
 */
const pluginMiddlewareDispatcher: MiddlewareHandler = async (c, next) => {
  const chain = plugins().collectMiddleware();
  if (chain.length === 0) return next();

  // Compose the chain so `next` at position i runs handler i+1, and the final
  // `next` falls through to the app's own routes (the outer `next`).
  const dispatch = (index: number): Promise<void> => {
    if (index >= chain.length) return next() as Promise<void>;
    return chain[index](c, () => dispatch(index + 1)) as Promise<void>;
  };
  return dispatch(0);
};

/**
 * Build the Hono app. Plugin middleware is dispatched from the *live* registry
 * per request (see {@link pluginMiddlewareDispatcher}) rather than baked in at
 * construction, so enabling/installing a plugin at runtime (via
 * `reloadServerPlugins()`) mounts its contributed routes without a restart.
 */
function createApp() {
  const base = new Hono()
    .use(trustedOriginMiddleware)
    // Confine plugin-UI-originated requests to their own plugin namespace, so a
    // same-origin plugin page can't reach keys/auth/settings or other plugins.
    .use(pluginApiGuard)
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

  // Dispatch plugin middleware from the live registry, so a runtime reload
  // (enable/disable/install) takes effect on the next request without a restart.
  base.use(pluginMiddlewareDispatcher);

  const app = base
    .onError((err, c) => {
      // Let Hono's own exceptions (e.g. bearerAuth's 401) keep their response,
      // but still report genuine server errors.
      if (err instanceof HTTPException) {
        if (err.status >= 500) {
          httpLog.error(
            `${c.req.method} ${c.req.path} -> ${err.status}: ${formatError(err)}`,
          );
          captureException(err);
        }
        const res = err.getResponse();
        // Preserve CORS so the cross-origin renderer can read auth errors.
        const origin = c.req.header("origin");
        if (origin) res.headers.set("Access-Control-Allow-Origin", origin);
        return res;
      }
      // Always log the failure locally so it's visible in dev and captured in
      // the diagnostics log file — otherwise a 500 only shows as a status code
      // in the access log with no detail. `captureException` (below) is gated,
      // but local logging never is.
      httpLog.error(
        `${c.req.method} ${c.req.path} -> 500: ${formatError(err)}`,
      );
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

  // Load plugins (built-in + user) before serving. The app dispatches plugin
  // middleware from the live registry per request, so later runtime reloads
  // (enable/disable/install) take effect without reconstructing the app.
  await initServerPlugins();

  const app = createApp();

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
  prefetchManagedMlxRuntimeForAppRelease,
  reconcileUnsupportedMlxVoiceDefault,
};

export type AppType = ReturnType<typeof createApp>;

export default createApp;
