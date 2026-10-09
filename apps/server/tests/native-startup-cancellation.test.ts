import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { writeSetting } from "../src/lib/db.js";

const { spawnSpy } = vi.hoisted(() => ({ spawnSpy: vi.fn() }));
class FakeProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = {
    write: vi.fn((_text: string, cb?: (error?: Error) => void) => {
      cb?.();
      return true;
    }),
    end: vi.fn(),
  };
  kill = vi.fn(() => {
    queueMicrotask(() => this.emit("close", 0));
    return true;
  });
}
vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  spawn: spawnSpy,
}));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: (path: string) =>
      path === "/fake/mlx-worker" || actual.existsSync(path),
  };
});
vi.mock("node:net", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createServer: () => {
    const probe = new EventEmitter() as EventEmitter & {
      unref: () => void;
      listen: (_opts: unknown, cb: () => void) => void;
      close: (cb: () => void) => void;
    };
    probe.unref = () => {};
    probe.listen = (_opts, cb) => cb();
    probe.close = (cb) => cb();
    return probe;
  },
}));
vi.mock("../src/lib/whisper/binary.js", () => ({
  isServerBinaryAvailable: () => true,
  findWhisperServer: () => "/fake/whisper",
  whisperSpawnEnv: () => ({}),
  WIN_DLL_NOT_FOUND_EXIT: 42,
  WIN_DLL_NOT_FOUND_MESSAGE: "missing",
}));
vi.mock("../src/lib/whisper/models.js", () => ({
  getDownloadedModelPath: () => "/fake/model",
}));
vi.mock("../src/lib/mlx-asr/python.js", () => ({
  describeMlxSetupBlocker: () => undefined,
  findPythonExecutable: () => null,
  getMlxAsrServerScriptPath: () => "",
  getMlxAsrWorkerPath: () => "/fake/mlx-worker",
  isMlxAudioInstalled: () => false,
}));
vi.mock("../src/lib/mlx-asr/runtime.js", () => ({
  isManagedMlxRuntimeAvailable: () => false,
  markManagedMlxRuntimeSyncedForAppVersion: () => {},
  updateManagedMlxRuntimeIfNeeded: async () => undefined,
}));
const { WhisperLocalTranscriptionProvider } = await import(
  "../src/lib/streaming/providers/whisper-local.js"
);
const { isServerRunning, stopServer } = await import(
  "../src/lib/whisper/server.js"
);
const { transcribeWithMlxAsr, isMlxServerRunning, stopMlxServer } =
  await import("../src/lib/mlx-asr/server.js");
afterEach(async () => {
  await stopServer();
  await stopMlxServer();
  vi.unstubAllGlobals();
  spawnSpy.mockReset();
});

describe("canceled native startup retention", () => {
  it("keeps Whisper ownership through deferred startup and unloads after it settles", async () => {
    const proc = new FakeProcess();
    spawnSpy.mockReturnValue(proc);
    let ready = false;
    const fetch = vi.fn(async () => ({ ok: ready, status: ready ? 200 : 503 }));
    vi.stubGlobal("fetch", fetch);
    writeSetting("whisper_keep_alive_minutes", "0");
    const controller = new AbortController();
    const request = new WhisperLocalTranscriptionProvider().transcribe({
      audio: new Uint8Array([1]),
      model: "local-whisper/test",
      apiKey: "unused",
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(spawnSpy).toHaveBeenCalledOnce());
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(proc.kill).not.toHaveBeenCalled();
    ready = true;
    await vi.advanceTimersByTimeAsync(300);
    expect(proc.kill).toHaveBeenCalled();
    expect(isServerRunning()).toBe(false);
    expect(
      fetch.mock.calls.every(
        (args) => args.length === 0 || !String(args[0]).includes("/inference"),
      ),
    ).toBe(true);
  });

  it("schedules MLX unload when cancellation arrives while startup is still pending", async () => {
    const proc = new FakeProcess();
    spawnSpy.mockReturnValue(proc);
    writeSetting("mlx_asr_keep_alive_minutes", "0");
    const controller = new AbortController();
    const request = transcribeWithMlxAsr({
      audio: new Uint8Array([1]),
      modelId: "qwen3-0.6b-8bit",
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(spawnSpy).toHaveBeenCalledOnce());
    controller.abort();
    expect(proc.kill).not.toHaveBeenCalled();
    const rejected = expect(request).rejects.toMatchObject({
      name: "AbortError",
    });
    proc.stdout.emit("data", Buffer.from('{"type":"ready"}\n'));
    await rejected;
    await vi.advanceTimersByTimeAsync(0);
    expect(proc.kill).toHaveBeenCalled();
    expect(isMlxServerRunning()).toBe(false);
    expect(
      proc.stdin.write.mock.calls.some(([text]) =>
        text.includes('"type":"transcribe"'),
      ),
    ).toBe(false);
  });
});
