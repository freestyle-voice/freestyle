/**
 * Build a case-insensitive regex that matches the agent's name at the start of
 * a transcript, tolerating however speech-to-text punctuates it — "Freestyle,",
 * "Freestyle.", or a bare "Freestyle …" all match. A leading "hey"/"ok"/"okay"
 * is always optional, so both "Freestyle, what time is it?" and "Hey Freestyle
 * …" summon an agent named "Freestyle".
 */
export function buildAgentNameRegex(agentName: string): RegExp {
  const words = agentName.trim().toLowerCase().split(/\s+/).filter(Boolean);
  // Drop a leading filler word ("hey"/"ok"/"okay") so the name itself is what
  // matters and the filler stays optional.
  const core =
    words.length > 1 && /^(hey|ok|okay)$/.test(words[0])
      ? words.slice(1)
      : words;
  const escaped = core.map(escapeRegExp).join("\\s+");
  // `[\s,.:;!?-]*` swallows the punctuation STT inserts after the name.
  return new RegExp(
    `^\\s*(?:hey\\s+|ok\\s+|okay\\s+)?${escaped}\\b[\\s,.:;!?-]*`,
    "i",
  );
}

/** Strip the matched agent name (and trailing punctuation) from a transcript. */
export function stripAgentName(text: string, matcher: RegExp): string {
  return text.replace(matcher, "").trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
