import type { VoiceCommand } from "./types.js";

/**
 * Normalise text for cheap phrase matching: lower-case, strip punctuation, and
 * collapse whitespace. Unicode-aware so accented trigger words still match.
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The cheap deterministic gate that runs before any LLM call. Returns the
 * enabled commands whose trigger phrases appear in the transcript. An empty
 * result means "definitely not a command" — the agent is skipped entirely.
 */
export function matchCommands(
  text: string,
  commands: VoiceCommand[],
): VoiceCommand[] {
  const hay = normalize(text);
  if (!hay) return [];
  return commands.filter(
    (cmd) =>
      cmd.enabled &&
      cmd.triggers.some((t) => {
        const needle = normalize(t);
        return needle.length > 0 && hay.includes(needle);
      }),
  );
}

/**
 * Best-effort extraction of the command "payload" for the LLM-less fallback
 * path: strip the first matching trigger phrase from the original transcript
 * and return the remainder (original casing preserved).
 */
export function stripTrigger(text: string, command: VoiceCommand): string {
  const normalizedTriggers = command.triggers
    .map((t) => normalize(t))
    .filter(Boolean)
    // Longest first so "open the pod bay doors" wins over "open".
    .sort((a, b) => b.length - a.length);

  for (const needle of normalizedTriggers) {
    // Build a case-insensitive, whitespace-tolerant regex from the trigger.
    const pattern = needle
      .split(" ")
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("\\s+");
    const re = new RegExp(pattern, "i");
    if (re.test(text)) {
      return text.replace(re, " ").replace(/\s+/g, " ").trim();
    }
  }
  return text.trim();
}
