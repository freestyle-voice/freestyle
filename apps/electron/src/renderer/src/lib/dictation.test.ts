import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type StreamerCallbacks = {
  onFinal: (text: string) => void;
  onError: (message: string) => void;
};

const mocks = vi.hoisted(() => {
  const state: {
    acquire: { resolve: (s: unknown) => void } | null;
    streamerCallbacks: StreamerCallbacks | null;
  } = { acquire: null, streamerCallbacks: null };
  return {
    state,
    apiFetch: vi.fn(),
    recorder: {
      acquireStream: vi.fn(
        () =>
          new Promise((resolve) => {
            state.acquire = { resolve };
          }),
      ),
      releaseStream: vi.fn(),
    },
    streamer: {
      startCapture: vi.fn(async () => {}),
      commit: vi.fn(),
      cancel: vi.fn(),
      destroy: vi.fn(),
      setContext: vi.fn(),
      getWavBlob: vi.fn<() => Blob | null>(() => null),
    },
  };
});

vi.mock("@renderer/lib/api", () => ({
  apiFetch: mocks.apiFetch,
  getApiBase: () => "http://127.0.0.1:4649",
  getClient: () => ({
    api: {
      output: {
        hook: { $get: vi.fn(async () => ({ ok: false })) },
        deliver: { $post: vi.fn(async () => ({ ok: false })) },
      },
      "post-process": { $post: vi.fn(async () => ({ ok: false })) },
    },
  }),
  getServerToken: () => "",
  initApiBase: vi.fn(async () => {}),
}));

vi.mock("@renderer/lib/level-meter", () => ({
  LevelMeter: class {
    attach(): void {}
    detach(): void {}
    destroy(): void {}
  },
}));

vi.mock("@renderer/lib/recorder", () => ({
  Recorder: class {
    acquireStream = mocks.recorder.acquireStream;
    releaseStream = mocks.recorder.releaseStream;
  },
  RecorderSupersededError: class extends Error {},
}));

vi.mock("@renderer/lib/streamer", () => ({
  Streamer: class {
    constructor(_base: string, _token: string, callbacks: StreamerCallbacks) {
      mocks.state.streamerCallbacks = callbacks;
    }
    startCapture = mocks.streamer.startCapture;
    commit = mocks.streamer.commit;
    cancel = mocks.streamer.cancel;
    destroy = mocks.streamer.destroy;
    setContext = mocks.streamer.setContext;
    getWavBlob = mocks.streamer.getWavBlob;
  },
}));

const { apiFetch, recorder, streamer, state } = mocks;

import { DictationController } from "./dictation";

function makeController() {
  const phases: string[] = [];
  const errors: string[] = [];
  const composer: string[] = [];
  const controller = new DictationController(
    {
      onPhase: (p) => phases.push(p),
      onPartial: () => {},
      onComposerText: (t) => composer.push(t),
      onError: (m) => errors.push(m),
    },
    {
      destination: () => "composer",
      outputMode: () => "paste",
      soundEnabled: () => false,
      audioPlaybackMode: () => "off",
    },
  );
  return { controller, phases, errors, composer };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe("DictationController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    state.acquire = null;
    state.streamerCallbacks = null;
    streamer.getWavBlob.mockReturnValue(null);
    apiFetch.mockReset();
    (globalThis as { window?: unknown }).window = {
      api: {
        getFrontmostApp: async () => null,
        prepareSystemAudio: async () => {},
        restoreSystemAudio: async () => {},
        sendTranscriptionDone: () => {},
        pasteText: async () => {},
        copyText: async () => {},
      },
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("returns to idle when the key is released before the mic is acquired", async () => {
    const { controller, phases } = makeController();
    await flush();
    void controller.start();
    await flush();
    controller.stop();
    state.acquire?.resolve({});
    await flush();
    expect(streamer.commit).not.toHaveBeenCalled();
    expect(phases).toEqual(["recording", "idle"]);
    expect(recorder.releaseStream).toHaveBeenCalled();
  });

  it("falls back to REST transcription when no final arrives", async () => {
    const { controller, phases, composer, errors } = makeController();
    await flush();
    void controller.start();
    await flush();
    state.acquire?.resolve({});
    await flush();
    controller.stop();
    expect(streamer.commit).toHaveBeenCalledTimes(1);
    streamer.getWavBlob.mockReturnValue(new Blob(["wav"]));
    apiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ cleaned: "hello there" }),
    });
    await vi.advanceTimersByTimeAsync(15_000);
    await flush();
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/transcribe",
      expect.objectContaining({ method: "POST" }),
    );
    expect(composer).toEqual(["hello there"]);
    expect(phases.at(-1)).toBe("idle");
    state.streamerCallbacks?.onFinal("late");
    state.streamerCallbacks?.onError("late transport error");
    await flush();
    expect(composer).toEqual(["hello there"]);
    expect(errors).toEqual([]);
  });

  it("reports a timeout when nothing was recorded", async () => {
    const { controller, errors, phases } = makeController();
    await flush();
    void controller.start();
    await flush();
    state.acquire?.resolve({});
    await flush();
    controller.stop();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(errors).toEqual(["Transcription timed out"]);
    expect(phases.at(-1)).toBe("idle");
  });

  it("delivers a streamed final and disarms the watchdog", async () => {
    const { controller, composer, errors } = makeController();
    await flush();
    void controller.start();
    await flush();
    state.acquire?.resolve({});
    await flush();
    controller.stop();
    state.streamerCallbacks?.onFinal("streamed text");
    await flush();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(composer).toEqual(["streamed text"]);
    expect(errors).toEqual([]);
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
