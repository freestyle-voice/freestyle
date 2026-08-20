import type { UIMessage } from "ai";

export function latestThreadState(
  latest: { id: string; messages: UIMessage[] } | null,
  fallbackThreadId: string,
): { threadId: string; messages: UIMessage[] } {
  return latest
    ? { threadId: latest.id, messages: latest.messages }
    : { threadId: fallbackThreadId, messages: [] };
}

export function appendAssistantDelta(
  messages: UIMessage[],
  delta: string,
  assistantId: string,
): UIMessage[] {
  const last = messages.at(-1);
  if (last?.role === "assistant") {
    const part = last.parts.at(-1);
    if (part?.type === "text") {
      return [
        ...messages.slice(0, -1),
        {
          ...last,
          parts: [
            ...last.parts.slice(0, -1),
            { ...part, text: part.text + delta },
          ],
        },
      ];
    }
  }
  return [
    ...messages,
    {
      id: assistantId,
      role: "assistant",
      parts: [{ type: "text", text: delta }],
    },
  ];
}
