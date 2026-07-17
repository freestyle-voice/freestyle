/**
 * Build a case-insensitive regex that matches a configured wake word at the
 * start of a transcript, tolerating however speech-to-text punctuates it —
 * "Hey Freestyle,", "Hey Freestyle.", or a bare "Hey Freestyle …" all match.
 * A leading "hey"/"ok"/"okay" is optional even when the wake word omits it, so
 * "Freestyle, what time is it?" works when the wake word is "hey freestyle".
 */
export function buildWakeWordRegex(wakeWord: string): RegExp {
  const words = wakeWord.trim().toLowerCase().split(/\s+/).filter(Boolean);
  // Drop a leading filler word ("hey"/"ok"/"okay") from the required core so it
  // becomes optional in the match.
  const core =
    words.length > 1 && /^(hey|ok|okay)$/.test(words[0])
      ? words.slice(1)
      : words;
  const escaped = core.map(escapeRegExp).join("\\s+");
  // `[\s,.:;!?-]*` swallows the punctuation STT inserts after the wake word.
  return new RegExp(
    `^\\s*(?:hey\\s+|ok\\s+|okay\\s+)?${escaped}\\b[\\s,.:;!?-]*`,
    "i",
  );
}

/** Strip the matched wake word (and trailing punctuation) from a transcript. */
export function stripWakeWord(text: string, wake: RegExp): string {
  return text.replace(wake, "").trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
