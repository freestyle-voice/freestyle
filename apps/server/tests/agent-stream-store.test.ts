import { describe, expect, it } from "vitest";
import { AgentStreamStore } from "../src/lib/agent-stream-store.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return chunks.map((chunk) => decoder.decode(chunk)).join("");
}

describe("AgentStreamStore", () => {
  it("keeps the Cloud stream alive after the initiating observer disconnects", async () => {
    let upstreamController: ReadableStreamDefaultController<Uint8Array>;
    const upstream = new ReadableStream<Uint8Array>({
      start(controller) {
        upstreamController = controller;
      },
    });
    const store = new AgentStreamStore();

    const firstObserver = store.start("thread-1", [{ id: "user-1" }], upstream);
    const firstReader = firstObserver.getReader();
    upstreamController!.enqueue(encoder.encode('data: {"type":"start"}\n\n'));
    await firstReader.read();
    await firstReader.cancel();

    const replay = store.connect("thread-1");
    expect(replay).not.toBeNull();
    const replayText = readAll(replay!);
    upstreamController!.enqueue(encoder.encode('data: {"type":"finish"}\n\n'));
    upstreamController!.close();
    await expect(replayText).resolves.toContain('"type":"start"');
    await expect(replayText).resolves.toContain('"type":"finish"');
    expect(store.connect("thread-1")).toBeNull();
  });

  it("retains the submitted messages while a thread is still active", () => {
    const store = new AgentStreamStore();
    const upstream = new ReadableStream<Uint8Array>();
    const messages = [{ id: "user-1", role: "user" }];

    store.start("thread-1", messages, upstream);

    expect(store.getActiveMessages("thread-1")).toEqual(messages);
  });
});
