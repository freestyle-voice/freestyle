import { type ServerType, serve } from "@hono/node-server";
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { WebSocketServer } from "ws";
import { reconcileUnsupportedMlxVoiceDefault } from "./lib/mlx-asr/reconcile.js";
import {
  activateManagedMlxRuntimeForAppVersion,
  prefetchManagedMlxRuntimeForAppRelease,
} from "./lib/mlx-asr/runtime.js";
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
    // CORS for renderer requests (skip WebSocket upgrades)
    .use((c, next) => {
      if (c.req.header("upgrade")?.toLowerCase() === "websocket") {
        return next();
      }
      return cors()(c, next);
    });

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
      captureException(err);
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
 * Start the Freestyle HTTP server with WebSocket support.
 *
 * Shared by the Electron main process (loopback, in-process) and the
 * standalone container entrypoint (see startup.ts).
 *
 * Plugins are loaded first so their contributed middleware is available when the
 * Hono app is constructed. Built-in plugins (cloud-sync) are always present;
 * user plugins are discovered from settings + disk.
 */
export async function startServer(
  options: StartServerOptions = {},
): Promise<RunningServer> {
  const { port = 4649, host = "127.0.0.1" } = options;

  // Load plugins (built-in + user) before constructing the app so middleware
  // contributions are mounted at the correct position in the chain.
  await initServerPlugins();

  const pluginMiddleware = plugins().collectMiddleware();
  const app = createApp(pluginMiddleware);
  const wss = new WebSocketServer({ noServer: true });

  return new Promise((resolve, reject) => {
    const server = serve(
      {
        fetch: app.fetch,
        port,
        hostname: host,
        websocket: { server: wss },
      },
      (info) => {
        resolve({ server, port: info.port });
      },
    );
    // Reject if the server fails to bind (e.g. EADDRINUSE) before listening.
    server.once("error", reject);
  });
}

export { closeDb } from "./lib/db.js";
export { stopMlxServer } from "./lib/mlx-asr/server.js";
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
