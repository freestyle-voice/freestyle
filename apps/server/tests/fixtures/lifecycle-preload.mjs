// Only native inference and external network are substituted. The built server,
// plugin loading, SQLite, HTTP/WS, signal handling and worker teardown are real.
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import { basename } from "node:path";

os.homedir = () => process.env.FREESTYLE_E2E_HOME;
const originalSpawn = childProcess.spawn;
childProcess.spawn = (command, args, options) => {
  if (basename(command).startsWith("whisper-server")) {
    return originalSpawn(
      process.execPath,
      [process.env.FREESTYLE_E2E_WORKER, ...args],
      options,
    );
  }
  return originalSpawn(command, args, options);
};
syncBuiltinESMExports();
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(
    typeof input === "string" || input instanceof URL ? input : input.url,
  );
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    return Promise.reject(
      new Error("External network disabled in lifecycle E2E"),
    );
  }
  return originalFetch(input, options);
};
