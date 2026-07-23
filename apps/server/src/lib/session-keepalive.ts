import { createAppLogger } from "@freestyle-voice/utils";
import {
  FreestyleCloudAuthError,
  fetchCloudUser,
  SESSION_LIFETIME_MS,
} from "./freestyle-cloud.js";
import { captureException } from "./posthog.js";
import {
  getSession,
  getSessionExpiry,
  invalidateSession,
  touchSessionExpiry,
} from "./sessions.js";

const log = createAppLogger("session-keepalive");

/** How often the scheduler checks whether the token needs renewing (12h). */
const KEEPALIVE_INTERVAL_MS = 12 * 60 * 60 * 1000;
/** Renew once the token has less than this long remaining (2 days). */
const RENEW_THRESHOLD_MS = 2 * 24 * 60 * 60 * 1000;

export type RenewResult = "renewed" | "not-needed" | "no-session" | "expired";

/**
 * Keep the Freestyle Cloud session alive by exercising better-auth's sliding
 * window before the local token expires.
 *
 * The cloud issues no refresh token, but validating the session after its 24h
 * `updateAge` window extends `expiresAt` by another {@link SESSION_LIFETIME_MS}.
 * A cheap authenticated `get-session` (via {@link fetchCloudUser}) triggers that
 * slide; on success we mirror the new expiry locally.
 *
 * @param force - renew regardless of remaining time (used by tests / manual
 *   refresh). When false, renews only within {@link RENEW_THRESHOLD_MS}.
 */
export async function renewSession(force = false): Promise<RenewResult> {
  const expiry = getSessionExpiry();
  if (!expiry) return "no-session";

  // No local expiry means the cloud never sent one — nothing to slide.
  if (expiry.remainingMs === null) return "not-needed";

  if (!force && expiry.remainingMs > RENEW_THRESHOLD_MS) return "not-needed";

  const token = getSession()?.token;
  if (!token) return "no-session";

  try {
    // Touching an authenticated endpoint slides the cloud session window.
    await fetchCloudUser(token);
    touchSessionExpiry(Date.now() + SESSION_LIFETIME_MS);
    return "renewed";
  } catch (err) {
    if (err instanceof FreestyleCloudAuthError) {
      // The cloud already rejected the token; drop it so the UI can prompt
      // a fresh sign-in rather than retrying a dead token forever.
      invalidateSession();
      return "expired";
    }
    // Transient network/cloud failure — keep the session and try again next
    // tick. Never surface as an app defect.
    log.warn(`session renewal failed: ${(err as Error).message}`);
    return "not-needed";
  }
}

let keepAliveTimer: NodeJS.Timeout | null = null;

/**
 * Start the periodic keep-alive. Runs one check immediately (so a stale token
 * is refreshed shortly after launch) then every {@link KEEPALIVE_INTERVAL_MS}.
 * Idempotent and fire-and-forget: renewal errors never propagate.
 */
export function startSessionKeepAlive(): void {
  if (keepAliveTimer) return;

  const tick = (): void => {
    void renewSession().catch((err) => captureException(err));
  };

  tick();
  keepAliveTimer = setInterval(tick, KEEPALIVE_INTERVAL_MS);
  keepAliveTimer.unref();
}

export function stopSessionKeepAlive(): void {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}
