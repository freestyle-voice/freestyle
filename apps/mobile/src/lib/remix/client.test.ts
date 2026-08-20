import type { RemixContext } from "@freestyle-voice/validations";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { request, json } = vi.hoisted(() => ({
  request: vi.fn(),
  json: vi.fn(),
}));

vi.mock("@/lib/cloud/client", () => ({ cloud: { json, request } }));

import { listThreads, runRemixTurn } from "./client";

const context: RemixContext = {
  selection: null,
  appName: null,
  windowTitle: null,
  languages: ["en"],
  capturedAt: 1_700_000_000_000,
};

function responseWithEvents(events: object[]): Response {
  const body = events
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .join("");
  return new Response(body, {
    headers: { "content-type": "text/event-stream" },
  });
}

describe("mobile Remix cloud client", () => {
  beforeEach(() => {
    request.mockReset();
    json.mockReset();
  });

  it("requests scheduled briefs with their own origin and cursor", async () => {
    json.mockResolvedValueOnce({ threads: [], nextCursor: null });

    const page = await listThreads({ origin: "scheduled", cursor: 42 });
    const path = json.mock.calls[0]?.[0] as string;
    const url = new URL(path, "https://cloud.example");

    expect(page).toEqual({ threads: [], nextCursor: null });
    expect(url.pathname).toBe("/v2/threads");
    expect(url.searchParams.get("origin")).toBe("scheduled");
    expect(url.searchParams.get("cursor")).toBe("42");
    expect(url.searchParams.get("limit")).toBe("24");
  });

  it("emits generated text from a Remix UI-message stream", async () => {
    request.mockResolvedValueOnce(
      responseWithEvents([
        { type: "start" },
        { type: "text-start", id: "text-1" },
        { type: "text-delta", id: "text-1", delta: "Here is a draft." },
        { type: "text-end", id: "text-1" },
        { type: "finish" },
      ]),
    );
    const events: unknown[] = [];

    await runRemixTurn({
      messages: [
        {
          id: "user-1",
          role: "user",
          parts: [{ type: "text", text: "Help me write" }],
        },
      ],
      context,
      signal: new AbortController().signal,
      onEvent: (event) => events.push(event),
    });

    expect(events).toContainEqual({ type: "text", text: "Here is a draft." });
    expect(events).toContainEqual({ type: "complete" });
  });

  it("holds an insert request for the keyboard instead of treating it as an app paste", async () => {
    request.mockResolvedValueOnce(
      responseWithEvents([
        { type: "start" },
        {
          type: "tool-input-available",
          toolCallId: "tool-1",
          toolName: "insert_at_cursor",
          input: { text: "Ready to paste" },
        },
        { type: "finish", finishReason: "tool-calls" },
      ]),
    );
    const events: unknown[] = [];

    await runRemixTurn({
      messages: [
        {
          id: "user-1",
          role: "user",
          parts: [{ type: "text", text: "Draft a reply" }],
        },
      ],
      context,
      signal: new AbortController().signal,
      onEvent: (event) => events.push(event),
    });

    expect(events).toContainEqual({
      type: "tool-result-needed",
      toolCallId: "tool-1",
      name: "insert_at_cursor",
      input: { text: "Ready to paste" },
    });
  });
});
