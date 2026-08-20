import type { UIMessage } from "ai";

export function appendAssistantDelta(
  messages: UIMessage[],
  delta: string,
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
      id: "assistant",
      role: "assistant",
      parts: [{ type: "text", text: delta }],
    },
  ];
}
