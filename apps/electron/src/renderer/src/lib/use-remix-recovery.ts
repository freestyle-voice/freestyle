import { apiFetch, initApiBase } from "@renderer/lib/api";
import type { UIMessage } from "ai";
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
  messages: UIMessage[];
  context?: () => unknown;
  onToolCall: (event: {
    toolCall: { toolName: string; toolCallId: string; input: unknown };
  }) => Promise<void>;
  onFinish?: (event: { messages: UIMessage[] }) => void;
  onError?: (error: Error) => void;
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
      }),
    [options.id],
  );
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    void controller.start();
    return controller.dispose;
  }, [controller]);
  useEffect(() => {
    if (snapshot.recovery.phase !== "reconnecting") return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [snapshot.recovery.phase]);
  return useMemo(
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
}
