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

export function sanitizeTranscriptText(text: string): string {
  let cleaned = stripWrappingQuotes(text);
  cleaned = stripTrailingFinTags(cleaned);
  return stripTrailingDuplicate(cleaned);
}
