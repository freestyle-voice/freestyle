import { once } from "node:events";
import { request } from "node:http";
import { connect, createServer } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";

const state = vi.hoisted(() => ({
  signals: [process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")],
  dispose: vi.fn<() => Promise<void>>(),
  init: vi.fn<() => Promise<void>>(),
  closeDb: vi.fn(),
  telemetry: vi.fn<() => Promise<void>>(),
  keepAliveStop: vi.fn<() => Promise<void>>(),
  outboxStop: vi.fn<() => Promise<void>>(),
  retentionStop: vi.fn(),
  whisperStop: vi.fn<() => Promise<void>>(),
  mlxStop: vi.fn<() => Promise<void>>(),
  lateWrite: undefined as (() => void) | undefined,
  requestStarted: undefined as (() => void) | undefined,
  responseReady: undefined as Promise<void> | undefined,
}));
vi.mock("../src/routes", async () => {
  const { Hono } = await import("hono");
  const { upgradeWebSocket } = await import("@hono/node-server");
  return {
    default: new Hono()
      .get("/slow", async (c) => {
        state.requestStarted?.();
        await state.responseReady;
        state.lateWrite?.();
        return c.text("finished");
      })
      .get(
        "/ws-delayed",
        upgradeWebSocket(() => ({
          onMessage: async () => {
            state.requestStarted?.();
            await state.responseReady;
            state.lateWrite?.();
          },
        })),
      )
      .get(
        "/ws",
        upgradeWebSocket(() => ({})),
      ),
  };
});
vi.mock("../src/lib/plugins/index.js", () => ({
  initServerPlugins: state.init,
  disposeServerPlugins: state.dispose,
  reloadServerPlugins: vi.fn(),
  plugins: () => ({ collectMiddleware: () => [] }),
}));
vi.mock("../src/lib/db.js", async (original) => {
  const actual = await original<typeof import("../src/lib/db.js")>();
  state.closeDb.mockImplementation(actual.closeDb);
  return { ...actual, closeDb: state.closeDb };
});
vi.mock("../src/lib/sentry.js", () => ({
  initSentry: vi.fn(),
  removeLegacyTelemetryIdentity: vi.fn(),
  captureException: vi.fn(),
  shutdownSentry: state.telemetry,
  isTelemetryEnabled: () => false,
  setTelemetrySettingChangeHandler: vi.fn(),
}));
vi.mock("../src/lib/network.js", () => ({ configureNetwork: vi.fn() }));
vi.mock("../src/lib/app-lifecycle.js", () => ({ recordAppLaunch: vi.fn() }));
vi.mock("../src/lib/editor/prompt-config.js", () => ({
  refreshCleanupPromptConfig: async () => {},
}));
vi.mock("../src/lib/history-store.js", () => ({
  startHistoryRetentionSweep: vi.fn(),
  stopHistoryRetentionSweep: state.retentionStop,
}));
vi.mock("../src/lib/session-keepalive.js", () => ({
  startSessionKeepAlive: vi.fn(),
  stopSessionKeepAlive: state.keepAliveStop,
}));
vi.mock("../src/lib/sync-outbox.js", () => ({
  drainOutbox: async () => {},
  startOutboxDrain: vi.fn(),
  stopOutboxDrain: state.outboxStop,
}));
vi.mock("../src/lib/preferences-sync.js", () => ({
  pullCloudPreferences: async () => false,
}));
vi.mock("../src/lib/timezone-sync.js", () => ({
  syncTimezoneToCloud: async () => {},
}));

vi.mock("../src/lib/whisper/server.js", () => ({
  stopServer: state.whisperStop,
}));
vi.mock("../src/lib/mlx-asr/server.js", () => ({
  stopMlxServer: state.mlxStop,
}));

const { startServer } = await import("../src/index.js");
const { getDb, readSetting, writeSetting } = await import("../src/lib/db.js");
let running: Awaited<ReturnType<typeof startServer>> | undefined;

beforeEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  state.init.mockResolvedValue();
  state.dispose.mockResolvedValue();
  state.telemetry.mockResolvedValue();
  state.keepAliveStop.mockResolvedValue();
  state.outboxStop.mockResolvedValue();
  state.whisperStop.mockResolvedValue();
  state.mlxStop.mockResolvedValue();
  state.lateWrite = undefined;
  state.responseReady = undefined;
  state.requestStarted = undefined;
});
afterEach(async () => {
  await running?.stop({ gracePeriodMs: 20 }).catch(() => {});
  running = undefined;
});

function get(port: number, path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port, path }, (res) => {
      let body = "";
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => resolve(body));
    });
    req.on("error", reject);
    req.end();
  });
}

describe("owned server lifecycle", () => {
  it("does not install executable signal handlers when imported", () => {
    expect([
      process.listenerCount("SIGINT"),
      process.listenerCount("SIGTERM"),
    ]).toEqual(state.signals);
  });

  it("finishes an active HTTP request and closes WebSockets before releasing plugins and DB", async () => {
    let release!: () => void;
    state.responseReady = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      state.requestStarted = resolve;
    });
    running = await startServer({ port: 0 });
    const ws = new WebSocket(`ws://127.0.0.1:${running.port}/ws`);
    await once(ws, "open");
    const wsClosed = once(ws, "close");
    const response = get(running.port, "/slow");
    await started;
    const stopped = running.stop();
    expect(state.closeDb).not.toHaveBeenCalled();
    expect(state.dispose).not.toHaveBeenCalled();
    release();
    expect(await response).toBe("finished");
    await stopped;
    expect((await wsClosed)[0]).toBe(1001);
    expect(state.dispose).toHaveBeenCalledOnce();
    expect(state.closeDb).toHaveBeenCalledOnce();
    expect(state.keepAliveStop).toHaveBeenCalledOnce();
    expect(state.outboxStop).toHaveBeenCalledOnce();
    expect(state.retentionStop).toHaveBeenCalledOnce();
    expect(state.whisperStop).toHaveBeenCalledOnce();
    expect(state.mlxStop).toHaveBeenCalledOnce();
    expect(state.dispose.mock.invocationCallOrder[0]).toBeLessThan(
      state.closeDb.mock.invocationCallOrder[0],
    );
    expect(state.closeDb.mock.invocationCallOrder[0]).toBeLessThan(
      state.telemetry.mock.invocationCallOrder[0],
    );
  });

  it("shares the same stop promise and awaits plugin disposal", async () => {
    let release!: () => void;
    state.dispose.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    running = await startServer({ port: 0 });
    const stopped = running.stop();
    expect(running.stop()).toBe(stopped);
    await vi.waitFor(() => expect(state.dispose).toHaveBeenCalledOnce());
    expect(state.closeDb).not.toHaveBeenCalled();
    release();
    await stopped;
    await running.stop();
    expect(state.closeDb).toHaveBeenCalledOnce();
    expect(state.telemetry).toHaveBeenCalledOnce();
  });

  it("forces lingering TCP connections closed at the grace deadline", async () => {
    running = await startServer({ port: 0 });
    const socket = connect(running.port, "127.0.0.1");
    await once(socket, "connect");
    // A partial request cannot finish gracefully.
    socket.write("GET / HTTP/1.1\r\nHost: localhost\r\n");
    socket.on("error", () => {});
    const closed = new Promise<void>((resolve) =>
      socket.once("close", () => resolve()),
    );
    await running.stop({ gracePeriodMs: 25 });
    await closed;
    expect(socket.destroyed).toBe(true);
    expect(running.server.listening).toBe(false);
  });

  it("forces a WebSocket peer that never acknowledges the close frame to disconnect", async () => {
    running = await startServer({ port: 0 });
    const socket = connect(running.port, "127.0.0.1");
    await once(socket, "connect");
    const upgraded = once(socket, "data");
    socket.write(
      "GET /ws HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n",
    );
    expect((await upgraded)[0].toString()).toContain("101 Switching Protocols");
    socket.on("error", () => {});
    const closed = new Promise<void>((resolve) =>
      socket.once("close", () => resolve()),
    );
    await running.stop({ gracePeriodMs: 25 });
    await closed;
    expect(socket.destroyed).toBe(true);
  });

  it("awaits in-flight background work before disposing plugins", async () => {
    let release!: () => void;
    state.keepAliveStop.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    running = await startServer({ port: 0 });
    const stopped = running.stop();
    await vi.waitFor(() => expect(running?.server.listening).toBe(false));
    expect(state.dispose).not.toHaveBeenCalled();
    release();
    await stopped;
    expect(state.dispose).toHaveBeenCalledOnce();
  });

  it("prevents a forced-close handler from reopening or writing the next server's DB", async () => {
    let release!: () => void;
    let handlerDone!: () => void;
    let lateError: unknown;
    state.responseReady = new Promise<void>((resolve) => {
      release = resolve;
    });
    const completed = new Promise<void>((resolve) => {
      handlerDone = resolve;
    });
    const started = new Promise<void>((resolve) => {
      state.requestStarted = resolve;
    });
    state.lateWrite = () => {
      try {
        writeSetting("late_write", "old request");
      } catch (error) {
        lateError = error;
      }
      handlerDone();
    };
    running = await startServer({ port: 0 });
    const response = get(running.port, "/slow").catch(() => "closed");
    await started;
    // The ignored request is reported, while the remaining owned resources close.
    await expect(running.stop({ gracePeriodMs: 10 })).rejects.toThrow(
      "Server shutdown failed",
    );
    expect(() => getDb()).toThrow("Server database owner has stopped");
    running = await startServer({ port: 0 });
    writeSetting("new_owner", "ready");
    release();
    await completed;
    await response;
    expect(lateError).toMatchObject({
      message: "Server database owner has stopped",
    });
    expect(readSetting("late_write")).toBeUndefined();
    expect(readSetting("new_owner")).toBe("ready");
  });

  it("rejects a delayed WebSocket callback's database write after a replacement server starts", async () => {
    let release!: () => void;
    let handlerDone!: () => void;
    let lateError: unknown;
    state.responseReady = new Promise<void>((resolve) => {
      release = resolve;
    });
    const completed = new Promise<void>((resolve) => {
      handlerDone = resolve;
    });
    const started = new Promise<void>((resolve) => {
      state.requestStarted = resolve;
    });
    state.lateWrite = () => {
      try {
        writeSetting("late_ws_write", "old socket");
      } catch (error) {
        lateError = error;
      }
      handlerDone();
    };
    running = await startServer({ port: 0 });
    const ws = new WebSocket(`ws://127.0.0.1:${running.port}/ws-delayed`);
    await once(ws, "open");
    ws.send("begin delayed work");
    await started;
    await running.stop({ gracePeriodMs: 10 });
    running = await startServer({ port: 0 });
    writeSetting("new_ws_owner", "ready");
    release();
    await completed;
    expect(lateError).toMatchObject({
      message: "Server database owner has stopped",
    });
    expect(readSetting("late_ws_write")).toBeUndefined();
    expect(readSetting("new_ws_owner")).toBe("ready");
  });

  it("rolls back a bind failure and permits Electron's random-port retry", async () => {
    const occupied = createServer();
    occupied.listen(0, "127.0.0.1");
    await once(occupied, "listening");
    try {
      let db!: ReturnType<typeof getDb>;
      state.init.mockImplementationOnce(async () => {
        db = getDb();
      });
      const address = occupied.address();
      if (!address || typeof address === "string")
        throw new Error("No TCP port");
      await expect(startServer({ port: address.port })).rejects.toMatchObject({
        code: "EADDRINUSE",
      });
      expect(state.dispose).toHaveBeenCalledOnce();
      expect(state.closeDb).toHaveBeenCalledOnce();
      expect(state.telemetry).toHaveBeenCalledOnce();
      expect(() => db.prepare("SELECT 1")).toThrow();
      running = await startServer({ port: 0 });
      expect(await get(running.port, "/")).toBe("Freestyle API");
    } finally {
      await new Promise<void>((resolve) => occupied.close(() => resolve()));
    }
  });

  it("rolls back failure before an HTTP server exists", async () => {
    state.init.mockRejectedValueOnce(new Error("plugin startup failed"));
    await expect(startServer({ port: 0 })).rejects.toThrow(
      "plugin startup failed",
    );
    expect(state.dispose).toHaveBeenCalledOnce();
    expect(state.closeDb).toHaveBeenCalledOnce();
    expect(state.telemetry).toHaveBeenCalledOnce();
  });

  it("continues teardown after plugin disposal fails", async () => {
    state.dispose.mockRejectedValueOnce(new Error("plugin dispose failed"));
    running = await startServer({ port: 0 });
    await expect(running.stop()).rejects.toThrow("Server shutdown failed");
    expect(state.closeDb).toHaveBeenCalledOnce();
    expect(state.telemetry).toHaveBeenCalledOnce();
  });
});
