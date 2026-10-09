import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requestSignal } from "../src/lib/request-abort.js";

const { stt, nativeMlx, whisperStart, sockets } = vi.hoisted(() => ({
  stt: vi.fn(),
  nativeMlx: vi.fn(),
  whisperStart: vi.fn().mockResolvedValue(undefined),
  sockets: [] as Array<{
    emit: (event: string) => void;
    terminate: ReturnType<typeof vi.fn>;
  }>,
}));
vi.mock("@freestyle-voice/stt", () => ({
  transcribe: stt,
  collapseAsrLineBreaks: (text: string) => text,
}));
vi.mock("ws", () => ({
  default: class extends EventEmitter {
    terminate = vi.fn();
    close = vi.fn();
    send = vi.fn();
    constructor() {
      super();
      sockets.push(this);
    }
  },
}));
vi.mock("../src/lib/whisper/binary.js", () => ({
  isServerBinaryAvailable: () => true,
}));
vi.mock("../src/lib/whisper/server.js", () => ({
  ensureServerRunning: whisperStart,
  getServerPort: () => 1234,
  withServerUse: async (fn: () => Promise<unknown>) => fn(),
}));
vi.mock("../src/lib/mlx-asr/models.js", () => ({
  getMlxModelStatus: () => ({ status: "ready" }),
}));
vi.mock("../src/lib/mlx-asr/python.js", () => ({
  describeMlxSetupBlocker: () => undefined,
}));
vi.mock("../src/lib/mlx-asr/server.js", () => ({
  canRunMlxAsr: () => true,
  transcribeWithMlxAsr: nativeMlx,
}));
const { transcribeWithAiSdk } = await import("../src/lib/streaming/utils.js");
const { transcribeDeepgramListen, transcribeElevenLabsWithBias } = await import(
  "../src/lib/streaming/transcribe-bias.js"
);
const { WhisperLocalTranscriptionProvider } = await import(
  "../src/lib/streaming/providers/whisper-local.js"
);
const { MlxLocalTranscriptionProvider } = await import(
  "../src/lib/streaming/providers/mlx-local.js"
);
const { SonioxTranscriptionProvider } = await import(
  "../src/lib/streaming/providers/soniox.js"
);
const options = {
  audio: new Uint8Array([1]),
  model: "test-model",
  apiKey: "test",
};
afterEach(() => {
  vi.unstubAllGlobals();
  stt.mockReset();
  nativeMlx.mockReset();
  whisperStart.mockClear();
  sockets.length = 0;
});

describe("batch provider cancellation", () => {
  it("forwards request cancellation into AI SDK STT with its deadline intact", async () => {
    const controller = new AbortController();
    stt.mockImplementation(async ({ signal }) => {
      expect(signal).not.toBe(controller.signal);
      controller.abort();
      expect(signal.aborted).toBe(true);
      throw signal.reason;
    });
    await expect(
      transcribeWithAiSdk(
        { ...options, signal: controller.signal },
        () => ({ transcription: () => ({}) as never }),
        "openai",
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it.each([
    "deepgram",
    "elevenlabs",
    "whisper",
  ])("aborts the %s HTTP request", async (provider) => {
    const controller = new AbortController();
    const fetch = vi.fn(async (_url, init) => {
      expect(init.signal.aborted).toBe(false);
      controller.abort();
      expect(init.signal.aborted).toBe(true);
      throw init.signal.reason;
    });
    vi.stubGlobal("fetch", fetch);
    const opts = { ...options, signal: controller.signal };
    const result =
      provider === "deepgram"
        ? transcribeDeepgramListen(opts)
        : provider === "elevenlabs"
          ? transcribeElevenLabsWithBias(opts, {
              kind: "elevenlabs-keyterms",
              terms: ["test"],
            })
          : new WhisperLocalTranscriptionProvider().transcribe(opts);
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(fetch).toHaveBeenCalledOnce();
    if (provider === "whisper") expect(whisperStart).toHaveBeenCalledOnce();
  });

  it("closes Soniox's socket and rejects without waiting for its commit timeout", async () => {
    const controller = new AbortController();
    const result = new SonioxTranscriptionProvider().transcribe({
      ...options,
      signal: controller.signal,
    });
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(sockets[0].terminate).toHaveBeenCalledOnce();
    sockets[0].emit("open");
  });

  it("stops awaiting MLX while leaving shared native inference to settle safely", async () => {
    const controller = new AbortController();
    let finish!: (text: string) => void;
    nativeMlx.mockReturnValue(
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
    );
    const result = new MlxLocalTranscriptionProvider().transcribe({
      ...options,
      signal: controller.signal,
    });
    expect(nativeMlx.mock.calls[0][0].signal).toBe(controller.signal);
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    finish("late native output");
  });

  it("keeps the deadline active when the caller never cancels", async () => {
    vi.useRealTimers();
    const controller = new AbortController();
    const signal = requestSignal(controller.signal, 5);
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(controller.signal.aborted).toBe(false);
    expect(signal.reason).toMatchObject({ name: "TimeoutError" });
    vi.useFakeTimers();
  });
});
