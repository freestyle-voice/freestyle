/**
 * Serialize an unknown thrown value into a single log-friendly string,
 * following the `cause` chain.
 *
 * This matters for `fetch` (undici): connection failures surface as a generic
 * `TypeError: fetch failed` whose real reason (e.g. `ECONNREFUSED`,
 * `ENOTFOUND`, a TLS error) lives only on `.cause`. Without walking the chain,
 * logs show "fetch failed" with no indication of *why* the request failed.
 */
export function formatError(err: unknown): string {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = err;
  let depth = 0;

  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const e = current as {
      stack?: unknown;
      message?: unknown;
      code?: unknown;
      cause?: unknown;
    };
    const detail =
      typeof e.stack === "string"
        ? e.stack
        : typeof e.message === "string"
          ? e.message
          : String(current);
    const code = typeof e.code === "string" ? ` (code=${e.code})` : "";
    parts.push(
      depth === 0 ? `${detail}${code}` : `caused by: ${detail}${code}`,
    );
    current = e.cause;
    depth++;
  }

  if (parts.length === 0) return String(err);
  return parts.join("\n");
}
