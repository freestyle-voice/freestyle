export type VoiceAgentResult =
  | { kind: "question"; text: string }
  | { kind: "insert"; text: string };

/**
 * The keyboard has room for one follow-up at a time. A direct question stays
 * visible for a spoken answer; every other completed reply is treated as the
 * cursor-ready result.
 */
export function resolveVoiceAgentResult(text: string): VoiceAgentResult | null {
  const normalized = text.trim();
  if (!normalized) return null;
  if (/^clarify:\s*/i.test(normalized)) {
    return {
      kind: "question",
      text: normalized.replace(/^clarify:\s*/i, ""),
    };
  }
  if (/^final:\s*/i.test(normalized)) {
    return {
      kind: "insert",
      text: normalized.replace(/^final:\s*/i, ""),
    };
  }
  // Keep accepting untagged answers while older Cloud agent prompts may still
  // be in flight. New keyboard requests use explicit prefixes so a finished
  // draft that happens to end in a question mark can still be pasted.
  return /\?\s*$/.test(normalized)
    ? { kind: "question", text: normalized }
    : { kind: "insert", text: normalized };
}
