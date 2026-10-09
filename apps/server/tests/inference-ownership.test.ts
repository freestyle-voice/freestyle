import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb } from "../src/lib/db";
import { acquireServerDatabase } from "../src/lib/db-ownership";

const state = vi.hoisted(() => ({
  spawn: vi.fn(),
  updateRuntime: vi.fn<() => Promise<void>>(),
  holdProbe: false,
  releaseProbe: undefined as (() => void) | undefined,
}));
vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  spawn: state.spawn,
}));
vi.mock("node:net", async (original) => ({
  ...(await original<typeof import("node:net")>()),
  createServer: () => {
    const probe = Object.assign(new EventEmitter(), {
      unref: () => {},
      close: (done?: () => void) => done?.(),
      address: () => ({ port: 48888 }),
      listen: (_options: unknown, done: () => void) => {
        if (state.holdProbe) {
          state.holdProbe = false;
          state.releaseProbe = done;
        } else queueMicrotask(done);
      },
    });
    return probe;
  },
}));
vi.mock("node:fs", async (original) => ({
  ...(await original<typeof import("node:fs")>()),
  existsSync: () => true,
}));
vi.mock("../src/lib/whisper/binary", () => ({
  findWhisperServer: () => "/fixture/whisper",
  whisperSpawnEnv: () => ({}),
  WIN_DLL_NOT_FOUND_EXIT: 3221225781,
  WIN_DLL_NOT_FOUND_MESSAGE: "missing DLL",
}));
vi.mock("../src/lib/whisper/models", () => ({
  getDownloadedModelPath: () => "/fixture/model",
}));
vi.mock("../src/lib/mlx-asr/constants", () => ({
  getMlxAsrModel: () => ({ hfId: "fixture/model" }),
  isAppleSiliconMac: () => true,
}));
vi.mock("../src/lib/mlx-asr/python", () => ({
  describeMlxSetupBlocker: () => null,
  findPythonExecutable: () => null,
  getMlxAsrServerScriptPath: () => null,
  getMlxAsrWorkerPath: () => "/fixture/mlx",
  isMlxAudioInstalled: () => false,
}));
vi.mock("../src/lib/mlx-asr/runtime", () => ({
  updateManagedMlxRuntimeIfNeeded: state.updateRuntime,
  isManagedMlxRuntimeAvailable: () => false,
  markManagedMlxRuntimeSyncedForAppVersion: vi.fn(),
}));

const whisper = await import("../src/lib/whisper/server");
const mlx = await import("../src/lib/mlx-asr/server");
let owner: ReturnType<typeof acquireServerDatabase>;
const children: ReturnType<typeof child>[] = [];

function child() {
  const proc = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    stdin: {
      write: (_value: string, done?: () => void) => {
        queueMicrotask(() => done?.());
        return true;
      },
      end: vi.fn(),
    },
    kill: vi.fn(() => {
      queueMicrotask(() => proc.emit("close", 0));
      return true;
    }),
  });
  return proc;
}

beforeEach(() => {
  vi.useFakeTimers();
  children.length = 0;
  state.updateRuntime.mockReset().mockResolvedValue();
  state.holdProbe = false;
  state.releaseProbe = undefined;
  state.spawn.mockReset().mockImplementation((command: string) => {
    const proc = child();
    children.push(proc);
    if (command.endsWith("mlx"))
      queueMicrotask(() =>
        proc.stdout.emit("data", Buffer.from('{"type":"ready"}\n')),
      );
    return proc;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200 })),
  );
});

afterEach(async () => {
  const stopped = Promise.all([whisper.stopServer(), mlx.stopMlxServer()]);
  await vi.advanceTimersByTimeAsync(0);
  await stopped;
  owner.revoke();
  closeDb();
  vi.unstubAllGlobals();
});

describe("inference worker ownership", () => {
  it("rejects a stale Whisper model switch or stop before touching the successor", async () => {
    const previous = acquireServerDatabase();
    previous.revoke();
    owner = acquireServerDatabase();
    const started = owner.run(() => whisper.ensureServerRunning("successor"));
    await vi.advanceTimersByTimeAsync(300);
    await started;
    const successor = children[0];
    await expect(
      previous.run(() => whisper.ensureServerRunning("stale model")),
    ).rejects.toThrow("Server database owner has stopped");
    await expect(previous.run(() => whisper.stopServer())).rejects.toThrow(
      "Server database owner has stopped",
    );
    expect(() => previous.run(() => whisper.getServerPort())).toThrow(
      "Server database owner has stopped",
    );
    expect(successor.kill).not.toHaveBeenCalled();
    expect(whisper.isServerRunning()).toBe(true);
    expect(state.spawn).toHaveBeenCalledOnce();
  });

  it("rejects a stale MLX model switch or stop before touching the successor", async () => {
    const previous = acquireServerDatabase();
    previous.revoke();
    owner = acquireServerDatabase();
    const started = owner.run(() => mlx.ensureMlxServerRunning("successor"));
    await vi.advanceTimersByTimeAsync(0);
    await started;
    const successor = children[0];
    await expect(
      previous.run(() => mlx.ensureMlxServerRunning("stale model")),
    ).rejects.toThrow("Server database owner has stopped");
    await expect(previous.run(() => mlx.stopMlxServer())).rejects.toThrow(
      "Server database owner has stopped",
    );
    expect(successor.kill).not.toHaveBeenCalled();
    expect(mlx.isMlxServerRunning()).toBe(true);
    expect(state.spawn).toHaveBeenCalledOnce();
  });

  it("abandons an old Whisper startup resumed after its port probe", async () => {
    const previous = acquireServerDatabase();
    state.holdProbe = true;
    const oldStart = previous.run(() =>
      whisper.ensureServerRunning("old model"),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(state.releaseProbe).toBeDefined();
    previous.revoke();
    owner = acquireServerDatabase();
    const started = owner.run(() => whisper.ensureServerRunning("successor"));
    await vi.advanceTimersByTimeAsync(300);
    await started;
    const successor = children[0];
    state.releaseProbe?.();
    await expect(oldStart).rejects.toThrow("Server database owner has stopped");
    expect(successor.kill).not.toHaveBeenCalled();
    expect(whisper.isServerRunning()).toBe(true);
    expect(state.spawn).toHaveBeenCalledOnce();
  });

  it("abandons an MLX startup waiting on runtime preparation before spawning", async () => {
    const previous = acquireServerDatabase();
    let release!: () => void;
    state.updateRuntime.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const oldStart = previous.run(() =>
      mlx.ensureMlxServerRunning("old model"),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(state.spawn).not.toHaveBeenCalled();
    previous.revoke();
    owner = acquireServerDatabase();
    const started = owner.run(() => mlx.ensureMlxServerRunning("successor"));
    release();
    await expect(oldStart).rejects.toThrow("Server database owner has stopped");
    await vi.advanceTimersByTimeAsync(0);
    await started;
    expect(children[0].kill).not.toHaveBeenCalled();
    expect(mlx.isMlxServerRunning()).toBe(true);
    expect(state.spawn).toHaveBeenCalledOnce();
  });

  it("ignores a retired Whisper process closing after a replacement is ready", async () => {
    owner = acquireServerDatabase();
    const oldStart = owner.run(() => whisper.ensureServerRunning("old model"));
    await vi.advanceTimersByTimeAsync(300);
    await oldStart;
    const retired = children[0];
    const stopped = whisper.stopServer();
    await vi.advanceTimersByTimeAsync(0);
    await stopped;
    const started = owner.run(() => whisper.ensureServerRunning("successor"));
    await vi.advanceTimersByTimeAsync(300);
    await started;
    retired.emit("close", 0);
    expect(whisper.isServerRunning()).toBe(true);
    expect(children[1].kill).not.toHaveBeenCalled();
  });

  it("ignores late stdout from a retired MLX process", async () => {
    owner = acquireServerDatabase();
    const started = owner.run(() => mlx.ensureMlxServerRunning("old model"));
    await vi.advanceTimersByTimeAsync(0);
    await started;
    const retired = children[0];
    const stopped = mlx.stopMlxServer();
    await vi.advanceTimersByTimeAsync(0);
    await stopped;
    expect(mlx.isMlxServerRunning()).toBe(false);
    retired.stdout.emit("data", Buffer.from('{"type":"ready"}\n'));
    expect(mlx.isMlxServerRunning()).toBe(false);
  });
});
