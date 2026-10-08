import type { Chat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import type { EffectCallback } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRemixRecovery } from "./use-remix-recovery";

// Exercise the installed Chat's continuation behavior with deterministic hook
// lifetimes, without starting an Electron window or a remote controller.
const harness = vi.hoisted(() => ({
  effects: [] as EffectCallback[],
  chat: null as Chat<UIMessage> | null,
  fetch: vi.fn(),
}));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useRef: (value: unknown) => ({ current: value }),
  useMemo: (create: () => unknown) => create(),
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: EffectCallback) => harness.effects.push(effect),
  useState: () => [0, vi.fn()],
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) =>
    snapshot(),
}));
vi.mock("@ai-sdk/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ai-sdk/react")>();
  return {
    ...actual,
    Chat: class extends actual.Chat<UIMessage> {
      constructor(
        options: ConstructorParameters<typeof actual.Chat<UIMessage>>[0],
      ) {
        super(options);
        harness.chat = this;
      }
    },
    useChat: ({ chat }: { chat: Chat<UIMessage> }) => ({
      messages: chat.messages,
      status: chat.status,
      sendMessage: chat.sendMessage,
      regenerate: chat.regenerate,
      addToolResult: chat.addToolOutput,
      addToolOutput: chat.addToolOutput,
      stop: chat.stop,
      clearError: chat.clearError,
    }),
  };
});
vi.mock("@renderer/lib/api", () => ({
  initApiBase: async () => {},
  apiFetch: harness.fetch,
}));

function mountChat() {
  // biome-ignore lint/correctness/useHookAtTopLevel: React hooks are mocked by this lifecycle harness.
  const chat = useRemixRecovery({
    id: "local-a",
    type: "local",
    messages: [],
    onToolCall: vi.fn(),
  });
  const cleanups = harness.effects.map((effect) => effect());
  return {
    chat,
    unmount: () => {
      for (const cleanup of cleanups) cleanup?.();
    },
  };
}

function pendingTool(): UIMessage[] {
  return [
    {
      id: "assistant-a",
      role: "assistant",
      parts: [
        {
          type: "tool-Read",
          toolCallId: "tool-a",
          state: "input-available",
          input: { path: "/example.txt" },
        },
      ],
    },
  ];
}

describe("local Remix continuation lifecycle", () => {
  beforeEach(() => {
    harness.effects = [];
    harness.chat = null;
    harness.fetch.mockReset();
    harness.fetch.mockImplementation(
      async () =>
        new Response(
          'data: {"type":"start","messageId":"reply"}\n\ndata: {"type":"start-step"}\n\ndata: {"type":"text-start","id":"text"}\n\ndata: {"type":"text-delta","id":"text","delta":"Done"}\n\ndata: {"type":"text-end","id":"text"}\n\ndata: {"type":"finish-step"}\n\ndata: {"type":"finish","finishReason":"stop"}\n\ndata: [DONE]\n\n',
          {
            headers: {
              "Content-Type": "text/event-stream",
              "x-vercel-ai-ui-message-stream": "v1",
            },
          },
        ),
    );
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    "active",
    "stopped",
    "unmounted",
  ] as const)("only continues an active chat after a late tool result (%s)", async (lifetime) => {
    const { chat, unmount } = mountChat();
    harness.chat!.messages = pendingTool();
    if (lifetime === "stopped") await chat.cancel();
    if (lifetime === "unmounted") unmount();
    await chat.addToolOutput({
      tool: "Read",
      toolCallId: "tool-a",
      output: "done",
    });
    if (lifetime === "active") {
      await vi.waitFor(() => expect(harness.fetch).toHaveBeenCalled());
    } else {
      // addToolOutput awaits the SDK's automatic-continuation decision.
      expect(harness.fetch).not.toHaveBeenCalled();
    }
    if (lifetime !== "unmounted") unmount();
  });
});
