/** Rough token estimate (~4 chars/token for English prose). */
function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

const MIN_CLEANUP_OUTPUT_TOKENS = 512;
/** Groq / most cleanup models support at least 8k completion tokens. */
const MAX_CLEANUP_OUTPUT_TOKENS = 8192;

/**
 * Scale max output tokens with input length so long dictations aren't truncated.
 * Cleanup output is usually similar length to input; extra headroom for list formatting.
 */
export function maxOutputTokensForCleanup(inputText: string): number {
  const inputTokens = estimateTokenCount(inputText);
  const scaled = Math.ceil(inputTokens * 1.5) + 256;
  return Math.min(
    Math.max(scaled, MIN_CLEANUP_OUTPUT_TOKENS),
    MAX_CLEANUP_OUTPUT_TOKENS,
  );
}
