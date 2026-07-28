import { useCloudAuth } from "@renderer/lib/auth-context";
import { useEffect, useRef } from "react";

/**
 * Bridges the main-process re-auth dialog (the single re-auth prompt) to the
 * renderer's sign-in flow. When the user picks "Sign in again", main either
 * flags the intent and opens this window (fresh load → consumed on mount) or,
 * if the window is already open, sends a live `cloud:start-sign-in` event. Both
 * paths kick off the device flow, surfacing the usual {@link CloudSignInModal}.
 * Renders nothing.
 */
export function CloudSignInBridge(): null {
  const { signIn } = useCloudAuth();
  const startedRef = useRef(false);

  useEffect(() => {
    // Consume the pending flag once per window load — guards against StrictMode
    // double-invoke and against re-running if the auth context identity changes.
    if (!startedRef.current) {
      startedRef.current = true;
      void window.api.consumePendingCloudSignIn().then((pending) => {
        if (pending) void signIn();
      });
    }

    // Live handshake for the already-open dashboard (no reload needed).
    return window.api.onCloudStartSignIn(() => {
      void signIn();
    });
  }, [signIn]);

  return null;
}
