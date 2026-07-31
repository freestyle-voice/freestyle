/**
 * Error taxonomy shared by every Freestyle Cloud REST call, on both the desktop
 * server and the mobile app. Kept runtime-agnostic (no `node:*`/undici/expo
 * imports) so the same classes work in Node 22 and React Native/Hermes.
 *
 * The desktop server re-exports these under its historical
 * `FreestyleCloud*Error` names so existing `instanceof` checks keep working; the
 * mobile app re-exports `CloudAuthError` under the same name it already used.
 */

/** Thrown when Freestyle Cloud rejects a request with HTTP 401 (sign-in required). */
export class CloudAuthError extends Error {
  constructor(message = "Freestyle Cloud sign-in required") {
    super(message);
    this.name = "CloudAuthError";
  }
}

/**
 * Thrown when Freestyle Cloud rejects a request because the user exhausted their
 * usage allowance (HTTP 429). Distinct from a generic request failure so callers
 * can surface an actionable "limit reached" message instead of a 500, and so it
 * is never reported to error tracking as an app defect. `resetsAt` (when the
 * cloud provides it) is the ISO timestamp at which the window resets.
 */
export class CloudUsageError extends Error {
  constructor(readonly resetsAt: string | null = null) {
    super("Freestyle Cloud usage limit reached");
    this.name = "CloudUsageError";
  }
}

/**
 * Thrown when Freestyle Cloud returns a non-OK response that isn't an auth (401)
 * or usage (429) failure. Carries the HTTP status so callers can tell an upstream
 * server fault (5xx) apart from a genuine app defect and avoid reporting
 * transient outages to error tracking.
 */
export class CloudRequestError extends Error {
  constructor(
    readonly status: number,
    readonly detail = "",
  ) {
    super(
      `Freestyle Cloud request failed (${status})${detail ? `: ${detail}` : ""}`,
    );
    this.name = "CloudRequestError";
  }
}
