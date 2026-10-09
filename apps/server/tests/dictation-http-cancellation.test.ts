import { request } from "node:http";
import type { Socket } from "node:net";
import { serve } from "@hono/node-server";
import { FreestyleEventType, PluginRegistry } from "freestyle-voice";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, writeSetting } from "../src/lib/db.js";

const fixtures = vi.hoisted(() => ({
  transcribe: vi.fn(),
  cleanup: vi.fn(),
  captureException: vi.fn(),
}));
vi.mock("../src/lib/streaming/registry.js", () => ({
  getProvider: () => ({ transcribe: fixtures.transcribe }),
}));
vi.mock("../src/lib/streaming-stt.js", () => ({
  getApiKeyForProvider: () => "fixture-key",
  voiceProviderCategory: () => "byok",
}));
vi.mock("../src/lib/freestyle-cloud.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  postProcessWithFreestyleCloud: fixtures.cleanup,
}));
vi.mock("../src/lib/sessions.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getSessionToken: () => "fixture-session",
}));
vi.mock("../src/lib/sentry.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  capture: vi.fn(),
  captureException: fixtures.captureException,
}));
const registry = { current: new PluginRegistry() };
vi.mock("../src/lib/plugins/index.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  plugins: () => registry.current,
}));
const { default: createApp } = await import("../src/index.js");

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

// A complete WAV upload, so disconnect happens after body consumption rather
// than exercising only Node's incomplete-upload cancellation path.
function recordedWav() {
  const wav = new Uint8Array(44 + 320);
  const view = new DataView(wav.buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++)
      wav[offset + i] = value.charCodeAt(i);
  };
  text(0, "RIFF");
  view.setUint32(4, wav.length - 8, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, wav.length - 44, true);
  return wav;
}

let server: ReturnType<typeof serve>;
let base: string;
let signal: AbortSignal;
let completed: ReturnType<typeof deferred<Response>>;
let abortObserved: ReturnType<typeof deferred<void>>;
const sockets = new Set<Socket>();

beforeEach(async () => {
  vi.useRealTimers();
  registry.current = new PluginRegistry();
  fixtures.transcribe.mockReset().mockResolvedValue({ text: "fresh text" });
  fixtures.cleanup.mockReset().mockResolvedValue({ cleaned: "fresh cleanup" });
  fixtures.captureException.mockClear();
  const db = getDb();
  db.exec("DELETE FROM transcription_history; DELETE FROM model_configs;");
  writeSetting("llm_cleanup", "false");
  writeSetting("history_paused", "false");
  db.prepare(
    "INSERT INTO model_configs (provider, model_id, model_name, type, is_default) VALUES ('fixture', 'fixture', 'Fixture', 'voice', 1)",
  ).run();
  completed = deferred<Response>();
  abortObserved = deferred<void>();
  const app = createApp();
  server = serve({
    hostname: "127.0.0.1",
    port: 0,
    // Observe the production app's result after a client has disconnected. A
    // client cannot read that result, so this also proves no deliverable text
    // escaped the handler or got persisted when a provider resolved late.
    fetch: async (incoming, env) => {
      signal = incoming.signal;
      signal.addEventListener("abort", () => abortObserved.resolve(), {
        once: true,
      });
      const result = await app.fetch(incoming, env);
      completed.resolve(result.clone());
      return result;
    },
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No bound port");
  base = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await vi.waitFor(() => expect(sockets.size).toBe(0));
  expect(server.listening).toBe(false);
});

function submit(
  path = "/api/transcribe",
  body: Uint8Array | string = recordedWav(),
  skip = false,
) {
  const client = request(`${base}${path}`, {
    method: "POST",
    // A private connection, with no shared agent or keepalive sockets to leak.
    agent: false,
    headers: {
      "content-type":
        typeof body === "string" ? "application/json" : "audio/wav",
      "content-length": Buffer.byteLength(body),
      ...(skip ? { "x-skip-post-process": "true" } : {}),
    },
  });
  const response = new Promise<{ status: number; body: unknown }>(
    (resolve, reject) => {
      client.once("error", reject);
      client.once("response", (incoming) => {
        const chunks: Buffer[] = [];
        incoming.on("data", (chunk) => chunks.push(chunk));
        incoming.once("error", reject);
        incoming.once("end", () =>
          resolve({
            status: incoming.statusCode ?? 0,
            body: JSON.parse(Buffer.concat(chunks).toString()),
          }),
        );
      });
    },
  );
  client.end(body);
  return { client, response };
}

async function disconnect(pending: ReturnType<typeof submit>) {
  expect(signal.aborted).toBe(false);
  pending.client.destroy(new Error("fixture client canceled"));
  await expect(pending.response).rejects.toThrow("fixture client canceled");
  await abortObserved.promise;
  expect(signal.aborted).toBe(true);
}

async function assertNoHistory() {
  expect(
    getDb().prepare("SELECT count(*) AS n FROM transcription_history").get(),
  ).toEqual({ n: 0 });
  expect(fixtures.captureException).not.toHaveBeenCalled();
}

describe("client disconnect through the production Node HTTP adapter", () => {
  it.each([
    false,
    true,
  ])("aborts a fully uploaded STT request and discards a late result (skip cleanup=%s)", async (skip) => {
    const entered = deferred<AbortSignal>();
    const finish = deferred<{ text: string }>();
    fixtures.transcribe.mockImplementation(
      ({ signal: providerSignal, audio }) => {
        expect(audio).toEqual(recordedWav());
        entered.resolve(providerSignal);
        return finish.promise;
      },
    );
    const afterTranscribe = vi.fn();
    registry.current = new PluginRegistry([
      { name: "observer", afterTranscribe },
    ]);
    const pending = submit("/api/transcribe", recordedWav(), skip);
    const providerSignal = await entered.promise;
    expect(providerSignal).toBe(signal);
    await disconnect(pending);
    expect(providerSignal.aborted).toBe(true);
    finish.resolve({ text: "stale canceled text" });
    expect(await (await completed.promise).json()).toMatchObject({
      raw: "",
      cleaned: "",
      disposition: "aborted",
    });
    expect(afterTranscribe).not.toHaveBeenCalled();
    expect(fixtures.cleanup).not.toHaveBeenCalled();
    await assertNoHistory();

    // A disconnect must not poison the next recording or the server listener.
    fixtures.transcribe.mockResolvedValue({ text: "new recording" });
    const fresh = await submit().response;
    expect(fresh).toMatchObject({
      status: 200,
      body: {
        raw: "new recording",
        cleaned: "new recording",
        disposition: "deliver",
      },
    });
    expect(
      getDb().prepare("SELECT raw_text FROM transcription_history").all(),
    ).toEqual([{ raw_text: "new recording" }]);
  });

  it.each([
    "/api/transcribe",
    "/api/post-process",
  ])("forwards disconnect to cleanup and suppresses its late result at %s", async (path) => {
    writeSetting("llm_cleanup", "true");
    getDb()
      .prepare(
        "INSERT INTO model_configs (provider, model_id, model_name, type, is_default) VALUES ('freestyle-cloud', 'fixture', 'Fixture cleanup', 'llm', 1)",
      )
      .run();
    const entered = deferred<AbortSignal>();
    const finish = deferred<{ cleaned: string }>();
    fixtures.cleanup.mockImplementation(({ signal: providerSignal }) => {
      entered.resolve(providerSignal);
      return finish.promise;
    });
    const afterCleanup = vi.fn();
    registry.current = new PluginRegistry([{ name: "observer", afterCleanup }]);
    const pending =
      path === "/api/transcribe"
        ? submit()
        : submit(path, JSON.stringify({ text: "merged recording" }));
    const providerSignal = await entered.promise;
    expect(providerSignal).toBe(signal);
    await disconnect(pending);
    expect(providerSignal.aborted).toBe(true);
    finish.resolve({ cleaned: "stale cleaned text" });
    expect(await (await completed.promise).json()).toMatchObject({
      cleaned: "",
      disposition: "aborted",
    });
    expect(afterCleanup).not.toHaveBeenCalled();
    await assertNoHistory();
  });

  it("suppresses a late output hook result after the delivery client disconnects", async () => {
    const entered = deferred<void>();
    const finish = deferred<void>();
    const event = vi.fn();
    registry.current = new PluginRegistry([
      {
        name: "pending-output",
        beforeOutput: async (_ctx, output) => {
          entered.resolve();
          await finish.promise;
          output.text = "stale deliverable text";
        },
        event,
      },
    ]);
    const pending = submit(
      "/api/output/deliver",
      JSON.stringify({ text: "recording", mode: "clipboard" }),
    );
    await entered.promise;
    await disconnect(pending);
    finish.resolve();
    expect(await (await completed.promise).json()).toEqual({
      output: { text: "", mode: "none" },
      disposition: "aborted",
    });
    expect(
      event.mock.calls.filter(
        ([payload]) => payload.type === FreestyleEventType.OutputDelivered,
      ),
    ).toHaveLength(0);
    await assertNoHistory();
  });
});
