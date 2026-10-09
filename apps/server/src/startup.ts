/**
 * Standalone entrypoint for running the Freestyle server outside of Electron.
 *
 * Used by the Docker image (see Dockerfile) to run the server inside a
 * container/VM. The Electron app calls `startServer()` directly instead.
 *
 * Configuration via environment variables:
 *   - FREESTYLE_DB_PATH (required) — path to the SQLite database file.
 *   - PORT  — port to listen on (default 4649).
 *   - HOST  — interface to bind to (default 0.0.0.0, all interfaces).
 *   - FREESTYLE_AUTH_TOKEN — optional bearer token required on all requests
 *     (except /api/health). Strongly recommended when binding to 0.0.0.0.
 */

import { startServer } from "./index.js";

const port = process.env.PORT ? Number(process.env.PORT) : 4649;
const host = process.env.HOST ?? "0.0.0.0";
const token = process.env.FREESTYLE_AUTH_TOKEN;

if (Number.isNaN(port)) {
  console.error(`Invalid PORT value: ${process.env.PORT}`);
  process.exit(1);
}

if (!process.env.FREESTYLE_DB_PATH) {
  console.error(
    "FREESTYLE_DB_PATH environment variable is required. Set it to the desired SQLite database file path.",
  );
  process.exit(1);
}

const startup = startServer({
  port,
  host,
  token,
});
let shutdownPromise: Promise<void> | undefined;
function shutdown(signal: string): void {
  if (shutdownPromise) return;
  console.log(`Received ${signal}, shutting down...`);
  const deadline = setTimeout(() => {
    console.error("Server shutdown timed out while waiting for startup");
    process.exit(1);
  }, 25_000);
  deadline.unref();
  shutdownPromise = startup
    .then((running) => running.stop())
    .finally(() => clearTimeout(deadline));
  void shutdownPromise.then(
    () => process.exit(0),
    (err) => {
      console.error(`Server shutdown failed: ${String(err)}`);
      process.exit(1);
    },
  );
}

// Only executable entrypoints own process signals, including during startup.
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

const running = await startup.catch((err) => {
  console.error(
    `Failed to start server: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
});
console.log(`Freestyle server running on http://${host}:${running.port}`);
