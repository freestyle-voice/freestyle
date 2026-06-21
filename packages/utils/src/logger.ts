import fs from "node:fs";
import path from "node:path";
import winston from "winston";

const isDev = process.env.NODE_ENV !== "production";

const LOG_FILE = "freestyle.log";
const MAX_SIZE = 2 * 1024 * 1024; // 2 MB per file
const MAX_FILES = 5; // keep ~10 MB of history (size-rotated, tailable)

// Every logger we hand out is tracked so file logging can be switched on
// *after* some loggers already exist. The Electron main process only learns
// the log directory once `app` is available, by which point server/main
// modules may have already created their namespaced loggers at import time.
const registry = new Set<winston.Logger>();

// Initialised from the env var so the standalone server (and tests) can opt in
// without code changes; the Electron app calls `enableFileLogging()` instead.
let logDir: string | undefined = process.env.FREESTYLE_LOG_DIR || undefined;

function createFileTransport(dir: string): winston.transport {
  return new winston.transports.File({
    filename: path.join(dir, LOG_FILE),
    maxsize: MAX_SIZE,
    maxFiles: MAX_FILES,
    tailable: true,
  });
}

function hasFileTransport(logger: winston.Logger): boolean {
  return logger.transports.some((t) => t instanceof winston.transports.File);
}

export function createAppLogger(namespace: string): winston.Logger {
  const logger = winston.createLogger({
    level: isDev ? "debug" : "info",
    format: winston.format.combine(
      winston.format.timestamp({ format: "HH:mm:ss.SSS" }),
      winston.format.printf(({ timestamp, level, message }) => {
        return `${timestamp as string} ${level} [${namespace}] ${message as string}`;
      }),
    ),
    transports: [
      new winston.transports.Console({
        stderrLevels: ["error"],
      }),
    ],
  });

  if (logDir) {
    try {
      logger.add(createFileTransport(logDir));
    } catch {
      // Logging must never crash the app.
    }
  }

  registry.add(logger);
  return logger;
}

/**
 * Persist logs to `<dir>/freestyle.log` (size-rotated, tailable). Attaches a
 * file transport to every logger created so far and every one created
 * afterwards, so the call is order-independent — it works whether loggers were
 * built before or after the log directory became known. Idempotent.
 */
export function enableFileLogging(dir: string): void {
  if (logDir === dir) return;

  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // Directory may already exist or be uncreatable; the File transport will
    // surface its own error without taking down the process.
  }

  logDir = dir;
  for (const logger of registry) {
    if (hasFileTransport(logger)) continue;
    try {
      logger.add(createFileTransport(dir));
    } catch {
      // Best-effort per logger.
    }
  }
}
