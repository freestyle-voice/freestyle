import type { UIMessage } from "ai";

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

export function messageText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

/** Keeps the edited user message and its preceding context for a clean resend. */
export function messagesForResend(
  messages: UIMessage[],
  messageId: string,
  text: string,
): UIMessage[] | null {
  const index = messages.findIndex(
    (message) => message.id === messageId && message.role === "user",
  );
  if (index < 0 || !text.trim()) return null;
  return [
    ...messages.slice(0, index),
    { ...messages[index], parts: [{ type: "text", text: text.trim() }] },
  ];
}

/** Re-runs the latest user turn after a failed/interrupted response. */
export function messagesForRetry(messages: UIMessage[]): UIMessage[] | null {
  const index = messages.findLastIndex((message) => message.role === "user");
  return index < 0 ? null : messages.slice(0, index + 1);
}
