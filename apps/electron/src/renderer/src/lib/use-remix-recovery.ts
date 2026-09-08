import { Chat, useChat } from "@ai-sdk/react";
import { apiFetch, initApiBase } from "@renderer/lib/api";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { RemixRecoveryController } from "./remix-recovery-controller";

type Options = {
  id: string;
  type?: "local" | "remote";
  messages: UIMessage[];
  context?: () => unknown;
  onToolCall: (event: {
    toolCall: {
      toolName: string;
      toolCallId: string;
      input: unknown;
      requiresConfirmation?: boolean;
    };
  }) => Promise<void>;
  onFinish?: (event: { messages: UIMessage[] }) => void;
  onError?: (error: Error) => void;
  onFork?: (thread: { id: string; messages: UIMessage[] }) => void;
  onActionUnavailable?: (actionId: string) => void;
};
const defaultContext = () => ({
  selection: null,
  appName: null,
  windowTitle: null,
  capturedAt: Date.now(),
});

/** Both surfaces use the same receipt lifecycle and existing approval cards. */
export function useRemixRecovery(options: Options) {
  const ref = useRef(options);
  ref.current = options;
  const controller = useMemo(
    () =>
      new RemixRecoveryController({
        threadId: options.id,
        messages: ref.current.messages,
        storage: localStorage,
        fetch: async (path, init) => {
          await initApiBase();
          return apiFetch(path, init);
        },
        onToolCall: (toolCall) => ref.current.onToolCall({ toolCall }),
        requiresApproval: (name) =>
          [
            "Bash",
            "Read",
            "Write",
            "Edit",
            "Glob",
            "Grep",
            "save_file",
          ].includes(name),
        onFinish: (messages) => ref.current.onFinish?.({ messages }),
        onError: (error) => ref.current.onError?.(error),
        onFork: (thread) => ref.current.onFork?.(thread),
        onActionUnavailable: (actionId) =>
          ref.current.onActionUnavailable?.(actionId),
      }),
    [options.id],
  );
  // The chat owns streaming message state. Recreating it for every streamed
  // token would discard that state, so only a session ID creates a new chat.
  // biome-ignore lint/correctness/useExhaustiveDependencies: explained above
  const localChat = useMemo(
    () =>
      new Chat({
        id: options.id,
        messages: options.messages,
        transport: new DefaultChatTransport({
          api: `/api/remix/sessions/${encodeURIComponent(options.id)}/stream`,
          fetch: async (input, init) => {
            await initApiBase();
            return apiFetch(input, init);
          },
          prepareSendMessagesRequest: ({ messages }) => ({
            body: {
              messages,
              context: (ref.current.context ?? defaultContext)(),
            },
          }),
        }),
        onToolCall: ({ toolCall }) => ref.current.onToolCall({ toolCall }),
        onFinish: async ({ messages }) => {
          await initApiBase();
          const response = await apiFetch(
            `/api/remix/sessions/${encodeURIComponent(options.id)}/messages`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ messages }),
            },
          );
          if (!response.ok) {
            throw new Error("Could not save this local Remix session.");
          }
          ref.current.onFinish?.({ messages });
        },
        onError: (error) => ref.current.onError?.(error),
      }),
    [options.id],
  );
  const local = useChat({ chat: localChat });
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (options.type === "local") return;
    void controller.start();
    return controller.dispose;
  }, [controller, options.type]);
  useEffect(() => {
    if (snapshot.recovery.phase !== "reconnecting") return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [snapshot.recovery.phase]);
  const remote = useMemo(
    () => ({
      messages: snapshot.messages,
      status: snapshot.status,
      canonical: snapshot.canonical,
      durableRuntime: {
        data: snapshot.runtime,
        refetch: async () => {
          await controller.start();
          return { data: controller.getSnapshot().runtime };
        },
      },
      setMessages: controller.setMessages,
      clearError: controller.clearError,
      sendMessage: (
        { text, messageId }: { text: string; messageId?: string },
        _options?: unknown,
      ) =>
        controller.send(
          text,
          (ref.current.context ?? defaultContext)(),
          messageId,
        ),
      regenerate: async ({ messageId }: { messageId: string }) => {
        const messages = controller.getSnapshot().messages;
        const index = messages.findIndex((message) => message.id === messageId);
        const user = messages
          .slice(0, index)
          .reverse()
          .find((message) => message.role === "user");
        if (user)
          await controller.send(
            user.parts
              .filter((part) => part.type === "text")
              .map((part) => part.text)
              .join("\n"),
            (ref.current.context ?? defaultContext)(),
            user.id,
          );
      },
      addToolResult: ({
        toolCallId,
        output,
      }: {
        tool?: string;
        toolCallId: string;
        output: unknown;
      }) => controller.complete(toolCallId, output),
      addToolOutput: ({
        toolCallId,
        output,
      }: {
        tool?: string;
        toolCallId: string;
        output: unknown;
      }) => controller.complete(toolCallId, output),
      stop: controller.detach,
      cancel: controller.stop,
      authorizeTool: controller.authorizeTool,
      resumeStream: controller.start,
      recovery: {
        state: snapshot.recovery,
        now,
        attempt: controller.retry,
        resume: () =>
          controller.resume((ref.current.context ?? defaultContext)()),
        desktop: snapshot.desktopRecovery,
        retryDesktop: controller.retryDesktop,
      },
      queue: {
        items: snapshot.queue,
        active:
          snapshot.status === "streaming" || snapshot.status === "submitted",
        enqueue: controller.enqueue,
        update: controller.updateQueued,
        remove: controller.removeQueued,
        steer: controller.steer,
      },
    }),
    [controller, snapshot, now],
  );
  if (options.type !== "local") return remote;
  return {
    messages: local.messages,
    status: local.status,
    canonical: true,
    durableRuntime: { data: null, refetch: async () => ({ data: null }) },
    setMessages: local.setMessages,
    clearError: local.clearError,
    sendMessage: local.sendMessage,
    regenerate: local.regenerate,
    addToolResult: local.addToolResult,
    addToolOutput: local.addToolOutput,
    stop: local.stop,
    cancel: local.stop,
    authorizeTool: async () => {},
    resumeStream: async () => {},
    recovery: {
      state: { phase: "idle" as const },
      now,
      attempt: () => {},
      resume: async () => {},
      desktop: null,
      retryDesktop: async () => {},
    },
    queue: {
      items: [],
      active: local.status === "streaming" || local.status === "submitted",
      enqueue: async () => {},
      update: async () => {},
      remove: async () => {},
      steer: async () => {},
    },
  };
}
