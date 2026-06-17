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

import { closeDb, startServer } from "./index.js";

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

const { server } = await startServer({ port, host });
console.log(`Freestyle server running on http://${host}:${port}`);

function shutdown(signal: string): void {
  console.log(`Received ${signal}, shutting down...`);
  server.close(() => {
    try {
      closeDb();
    } catch {
      // ignore
    }
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
