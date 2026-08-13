import { createAppLogger } from "@freestyle-voice/utils";
import { FreestyleCloudAuthError, fetchCloudUser } from "./freestyle-cloud.js";
import {
  type CloudUser,
  getSession,
  invalidateSession,
  type Session,
  setSession,
} from "./sessions.js";

const log = createAppLogger("session-validate");

const VALIDATE_TTL_MS = 60 * 1000;

const VALIDATE_WAIT_MS = 2_500;

let lastValidatedAt = 0;
let inFlight: Promise<ValidatedSession> | null = null;

export interface ValidatedSession {
  user: CloudUser | null;
  verified: boolean;
}

export function resetSessionValidationThrottle(): void {
  lastValidatedAt = 0;
  inFlight = null;
}

async function validateAgainstCloud(
  session: Session,
): Promise<ValidatedSession> {
  try {
    const user = await fetchCloudUser(session.token);
    lastValidatedAt = Date.now();
    if (getSession()?.token === session.token) {
      setSession({ ...session, user });
    }
    return { user, verified: true };
  } catch (err) {
    if (err instanceof FreestyleCloudAuthError) {
      invalidateSession();
      return { user: null, verified: true };
    }
    log.warn(`session validation failed: ${(err as Error).message}`);
    return { user: session.user, verified: false };
  }
}

export async function validateSession(options?: {
  waitMs?: number;
}): Promise<ValidatedSession> {
  const session = getSession();
  if (!session) return { user: null, verified: true };
  if (Date.now() - lastValidatedAt < VALIDATE_TTL_MS) {
    return { user: session.user, verified: true };
  }

  inFlight ??= validateAgainstCloud(session).finally(() => {
    inFlight = null;
  });

  let waitTimer: NodeJS.Timeout | undefined;
  const cloudSlow = new Promise<null>((resolve) => {
    waitTimer = setTimeout(
      () => resolve(null),
      options?.waitMs ?? VALIDATE_WAIT_MS,
    );
    waitTimer.unref?.();
  });
  try {
    const result = await Promise.race([inFlight, cloudSlow]);
    if (result) return result;
    return { user: session.user, verified: false };
  } finally {
    clearTimeout(waitTimer);
  }
}
