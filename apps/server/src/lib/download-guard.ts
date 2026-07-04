/**
 * Guards that turn opaque proxy/captive-portal responses into actionable
 * errors during model downloads.
 *
 * On corporate networks behind a secure web gateway (Zscaler, etc.), a request
 * for a model binary can be intercepted and answered with an HTML
 * coaching/click-through page instead of the file. Left unhandled this either
 * corrupts the download or surfaces a bare "fetch failed", neither of which
 * tells the user what to do. These helpers detect that case and raise a message
 * that points them at the browser acknowledgement flow.
 */

/** Error raised when a download response looks like a proxy/coaching page. */
export class ProxyInterceptionError extends Error {
  readonly code = "PROXY_INTERCEPTION";
  /** The upstream URL the user should open in a browser to acknowledge. */
  readonly sourceUrl?: string;

  constructor(message: string, sourceUrl?: string) {
    super(message);
    this.name = "ProxyInterceptionError";
    this.sourceUrl = sourceUrl;
  }
}

function isHtmlContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  return /text\/html|application\/xhtml\+xml/i.test(contentType);
}

/**
 * Inspect a model-download response and throw {@link ProxyInterceptionError}
 * when it is almost certainly a proxy/coaching page rather than the expected
 * binary. Detection is intentionally conservative:
 *
 *   - `Content-Type` is HTML, or
 *   - a small (< 64 KB) response advertises no useful content type while we
 *     expected a multi-megabyte model file.
 *
 * `expectedBytes` is the catalog size of the model; when we expect megabytes
 * but receive kilobytes of HTML-ish payload, that's the tell.
 */
export function assertNotProxyPage(
  res: Response,
  sourceUrl: string,
  expectedBytes: number,
): void {
  const contentType = res.headers.get("content-type");
  const contentLength = Number(res.headers.get("content-length"));

  const looksHtml = isHtmlContentType(contentType);
  const suspiciouslySmall =
    expectedBytes > 1024 * 1024 &&
    Number.isFinite(contentLength) &&
    contentLength > 0 &&
    contentLength < 64 * 1024;

  if (looksHtml || suspiciouslySmall) {
    throw new ProxyInterceptionError(proxyInterceptionMessage(), sourceUrl);
  }
}

/** User-facing guidance for the proxy/coaching-page case. */
export function proxyInterceptionMessage(): string {
  return (
    "Your network intercepted this download and returned a web page instead of the model file. " +
    "This usually means a corporate proxy requires browser acknowledgement first. " +
    "Open the model source in your browser, complete any click-through notice, then retry. " +
    "If your network uses a proxy or custom certificate, set them under Settings → Network."
  );
}

/**
 * Recognize the low-level connection failures (undici's generic "fetch failed",
 * TLS/cert errors, connection refused/timeouts) that, on a managed network,
 * almost always mean a proxy or certificate is in the way.
 */
export function isLikelyProxyOrTlsFailure(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const cause =
    err instanceof Error && err.cause instanceof Error ? err.cause.message : "";
  const code = err instanceof Error && "code" in err ? String(err.code) : "";
  const haystack = `${message} ${cause} ${code}`;

  return (
    /fetch failed/i.test(haystack) ||
    /self[- ]signed certificate/i.test(haystack) ||
    /unable to (?:get|verify) (?:local issuer|the first) certificate/i.test(
      haystack,
    ) ||
    /ERR_TLS/i.test(haystack) ||
    /CERT_/i.test(haystack) ||
    /ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i.test(haystack) ||
    /UND_ERR/i.test(haystack)
  );
}

/**
 * Resolve the upstream URL a user should open in their browser to clear a
 * proxy/coaching interception, when the failure looks proxy/TLS related.
 *
 *   - A detected coaching page ({@link ProxyInterceptionError}) already carries
 *     the exact URL that was intercepted — prefer it.
 *   - A bare connection/TLS failure has no URL on the error, so fall back to the
 *     caller-supplied model URL (e.g. the Hugging Face page/file).
 *   - Anything unrelated returns `undefined` so the UI shows no link.
 */
export function downloadErrorSourceUrl(
  err: unknown,
  fallbackUrl?: string,
): string | undefined {
  if (err instanceof ProxyInterceptionError && err.sourceUrl) {
    return err.sourceUrl;
  }
  if (isLikelyProxyOrTlsFailure(err)) {
    return fallbackUrl || undefined;
  }
  return undefined;
}

/** Guidance for a connection failure that is probably proxy/certificate related. */
export function proxyOrTlsFailureMessage(): string {
  return (
    "Couldn't reach the download server. On a corporate network this usually means a proxy " +
    "or custom certificate is required. Set your proxy URL and CA certificate under " +
    "Settings → Network, or open the model source in your browser to acknowledge access, then retry."
  );
}
