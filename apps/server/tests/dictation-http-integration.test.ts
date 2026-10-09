import { serve } from "@hono/node-server";
import { PluginRegistry } from "freestyle-voice";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, writeSetting } from "../src/lib/db.js";

const inference = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/streaming/registry.js", () => ({
  getProvider: () => ({ transcribe: inference }),
}));
vi.mock("../src/lib/streaming-stt.js", () => ({
  getApiKeyForProvider: () => "fixture-key",
  voiceProviderCategory: () => "local",
}));
const registry = { current: new PluginRegistry() };
vi.mock("../src/lib/plugins/index.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/plugins/index.js")>()),
  plugins: () => registry.current,
}));
const { default: createApp } = await import("../src/index.js");

// One second of 16 kHz mono PCM silence: exercises binary HTTP framing without
// a microphone, network provider, model download, or developer profile.
function recordedWav(): Uint8Array<ArrayBuffer> {
  const wav = new Uint8Array(44 + 32_000);
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
  view.setUint32(24, 16_000, true);
  view.setUint32(28, 32_000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, 32_000, true);
  return wav;
}
let server: ReturnType<typeof serve>;
let base: string;
beforeEach(async () => {
  vi.useRealTimers();
  registry.current = new PluginRegistry();
  const db = getDb();
  db.exec(
    "DELETE FROM transcription_history; DELETE FROM model_configs; DELETE FROM dictionary;",
  );
  writeSetting("llm_cleanup", "false");
  writeSetting("history_paused", "false");
  db.prepare(
    "INSERT INTO model_configs (provider, model_id, model_name, type, is_default) VALUES ('fixture', 'fixture', 'Fixture', 'voice', 1)",
  ).run();
  db.prepare(
    "INSERT INTO dictionary (key,value) VALUES ('freestyle','Freestyle')",
  ).run();
  inference.mockReset().mockResolvedValue({ text: "we use freestyle" });
  server = serve({ fetch: createApp().fetch, hostname: "127.0.0.1", port: 0 });
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing bound port");
  base = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});
function submit(): Promise<Response> {
  return fetch(`${base}/api/transcribe`, {
    method: "POST",
    headers: {
      "Content-Type": "audio/wav",
      "x-app-context": encodeURIComponent("editor|Файл"),
    },
    body: recordedWav(),
  });
}
describe("recorded audio through the real local HTTP pipeline", () => {
  it("passes WAV bytes to inference, applies dictionary cleanup, and exposes saved history", async () => {
    const res = await submit();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      raw: "we use freestyle",
      cleaned: "we use Freestyle",
    });
    expect(inference.mock.calls[0][0].audio).toEqual(recordedWav());
    const history = await fetch(`${base}/api/history`).then((res) =>
      res.json(),
    );
    expect(history.total).toBe(1);
    expect(history.items[0]).toMatchObject({
      raw_text: "we use freestyle",
      cleaned_text: "we use Freestyle",
      audio_duration_ms: 1000,
    });
  });
  it("returns the plugin suppression disposition over HTTP without saving history", async () => {
    registry.current = new PluginRegistry([
      {
        name: "fixture-suppress",
        afterTranscribe: (_ctx, _input, api) => {
          api.control.consume("fixture");
        },
      },
    ]);
    const res = await submit();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      raw: "",
      cleaned: "",
      disposition: "suppressed",
    });
    expect(
      await fetch(`${base}/api/history`).then((res) => res.json()),
    ).toMatchObject({ total: 0 });
  });
});
