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
 */

import { closeDb, disposeServerPlugins, startServer } from "./index.js";

const port = process.env.PORT ? Number(process.env.PORT) : 4649;
const host = process.env.HOST ?? "0.0.0.0";

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

const { server, port: boundPort } = await startServer({
  port,
  host,
}).catch((err) => {
  console.error(
    `Failed to start server: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
});
console.log(`Freestyle server running on http://${host}:${boundPort}`);

function shutdown(signal: string): void {
  console.log(`Received ${signal}, shutting down...`);
  void disposeServerPlugins().catch(() => {});
  server.close(() => {
    try {
      closeDb();
    } catch {
      // ignore
    }
    process.exit(0);
  });
  // Don't wait forever for in-flight connections (e.g. open WebSockets).
  setTimeout(() => process.exit(0), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
