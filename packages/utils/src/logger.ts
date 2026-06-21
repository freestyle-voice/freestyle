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

// One shared File transport for the whole process. Sharing a single instance
// (rather than one per logger) is important: the per-namespace formatting is
// already applied at the logger level, and a single write stream avoids the
// size-rotation races that independent transports to the same file would hit.
let fileTransport: winston.transport | null = null;

// Initialised from the env var so the standalone server (and tests) can opt in
// without code changes; the Electron app calls `enableFileLogging()` instead.
let logDir: string | undefined = process.env.FREESTYLE_LOG_DIR || undefined;

function getFileTransport(dir: string): winston.transport | null {
  if (fileTransport) return fileTransport;
  try {
    fs.mkdirSync(dir, { recursive: true });
    fileTransport = new winston.transports.File({
      filename: path.join(dir, LOG_FILE),
      maxsize: MAX_SIZE,
      maxFiles: MAX_FILES,
      tailable: true,
    });
  } catch {
    // Logging must never crash the app; fall back to console-only.
    fileTransport = null;
  }
  return fileTransport;
}

function attachFileTransport(logger: winston.Logger, dir: string): void {
  const transport = getFileTransport(dir);
  if (!transport) return;
  if (logger.transports.includes(transport)) return;
  logger.add(transport);
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

  if (logDir) attachFileTransport(logger, logDir);

  registry.add(logger);
  return logger;
}

/**
 * Persist logs to `<dir>/freestyle.log` (size-rotated, tailable). Attaches the
 * shared file transport to every logger created so far and every one created
 * afterwards, so the call is order-independent — it works whether loggers were
 * built before or after the log directory became known. Idempotent.
 */
export function enableFileLogging(dir: string): void {
  if (logDir === dir && fileTransport) return;
  logDir = dir;
  for (const logger of registry) attachFileTransport(logger, dir);
}
