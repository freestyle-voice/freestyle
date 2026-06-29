/** Remove a trailing paragraph duplicated from earlier in the output. */
export function stripTrailingDuplicate(text: string): string {
  const trimmed = text.trim();
  const parts = trimmed
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return trimmed;

  const last = parts[parts.length - 1]!;
  const earlier = parts.slice(0, -1).join("\n\n");
  if (last.length >= 12 && earlier.includes(last)) {
    return parts.slice(0, -1).join("\n\n");
  }
  return trimmed;
}

export function stripWrappingQuotes(text: string): string {
  const stripped = text.trim();
  if (
    stripped.length >= 2 &&
    stripped[0] === stripped.at(-1) &&
    (stripped[0] === '"' || stripped[0] === "'")
  ) {
    return stripped.slice(1, -1).trim();
  }
  return stripped;
}

function stripTrailingFinTags(text: string): string {
  return text.replace(/(?:\s*<\/?fin>\s*)+$/gi, "").trim();
}

/**
 * Collapse spurious line breaks emitted by local ASR engines.
 *
 * whisper.cpp and MLX ASR put each decoded speech segment on its own line, so
 * a single dictated paragraph comes back peppered with `\n` between segments.
 * Those breaks are decoder artifacts, not content, and an ASR-time prompt
 * cannot suppress them. Collapse single line breaks into spaces while keeping
 * blank-line paragraph breaks intact.
 */
export function collapseAsrLineBreaks(text: string): string {
  // Replace each run of whitespace that spans one or more line breaks with a
  // single space, unless the run contains a blank line (two or more breaks),
  // in which case keep a single paragraph break.
  return text.replace(/[^\S\n]*(?:\r?\n[^\S\n]*)+/g, (run) => {
    const breaks = (run.match(/\r?\n/g) ?? []).length;
    return breaks >= 2 ? "\n\n" : " ";
  });
}

export function sanitizeTranscriptText(text: string): string {
  let cleaned = stripWrappingQuotes(text);
  cleaned = stripTrailingFinTags(cleaned);
  return stripTrailingDuplicate(cleaned);
}
