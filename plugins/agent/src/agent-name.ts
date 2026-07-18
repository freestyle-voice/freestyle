/**
 * Common filler words / greetings that speech-to-text may insert before the
 * agent name. Kept in a single alternation group so the regex stays compact.
 */
const FILLER_WORDS = [
  "hey",
  "hi",
  "hello",
  "yo",
  "ok",
  "okay",
  "so",
  "well",
  "um",
  "uh",
  "like",
];

/**
 * Build a case-insensitive regex that matches the agent's name near the start
 * of a transcript, tolerating however speech-to-text punctuates it —
 * "Freestyle,", "Freestyle.", or a bare "Freestyle …" all match.
 *
 * Greeting / filler words before the name are optional, so "Freestyle do X",
 * "Hey Freestyle do X", "Hi Freestyle do X", "Hello Freestyle" etc. all work.
 * Up to two filler words are consumed so phrases like "Hey um Freestyle" or
 * "Okay so Freestyle" also match.
 */
export function buildAgentNameRegex(agentName: string): RegExp {
  const words = agentName.trim().toLowerCase().split(/\s+/).filter(Boolean);
  // Drop a leading filler word from the name itself so e.g. an agent named
  // "Hey Siri" still keys on "Siri".
  const core =
    words.length > 1 && FILLER_WORDS.includes(words[0])
      ? words.slice(1)
      : words;
  const escaped = core.map(escapeRegExp).join("\\s+");
  const fillerAlt = FILLER_WORDS.map(escapeRegExp).join("|");
  // Allow 0-2 filler words (each optionally followed by comma/punctuation)
  // before the agent name.  `[\s,.:;!?-]*` swallows the punctuation STT
  // inserts after the name.
  const fillerGroup = `(?:(?:${fillerAlt})[\\s,.:;!?-]*)?`;
  return new RegExp(
    `^\\s*${fillerGroup}${fillerGroup}${escaped}\\b[\\s,.:;!?-]*`,
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
