import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { connect, createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { initSchema } from "../src/lib/schema.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const fixture = (name: string) => join(root, "tests", "fixtures", name);
const children: ChildProcess[] = [];
const directories: string[] = [];
const sockets: WebSocket[] = [];
const tcpSockets: Socket[] = [];
const workerPids: number[] = [];

async function until<T>(
  read: () => T | undefined,
  deadlineMs = 10_000,
): Promise<T> {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    const value = read();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for standalone lifecycle state");
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

afterEach(async () => {
  for (const ws of sockets.splice(0)) ws.terminate();
  for (const socket of tcpSockets.splice(0)) socket.destroy();
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await once(child, "exit");
    }
  }
  for (const pid of workerPids.splice(0)) {
    if (alive(pid)) process.kill(pid, "SIGKILL");
  }
  for (const dir of directories.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function prepare() {
  const dir = mkdtempSync(join(tmpdir(), "freestyle-standalone-"));
  directories.push(dir);
  const dbPath = join(dir, "history.db");
  const db = new DatabaseSync(dbPath);
  try {
    initSchema(db);
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      "telemetry_enabled",
      "false",
    );
    db.prepare(
      "INSERT INTO model_configs (provider, model_id, model_name, type, is_default) VALUES (?, ?, ?, ?, ?)",
    ).run("local-whisper", "tiny", "E2E mock", "voice", 1);
  } finally {
    db.close();
  }
  const pluginsDir = join(dir, "plugins");
  mkdirSync(pluginsDir);
  copyFileSync(
    fixture("lifecycle-plugin.mjs"),
    join(pluginsDir, "lifecycle.mjs"),
  );
  const binDir = join(dir, ".cache", "freestyle", "whisper-bin");
  const modelsDir = join(dir, ".cache", "freestyle", "whisper-models");
  mkdirSync(binDir, { recursive: true });
  mkdirSync(modelsDir, { recursive: true });
  // Native process substitution happens in the preload. Mark only our isolated
  // binary as executable; no installed binaries or models are touched.
  writeFileSync(join(binDir, "whisper-server"), "fixture", { mode: 0o755 });
  const model = join(modelsDir, "ggml-tiny.bin");
  writeFileSync(model, "");
  truncateSync(model, 75_000_000); // sparse model file satisfies production discovery
  return { dir, dbPath };
}

function launch(dir: string, dbPath: string, port = 0, startupDelayMs = 0) {
  // Use an allowlist so host credentials, proxies and NODE_OPTIONS cannot leak
  // into this executable or its inference child.
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    TMPDIR: process.env.TMPDIR,
    TEMP: process.env.TEMP,
    NODE_ENV: "production",
    PORT: String(port),
    HOST: "127.0.0.1",
    FREESTYLE_DB_PATH: dbPath,
    FREESTYLE_CLOUD_URL: "http://127.0.0.1:1",
    FREESTYLE_E2E_HOME: dir,
    FREESTYLE_E2E_WORKER: fixture("lifecycle-worker.mjs"),
    FREESTYLE_E2E_WORKER_STATE: join(dir, "worker.json"),
    FREESTYLE_E2E_WORKER_STOPPED: join(dir, "worker-stopped"),
    FREESTYLE_E2E_REQUEST_STARTED: join(dir, "request-started"),
    FREESTYLE_E2E_PLUGIN_STOPPED: join(dir, "plugin-stopped"),
    FREESTYLE_E2E_SETUP_STARTED: join(dir, "setup-started"),
    FREESTYLE_E2E_STARTUP_DELAY_MS: String(startupDelayMs),
  };
  const child = spawn(
    process.execPath,
    [
      "--import",
      pathToFileURL(fixture("lifecycle-preload.mjs")).href,
      join(root, "dist", "startup.js"),
    ],
    {
      cwd: root,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  children.push(child);
  let output = "";
  child.stdout!.on("data", (chunk) => {
    output += String(chunk);
  });
  child.stderr!.on("data", (chunk) => {
    output += String(chunk);
  });
  const exit = once(child, "exit");
  const ready = () =>
    until(() => {
      const match = output.match(
        /Freestyle server running on http:\/\/127\.0\.0\.1:(\d+)/,
      );
      if (match) return Number(match[1]);
      if (child.exitCode !== null || child.signalCode !== null)
        throw new Error(output);
      return undefined;
    });
  return { child, exit, ready, output: () => output };
}

async function assertPortReleased(port: number) {
  const probe = createServer();
  try {
    probe.listen(port, "127.0.0.1");
    await once(probe, "listening");
  } finally {
    await new Promise<void>((resolve) => probe.close(() => resolve()));
  }
}

// Windows ChildProcess.kill(SIGTERM) terminates immediately rather than
// delivering a catchable POSIX signal. Existing in-process tests cover stop()
// there; these checks exercise the POSIX executable signal contract.
describe.skipIf(process.platform === "win32")(
  "built standalone lifecycle",
  () => {
    it("drains HTTP, closes WS, awaits its inference child, releases ports and reopens durable history", async () => {
      const { dir, dbPath } = prepare();
      const first = launch(dir, dbPath);
      const port = await first.ready();
      const base = `http://127.0.0.1:${port}`;
      expect(await (await fetch(`${base}/api/health`)).json()).toEqual({
        status: "ok",
        name: "freestyle",
      });
      const transcribed = await fetch(`${base}/api/transcribe`, {
        method: "POST",
        body: new Uint8Array(64),
        headers: { "content-type": "audio/wav" },
      });
      expect(transcribed.status, await transcribed.clone().text()).toBe(200);
      expect(await transcribed.json()).toMatchObject({
        raw: "Persisted transcription from mock inference",
      });
      await until(() =>
        existsSync(join(dir, "worker.json")) ? true : undefined,
      );
      const worker = JSON.parse(
        readFileSync(join(dir, "worker.json"), "utf8"),
      ) as { pid: number; port: number };
      workerPids.push(worker.pid);
      expect(alive(worker.pid)).toBe(true);
      const ws = new WebSocket(`ws://127.0.0.1:${port}/stream`);
      sockets.push(ws);
      await once(ws, "open");
      const wsClosed = once(ws, "close");
      const slow = fetch(`${base}/e2e/slow`);
      await until(() =>
        existsSync(join(dir, "request-started")) ? true : undefined,
      );
      const shutdownAt = Date.now();
      first.child.kill("SIGTERM");
      expect(await (await slow).text()).toBe("drained");
      expect((await wsClosed)[0]).toBe(1001);
      expect(await first.exit, first.output()).toEqual([0, null]);
      expect(Date.now() - shutdownAt).toBeLessThan(10_000);
      expect(existsSync(join(dir, "worker-stopped"))).toBe(true);
      expect(existsSync(join(dir, "plugin-stopped"))).toBe(true);
      await until(() => (!alive(worker.pid) ? true : undefined));
      await assertPortReleased(port);
      await assertPortReleased(worker.port);

      const db = new DatabaseSync(dbPath);
      try {
        expect(db.prepare("PRAGMA integrity_check").get()).toMatchObject({
          integrity_check: "ok",
        });
        expect(
          db
            .prepare("SELECT value FROM settings WHERE key = ?")
            .get("plugin:lifecycle-e2e:request-finished"),
        ).toMatchObject({ value: "true" });
        expect(
          db
            .prepare("SELECT value FROM settings WHERE key = ?")
            .get("plugin:lifecycle-e2e:disposed"),
        ).toMatchObject({ value: "true" });
      } finally {
        db.close();
      }
      const second = launch(dir, dbPath, port);
      expect(await second.ready()).toBe(port);
      const history = await (await fetch(`${base}/api/history`)).json();
      expect(history).toMatchObject({
        total: 1,
        items: [{ raw_text: "Persisted transcription from mock inference" }],
      });
      second.child.kill("SIGTERM");
      expect(await second.exit, second.output()).toEqual([0, null]);
      await assertPortReleased(port);
    });

    it("awaits initialization when signaled during plugin startup", async () => {
      const { dir, dbPath } = prepare();
      const starting = launch(dir, dbPath, 0, 350);
      await until(() =>
        existsSync(join(dir, "setup-started")) ? true : undefined,
      );
      starting.child.kill("SIGTERM");
      expect(await starting.exit, starting.output()).toEqual([0, null]);
      expect(starting.output()).toContain("Received SIGTERM");
      expect(existsSync(join(dir, "plugin-stopped"))).toBe(true);
      const port = starting.output().match(/127\.0\.0\.1:(\d+)/)?.[1];
      expect(port).toBeDefined();
      await assertPortReleased(Number(port));
    });

    it("forces incomplete HTTP and uncooperative WS peers closed by the grace deadline", async () => {
      const { dir, dbPath } = prepare();
      const running = launch(dir, dbPath);
      const port = await running.ready();
      const http = connect(port, "127.0.0.1");
      const ws = connect(port, "127.0.0.1");
      tcpSockets.push(http, ws);
      for (const socket of [http, ws]) socket.on("error", () => {});
      await Promise.all([once(http, "connect"), once(ws, "connect")]);
      http.write("GET / HTTP/1.1\r\nHost: localhost\r\n");
      const upgraded = once(ws, "data");
      ws.write(
        "GET /stream HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n",
      );
      expect((await upgraded)[0].toString()).toContain(
        "101 Switching Protocols",
      );
      ws.resume(); // read close frames but deliberately do not acknowledge
      const closed = Promise.all([once(http, "close"), once(ws, "close")]);
      const shutdownAt = Date.now();
      running.child.kill("SIGTERM");
      await until(() =>
        running.output().includes("Received SIGTERM") ? true : undefined,
      );
      running.child.kill("SIGINT"); // a second signal shares the pending teardown
      expect(await running.exit, running.output()).toEqual([0, null]);
      await closed;
      expect(Date.now() - shutdownAt).toBeGreaterThanOrEqual(4_500);
      expect(Date.now() - shutdownAt).toBeLessThan(10_000);
      expect(running.output().match(/Received SIG/g)).toHaveLength(1);
      expect(http.destroyed && ws.destroyed).toBe(true);
      await assertPortReleased(port);
    });

    it("rolls back plugin resources when the standalone bind fails", async () => {
      const { dir, dbPath } = prepare();
      const blocker = createServer();
      blocker.listen(0, "127.0.0.1");
      await once(blocker, "listening");
      try {
        const address = blocker.address();
        if (!address || typeof address === "string")
          throw new Error("Missing blocker port");
        const failed = launch(dir, dbPath, address.port);
        expect(await failed.exit).toEqual([1, null]);
        expect(failed.output()).toContain("EADDRINUSE");
        expect(existsSync(join(dir, "plugin-stopped"))).toBe(true);
        expect(blocker.listening).toBe(true);
      } finally {
        await new Promise<void>((resolve) => blocker.close(() => resolve()));
      }
    });
  },
);
