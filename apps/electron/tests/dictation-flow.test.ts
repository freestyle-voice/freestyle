import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  type ElectronApplication,
  _electron as electron,
  expect,
  type Page,
  test,
} from "@playwright/test";

type Mode = "batch" | "fallback";
type Reply = { status?: number; body: Record<string, unknown>; hold?: boolean };
type Call = {
  path: string;
  body?: Record<string, unknown>;
  headers: Record<string, string>;
  aborted: boolean;
  returned: boolean;
  audio?: {
    riff: string;
    wave: string;
    bytes: number;
    rate: number;
    channels: number;
    bits: number;
  };
};
type DictationFixture = {
  calls: Call[];
  configCount: number;
  pcmBytes: number;
  streamMessages: string[];
  transcriptions: Reply[];
  outputs: Reply[];
  release: (path: string, index: number) => void;
};
type FixtureWindow = Window & { __dictation: DictationFixture };
type RecordedEvent = {
  type: string;
  body?: { phase?: string; text?: string; mode?: string };
  options?: { message?: string };
};

let app: ElectronApplication;
let pill: Page;
let eventsPath: string;

function events(): RecordedEvent[] {
  if (!existsSync(eventsPath)) return [];
  return readFileSync(eventsPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
function outputs() {
  return events().filter((event) => event.type === "native-output");
}

function microphoneWav(): Buffer {
  const rate = 16000;
  const wav = Buffer.alloc(44 + rate * 2 * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(wav.length - 44, 40);
  for (let i = 0; i < rate * 2; i++) {
    wav.writeInt16LE(
      Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 5000),
      44 + i * 2,
    );
  }
  return wav;
}

async function launch(
  mode: Mode,
  transcriptions: Reply[],
  outputReplies: Reply[] = [],
) {
  const dir = mkdtempSync(join(tmpdir(), "freestyle-dictation-e2e-"));
  const mic = join(dir, "microphone.wav");
  eventsPath = join(dir, "events.jsonl");
  writeFileSync(mic, microphoneWav());
  writeFileSync(
    join(dir, "settings.json"),
    JSON.stringify({ onboardingComplete: true }),
  );
  app = await electron.launch({
    args: [
      resolve(__dirname, "fixtures/dictation-main.cjs"),
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      `--use-file-for-fake-audio-capture=${mic}`,
    ],
    env: {
      ...process.env,
      NODE_ENV: "development",
      FREESTYLE_E2E: "1",
      FREESTYLE_USER_DATA: dir,
      FREESTYLE_E2E_USER_DATA_DIR: dir,
      FREESTYLE_E2E_PERMISSION_EVENTS: eventsPath,
      FREESTYLE_E2E_ACCESSIBILITY: "granted",
      FREESTYLE_E2E_MICROPHONE: "granted",
      FREESTYLE_E2E_DIALOG_RESPONSE: "2",
      FREESTYLE_CLOUD_URL: "https://cloud.test",
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
    },
  });
  await app.firstWindow();
  await expect
    .poll(() => app.windows().find((page) => page.url().includes("pill")))
    .toBeTruthy();
  pill = app.windows().find((page) => page.url().includes("pill"))!;
  await pill.addInitScript(
    ({ mode, transcriptions, outputReplies }) => {
      const f: DictationFixture = {
        calls: [],
        configCount: 0,
        pcmBytes: 0,
        streamMessages: [],
        transcriptions,
        outputs: outputReplies,
        release: () => {},
      };
      (window as unknown as FixtureWindow).__dictation = f;
      const held = new Map<string, () => void>();
      f.release = (path, index) => {
        held.get(`${path}:${index}`)?.();
      };
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const req = new Request(input, init);
        const path = new URL(req.url).pathname;
        if (path === "/api/settings")
          return Response.json({
            output_mode: "clipboard",
            audio_playback_mode: "off",
            llm_cleanup: "false",
          });
        if (path === "/api/auth/status")
          return Response.json({ authenticated: true, verified: true });
        if (path === "/api/output/hook")
          return Response.json({ present: true });
        if (path === "/api/transcribe/pre-warm")
          return Response.json({ ok: true });
        if (
          ![
            "/api/transcribe",
            "/api/post-process",
            "/api/output/deliver",
          ].includes(path)
        )
          return originalFetch(input, init);

        const call: Call = {
          path,
          headers: Object.fromEntries(req.headers),
          aborted: req.signal.aborted,
          returned: false,
        };
        req.signal.addEventListener(
          "abort",
          () => {
            call.aborted = true;
          },
          { once: true },
        );
        if (path === "/api/transcribe") {
          const bytes = await req.arrayBuffer();
          const view = new DataView(bytes);
          const text = (start: number) =>
            new TextDecoder().decode(bytes.slice(start, start + 4));
          call.audio = {
            riff: text(0),
            wave: text(8),
            bytes: bytes.byteLength,
            rate: view.getUint32(24, true),
            channels: view.getUint16(22, true),
            bits: view.getUint16(34, true),
          };
        } else call.body = await req.json();
        const index = f.calls.filter((item) => item.path === path).length;
        f.calls.push(call);
        const reply =
          path === "/api/transcribe"
            ? f.transcriptions[index]
            : path === "/api/output/deliver"
              ? (f.outputs[index] ?? {
                  body: {
                    output: { text: call.body?.text, mode: "clipboard" },
                    disposition: "deliver",
                  },
                })
              : {
                  body: {
                    cleaned: "merged clean text",
                    disposition: "deliver",
                  },
                };
        if (!reply)
          throw new Error(`Unexpected fixture request ${path}:${index}`);
        // Deliberately allow late success after abort: production session/signal
        // guards must reject it even when an inference backend ignores cancel.
        if (reply.hold)
          await new Promise<void>((resolve) =>
            held.set(`${path}:${index}`, resolve),
          );
        call.returned = true;
        return Response.json(reply.body, { status: reply.status ?? 200 });
      };

      // Provider transport fixture only; the production Streamer still captures
      // microphone PCM, commits sessions, and constructs its fallback WAV.
      const NativeWebSocket = window.WebSocket;
      class ProviderSocket extends EventTarget {
        readyState: number = NativeWebSocket.CONNECTING;
        binaryType = "blob";
        constructor() {
          super();
          setTimeout(() => {
            this.readyState = NativeWebSocket.OPEN;
            this.dispatchEvent(new Event("open"));
            this.message({
              type: "config",
              streaming: mode === "fallback",
              sessionTransport: mode === "fallback",
              model: "fixture",
              providerCategory: "byok",
            });
            f.configCount++;
          }, 0);
        }
        message(body: Record<string, unknown>) {
          this.dispatchEvent(
            new MessageEvent("message", { data: JSON.stringify(body) }),
          );
        }
        send(data: string | ArrayBuffer) {
          if (typeof data !== "string") {
            f.pcmBytes += data.byteLength;
            return;
          }
          const msg = JSON.parse(data);
          f.streamMessages.push(msg.type);
          if (msg.type === "start")
            queueMicrotask(() => this.message({ type: "session.ready" }));
          if (msg.type === "commit")
            queueMicrotask(() =>
              this.message({
                type: "error",
                message: "fixture stream interrupted",
              }),
            );
        }
        close() {
          this.readyState = NativeWebSocket.CLOSED;
          this.dispatchEvent(new Event("close"));
        }
      }
      Object.defineProperty(window, "WebSocket", {
        configurable: true,
        value: new Proxy(NativeWebSocket, {
          construct(target, args) {
            return new URL(String(args[0])).pathname === "/stream"
              ? new ProviderSocket()
              : Reflect.construct(target, args);
          },
        }),
      });
    },
    { mode, transcriptions, outputReplies },
  );
  await pill.reload();
  await expect
    .poll(() =>
      pill.evaluate(
        () => (window as unknown as FixtureWindow).__dictation?.configCount,
      ),
    )
    .toBeGreaterThan(0);
  // Receiving config requires the production renderer's mount effects and
  // provider listeners to have run before the first hotkey.
}

test.afterEach(async () => {
  if (!app) return;
  const child = app.process();
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) =>
    child.once("exit", () => resolve()),
  );
  // Quit through production cleanup so fake-microphone tests cannot leave
  // native key helpers running on the developer's computer.
  await app.evaluate(({ app }) => {
    setTimeout(() => app.quit(), 25);
  });
  await expect.poll(() => child.exitCode, { timeout: 15_000 }).toBe(0);
  await exited;
});

async function trigger(channel: string) {
  await pill.evaluate(
    (channel) => window.electron.ipcRenderer.send(channel),
    channel,
  );
}
async function record() {
  const previous = events().filter(
    (event) =>
      event.type === "dictation-state" && event.body?.phase === "recording",
  ).length;
  await trigger("e2e:trigger-hotkey-down");
  await expect
    .poll(
      () =>
        events().filter(
          (event) =>
            event.type === "dictation-state" &&
            event.body?.phase === "recording",
        ).length,
    )
    .toBe(previous + 1);
  // Production commits intentionally discard clips shorter than 250 ms.
  await pill.waitForTimeout(400);
  await trigger("e2e:trigger-hotkey-up");
}
async function calls(path: string) {
  return pill.evaluate(
    (path) =>
      (window as unknown as FixtureWindow).__dictation.calls.filter(
        (call) => call.path === path,
      ),
    path,
  );
}
async function waitForCall(path: string, count = 1) {
  await expect.poll(async () => (await calls(path)).length).toBe(count);
}
async function idle() {
  await expect
    .poll(
      () =>
        events()
          .filter((event) => event.type === "dictation-state")
          .at(-1)?.body?.phase,
    )
    .toBe("idle");
}
async function release(path: string, index = 0) {
  await pill.evaluate(
    ({ path, index }) =>
      (window as unknown as FixtureWindow).__dictation.release(path, index),
    { path, index },
  );
}

for (const mode of ["batch", "fallback"] as const) {
  test(`${mode} uploads real microphone WAV through shared batch mapping and delivers cleaned text once`, async () => {
    await launch(mode, [
      {
        body: {
          raw: " raw recording ",
          cleaned: " clean recording ",
          provider_category: "byok",
          disposition: "deliver",
        },
      },
    ]);
    await record();
    await expect.poll(() => outputs().length).toBe(1);
    expect(outputs()[0].body).toMatchObject({
      text: "clean recording",
      mode: "clipboard",
    });
    await expect
      .poll(
        () =>
          events().filter((event) => event.type === "transcription-done")
            .length,
      )
      .toBe(1);
    const [upload] = await calls("/api/transcribe");
    expect(upload.audio).toMatchObject({
      riff: "RIFF",
      wave: "WAVE",
      rate: 16000,
      channels: 1,
      bits: 16,
    });
    expect(upload.audio!.bytes).toBeGreaterThan(44);
    expect(upload.headers["content-type"]).toBe("audio/wav");
    expect(
      Number(upload.headers["x-audio-duration-ms"]),
    ).toBeGreaterThanOrEqual(250);
    expect((await calls("/api/output/deliver"))[0].body).toMatchObject({
      text: "clean recording",
      mode: "clipboard",
    });
    if (mode === "fallback") {
      const transport = await pill.evaluate(
        () => (window as unknown as FixtureWindow).__dictation,
      );
      expect(transport.streamMessages).toContain("commit");
      expect(transport.pcmBytes).toBeGreaterThan(0);
    }
  });

  for (const disposition of ["suppressed", "aborted"] as const) {
    test(`${mode} ${disposition} response with nonempty text never reaches native output`, async () => {
      await launch(mode, [
        {
          body: { raw: "must not leak", cleaned: "must not leak", disposition },
        },
      ]);
      await record();
      await waitForCall("/api/transcribe");
      await idle();
      expect(await calls("/api/output/deliver")).toHaveLength(0);
      expect(outputs()).toHaveLength(0);
      expect(
        events().filter((event) => event.type === "transcription-done"),
      ).toHaveLength(0);
    });
  }
}

test("Escape aborts an outstanding upload, rejects late text, and a fresh recording still delivers", async () => {
  await launch("batch", [
    {
      hold: true,
      body: {
        raw: "stale recording",
        cleaned: "stale recording",
        disposition: "deliver",
      },
    },
    {
      body: {
        raw: "new recording",
        cleaned: "new clean recording",
        disposition: "deliver",
      },
    },
  ]);
  await record();
  await waitForCall("/api/transcribe");
  await trigger("e2e:trigger-escape");
  await expect
    .poll(async () => (await calls("/api/transcribe"))[0].aborted)
    .toBe(true);
  await idle();
  await record();
  await expect.poll(() => outputs().length).toBe(1);
  await release("/api/transcribe");
  await expect
    .poll(async () => (await calls("/api/transcribe"))[0].returned)
    .toBe(true);
  await idle();
  expect(outputs().map((event) => event.body?.text)).toEqual([
    "new clean recording",
  ]);
  expect(
    (await calls("/api/output/deliver")).map((call) => call.body?.text),
  ).toEqual(["new clean recording"]);
});

test("Escape during the output hook aborts delivery even if its late result says deliver", async () => {
  await launch(
    "batch",
    [
      {
        body: {
          raw: "recording",
          cleaned: "clean recording",
          disposition: "deliver",
        },
      },
    ],
    [
      {
        hold: true,
        body: {
          output: { text: "late output", mode: "clipboard" },
          disposition: "deliver",
        },
      },
    ],
  );
  await record();
  await waitForCall("/api/output/deliver");
  await trigger("e2e:trigger-escape");
  await expect
    .poll(async () => (await calls("/api/output/deliver"))[0].aborted)
    .toBe(true);
  await release("/api/output/deliver");
  await expect
    .poll(async () => (await calls("/api/output/deliver"))[0].returned)
    .toBe(true);
  await idle();
  expect(outputs()).toHaveLength(0);
  expect(
    events().filter((event) => event.type === "transcription-done"),
  ).toHaveLength(0);
});

test("stream failure keeps its diagnostic when shared REST fallback also fails", async () => {
  await launch("fallback", [
    {
      status: 500,
      body: {
        error: "Transcription failed",
        detail: "generic provider failure",
      },
    },
  ]);
  await record();
  await waitForCall("/api/transcribe");
  await expect(
    pill.getByText("fixture stream interrupted", { exact: true }),
  ).toBeVisible();
  expect(outputs()).toHaveLength(0);
});

test("shared batch usage mapping prompts upgrade without delivering", async () => {
  await launch("batch", [{ status: 429, body: { error: "usage_exceeded" } }]);
  await record();
  await expect
    .poll(() =>
      events().some(
        (event) =>
          event.type === "dialog" &&
          event.options?.message === "Usage limit reached",
      ),
    )
    .toBe(true);
  expect(outputs()).toHaveLength(0);
});
