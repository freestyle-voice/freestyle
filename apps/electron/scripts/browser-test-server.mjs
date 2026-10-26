import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "freestyle-browser-e2e-"));
process.env.FREESTYLE_DB_PATH = join(directory, "preview.sqlite");
process.env.FREESTYLE_LOG_DIR = directory;
const { startServer } = await import("../../server/dist/index.js");
const server = await startServer({
  port: 4651,
  host: "127.0.0.1",
  token: "browser-e2e-only",
});
for (const [key, value] of Object.entries({
  onboarding: JSON.stringify({ v: 2, done: true }),
  telemetry_enabled: "false",
})) {
  const response = await fetch(`http://127.0.0.1:4651/api/settings/${key}`, {
    method: "PUT",
    headers: {
      Authorization: "Bearer browser-e2e-only",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ value }),
  });
  if (!response.ok)
    throw new Error(`Could not seed browser test setting: ${key}`);
}
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    await server.stop();
    rmSync(directory, { recursive: true, force: true });
    process.exit(0);
  });
}
