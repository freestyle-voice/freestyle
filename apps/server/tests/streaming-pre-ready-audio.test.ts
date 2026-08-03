import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Recording starts the moment the hotkey goes down, but an upstream session
 * takes a few hundred milliseconds to open and configure. Every streaming
 * provider must hold the audio captured in that window and send it once the
 * socket is usable — dropping it costs the user the start of their sentence,
 * and on a short take it costs them the whole thing.
 *
 * This ran differently in every provider before: some buffered, some silently
 * returned. These tests hold them all to the same contract.
 */

const sockets: FakeSocket[] = [];

class FakeSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = 0; // CONNECTING — nothing is ready when recording starts
  binaryType = "arraybuffer";
  /** Every audio frame that actually reached the wire, in order. */
  audio: string[] = [];
  control: string[] = [];
  private handlers = new Map<string, (arg?: unknown) => void>();

  send = vi.fn((data: unknown) => {
    if (typeof data === "string") {
      // Only OpenAI wraps audio in JSON; every other control frame (configs,
      // finalize, keepalive) is bookkeeping, not audio.
      if (data.includes("input_audio_buffer.append")) this.audio.push(data);
      else this.control.push(data);
      return;
    }
    this.audio.push(Buffer.from(data as ArrayBuffer).toString("hex"));
  });
  close = vi.fn();
  on = vi.fn((event: string, handler: (arg?: unknown) => void) => {
    this.handlers.set(event, handler);
  });
  addEventListener = vi.fn();

  emit(event: string, arg?: unknown): void {
    this.handlers.get(event)?.(arg);
  }
  open(): void {
    this.readyState = FakeSocket.OPEN;
    this.emit("open");
  }
  reply(payload: unknown): void {
    this.emit("message", Buffer.from(JSON.stringify(payload)));
  }

  constructor() {
    sockets.push(this);
  }
}

vi.mock("ws", () => ({ default: FakeSocket }));
const { SonioxTranscriptionProvider } = await import(
  "../src/lib/streaming/providers/soniox.js"
);
const { DeepgramTranscriptionProvider } = await import(
  "../src/lib/streaming/providers/deepgram.js"
);
const { OpenAITranscriptionProvider } = await import(
  "../src/lib/streaming/providers/openai.js"
);

const callbacks = () => ({
  onPartial: vi.fn(),
  onFinal: vi.fn(),
  onError: vi.fn(),
  onReady: vi.fn(),
  onClose: vi.fn(),
});

/** Two chunks of audio spoken before the socket finished opening. */
function speakEarly(session: { sendAudio: (c: ArrayBuffer) => void }) {
  session.sendAudio(new Uint8Array([1, 2, 3, 4]).buffer);
  session.sendAudio(new Uint8Array([5, 6, 7, 8]).buffer);
}

describe("audio captured before the session is ready", () => {
  beforeEach(() => {
    sockets.length = 0;
  });

  it("soniox sends it once the socket opens", () => {
    const session = new SonioxTranscriptionProvider().openStreamingSession({
      apiKey: "k",
      model: "soniox/stt-rt-preview",
      languages: ["en"],
      bias: null,
      callbacks: callbacks(),
    });
    const socket = sockets[0];

    speakEarly(session);
    expect(socket.audio).toHaveLength(0); // held, not lost

    socket.open();

    expect(socket.audio).toEqual(["01020304", "05060708"]);
  });

  it("deepgram sends it once the socket opens", () => {
    const session = new DeepgramTranscriptionProvider().openStreamingSession({
      apiKey: "k",
      model: "deepgram/nova-3",
      languages: ["en"],
      bias: null,
      callbacks: callbacks(),
    });
    const socket = sockets[0];

    speakEarly(session);
    expect(socket.audio).toHaveLength(0);

    socket.open();

    expect(socket.audio).toHaveLength(2);
  });

  it("openai holds it until the session is configured, not merely open", () => {
    const session = new OpenAITranscriptionProvider().openStreamingSession({
      apiKey: "k",
      model: "openai/gpt-4o-transcribe",
      languages: ["en"],
      bias: null,
      callbacks: callbacks(),
    });
    const socket = sockets[0];

    speakEarly(session);
    socket.open();

    // Open is not enough — OpenAI rejects audio before session.updated.
    expect(socket.audio).toHaveLength(0);

    socket.reply({ type: "session.updated" });

    expect(socket.audio).toHaveLength(2);
  });

  it("keeps held audio ahead of live audio, in order", () => {
    const session = new SonioxTranscriptionProvider().openStreamingSession({
      apiKey: "k",
      model: "soniox/stt-rt-preview",
      languages: ["en"],
      bias: null,
      callbacks: callbacks(),
    });
    const socket = sockets[0];

    speakEarly(session);
    socket.open();
    session.sendAudio(new Uint8Array([9, 9, 9, 9]).buffer);

    expect(socket.audio).toEqual(["01020304", "05060708", "09090909"]);
  });

  it("drops held audio when the recording is cancelled", () => {
    const session = new SonioxTranscriptionProvider().openStreamingSession({
      apiKey: "k",
      model: "soniox/stt-rt-preview",
      languages: ["en"],
      bias: null,
      callbacks: callbacks(),
    });
    const socket = sockets[0];

    speakEarly(session);
    session.cancel?.();
    socket.open();

    expect(socket.audio).toHaveLength(0);
  });
});
