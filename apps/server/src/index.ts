import { createAppLogger } from "@freestyle-voice/utils";
import { type ServerType, serve } from "@hono/node-server";
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { requestId } from "hono/request-id";
import { timeout } from "hono/timeout";
import type { WebSocketServer } from "ws";
import { recordAppLaunch } from "./lib/app-lifecycle.js";
import { authMiddleware, setAuthToken } from "./lib/auth.js";
import { closeDb } from "./lib/db.js";
import { acquireServerDatabase } from "./lib/db-ownership.js";
import { refreshCleanupPromptConfig } from "./lib/editor/prompt-config.js";
import { formatError } from "./lib/format-error.js";
import { isTransientCloudError } from "./lib/freestyle-cloud.js";
import {
  startHistoryRetentionSweep,
  stopHistoryRetentionSweep,
} from "./lib/history-store.js";
import { stopMlxServer } from "./lib/mlx-asr/server.js";
import { configureNetwork } from "./lib/network.js";
import { pluginApiGuard } from "./lib/plugin-api-guard.js";
import {
  disposeServerPlugins,
  initServerPlugins,
  plugins,
} from "./lib/plugins/index.js";
import { pullCloudPreferences } from "./lib/preferences-sync.js";
import {
  captureException,
  initSentry,
  removeLegacyTelemetryIdentity,
  shutdownSentry,
} from "./lib/sentry.js";
import {
  boundedCleanup,
  connectionStopper,
  ownedWebSocketServer,
} from "./lib/server-lifecycle.js";
import {
  startSessionKeepAlive,
  stopSessionKeepAlive,
} from "./lib/session-keepalive.js";
import {
  drainOutbox,
  startOutboxDrain,
  stopOutboxDrain,
} from "./lib/sync-outbox.js";
import { syncTimezoneToCloud } from "./lib/timezone-sync.js";
import {
  isTrustedRendererOrigin,
  trustedOriginMiddleware,
} from "./lib/trusted-origin.js";
import { stopServer as stopWhisperServer } from "./lib/whisper/server.js";
import routes from "./routes";

const httpLog = createAppLogger("http");

// Lightweight CRUD routers get a request timeout. Transcription, post-process,
// and the auth device-flow poll are intentionally excluded — they can
// legitimately run longer than this window.
const REQUEST_TIMEOUT_MS = 30_000;
const TIMEOUT_PREFIXES = [
  "/api/settings",
  "/api/dictionary",
  "/api/dismissed-notifications",
  "/api/vocabulary",
  "/api/history",
  "/api/models",
  "/api/plugins",
  "/api/usage",
  "/api/org",
  "/api/agent/thread",
];

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
    // CORS for renderer requests. Must run BEFORE auth: the desktop renderer
    // talks to a remote server cross-origin (app:// -> http://remote), so any
    // request with an Authorization header triggers an OPTIONS preflight that
    // carries no token. cors() answers the preflight and short-circuits it, so
    // auth never rejects it; real requests still fall through to auth.
    // Scoped to renderer origins, never `*`: a wildcard here would let any page
    // the user has open read loopback responses (history, brain, settings).
    .use(
      cors({
        origin: (origin) =>
          isTrustedRendererOrigin(origin) ? (origin ?? "*") : null,
      }),
    )
    // Bearer-token auth for standalone/remote deployments. A no-op when no
    // token is configured (the default loopback Electron case), so it never
    // affects the in-process server.
    .use(authMiddleware)
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
  /**
   * Optional bearer token required on all requests (except `/api/health`).
   * Empty/undefined disables auth — appropriate for the loopback Electron
   * server. Set it for standalone/remote deployments exposed on a network.
   */
  token?: string;
}

export interface RunningServer {
  server: ServerType;
  /** The actual port bound (useful when `port` was 0). */
  port: number;
  /** Idempotent, awaited teardown of resources owned by this server. */
  stop(options?: { gracePeriodMs?: number }): Promise<void>;
}

let serverOwned = false;

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
  const { port = 4649, host = "127.0.0.1", token } = options;

  // The DB/plugin registry and background schedulers are process singletons.
  // Never let a second start take ownership of a running (or starting) server.
  if (serverOwned)
    throw new Error("A Freestyle server is already owned by this process");
  serverOwned = true;
  const databaseOwner = acquireServerDatabase();
  const activeRequests = new Set<Promise<Response>>();
  const backgroundAbort = new AbortController();
  const backgroundTasks: Promise<unknown>[] = [];
  let closeConnections: ((gracePeriodMs: number) => Promise<void>) | undefined;
  let wss: WebSocketServer | undefined;
  let stopPromise: Promise<void> | undefined;
  let startupSucceeded = false;
  const stop: RunningServer["stop"] = (stopOptions = {}) => {
    if (stopPromise) return stopPromise;
    const requestedGrace = stopOptions.gracePeriodMs ?? 5_000;
    const gracePeriodMs = Number.isFinite(requestedGrace)
      ? Math.max(0, Math.min(requestedGrace, 5_000))
      : 5_000;
    stopPromise = (async () => {
      const errors: unknown[] = [];
      const cleanup = async (
        fn: () => unknown,
        name: string,
        timeoutMs?: number,
      ) => {
        try {
          await boundedCleanup(fn, name, timeoutMs);
        } catch (error) {
          errors.push(error);
        }
      };
      // Stop schedulers immediately; requests retain the DB/plugins until drained.
      backgroundAbort.abort();
      stopHistoryRetentionSweep();
      const pendingJobs = [
        stopSessionKeepAlive(),
        stopOutboxDrain(),
        ...backgroundTasks,
      ];
      try {
        if (closeConnections) await closeConnections(gracePeriodMs);
        else if (wss)
          await new Promise<void>((resolve) => wss!.close(() => resolve()));
      } catch (error) {
        errors.push(error);
      }
      await cleanup(() => Promise.allSettled([...activeRequests]), "Requests");
      await cleanup(() => Promise.allSettled(pendingJobs), "Background jobs");
      await cleanup(() => databaseOwner.run(disposeServerPlugins), "Plugins");
      // A route/plugin which ignored cancellation or exceeded its deadline must
      // never reopen the released DB or write into a later server instance.
      databaseOwner.revoke();
      await cleanup(
        () => Promise.all([stopWhisperServer(), stopMlxServer()]),
        "Inference workers",
        6_000,
      );
      await cleanup(closeDb, "Database");
      // Electron initializes its shared telemetry client before startup. A bind
      // failure must not disable that client before the random-port retry.
      if (startupSucceeded || !process.versions.electron)
        await cleanup(shutdownSentry, "Telemetry", 3_000);
      serverOwned = false;
      if (errors.length)
        throw new AggregateError(errors, "Server shutdown failed");
    })();
    return stopPromise;
  };

  return databaseOwner.run(async () => {
    try {
      initSentry();
      removeLegacyTelemetryIdentity();
      setAuthToken(token);
      // Configure proxy/custom CA before any fetch.
      configureNetwork();
      recordAppLaunch();
      await initServerPlugins();
      const app = createApp();
      wss = ownedWebSocketServer(databaseOwner.run);
      const running = await new Promise<RunningServer>((resolve, reject) => {
        const server = serve(
          {
            fetch: (request, env) =>
              databaseOwner.run(() => {
                const pending = Promise.resolve(app.fetch(request, env));
                activeRequests.add(pending);
                void pending
                  .finally(() => activeRequests.delete(pending))
                  .catch(() => {});
                return pending;
              }),
            port,
            hostname: host,
            websocket: { server: wss! },
          },
          (info) => {
            server.off("error", reject);
            resolve({ server, port: info.port, stop });
          },
        );
        closeConnections = connectionStopper(server, wss!);
        server.once("error", reject);
      });

      // Launch network jobs only after binding succeeds, so a port collision does
      // not leave work behind while Electron retries on a random port.
      startHistoryRetentionSweep();
      startOutboxDrain();
      startSessionKeepAlive();
      backgroundTasks.push(refreshCleanupPromptConfig(backgroundAbort.signal));
      backgroundTasks.push(
        drainOutbox().then(() => {
          if (!backgroundAbort.signal.aborted)
            return pullCloudPreferences(backgroundAbort.signal);
        }),
      );
      backgroundTasks.push(syncTimezoneToCloud(backgroundAbort.signal));
      startupSucceeded = true;
      return running;
    } catch (error) {
      // Keep the bind/start error intact while rolling back every acquired resource.
      await stop().catch((cleanupError) =>
        httpLog.warn(formatError(cleanupError)),
      );
      throw error;
    }
  });
}

export { closeDb, readSetting, writeSetting } from "./lib/db.js";
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
export {
  captureException,
  isTelemetryEnabled,
  removeLegacyTelemetryIdentity,
  setTelemetrySettingChangeHandler,
  shutdownSentry,
} from "./lib/sentry.js";
export type AppType = ReturnType<typeof createApp>;

export default createApp;
