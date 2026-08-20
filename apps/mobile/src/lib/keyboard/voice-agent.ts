export type VoiceAgentResult =
  | { kind: "question"; text: string }
  | { kind: "insert"; text: string };

/**
 * The keyboard has room for one follow-up at a time. A direct question stays
 * visible for a spoken answer; every other completed reply is treated as the
 * cursor-ready result.
 */
export function resolveVoiceAgentResult(text: string): VoiceAgentResult {
  const normalized = text.trim();
  return /\?\s*$/.test(normalized)
    ? { kind: "question", text: normalized }
    : { kind: "insert", text: normalized };
}
