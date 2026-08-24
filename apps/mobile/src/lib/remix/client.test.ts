import { CloudRequestError } from "@freestyle-voice/utils/cloud";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { request, json } = vi.hoisted(() => ({
  request: vi.fn(),
  json: vi.fn(),
}));

vi.mock("@/lib/cloud/client", () => ({ cloud: { json, request } }));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));

import {
  getLatestThread,
  getThread,
  listThreads,
  runRemixTurn,
} from "./client";

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

  it("loads the latest durable conversation for Home", async () => {
    json.mockResolvedValueOnce({ thread: { id: "thread-1", messages: [] } });

    await expect(getLatestThread()).resolves.toEqual({
      id: "thread-1",
      messages: [],
    });
    expect(json).toHaveBeenCalledWith("/v2/threads/latest");
  });

  it("loads a selected durable conversation from Activity", async () => {
    json.mockResolvedValueOnce({ thread: { id: "thread-1", messages: [] } });

    await expect(getThread("thread-1")).resolves.toEqual({
      id: "thread-1",
      messages: [],
    });
    expect(json).toHaveBeenCalledWith("/v2/threads/thread-1");
  });

  it("treats a cleared thread as unavailable instead of a load failure", async () => {
    json.mockRejectedValueOnce(new CloudRequestError(404, "Not found"));

    await expect(getThread("cleared-thread")).resolves.toBeNull();
  });

  it("streams generated text through the durable agent route", async () => {
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
      threadId: "thread-123",
      firstTurn: true,
      signal: new AbortController().signal,
      onEvent: (event) => events.push(event),
    });

    expect(events).toContainEqual({ type: "text", text: "Here is a draft." });
    expect(events).toContainEqual({ type: "complete" });
    expect(request).toHaveBeenCalledWith(
      "/v2/agent",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(request.mock.calls[0]?.[1]?.body as string) as {
      client?: { platform?: string };
    };
    expect(body.client?.platform).toMatch(/^(ios|android)$/);
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
      threadId: "thread-123",
      keyboardInsertion: true,
      signal: new AbortController().signal,
      onEvent: (event) => events.push(event),
    });

    expect(events).toContainEqual({
      type: "tool-result-needed",
      toolCallId: "tool-1",
      name: "insert_at_cursor",
      input: { text: "Ready to paste" },
    });
    const body = JSON.parse(request.mock.calls[0]?.[1]?.body as string) as {
      client?: { supportsKeyboardInsertion?: boolean };
    };
    expect(body.client?.supportsKeyboardInsertion).toBe(true);
  });

  it("keeps temporary request rate limits distinct from usage limits", async () => {
    request.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: "rate_limited" }), { status: 429 }),
    );

    await expect(
      runRemixTurn({
        messages: [],
        threadId: "thread-123",
        signal: new AbortController().signal,
        onEvent: () => undefined,
      }),
    ).rejects.toBeInstanceOf(CloudRequestError);
  });
});
