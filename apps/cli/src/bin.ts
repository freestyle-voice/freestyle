// Suppress experimental warnings (node:sqlite, etc.)
const originalEmit = process.emit;
process.emit = function (
  this: typeof process,
  name: string | symbol,
  ...args: unknown[]
) {
  if (name === "warning") return false;
  return originalEmit.apply(this, [name, ...args] as Parameters<
    typeof originalEmit
  >);
} as typeof process.emit;

// Handle broken pipes gracefully
process.stdout.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EPIPE" || err.code === "EIO") {
    process.exit(0);
  }
  throw err;
});

process.stderr.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EPIPE" || err.code === "EIO") {
    process.exit(0);
  }
  throw err;
});

import { startCli } from "./cli.js";

startCli(process.argv.slice(2)).catch(() => {
  process.exitCode = 1;
});
