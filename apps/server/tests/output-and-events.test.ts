import { describe, expect, it } from "vitest";
import createApp from "../src/index.js";

const app = createApp();

function json(path: string, body: unknown, method = "POST") {
  return app.request(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/output/deliver", () => {
  it("passes text/mode through unchanged when no plugin implements beforeOutput", async () => {
    const res = await json("/api/output/deliver", {
      text: "hello world",
      mode: "paste",
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      output: { text: string; mode: string };
      disposition: string;
    };
    expect(data.output).toEqual({ text: "hello world", mode: "paste" });
    expect(data.disposition).toBe("deliver");
  });

  it("reports suppressed disposition for empty text", async () => {
    const res = await json("/api/output/deliver", {
      text: "   ",
      mode: "paste",
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { disposition: string };
    expect(data.disposition).toBe("suppressed");
  });

  it("rejects an invalid mode", async () => {
    const res = await json("/api/output/deliver", {
      text: "hi",
      mode: "bogus",
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/events", () => {
  it("accepts a well-formed event and never fails", async () => {
    const res = await json("/api/events", { type: "recordingStarted" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("rejects an unknown event type", async () => {
    const res = await json("/api/events", { type: "bogus" });
    expect(res.status).toBe(400);
  });

  it("accepts a relayed pipelineError from the output stage", async () => {
    const res = await json("/api/events", {
      type: "pipelineError",
      stage: "output",
      message: "paste failed",
    });
    expect(res.status).toBe(200);
  });

  it("accepts outputDelivered with text + mode, rejects it without", async () => {
    const ok = await json("/api/events", {
      type: "outputDelivered",
      text: "hi",
      mode: "none",
    });
    expect(ok.status).toBe(200);

    const bad = await json("/api/events", { type: "outputDelivered" });
    expect(bad.status).toBe(400);
  });
});

describe("plugin storage routes", () => {
  const base = "/api/plugins/test-plugin/storage/foo";

  it("returns null for an unset key", async () => {
    const res = await app.request(base);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ value: null });
  });

  it("round-trips a JSON value through PUT/GET/DELETE", async () => {
    const put = await json(base, { value: { a: 1, b: ["x"] } }, "PUT");
    expect(put.status).toBe(200);

    const get = await app.request(base);
    expect(await get.json()).toEqual({ value: { a: 1, b: ["x"] } });

    const del = await app.request(base, { method: "DELETE" });
    expect(del.status).toBe(200);

    const after = await app.request(base);
    expect(await after.json()).toEqual({ value: null });
  });
});
