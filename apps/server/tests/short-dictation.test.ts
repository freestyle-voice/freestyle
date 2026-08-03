import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A dictation shorter than the connect time finishes before its provider
 * session is live. Two things used to go wrong there, and both cost the user
 * the whole take: the audio was dropped while the socket was opening, and
 * Soniox resolved to an empty transcript before it had decoded anything.
 */

const sockets: FakeSocket[] = [];

class FakeSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = 0; // CONNECTING — nothing is ready when recording starts
  binaryType = "arraybuffer";
  /** Audio frames that actually reached the wire, in order. */
  audio: string[] = [];
  private handlers = new Map<string, (arg?: unknown) => void>();

  send = vi.fn((data: unknown) => {
    if (typeof data === "string") {
      // Only OpenAI wraps audio in JSON; the rest is config/finalize noise.
      if (data.includes("input_audio_buffer.append")) this.audio.push(data);
      return;
    }
    this.audio.push(Buffer.from(data as ArrayBuffer).toString("hex"));
  });
  close = vi.fn();
  on = vi.fn((event: string, handler: (arg?: unknown) => void) => {
    this.handlers.set(event, handler);
  });
  addEventListener = vi.fn();

  open(): void {
    this.readyState = FakeSocket.OPEN;
    this.handlers.get("open")?.();
  }
  reply(payload: unknown): void {
    this.handlers.get("message")?.(Buffer.from(JSON.stringify(payload)));
  }

  constructor() {
    sockets.push(this);
  }
}

vi.mock("ws", () => ({ default: FakeSocket }));

const { SonioxTranscriptionProvider } = await import(
  "../src/lib/streaming/providers/soniox.js"
);
const { OpenAITranscriptionProvider } = await import(
  "../src/lib/streaming/providers/openai.js"
);
const { FreestyleCloudTranscriptionProvider } = await import(
  "../src/lib/streaming/providers/freestyle-cloud.js"
);

function openSession(provider: "soniox" | "openai" | "freestyle-cloud") {
  const onFinal = vi.fn();
  const callbacks = {
    onPartial: vi.fn(),
    onFinal,
    onError: vi.fn(),
    onReady: vi.fn(),
    onClose: vi.fn(),
  };
  const providers = {
    soniox: () =>
      new SonioxTranscriptionProvider().openStreamingSession({
        apiKey: "k",
        model: "soniox/stt-rt-preview",
        languages: ["en"],
        bias: null,
        callbacks,
      }),
    openai: () =>
      new OpenAITranscriptionProvider().openStreamingSession({
        apiKey: "k",
        model: "openai/gpt-4o-transcribe",
        languages: ["en"],
        bias: null,
        callbacks,
      }),
    "freestyle-cloud": () =>
      new FreestyleCloudTranscriptionProvider().openStreamingSession({
        apiKey: "k",
        model: "freestyle-cloud/stt-rt-preview",
        languages: ["en"],
        bias: null,
        callbacks,
      }),
  };
  const session = providers[provider]();
  return { session, socket: sockets[0], onFinal };
}

/** Speak, then release — both before the socket has finished opening. */
function shortDictation(session: {
  sendAudio: (c: ArrayBuffer) => void;
  commit: () => void;
}) {
  session.sendAudio(new Uint8Array([1, 2, 3, 4]).buffer);
  session.sendAudio(new Uint8Array([5, 6, 7, 8]).buffer);
  session.commit();
}

describe("a dictation that ends before its session is live", () => {
  beforeEach(() => {
    sockets.length = 0;
  });

  it("sends the audio captured while the socket was opening", () => {
    const { session, socket } = openSession("freestyle-cloud");

    shortDictation(session);
    expect(socket.audio).toHaveLength(0); // held, not dropped

    socket.open();

    expect(socket.audio).toEqual(["01020304", "05060708"]);
  });

  it("holds audio for openai until the session is configured, not just open", () => {
    const { session, socket } = openSession("openai");

    shortDictation(session);
    socket.open();
    // Open is not enough — OpenAI rejects audio before session.updated.
    expect(socket.audio).toHaveLength(0);

    socket.reply({ type: "session.updated" });

    expect(socket.audio).toHaveLength(2);
  });

  it("waits for tokens instead of resolving empty the moment it finalizes", () => {
    const { session, socket, onFinal } = openSession("soniox");

    shortDictation(session);
    socket.open();
    // The audio and the finalize reached Soniox together, so its first reply
    // carries nothing yet. Delivering here would discard the real transcript.
    socket.reply({ tokens: [] });
    expect(onFinal).not.toHaveBeenCalled();

    socket.reply({
      tokens: [
        { text: "on", is_final: true },
        { text: " it", is_final: true },
      ],
    });

    expect(onFinal).toHaveBeenCalledWith("on it");
  });

  it("still resolves genuine silence, via the finished message", () => {
    const { session, socket, onFinal } = openSession("soniox");

    shortDictation(session);
    socket.open();
    socket.reply({ tokens: [] });

    socket.reply({ finished: true });

    expect(onFinal).toHaveBeenCalledWith("");
  });
});
